/**
 * Galaxies solver: a difficulty-graded deduction chain plus bounded recursion
 * for `Unreasonable`, derived from upstream's `solver_state`.
 *
 * The rules take an optional {@link SolverRecorder}, which is how `hint.ts`
 * narrates them (one engine, two projections — docs/games/hints.md §
 * "Recording the deduction"). The generator and `solve` pass none, so their
 * path is byte-identical by construction and the frozen differential is the
 * guard.
 */
import {
  type DeductionTechnique,
  type FiringTally,
  runDeductionFixpoint,
} from "../../engine/deduction-fixpoint.ts";
import { Dsf } from "../../engine/dsf.ts";
import type { Point } from "../../engine/types.ts";
import {
  addAssoc,
  adjacencies,
  checkComplete,
  dotTiles,
  F_DOT,
  F_DOT_BLACK,
  F_EDGE_SET,
  F_TILE_ASSOC,
  type GalaxiesState,
  idx,
  inGrid,
  SpaceType,
  spaceOppositeDot,
  spaceTypeAt,
  tileOpposite,
  tilesFromEdge,
} from "./state.ts";

export enum GalaxiesDiff {
  /** Solvable with only the basic deduction chain. */
  Normal = 0,
  /** Required bounded recursion to solve uniquely. */
  Unreasonable = 1,
  /** No consistent solution exists. */
  Impossible = 2,
  /** More than one solution exists. */
  Ambiguous = 3,
  /** Solver gave up — exceeded recursion limit. */
  Unfinished = 4,
}

const MAX_RECURSE = 5;
const IMPOSSIBLE = -1;
const NOTHING = 0;
const PROGRESS = 1;

// --- the recorder (the hint's projection of these same rules) --------

/**
 * One deduction firing, in the vocabulary of the rule that fired it. The
 * *reason* is built where the deduction is made — only the rule knows why the
 * other possibilities died (docs/games/hints.md § "The premise must single out
 * the conclusion").
 *
 * Every association firing carries `opp`, the 180° partner the game commits in
 * the same move (`addAssocWithOpposite`), because the hint's targets are the
 * pair and its narration says so.
 */
export type GalaxiesFiring =
  /** The cells a dot physically sits on belong to it. */
  | { kind: "dotTile"; dot: Point; tiles: Point[] }
  /** Two neighbors in different galaxies: a wall must run between them. */
  | { kind: "separate"; edge: Point; tiles: [Point, Point]; dots: [Point, Point] }
  /** A galaxy's boundary is symmetric, so a wall is mirrored about the dot. */
  | {
      kind: "mirrorWall";
      edge: Point;
      from: Point;
      tile: Point;
      opp: Point;
      dot: Point;
    }
  /** Every way out of a cell leads into the same galaxy. */
  | { kind: "enclosed"; tile: Point; opp: Point | null; dot: Point; openings: Point[] }
  /** Only one dot's galaxy can still stretch to a cell. */
  | { kind: "onlyReach"; tile: Point; opp: Point | null; dot: Point; region: Point[] }
  /** A detached piece of a galaxy has one square left to grow through. */
  | {
      kind: "exclave";
      tile: Point;
      opp: Point | null;
      dot: Point;
      component: Point[];
    }
  /** Only one dot could own this cell at all — symmetry and connectivity to
   * the dots, the same test the drag's candidate rings run (hint-only, built
   * in `hint.ts`). */
  | { kind: "soleOwner"; tile: Point; opp: Point | null; dot: Point };

/**
 * The optional sink the rules record into.
 *
 * `stopAtFirstFiring` is what makes the hint's projection *stepwise*: a rule
 * normally sweeps the whole board and accumulates, which is right for solving
 * and wrong for narrating (one firing = one hint).
 */
export interface SolverRecorder {
  /** Return from a rule as soon as one firing is recorded. */
  stopAtFirstFiring: boolean;
  /** The firing this pass recorded, if any. */
  firing: GalaxiesFiring | null;
}

export function newRecorder(stopAtFirstFiring: boolean): SolverRecorder {
  return { stopAtFirstFiring, firing: null };
}

/** True when this rule should return now — it has a firing and the caller
 * asked for one at a time. */
