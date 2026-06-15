/**
 * Palisade solver + generator.
 *
 * The solver is a faithful port of upstream's six DSF deductions, run
 * to a fixpoint; `solver()` returns whether the clue set is fully
 * solved. Discriminated `"progress"`-style booleans replace C's
 * changed-flag accumulation, but the deductions themselves mirror the C
 * one-to-one (each annotated with its upstream name). The generator
 * divides the rectangle (`divvyRectangle`), derives clues, and strips
 * them while the solver still uniquely solves the board.
 */

import { Dsf } from "../../engine/dsf.ts";
import { shuffle } from "../../engine/shuffle.ts";
import type { RandomState } from "../../random/index.ts";
import { divvyRectangle } from "./divvy.ts";
import {
  BORDER,
  bitcount,
  DISABLED,
  DX,
  DY,
  EMPTY,
  encodeDesc,
  FLIP,
  initBorders,
  isSolved,
  outOfBounds,
  type PalisadeParams,
} from "./state.ts";

// --- hint-mode deduction trace --------------------------------------------

/** Which of the six deductions forced an edge (for hint narration). */
export type SolverRule =
  | "cluesVersusRegionSize"
  | "numberExhausted"
  | "notTooBig"
  | "notTooSmall"
  | "noDanglingEdges"
  | "equivalentEdges";

/** Context the explanation references, for highlighting: the cells it
 * names (a clue pair, the region). Cells are cell indices. Sibling edges
 * are no longer carried here — the hint derives them from the firing
 * group (a multi-edge deduction's other edges). */
export interface EdgeContext {
  cells?: number[];
}

/** A single edge the solver forced, in player-visible terms: a `"wall"`
 * (a `disconnect`) or a `"nowall"` (an individually-forced `connect`),
 * named by the rule that produced it. `(x,y)` + `dir` is the edge on the
 * primary cell; the deduction always records it on that cell's `dir`
 * side. Interior only (the rim is never re-decided). `cells` carries the
 * deduction's evidence for highlighting (hint mode only). `group` is the
 * firing — a single logical deduction — that forced it: edges sharing a
 * `group` are one deduction (the `equivalentEdges` pair, a
 * `numberExhausted` sweep) and the hint presents them as one journey. */
export interface ForcedEdge {
  x: number;
  y: number;
  dir: number;
  kind: "wall" | "nowall";
  rule: SolverRule;
  cells?: number[];
  group: number;
}

class SolverCtx {
  readonly w: number;
  readonly h: number;
  readonly k: number;
  readonly clues: Int8Array;
  readonly borders: Uint8Array;
  readonly dsf: Dsf;
  /** Hint mode: when set, `disconnect`/`connectEdge`/`notTooSmall` push
   * the player-visible edges they force here. Left null on the
   * solve/findMistakes/generator paths, which then behave unchanged. */
  record: ForcedEdge[] | null = null;
  /** The rule currently sweeping — stamped on each recorded edge. */
  private rule: SolverRule = "cluesVersusRegionSize";
  /** Firing grouping for hint journeys: edges recorded inside one
   * `firing(...)` call share an id; edges recorded outside one each get a
   * fresh id (a one-edge group = an ordinary single step). */
  private nextGroup = 0;
  private currentGroup = -1;
  private inFiring = false;

  /** Run `fn` as a single logical deduction: every edge it records shares
   * one firing id, so the hint groups them into one multi-leg journey. */
  firing(fn: () => void): void {
    const prevIn = this.inFiring;
    const prevGroup = this.currentGroup;
    this.currentGroup = this.nextGroup++;
    this.inFiring = true;
    fn();
    this.inFiring = prevIn;
    this.currentGroup = prevGroup;
  }

  constructor(p: PalisadeParams, clues: Int8Array, borders: Uint8Array) {
    this.w = p.w;
    this.h = p.h;
    this.k = p.k;
    this.clues = clues;
    this.borders = borders;
    this.dsf = new Dsf(p.w * p.h);
  }

  /** Begin a rule sweep: subsequent recorded edges are tagged `rule`. */
  beginRule(rule: SolverRule): void {
    this.rule = rule;
  }