function stop(rec: SolverRecorder | undefined): boolean {
  return rec?.stopAtFirstFiring === true && rec.firing !== null;
}

// Scratch flags live in a side buffer, so no transient bit reaches the state.
const M_MARK = 1;
const M_REACHABLE = 2;
const M_MULTIPLE = 4;

/** Associate the tile and its 180° image with the dot, reporting IMPOSSIBLE,
 * NOTHING or PROGRESS. Upstream's `solver_add_assoc`. */
function solverAddAssoc(
  s: GalaxiesState,
  tx: number,
  ty: number,
  dx: number,
  dy: number,
): number {
  if (s.flags[idx(s, tx, ty)] & F_TILE_ASSOC) {
    return canJoin(s, tx, ty, dx, dy) ? NOTHING : IMPOSSIBLE;
  }
  const opp = spaceOppositeDot(s, tx, ty, dx, dy);
  if (!opp || !canJoin(s, opp.x, opp.y, dx, dy)) return IMPOSSIBLE;
  addAssoc(s, tx, ty, dx, dy);
  addAssoc(s, opp.x, opp.y, dx, dy);
  return PROGRESS;
}

/** The tiles a dot sits on are its own. Upstream's `solver_obvious_dot`. */
function solverObviousDot(
  s: GalaxiesState,
  dx: number,
  dy: number,
  rec?: SolverRecorder,
): number {
  // One dot's own cells are one deduction, so the firing is the whole set. It
  // lists the cells unclaimed *before* the loop: `solverAddAssoc` claims each
  // cell's 180° partner too, so the partner reports NOTHING on its own turn,
  // and a list built from PROGRESS would name half the cells the move claims.
  const own = dotTiles(s, dx, dy);
  const fresh = own.filter((t) => !(s.flags[idx(s, t.x, t.y)] & F_TILE_ASSOC));
  let progress = NOTHING;
  for (const t of own) {
    const r = solverAddAssoc(s, t.x, t.y, dx, dy);
    if (r === IMPOSSIBLE) return IMPOSSIBLE;
    if (r === PROGRESS) progress = PROGRESS;
  }
  if (rec && progress === PROGRESS) {
    rec.firing = { kind: "dotTile", dot: { x: dx, y: dy }, tiles: fresh };
  }
  return progress;
}

export function solverObvious(s: GalaxiesState, rec?: SolverRecorder): number {
  let progress = NOTHING;
  for (const dot of s.dots) {
    const r = solverObviousDot(s, dot.x, dot.y, rec);
    if (r === IMPOSSIBLE) return IMPOSSIBLE;
    if (r === PROGRESS) progress = PROGRESS;
    if (stop(rec)) return PROGRESS;
  }
  return progress;
}

/**
 * Which halves of the wall rule to apply: both, on the solve path. The hint
 * wants them as separate rungs, since "different dots, so a wall" is what
 * advances the board and the mirror half is the clever one, better shown when
 * it is needed than as the routine way walls appear.
 */
interface LineRules {
  separate: boolean;
  mirror: boolean;
}

const BOTH_LINE_RULES: LineRules = { separate: true, mirror: true };

/** Upstream's `solver_lines_opposite_cb`, run across every edge: two tiles of
 * different dots get a wall between them, and a set wall is mirrored through
 * the dot of each tile beside it. */
function solverLinesOpposite(
  s: GalaxiesState,
  rec?: SolverRecorder,
  rules: LineRules = BOTH_LINE_RULES,
): number {
  let progress = NOTHING;
  for (let y = 0; y < s.sy; y++) {
    for (let x = 0; x < s.sx; x++) {
      if (spaceTypeAt(x, y) !== SpaceType.Edge) continue;
      const ei = idx(s, x, y);
      const tiles = tilesFromEdge(s, x, y);
      const [t0, t1] = tiles;

      if (rules.separate && !(s.flags[ei] & F_EDGE_SET) && t0 && t1) {
        const i0 = idx(s, t0.x, t0.y);
        const i1 = idx(s, t1.x, t1.y);
        if (
          s.flags[i0] & F_TILE_ASSOC &&
          s.flags[i1] & F_TILE_ASSOC &&
          (s.dotx[i0] !== s.dotx[i1] || s.doty[i0] !== s.doty[i1])
        ) {
          s.flags[ei] |= F_EDGE_SET;
          progress = PROGRESS;
          if (rec) {
            rec.firing = {
              kind: "separate",
              edge: { x, y },
              tiles: [t0, t1],
              dots: [
                { x: s.dotx[i0], y: s.doty[i0] },
                { x: s.dotx[i1], y: s.doty[i1] },
              ],
            };
            if (rec.stopAtFirstFiring) return PROGRESS;
          }
        }
      }

      if (!rules.mirror) continue;
      if (!(s.flags[ei] & F_EDGE_SET)) continue;

      for (const t of tiles) {
        if (!t) continue;
        const ti = idx(s, t.x, t.y);
        if (!(s.flags[ti] & F_TILE_ASSOC)) continue;
        const opp = tileOpposite(s, t.x, t.y);
        if (!opp) return IMPOSSIBLE;
        const ox = opp.x + t.x - x;
        const oy = opp.y + t.y - y;
        if (!inGrid(s, ox, oy)) return IMPOSSIBLE;
        const oei = idx(s, ox, oy);
        if (!(s.flags[oei] & F_EDGE_SET)) {
          s.flags[oei] |= F_EDGE_SET;
          progress = PROGRESS;
          if (rec) {
            rec.firing = {
              kind: "mirrorWall",
              edge: { x: ox, y: oy },
              from: { x, y },
              tile: { x: t.x, y: t.y },
              opp,
              dot: { x: s.dotx[ti], y: s.doty[ti] },
            };
            if (rec.stopAtFirstFiring) return PROGRESS;
          }
        }
      }
    }
  }
  return progress;
}

/** A free tile whose every way out leads into one dot's tiles belongs to that
 * dot. Upstream's `solver_spaces_oneposs_cb`, run across every tile. */
function solverSpacesOneposs(s: GalaxiesState, rec?: SolverRecorder): number {
  let progress = NOTHING;
  for (let y = 1; y < s.sy - 1; y += 2) {
    for (let x = 1; x < s.sx - 1; x += 2) {
      if (s.flags[idx(s, x, y)] & F_TILE_ASSOC) continue;
      const { edges, tiles } = adjacencies(s, x, y);
      let walled = 0;
      let dx = -1;
      let dy = -1;
      let mixed = false;
      // The ways out: neighbors through an unwalled side, all of which belong
      // to the one dot below, which is the whole premise.
      const openings: Point[] = [];
      for (let n = 0; n < 4; n++) {
        const e = edges[n];
        if (!e) continue;
        if (s.flags[idx(s, e.x, e.y)] & F_EDGE_SET) {
          walled++;
          continue;
        }
        const t = tiles[n];
        if (!t) continue;
        const ai = idx(s, t.x, t.y);
        if (
          !(s.flags[ai] & F_TILE_ASSOC) ||
          (dx !== -1 && (s.dotx[ai] !== dx || s.doty[ai] !== dy))
        ) {
          mixed = true;
          break;
        }
        dx = s.dotx[ai];
        dy = s.doty[ai];
        openings.push({ x: t.x, y: t.y });
      }
      if (mixed) continue;
      if (walled === 4) return IMPOSSIBLE;
      if (dx === -1) continue;
      if (rec) {
        rec.firing = {
          kind: "enclosed",
          tile: { x, y },
          opp: spaceOppositeDot(s, x, y, dx, dy),
          dot: { x: dx, y: dy },
          openings,
        };
      }
      const r = solverAddAssoc(s, x, y, dx, dy);
      if (r === IMPOSSIBLE) return IMPOSSIBLE;
      if (r === PROGRESS) {
        progress = PROGRESS;
        if (stop(rec)) return PROGRESS;
      } else if (rec) {
        // Recorded a firing that turned out to change nothing — drop it, or
        // the hint would offer a move the board already has.
        rec.firing = null;
      }
    }
  }
  return progress;
}

interface ExpandCtx {
  mark: Uint8Array;
  /** The flood's queue of tile indices, in 180° pairs. */
  scratch: Int32Array;
  reach: Uint8Array;
  reachDotX: Int16Array;
  reachDotY: Int16Array;
}