  /** Seed the DSF from a player's no-wall marks (the `DISABLED` bits),
   * mirroring `buildDsf(black=false)`, so the hint reasons from where
   * the player actually is. */
  seedNoWall(playerBorders: Uint8Array): void {
    const { w, h } = this;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (x + 1 < w && playerBorders[i] & DISABLED(BORDER(1)))
          this.dsf.merge(i, i + 1);
        if (y + 1 < h && playerBorders[i] & DISABLED(BORDER(2)))
          this.dsf.merge(i, i + w);
      }
    }
  }

  private recordEdge(
    i: number,
    dir: number,
    kind: "wall" | "nowall",
    extra?: EdgeContext,
  ): void {
    if (!this.record) return;
    this.record.push({
      x: i % this.w,
      y: Math.floor(i / this.w),
      dir,
      kind,
      rule: this.rule,
      cells: extra?.cells,
      group: this.inFiring ? this.currentGroup : this.nextGroup++,
    });
  }

  /** All cells the DSF currently puts in the same region as `cell`. Hint
   * mode only (callers guard with `this.record`); O(w·h). */
  regionCells(cell: number): number[] {
    const rep = this.dsf.canonify(cell);
    const out: number[] = [];
    for (let c = 0; c < this.w * this.h; c++) {
      if (this.dsf.canonify(c) === rep) out.push(c);
    }
    return out;
  }

  /** Neighbour cell in direction `dir`, or -1 if off the grid. */
  nbr(i: number, dir: number): number {
    const x = (i % this.w) + DX[dir];
    const y = Math.floor(i / this.w) + DY[dir];
    if (outOfBounds(x, y, this.w, this.h)) return -1;
    return y * this.w + x;
  }

  connect(i: number, j: number): void {
    this.dsf.merge(i, j);
  }

  /** Merge across edge `dir` of `i` and, in hint mode, record it as a
   * forced no-wall. Callers guard with `maybe(i, dir)` first, so the edge
   * is genuinely undecided (a player's seeded no-wall mark is already
   * `connectedDir` and so never `maybe`); the record is captured before
   * the merge so a sibling edge made transitively-connected by this merge
   * is still recorded on its own `connectEdge` call. */
  connectEdge(i: number, dir: number, extra?: EdgeContext): void {
    this.recordEdge(i, dir, "nowall", extra);
    this.connect(i, this.nbr(i, dir));
  }

  /** Record the unique forced no-wall edge for an under-sized region (used
   * by `notTooSmall` when a region's single growth target is reached by
   * exactly one undecided edge). */
  recordNoWall(i: number, dir: number, extra?: EdgeContext): void {
    this.recordEdge(i, dir, "nowall", extra);
  }

  /** Is there a wall on edge `dir` of `i`? Bounds-safe (the rim is
   * always walled), so it never indexes off-grid. */
  disconnectedDir(i: number, dir: number): boolean {
    return (this.borders[i] & BORDER(dir)) !== 0;
  }

  /** Are `i` and its `dir`-neighbour known to be in one region? */
  connectedDir(i: number, dir: number): boolean {
    const j = this.nbr(i, dir);
    return j >= 0 && this.dsf.equivalent(i, j);
  }

  /** Neither walled nor known-connected: the edge is still undecided.
   * Order matters — `disconnectedDir` is bounds-safe, `connectedDir`
   * relies on the edge being interior. */
  maybe(i: number, dir: number): boolean {
    return !this.disconnectedDir(i, dir) && !this.connectedDir(i, dir);
  }

  /** Set a wall on edge `dir` of `i`, recording both shared sides. In
   * hint mode, record a genuinely-new wall as a forced edge. */
  disconnect(i: number, dir: number, extra?: EdgeContext): void {
    const newWall = !(this.borders[i] & BORDER(dir));
    const j = this.nbr(i, dir);
    this.borders[i] |= BORDER(dir);
    if (j >= 0) this.borders[j] |= BORDER(FLIP(dir));
    if (newWall) this.recordEdge(i, dir, "wall", extra);
  }
}

// --- the six deductions ---------------------------------------------------