function newExpandCtx(s: GalaxiesState): ExpandCtx {
  const sz = s.sx * s.sy;
  return {
    mark: new Uint8Array(sz),
    scratch: new Int32Array(sz),
    reach: new Uint8Array(sz),
    reachDotX: new Int16Array(sz),
    reachDotY: new Int16Array(sz),
  };
}

/** Whether the tile is free, or already the dot's. */
function canJoin(s: GalaxiesState, tx: number, ty: number, dx: number, dy: number) {
  const i = idx(s, tx, ty);
  if (!(s.flags[i] & F_TILE_ASSOC)) return true;
  return s.dotx[i] === dx && s.doty[i] === dy;
}

function solverExpandFromdot(
  s: GalaxiesState,
  dx: number,
  dy: number,
  ctx: ExpandCtx,
  reached?: number[],
): void {
  // Reset M_MARK across tiles only.
  for (let y = 1; y < s.sy - 1; y += 2) {
    for (let x = 1; x < s.sx - 1; x += 2) {
      ctx.mark[idx(s, x, y)] &= ~M_MARK;
    }
  }

  // Seed with two tiles the dot sits on, 180° partners about it: one space
  // away along each axis on which the dot lies between tiles.
  const ox = dx & 1 ? 0 : 1;
  const oy = dy & 1 ? 0 : 1;
  const scratch = ctx.scratch;
  scratch[0] = idx(s, dx - ox, dy - oy);
  scratch[1] = idx(s, dx + ox, dy + oy);
  ctx.mark[scratch[0]] |= M_MARK;
  ctx.mark[scratch[1]] |= M_MARK;

  // Expand from the first tile of each pair; its partner follows by symmetry.
  let next = 2;
  for (let i = 0; i < next; i += 2) {
    const enc = scratch[i];
    const tx = enc % s.sx;
    const ty = (enc / s.sx) | 0;
    const { edges, tiles } = adjacencies(s, tx, ty);
    for (let j = 0; j < 4; j++) {
      const e = edges[j];
      if (!e) continue;
      const ei = idx(s, e.x, e.y);
      if (s.flags[ei] & F_EDGE_SET) continue;
      const tj = tiles[j];
      if (!tj) continue;
      const tji = idx(s, tj.x, tj.y);
      if (ctx.mark[tji] & M_MARK) continue;

      const opp = spaceOppositeDot(s, tj.x, tj.y, dx, dy);
      if (!opp) {
        ctx.mark[tji] |= M_MARK;
        continue;
      }
      const oi = idx(s, opp.x, opp.y);
      // Partners are marked together, so `opp` is unmarked too.
      if (canJoin(s, tj.x, tj.y, dx, dy) && canJoin(s, opp.x, opp.y, dx, dy)) {
        scratch[next++] = tji;
        scratch[next++] = oi;
      }
      ctx.mark[tji] |= M_MARK;
      ctx.mark[oi] |= M_MARK;
    }
  }

  // For every newly-reached empty tile, update reachability.
  for (let i = 0; i < next; i++) {
    const enc = scratch[i];
    // The queue is the *reachable* set; `ctx.mark` is wider than that (it also
    // marks neighbors the pair test rejected), so a hint that shaded `mark`
    // would claim reach the galaxy does not have.
    reached?.push(enc);
    if (s.flags[enc] & F_TILE_ASSOC) continue;
    if (ctx.reach[enc] & M_REACHABLE) {
      ctx.reach[enc] |= M_MULTIPLE;
    } else {
      ctx.reach[enc] |= M_REACHABLE;
      ctx.reachDotX[enc] = dx;
      ctx.reachDotY[enc] = dy;
    }
  }
}

/** Every tile one dot's mirror-pair flood can still reach — the shaded area
 * behind an `onlyReach` firing's "this is as far as that galaxy can stretch".
 * Recomputed for the one winning dot rather than kept for all of them: the
 * solve path never needs it, and a hint fires at most once per pass. */
function reachOfDot(s: GalaxiesState, dx: number, dy: number): Point[] {
  const reached: number[] = [];
  solverExpandFromdot(s, dx, dy, newExpandCtx(s), reached);
  return [...new Set(reached)].map((enc) => ({ x: enc % s.sx, y: (enc / s.sx) | 0 }));
}

function solverExpandDots(s: GalaxiesState, rec?: SolverRecorder): number {
  const ctx = newExpandCtx(s);
  for (const dot of s.dots) solverExpandFromdot(s, dot.x, dot.y, ctx);

  let progress = NOTHING;
  for (let y = 1; y < s.sy - 1; y += 2) {
    for (let x = 1; x < s.sx - 1; x += 2) {
      const ti = idx(s, x, y);
      if (s.flags[ti] & F_TILE_ASSOC) continue;
      if (!(ctx.reach[ti] & M_REACHABLE)) return IMPOSSIBLE;
      if (ctx.reach[ti] & M_MULTIPLE) continue;
      const dx = ctx.reachDotX[ti];
      const dy = ctx.reachDotY[ti];
      // Record before applying: the reachable area is the argument, and the
      // association about to be made would be part of it.
      if (rec) {
        rec.firing = {
          kind: "onlyReach",
          tile: { x, y },
          opp: spaceOppositeDot(s, x, y, dx, dy),
          dot: { x: dx, y: dy },
          region: reachOfDot(s, dx, dy),
        };
      }
      const r = solverAddAssoc(s, x, y, dx, dy);
      if (r === IMPOSSIBLE) return IMPOSSIBLE;
      if (r === PROGRESS) {
        progress = PROGRESS;
        if (stop(rec)) return PROGRESS;
      } else if (rec) {
        rec.firing = null;
      }
    }
  }
  return progress;
}

const ORTHOGONAL = [
  [-1, 0],
  [0, -1],
  [0, 1],
  [1, 0],
] as const;

function solverExtendExclaves(s: GalaxiesState, rec?: SolverRecorder): number {
  const sz = s.sx * s.sy;
  const dsf = new Dsf(sz);
  // Unify adjacent tiles sharing a dot association.
  for (let x = 1; x < s.sx; x += 2) {
    for (let y = 1; y < s.sy; y += 2) {
      const ti = idx(s, x, y);
      if (!(s.flags[ti] & F_TILE_ASSOC)) continue;
      const dx = s.dotx[ti];
      const dy = s.doty[ti];
      if (inGrid(s, x + 2, y)) {
        const oi = idx(s, x + 2, y);
        if (s.flags[oi] & F_TILE_ASSOC && s.dotx[oi] === dx && s.doty[oi] === dy) {
          dsf.merge(ti, oi);
        }
      }
      if (inGrid(s, x, y + 2)) {
        const oi = idx(s, x, y + 2);
        if (s.flags[oi] & F_TILE_ASSOC && s.dotx[oi] === dx && s.doty[oi] === dy) {
          dsf.merge(ti, oi);
        }
      }
    }
  }

  // Count each component's liberties, in the Go sense: the free tiles beside
  // it. An exclave with one liberty must extend through it, or it is cut off
  // from its dot. Each free tile de-duplicates its neighbors, so a tile
  // touching a component on two sides counts once.
  //
  // Upstream's storage trick: the count lives in `iscratch[i]` at a
  // component's canonical tile center, and `iscratch[i - 1]`, an edge space
  // that holds no tile data and no other tile center shares, remembers the
  // liberty's index when there is only one. `-1` marks every tile that is not
  // a canonical associated one.
  const iscratch = new Int32Array(sz);
  for (let x = 1; x < s.sx; x += 2) {
    for (let y = 1; y < s.sy; y += 2) {
      const i = idx(s, x, y);
      if (!(s.flags[i] & F_TILE_ASSOC) || dsf.canonify(i) !== i) {
        iscratch[i] = -1;
      } else {
        iscratch[i] = 0;
        iscratch[i - 1] = 0;
      }
    }
  }

  // Count distinct liberties per component.
  for (let x = 1; x < s.sx; x += 2) {
    for (let y = 1; y < s.sy; y += 2) {
      const ti = idx(s, x, y);
      if (s.flags[ti] & F_TILE_ASSOC) continue;
      const seen: number[] = [];
      for (const [dx, dy] of ORTHOGONAL) {
        const nx = x + 2 * dx;
        const ny = y + 2 * dy;
        if (!inGrid(s, nx, ny)) continue;
        const ai = idx(s, nx, ny);
        if (!(s.flags[ai] & F_TILE_ASSOC)) continue;
        const can = dsf.canonify(ai);
        if (seen.includes(can)) continue;
        iscratch[can]++;
        iscratch[can - 1] = ti;
        seen.push(can);
      }
    }
  }

  let progress = NOTHING;
  for (let x = 1; x < s.sx; x += 2) {
    for (let y = 1; y < s.sy; y += 2) {
      const i = idx(s, x, y);
      if (iscratch[i] === -1) continue;
      if (!(s.flags[i] & F_TILE_ASSOC)) continue;
      const dx = s.dotx[i];
      const dy = s.doty[i];
      // Skip if this component contains its own dot.
      if (i === dsf.canonify((dy | 1) * s.sx + (dx | 1))) continue;
      if (iscratch[i] === 0) return IMPOSSIBLE;
      if (iscratch[i] !== 1) continue;
      const li = iscratch[i - 1];
      if (s.flags[li] & F_TILE_ASSOC) continue;
      const lx = li % s.sx;
      const ly = (li / s.sx) | 0;
      if (rec) {
        rec.firing = {
          kind: "exclave",
          tile: { x: lx, y: ly },
          opp: spaceOppositeDot(s, lx, ly, dx, dy),
          dot: { x: dx, y: dy },
          component: membersOf(s, dsf, i),
        };
      }
      const r = solverAddAssoc(s, lx, ly, dx, dy);
      if (r === IMPOSSIBLE) return IMPOSSIBLE;
      if (r === PROGRESS) {
        progress = PROGRESS;
        if (stop(rec)) return PROGRESS;
      } else if (rec) {
        rec.firing = null;
      }
    }
  }
  return progress;
}