/** `solver_connected_clues_versus_region_size` — idempotent, run once. */
function connectedCluesVersusRegionSize(ctx: SolverCtx): void {
  ctx.beginRule("cluesVersusRegionSize");
  const { w, h, k, clues } = ctx;
  const wh = w * h;
  for (let i = 0; i < wh; i++) {
    if (clues[i] === EMPTY) continue;
    for (let dir = 0; dir < 4; dir++) {
      if (ctx.disconnectedDir(i, dir)) continue;
      const j = ctx.nbr(i, dir);
      if (j < 0 || clues[j] === EMPTY) continue;
      if (
        8 - clues[i] - clues[j] > k ||
        (clues[i] === 3 && clues[j] === 3 && k !== 2)
      ) {
        ctx.disconnect(i, dir, ctx.record ? { cells: [i, j] } : undefined);
      }
    }
  }
}

/** `solver_number_exhausted`. */
function numberExhausted(ctx: SolverCtx): boolean {
  ctx.beginRule("numberExhausted");
  const { w, h, clues, borders } = ctx;
  const wh = w * h;
  let changed = false;
  for (let i = 0; i < wh; i++) {
    if (clues[i] === EMPTY) continue;

    if (bitcount(borders[i]) === clues[i]) {
      // All this clue's walls are placed: the rest are non-walls — one
      // firing (the clue's remaining edges are forced together).
      ctx.firing(() => {
        for (let dir = 0; dir < 4; dir++) {
          if (!ctx.maybe(i, dir)) continue;
          ctx.connectEdge(i, dir, ctx.record ? { cells: [i] } : undefined);
          changed = true;
        }
      });
      continue;
    }

    let off = 0;
    for (let dir = 0; dir < 4; dir++) {
      if (!ctx.disconnectedDir(i, dir) && ctx.connectedDir(i, dir)) off++;
    }
    if (clues[i] === 4 - off) {
      // Every remaining edge must be a wall to reach the clue — one firing.
      ctx.firing(() => {
        for (let dir = 0; dir < 4; dir++) {
          if (!ctx.maybe(i, dir)) continue;
          ctx.disconnect(i, dir, ctx.record ? { cells: [i] } : undefined);
          changed = true;
        }
      });
    }
  }
  return changed;
}

/** `solver_not_too_big`. */
function notTooBig(ctx: SolverCtx): boolean {
  ctx.beginRule("notTooBig");
  const { w, h, k } = ctx;
  const wh = w * h;
  let changed = false;
  for (let i = 0; i < wh; i++) {
    const size = ctx.dsf.size(i);
    for (let dir = 0; dir < 4; dir++) {
      if (!ctx.maybe(i, dir)) continue;
      const j = ctx.nbr(i, dir);
      if (size + ctx.dsf.size(j) <= k) continue;
      ctx.disconnect(
        i,
        dir,
        ctx.record
          ? { cells: [...ctx.regionCells(i), ...ctx.regionCells(j)] }
          : undefined,
      );
      changed = true;
    }
  }
  return changed;
}

/** `solver_not_too_small` — a region with a single way to grow grows. */
function notTooSmall(ctx: SolverCtx): boolean {
  ctx.beginRule("notTooSmall");
  const { w, h, k } = ctx;
  const wh = w * h;
  const outs = new Int32Array(wh).fill(-1); // -1 none, -2 several
  // The undecided growth edge(s) toward `outs[ci]`: count + the last one,
  // so a region with a single way out can record that forced no-wall.
  const outCount = new Int32Array(wh);
  const outCell = new Int32Array(wh).fill(-1);
  const outDir = new Int32Array(wh).fill(-1);
  let changed = false;

  for (let i = 0; i < wh; i++) {
    const ci = ctx.dsf.canonify(i);
    if (ctx.dsf.size(ci) === k) continue;
    for (let dir = 0; dir < 4; dir++) {
      if (!ctx.maybe(i, dir)) continue;
      const cj = ctx.dsf.canonify(ctx.nbr(i, dir));
      if (outs[ci] === -1) {
        outs[ci] = cj;
        outCount[ci] = 1;
        outCell[ci] = i;
        outDir[ci] = dir;
      } else if (outs[ci] === cj) {
        outCount[ci]++;
      } else outs[ci] = -2;
    }
  }

  for (let i = 0; i < wh; i++) {
    const j = outs[i];
    if (i !== ctx.dsf.canonify(i)) continue;
    if (j < 0) continue;
    // A single undecided exit means that exact edge is forced no-wall.
    if (outCount[i] === 1) {
      ctx.recordNoWall(
        outCell[i],
        outDir[i],
        ctx.record ? { cells: ctx.regionCells(i) } : undefined,
      );
    }
    ctx.connect(i, j);
    changed = true;
  }
  return changed;
}