/** The tiles of one `solverExtendExclaves` component — the detached piece an
 * `exclave` firing shades as its evidence. */
function membersOf(s: GalaxiesState, dsf: Dsf, canon: number): Point[] {
  const out: Point[] = [];
  for (let y = 1; y < s.sy - 1; y += 2) {
    for (let x = 1; x < s.sx - 1; x += 2) {
      const i = idx(s, x, y);
      if (!(s.flags[i] & F_TILE_ASSOC)) continue;
      if (dsf.canonify(i) === canon) out.push({ x, y });
    }
  }
  return out;
}

/** Whether the dot could own the tile: its 180° image is on the board, and free
 * or already the dot's. */
function couldOwn(s: GalaxiesState, tx: number, ty: number, dx: number, dy: number) {
  const opp = spaceOppositeDot(s, tx, ty, dx, dy);
  return opp !== null && canJoin(s, opp.x, opp.y, dx, dy);
}

/** The free tile with the most candidate dots: the recursion's branch point. */
function pickRecurseTarget(s: GalaxiesState): Point | null {
  let best: Point | null = null;
  let bestN = 0;
  for (let y = 1; y < s.sy - 1; y += 2) {
    for (let x = 1; x < s.sx - 1; x += 2) {
      if (s.flags[idx(s, x, y)] & F_TILE_ASSOC) continue;
      const n = s.dots.filter((d) => couldOwn(s, x, y, d.x, d.y)).length;
      if (n > bestN) {
        bestN = n;
        best = { x, y };
      }
    }
  }
  return best;
}

type Snapshot = Pick<GalaxiesState, "flags" | "dotx" | "doty" | "nassoc">;

function snapshot(s: Snapshot): Snapshot {
  return {
    flags: new Uint16Array(s.flags),
    dotx: new Int16Array(s.dotx),
    doty: new Int16Array(s.doty),
    nassoc: new Int16Array(s.nassoc),
  };
}

function restore(s: Snapshot, from: Snapshot): void {
  s.flags.set(from.flags);
  s.dotx.set(from.dotx);
  s.doty.set(from.doty);
  s.nassoc.set(from.nassoc);
}