/** `solver_no_dangling_edges` — vertex parity of incident walls. */
function noDanglingEdges(ctx: SolverCtx): boolean {
  ctx.beginRule("noDanglingEdges");
  const { w, h, borders } = ctx;
  let changed = false;
  for (let r = 1; r < h; r++) {
    for (let c = 1; c < w; c++) {
      const i = r * w + c;
      const j = i - w - 1;
      let noline = 0;
      // Aligned with BORDER_[U0 R1 D2 L3].
      const squares = [i, j, j, i];
      let e = -1;
      let f = -1;
      let de = -1;
      let df = -1;

      for (let dir = 0; dir < 4; dir++) {
        if (!ctx.connectedDir(squares[dir], dir)) {
          df = dir;
          f = squares[df];
          if (e !== -1) continue;
          e = f;
          de = df;
        } else noline++;
      }

      // The four cells meeting at this vertex, highlighting "this corner".
      const corner: EdgeContext | undefined = ctx.record
        ? { cells: [i, i - 1, i - w, j] }
        : undefined;

      if (4 - noline === 1) {
        ctx.disconnect(e, de, corner);
        changed = true;
        continue;
      }
      if (4 - noline !== 2) continue;

      if (borders[e] & BORDER(de)) {
        if (!(borders[f] & BORDER(df))) {
          ctx.disconnect(f, df, corner);
          changed = true;
        }
      } else if (borders[f] & BORDER(df)) {
        ctx.disconnect(e, de, corner);
        changed = true;
      }
    }
  }
  return changed;
}

/** `solver_equivalent_edges` — two edges to one region share a fate. */
function equivalentEdges(ctx: SolverCtx): boolean {
  ctx.beginRule("equivalentEdges");
  const { w, h, clues } = ctx;
  const wh = w * h;
  let changed = false;

  for (let i = 0; i < wh; i++) {
    if (clues[i] < 1 || clues[i] > 3) continue;
    let nOn = 0;
    let nOff = 0;
    if (clues[i] === 2) {
      for (let dir = 0; dir < 4; dir++) {
        if (ctx.disconnectedDir(i, dir)) nOn++;
        else if (ctx.connectedDir(i, dir)) nOff++;
      }
    }
    for (let dirj = 0; dirj < 4; dirj++) {
      if (!ctx.maybe(i, dirj)) continue;
      const j = ctx.nbr(i, dirj);
      for (let dirk = dirj + 1; dirk < 4; dirk++) {
        if (!ctx.maybe(i, dirk)) continue;
        const kk = ctx.nbr(i, dirk);
        if (!ctx.dsf.equivalent(j, kk)) continue;
        // The shared region the two edges lead into (captured before any
        // merge; the clue cell `i` is deliberately excluded — it's the
        // decider, not part of the region). The pair is one firing, so the
        // hint groups them into one journey and derives each leg's sibling
        // edge from the other group member.
        const region = ctx.record ? ctx.regionCells(j) : undefined;
        const ext: EdgeContext | undefined = region ? { cells: region } : undefined;
        if (nOn + 2 > clues[i]) {
          ctx.firing(() => {
            ctx.connectEdge(i, dirj, ext);
            ctx.connectEdge(i, dirk, ext);
          });
          changed = true;
        } else if (nOff + 2 > 4 - clues[i]) {
          ctx.firing(() => {
            ctx.disconnect(i, dirj, ext);
            ctx.disconnect(i, dirk, ext);
          });
          changed = true;
        }
      }
    }
  }
  return changed;
}

/**
 * Run the solver in place on `borders` (which must start as the grid
 * rim). Returns whether the clue set is fully solved.
 */
export function solver(
  p: PalisadeParams,
  clues: Int8Array,
  borders: Uint8Array,
): boolean {
  const ctx = new SolverCtx(p, clues, borders);
  connectedCluesVersusRegionSize(ctx); // idempotent
  let changed = true;
  while (changed) {
    changed = false;
    if (numberExhausted(ctx)) changed = true;
    if (notTooBig(ctx)) changed = true;
    if (notTooSmall(ctx)) changed = true;
    if (noDanglingEdges(ctx)) changed = true;
    if (equivalentEdges(ctx)) changed = true;
  }
  return isSolved(p.w, p.h, p.k, clues, borders);
}

/** Solve a clue set from the bare rim; returns the solution walls, or
 * null if the clue set is not (uniquely) solver-solvable. */
export function solveToBorders(p: PalisadeParams, clues: Int8Array): Uint8Array | null {
  const borders = initBorders(p.w, p.h);
  return solver(p, clues, borders) ? borders : null;
}

/**
 * Hint mode: seed the solver from the player's `playerBorders` (their
 * walls copied in, their no-wall marks pre-merged into the DSF) and run
 * the deductions to a fixpoint, returning every player-visible edge they
 * force, in discovery order. Pure: `playerBorders` is not mutated. The
 * physical edges are de-duplicated (two under-sized regions can each
 * record the shared edge between them).
 */
export function deduceForcedEdges(
  p: PalisadeParams,
  clues: Int8Array,
  playerBorders: Uint8Array,
): ForcedEdge[] {
  const ctx = new SolverCtx(p, clues, playerBorders.slice());
  ctx.record = [];
  ctx.seedNoWall(playerBorders);

  connectedCluesVersusRegionSize(ctx); // idempotent, run once
  let changed = true;
  while (changed) {
    changed = false;
    if (numberExhausted(ctx)) changed = true;
    if (notTooBig(ctx)) changed = true;
    if (notTooSmall(ctx)) changed = true;
    if (noDanglingEdges(ctx)) changed = true;
    if (equivalentEdges(ctx)) changed = true;
  }

  const seen = new Set<number>();
  const out: ForcedEdge[] = [];
  for (const e of ctx.record) {
    const i = e.y * p.w + e.x;
    const j = i + DY[e.dir] * p.w + DX[e.dir];
    const lo = Math.min(i, j);
    const horizontal = Math.max(i, j) - lo === 1;
    const id = lo * 2 + (horizontal ? 0 : 1); // unique per physical edge
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(e);
  }
  return out;
}

// --- generator ------------------------------------------------------------

/** Generate a uniquely solvable clue grid; returns its run-length desc. */
export function newDesc(p: PalisadeParams, rng: RandomState): { desc: string } {
  const { w, h, k } = p;
  const wh = w * h;
  const numbers = new Int8Array(wh);
  const rim = initBorders(w, h);

  // Divide into k-ominoes, derive clues + the solution walls, retry
  // until the full-clue board is solver-solvable (it nearly always is).
  do {
    const dsf = divvyRectangle(w, h, k, rng);
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const i = r * w + c;
        numbers[i] = 0;
        for (let dir = 0; dir < 4; dir++) {
          const rr = r + DY[dir];
          const cc = c + DX[dir];
          if (outOfBounds(cc, rr, w, h) || !dsf.equivalent(i, rr * w + cc)) {
            numbers[i]++;
          }
        }
      }
    }
  } while (!solver(p, numbers, rim.slice()));

  // Strip clues in a random order, keeping each removed only while the
  // board stays uniquely solvable.
  const shuf: number[] = Array.from({ length: wh }, (_, i) => i);
  shuffle(shuf, rng);
  for (const idx of shuf) {
    const copy = numbers[idx];
    numbers[idx] = EMPTY;
    if (!solver(p, numbers, rim.slice())) numbers[idx] = copy;
  }

  return { desc: encodeDesc(numbers, wh) };
}