function solverRecurse(
  s: GalaxiesState,
  maxDiff: GalaxiesDiff,
  depth: number,
): GalaxiesDiff {
  if (depth >= MAX_RECURSE) return GalaxiesDiff.Unfinished;
  const pick = pickRecurseTarget(s);
  if (!pick) return GalaxiesDiff.Impossible;

  const base = snapshot(s);
  let diff: GalaxiesDiff = GalaxiesDiff.Impossible;
  let best: Snapshot | null = null;

  for (const dot of s.dots) {
    restore(s, base);
    if (!couldOwn(s, pick.x, pick.y, dot.x, dot.y)) continue;
    solverAddAssoc(s, pick.x, pick.y, dot.x, dot.y);

    const ret = solverStateInner(s, maxDiff, depth + 1);
    if (diff === GalaxiesDiff.Impossible && ret !== GalaxiesDiff.Impossible) {
      best = snapshot(s);
    }
    if (ret === GalaxiesDiff.Ambiguous || ret === GalaxiesDiff.Unfinished) {
      diff = ret;
    } else if (ret !== GalaxiesDiff.Impossible) {
      // Precisely one solution under this branch.
      if (diff === GalaxiesDiff.Impossible) diff = GalaxiesDiff.Unreasonable;
      else diff = GalaxiesDiff.Ambiguous;
    }
    if (diff === GalaxiesDiff.Ambiguous || diff === GalaxiesDiff.Unfinished) {
      break;
    }
  }

  restore(s, best ?? base);
  return diff;
}

/**
 * The four rungs, all at one tier, for {@link solverStateInner}. They already
 * return the runner's convention (`IMPOSSIBLE` -1, `NOTHING` 0, `PROGRESS` 1),
 * and each still takes `rec`, so the runner carries the hint's recording
 * through unchanged.
 */
function galaxiesLadder(s: GalaxiesState, rec?: SolverRecorder): DeductionTechnique[] {
  return [
    {
      id: "lines-opposite",
      tier: GalaxiesDiff.Normal,
      run: () => solverLinesOpposite(s, rec),
    },
    {
      id: "spaces-oneposs",
      tier: GalaxiesDiff.Normal,
      run: () => solverSpacesOneposs(s, rec),
    },
    {
      id: "expand-dots",
      tier: GalaxiesDiff.Normal,
      run: () => solverExpandDots(s, rec),
    },
    {
      id: "extend-exclaves",
      tier: GalaxiesDiff.Normal,
      run: () => solverExtendExclaves(s, rec),
    },
  ];
}

function solverStateInner(
  s: GalaxiesState,
  maxDiff: GalaxiesDiff,
  depth: number,
  rec?: SolverRecorder,
  firings?: FiringTally,
): GalaxiesDiff {
  const ret = solverObvious(s, rec);
  if (ret === IMPOSSIBLE) return GalaxiesDiff.Impossible;

  const ladder = galaxiesLadder(s, rec);
  // `GalaxiesDiff`'s members above Normal are verdicts, not harder tiers:
  // every rung is Normal, and `maxDiff` gates only the recursion below.
  const { grade: diff, impossible } = runDeductionFixpoint({
    techniques: ladder,
    firings,
    baseGrade: GalaxiesDiff.Normal,
  });
  if (impossible) return GalaxiesDiff.Impossible;

  const { complete } = checkComplete(s, false);
  if (complete) return diff;
  if (maxDiff >= GalaxiesDiff.Unreasonable) {
    return solverRecurse(s, maxDiff, depth);
  }
  return GalaxiesDiff.Unfinished;
}

/** Run the difficulty-graded solver on `s` (mutated in place).
 * Returns the *minimum* difficulty at which the puzzle is uniquely
 * solvable, or `Ambiguous` / `Impossible` / `Unfinished`. */
export function solverState(
  s: GalaxiesState,
  maxDiff: GalaxiesDiff,
  firings?: FiringTally,
): GalaxiesDiff {
  return solverStateInner(s, maxDiff, 0, undefined, firings);
}

/**
 * The hand-written ladder the runner replaced, kept as the oracle
 * `galaxies-ladder.test.ts` checks it against. It stops before the recursion,
 * which was not re-plumbed and would only compare a path with itself.
 */
export function galaxiesLadderLegacy(
  s: GalaxiesState,
  rec?: SolverRecorder,
): GalaxiesDiff {
  let ret = solverObvious(s, rec);
  if (ret === IMPOSSIBLE) return GalaxiesDiff.Impossible;

  let diff = GalaxiesDiff.Normal;
  while (true) {
    ret = solverLinesOpposite(s, rec);
    if (ret === IMPOSSIBLE) return GalaxiesDiff.Impossible;
    if (ret === PROGRESS) {
      diff = Math.max(diff, GalaxiesDiff.Normal);
      continue;
    }
    ret = solverSpacesOneposs(s, rec);
    if (ret === IMPOSSIBLE) return GalaxiesDiff.Impossible;
    if (ret === PROGRESS) {
      diff = Math.max(diff, GalaxiesDiff.Normal);
      continue;
    }
    ret = solverExpandDots(s, rec);
    if (ret === IMPOSSIBLE) return GalaxiesDiff.Impossible;
    if (ret === PROGRESS) {
      diff = Math.max(diff, GalaxiesDiff.Normal);
      continue;
    }
    ret = solverExtendExclaves(s, rec);
    if (ret === IMPOSSIBLE) return GalaxiesDiff.Impossible;
    if (ret === PROGRESS) {
      diff = Math.max(diff, GalaxiesDiff.Normal);
      continue;
    }
    break;
  }
  return diff;
}

/** The adopted ladder alone, stopping where {@link galaxiesLadderLegacy} does,
 * so the two are comparable. */
export function galaxiesLadderOnly(
  s: GalaxiesState,
  firings?: FiringTally,
): GalaxiesDiff {
  const ret = solverObvious(s, undefined);
  if (ret === IMPOSSIBLE) return GalaxiesDiff.Impossible;

  const ladder = galaxiesLadder(s, undefined);
  const { grade, impossible } = runDeductionFixpoint({
    techniques: ladder,
    firings,
    baseGrade: GalaxiesDiff.Normal,
  });
  return impossible ? GalaxiesDiff.Impossible : grade;
}

// --- the hint's two entry points into these rules --------------------

/**
 * One rule of the deduction chain, as the hint consumes it: run it against the
 * board and return the single firing it records, or `null`.
 *
 * The *order* these are tried in is a narration decision, not a solver one —
 * every rule is run to a fixpoint either way, so ordering changes which
 * explanation the player is offered first and nothing about what is
 * deducible. The ladder therefore lives in `hint.ts`.
 */
export interface GalaxiesRung {
  readonly name: string;
  fire(s: GalaxiesState): GalaxiesFiring | null;
}

function rungOf(
  name: string,
  run: (s: GalaxiesState, rec: SolverRecorder) => number,
): GalaxiesRung {
  return {
    name,
    fire(s) {
      const rec = newRecorder(true);
      if (run(s, rec) === IMPOSSIBLE) return null;
      return rec.firing;
    },
  };
}

const SEPARATE_ONLY: LineRules = { separate: true, mirror: false };
const MIRROR_ONLY: LineRules = { separate: false, mirror: true };

/** The rules, named. `hint.ts` picks the order. */
export const RUNGS = {
  dotOwnCells: rungOf("dotOwnCells", solverObvious),
  separate: rungOf("separate", (b, r) => solverLinesOpposite(b, r, SEPARATE_ONLY)),
  enclosed: rungOf("enclosed", solverSpacesOneposs),
  reach: rungOf("reach", solverExpandDots),
  exclave: rungOf("exclave", solverExtendExclaves),
  mirrorWall: rungOf("mirrorWall", (b, r) => solverLinesOpposite(b, r, MIRROR_ONLY)),
};

/** Upstream's `clear_game(state, false)`: clear everything but the dots and the
 * border edges, giving the board's starting position. */
export function clearForSolve(s: GalaxiesState): void {
  for (let y = 1; y < s.sy - 1; y++) {
    for (let x = 1; x < s.sx - 1; x++) {
      const i = idx(s, x, y);
      s.flags[i] &= F_DOT | F_DOT_BLACK;
      s.dotx[i] = 0;
      s.doty[i] = 0;
      if (s.flags[i] & F_DOT) s.nassoc[i] = 0;
    }
  }
}

// Re-export the deduction primitives for testing.
export const _internals = {
  solverObvious,
  solverLinesOpposite,
  solverSpacesOneposs,
  solverExpandDots,
  solverExtendExclaves,
};
