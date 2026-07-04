/**
 * Slant solver — faithful port of `slant_solve` in slant.c.
 *
 * Byte-match discipline (playbook §4.4): the generator removes clues while
 * this solver still reports a unique solution, so the published clue set —
 * and hence the desc — is decided entirely by this solver's verdict on every
 * intermediate board. Every deduction, its sweep order, and its exact
 * bookkeeping must match C's, including the per-difficulty technique gating
 * and the release-build `fillSquare` semantics (see below).
 *
 * Techniques, per difficulty:
 * - Easy: clue-point counting (fill/empty around a clue whose remaining
 *   lines are 0 or equal its undecided neighbours) + immediate loop
 *   avoidance (the square pass).
 * - Hard adds: single-pair equivalence tracking around clue points,
 *   slash-value propagation through equivalence classes, dead-end avoidance
 *   over the vertex-connectivity DSF, and the v-shape bitmap deductions.
 */
import { Dsf } from "../../engine/dsf.ts";
import { DIFF_EASY, DIFF_HARD, type Slash } from "./state.ts";

/** Solver verdicts (upstream's 0 / 1 / 2 return codes). */
export const SOLVE_IMPOSSIBLE = 0;
export const SOLVE_UNIQUE = 1;
export const SOLVE_NOT_CONVERGED = 2;
export type SolveVerdict =
  | typeof SOLVE_IMPOSSIBLE
  | typeof SOLVE_UNIQUE
  | typeof SOLVE_NOT_CONVERGED;

/**
 * The four move-producing techniques of `slant_solve`. The v-shape /
 * equivalence-merge pass never places a square — it only feeds the
 * `equiv`/`vbitmap` state that later square-pass firings read — so the hint
 * has exactly these to narrate.
 */
export type SlantTechnique = "clue-fill" | "clue-empty" | "loop" | "deadend" | "equiv";

/** One square placed by a firing. */
export interface SlantPlacement {
  x: number;
  y: number;
  v: Slash;
}

/** A single deduction firing, recorded for the hint (D1). */
export interface SlantFiring {
  technique: SlantTechnique;
  /** The square(s) this one firing forces (1, or up to 4 for a clue). */
  moves: SlantPlacement[];
  /** Driving clue vertex + value (clue-fill / clue-empty). */
  clue?: { x: number; y: number; c: number };
  /** A same-class already-filled square (equivalence anchor). */
  anchor?: { x: number; y: number };
  /** Snapshot of `soln` just after this firing (stale-safe evidence — the
   * Range `HintMove.grid` pattern). */
  grid: Int8Array;
}

/** Options for the recording / seeded solve path (the generator passes none,
 * keeping its call byte-identical). */
export interface SlantSolveOpts {
  record?: (f: SlantFiring) => void;
  /** Replay these placed diagonals before deducing, so the recorded plan
   * continues from the player's position. */
  seedFrom?: Int8Array;
}

/** Find an already-filled square in the same equivalence class as (x, y) — the
 * "share a fate" anchor an equivalence firing propagates from. */
function findEquivAnchor(
  sc: SolverScratch,
  soln: Int8Array,
  w: number,
  h: number,
  x: number,
  y: number,
): { x: number; y: number } | undefined {
  const cls = sc.equiv.canonify(y * w + x);
  for (let i = 0; i < w * h; i++) {
    if (soln[i] !== 0 && sc.equiv.canonify(i) === cls) {
      return { x: i % w, y: Math.floor(i / w) };
    }
  }
  return undefined;
}

/** Reusable scratch space (upstream `struct solver_scratch`). */
export class SolverScratch {
  /** Connectivity between grid points, via placed diagonals. */
  readonly connected: Dsf;
  /** Possible *simultaneous* exits from each connected point set, stored at
   * the set's canonical root. */
  readonly exits: Int32Array;
  /** Whether each connected point set includes a border point (at root). */
  readonly border: Uint8Array;
  /** Squares known to slant in the same direction. */
  readonly equiv: Dsf;
  /** Known slash value per equivalence class (at the canonical root). */
  readonly slashval: Int8Array;
  /** Possible v-shapes per square: bit 0 `v` / bit 1 `^` with the square to
   * the right; bit 2 `>` / bit 3 `<` with the square below. */
  readonly vbitmap: Uint8Array;
  clues: Int8Array | null = null;

  constructor(w: number, h: number) {
    const W = w + 1;
    const H = h + 1;
    this.connected = new Dsf(W * H);
    this.exits = new Int32Array(W * H);
    this.border = new Uint8Array(W * H);
    this.equiv = new Dsf(w * h);
    this.slashval = new Int8Array(w * h);
    this.vbitmap = new Uint8Array(w * h);
  }
}

/**
 * Merge two vertex classes, combining their exit counts and border flags
 * (upstream `merge_vertices`). One possible exit of each class has just
 * been used, hence the −2.
 */
function mergeVertices(connected: Dsf, sc: SolverScratch | null, i: number, j: number) {
  let exits = -1;
  let border = false;
  if (sc) {
    i = connected.canonify(i);
    j = connected.canonify(j);
    exits = sc.exits[i] + sc.exits[j] - 2;
    border = sc.border[i] !== 0 || sc.border[j] !== 0;
  }
  connected.merge(i, j);
  if (sc) {
    const root = connected.canonify(i);
    sc.exits[root] = exits;
    sc.border[root] = border ? 1 : 0;
  }
}

/** One way out of a non-clue point was just blocked; decrement its class's
 * exit count (upstream `decr_exits`). */
function decrExits(sc: SolverScratch, i: number) {
  if (sc.clues && sc.clues[i] < 0) {
    const root = sc.connected.canonify(i);
    sc.exits[root]--;
  }
}

/**
 * Place slash `v` in square (x, y) (upstream `fill_square`).
 *
 * RELEASE-BUILD SEMANTICS, deliberately: upstream's "already filled with the
 * opposite value" and "would make a loop" early-outs `return false` only
 * under `SOLVER_DIAGNOSTICS`, which neither the shipped build nor the trace
 * harness defines — so in the build we are byte-matching, `fill_square`
 * never fails and will overwrite. Porting the diagnostics semantics would
 * change solver verdicts (design D2).
 */
export function fillSquare(
  w: number,
  _h: number,
  x: number,
  y: number,
  v: number,
  soln: Int8Array,
  connected: Dsf,
  sc: SolverScratch | null,
): void {
  const W = w + 1;
  if (soln[y * w + x] === v) return; // do nothing

  let ci1: number;
  let ci2: number; // vertices the new slash connects
  let di1: number;
  let di2: number; // the other two, which it disconnects
  if (v < 0) {
    ci1 = y * W + x;
    ci2 = (y + 1) * W + (x + 1);
    di1 = y * W + (x + 1);
    di2 = (y + 1) * W + x;
  } else {
    ci1 = y * W + (x + 1);
    ci2 = (y + 1) * W + x;
    di1 = y * W + x;
    di2 = (y + 1) * W + (x + 1);
  }

  soln[y * w + x] = v;

  if (sc) {
    const c = sc.equiv.canonify(y * w + x);
    sc.slashval[c] = v;
  }

  mergeVertices(connected, sc, ci1, ci2);
  if (sc) {
    decrExits(sc, di1);
    decrExits(sc, di2);
  }
}

/** Clear `vbits` out of square (x, y)'s v-shape bitmap; true if any bit was
 * actually cleared (upstream `vbitmap_clear`, minus the diagnostics). */
function vbitmapClear(
  w: number,
  sc: SolverScratch,
  x: number,
  y: number,
  vbits: number,
): boolean {
  const cleared = vbits & sc.vbitmap[y * w + x];
  if (cleared) sc.vbitmap[y * w + x] &= ~cleared;
  return cleared !== 0;
}

/**
 * The solver (upstream `slant_solve`). Writes the deduced solution into
 * `soln` and returns the verdict.
 */
export function slantSolve(
  w: number,
  h: number,
  clues: Int8Array,
  soln: Int8Array,
  sc: SolverScratch,
  difficulty: number,
  opts?: SlantSolveOpts,
): SolveVerdict {
  const W = w + 1;
  const H = h + 1;
  const record = opts?.record;

  soln.fill(0);
  sc.clues = clues;
  sc.connected.reinit();
  sc.equiv.reinit();
  sc.slashval.fill(0);
  sc.vbitmap.fill(0xf);

  // `exits`/`border` power second-order loop avoidance: every point must
  // connect to the border somehow (else a loop would surround it). A "dead
  // end" is a borderless point group with at most one connection left; two
  // dead ends must never be joined.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      sc.border[y * W + x] = y === 0 || y === H - 1 || x === 0 || x === W - 1 ? 1 : 0;
      sc.exits[y * W + x] = clues[y * W + x] < 0 ? 4 : clues[y * W + x];
    }
  }

  // Hint path: replay the player's current marks so the recorded plan
  // continues from their position (syncing connectivity / exits / equiv).
  if (opts?.seedFrom) {
    for (let i = 0; i < w * h; i++) {
      const v = opts.seedFrom[i];
      if (v !== 0) {
        fillSquare(w, h, i % w, Math.floor(i / w), v, soln, sc.connected, sc);
      }
    }
  }

  let doneSomething: boolean;
  do {
    doneSomething = false;

    /*
     * Clue-point pass: any clue point with the number of remaining lines
     * equal to zero or to the number of remaining undecided neighbouring
     * squares can be filled in completely.
     */
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = clues[y * W + x];
        if (c < 0) continue;

        // The clue's neighbouring squares, in order around the point, with
        // the slash each would need to connect to the point.
        const nPos: number[] = [];
        const nSlash: number[] = [];
        if (x > 0 && y > 0) {
          nPos.push((y - 1) * w + (x - 1));
          nSlash.push(-1);
        }
        if (x > 0 && y < h) {
          nPos.push(y * w + (x - 1));
          nSlash.push(1);
        }
        if (x < w && y < h) {
          nPos.push(y * w + x);
          nSlash.push(-1);
        }
        if (x < w && y > 0) {
          nPos.push((y - 1) * w + x);
          nSlash.push(1);
        }
        const nneighbours = nPos.length;

        // Count undecided neighbours (nu) and remaining lines (nl). Above
        // Easy, also track ONE pair of adjacent undecided squares in the
        // same equivalence class — they share a slash value, so exactly one
        // of them connects: count them jointly as one line.
        let nu = 0;
        let nl = c;
        let last = nPos[nneighbours - 1];
        let eq = soln[last] === 0 ? sc.equiv.canonify(last) : -1;
        let meq = -1;
        let mj1 = -1;
        let mj2 = -1;
        for (let i = 0; i < nneighbours; i++) {
          const j = nPos[i];
          const s = nSlash[i];
          if (soln[j] === 0) {
            nu++;
            if (meq < 0 && difficulty > DIFF_EASY) {
              const eq2 = sc.equiv.canonify(j);
              if (eq === eq2 && last !== j) {
                // Found an equivalent pair. This also inhibits any further
                // equivalence tracking around this point (only one pair can
                // be handled; overlapping pairs would mislead).
                meq = eq;
                mj1 = last;
                mj2 = j;
                nl--; // count one line
                nu -= 2; // and lose two undecideds
              } else {
                eq = eq2;
              }
            }
          } else {
            eq = -1;
            if (soln[j] === s) nl--; // here's a line
          }
          last = j;
        }

        if (nl < 0 || nl > nu) return SOLVE_IMPOSSIBLE;

        if (nu > 0 && (nl === 0 || nl === nu)) {
          // Fill (nl > 0) or empty (nl === 0) every undecided neighbour
          // except a tracked equivalent pair.
          const placed: SlantPlacement[] = [];
          for (let i = 0; i < nneighbours; i++) {
            const j = nPos[i];
            const s = nSlash[i];
            if (soln[j] === 0 && j !== mj1 && j !== mj2) {
              const sv = (nl ? s : -s) as Slash;
              fillSquare(w, h, j % w, Math.floor(j / w), sv, soln, sc.connected, sc);
              if (record) placed.push({ x: j % w, y: Math.floor(j / w), v: sv });
            }
          }
          record?.({
            technique: nl ? "clue-fill" : "clue-empty",
            moves: placed,
            clue: { x, y, c },
            grid: soln.slice(),
          });
          doneSomething = true;
        } else if (nu === 2 && nl === 1 && difficulty > DIFF_EASY) {
          // Precisely two undecided squares and one line to place between
          // them: if those squares are adjacent around the point, mark them
          // equivalent. (Applies even when meq >= 0 — a 2 point with two
          // neighbours already equivalent lets us pair the other two.)
          // Upstream does NOT set done_something here; the merge's effect
          // is only picked up by later passes. Faithful.
          let lastIdx = -1;
          let i: number;
          for (i = 0; i < nneighbours; i++) {
            const j = nPos[i];
            if (soln[j] === 0 && j !== mj1 && j !== mj2) {
              if (lastIdx < 0) lastIdx = i;
              else if (lastIdx === i - 1 || (lastIdx === 0 && i === 3)) break; // adjacent pair
            }
          }
          if (i < nneighbours) {
            let a = sc.equiv.canonify(nPos[lastIdx]);
            const sv1 = sc.slashval[a];
            const b = sc.equiv.canonify(nPos[i]);
            const sv2 = sc.slashval[b];
            if (sv1 !== 0 && sv2 !== 0 && sv1 !== sv2) return SOLVE_IMPOSSIBLE;
            const sv = sv1 !== 0 ? sv1 : sv2;
            sc.equiv.merge(a, b);
            a = sc.equiv.canonify(a);
            sc.slashval[a] = sv;
          }
        }
      }
    }

    if (doneSomething) continue;

    /*
     * Square pass: no square may complete a loop; above Easy, also dead-end
     * avoidance and equivalence-class slash values.
     */
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (soln[y * w + x]) continue;

        let fs = false;
        let bs = false;
        let reason: SlantTechnique = "loop";
        const v =
          difficulty > DIFF_EASY ? sc.slashval[sc.equiv.canonify(y * w + x)] : 0;

        // Rule out connecting (x,y)–(x+1,y+1)? Then it must be a forward
        // slash.
        {
          const c1 = sc.connected.canonify(y * W + x);
          const c2 = sc.connected.canonify((y + 1) * W + (x + 1));
          if (c1 === c2) {
            fs = true;
            reason = "loop";
          }
          if (
            difficulty > DIFF_EASY &&
            !sc.border[c1] &&
            !sc.border[c2] &&
            sc.exits[c1] <= 1 &&
            sc.exits[c2] <= 1
          ) {
            fs = true;
            reason = "deadend";
          }
          if (v === 1) {
            fs = true;
            reason = "equiv";
          }
        }

        // Same between (x+1,y)–(x,y+1) for a backslash.
        {
          const c1 = sc.connected.canonify(y * W + (x + 1));
          const c2 = sc.connected.canonify((y + 1) * W + x);
          if (c1 === c2) {
            bs = true;
            reason = "loop";
          }
          if (
            difficulty > DIFF_EASY &&
            !sc.border[c1] &&
            !sc.border[c2] &&
            sc.exits[c1] <= 1 &&
            sc.exits[c2] <= 1
          ) {
            bs = true;
            reason = "deadend";
          }
          if (v === -1) {
            bs = true;
            reason = "equiv";
          }
        }

        if (fs && bs) return SOLVE_IMPOSSIBLE;
        if (fs || bs) {
          const sv: Slash = fs ? 1 : -1;
          // For an equivalence firing, the anchor must be found BEFORE the
          // fill merges this square into the class as another filled member.
          const anchor =
            record && reason === "equiv"
              ? findEquivAnchor(sc, soln, w, h, x, y)
              : undefined;
          fillSquare(w, h, x, y, sv, soln, sc.connected, sc);
          record?.({
            technique: reason,
            moves: [{ x, y, v: sv }],
            anchor,
            grid: soln.slice(),
          });
          doneSomething = true;
        }
      }
    }

    if (doneSomething) continue;

    // All vbitmap deductions are disabled at Easy.
    if (difficulty <= DIFF_EASY) continue;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // A placed slash rules out contradicting v-shapes with each
        // neighbour.
        const s = soln[y * w + x];
        if (s !== 0) {
          if (x > 0) {
            doneSomething =
              vbitmapClear(w, sc, x - 1, y, s < 0 ? 0x1 : 0x2) || doneSomething;
          }
          if (x + 1 < w) {
            doneSomething =
              vbitmapClear(w, sc, x, y, s < 0 ? 0x2 : 0x1) || doneSomething;
          }
          if (y > 0) {
            doneSomething =
              vbitmapClear(w, sc, x, y - 1, s < 0 ? 0x4 : 0x8) || doneSomething;
          }
          if (y + 1 < h) {
            doneSomething =
              vbitmapClear(w, sc, x, y, s < 0 ? 0x8 : 0x4) || doneSomething;
          }
        }

        // Both v-shapes ruled out for an adjacent pair ⇒ the pair is
        // equivalent. (Upstream merges without reconciling slashval — the
        // orphaned class's value is simply lost; faithful.)
        if (x + 1 < w && !(sc.vbitmap[y * w + x] & 0x3)) {
          const n1 = y * w + x;
          const n2 = y * w + (x + 1);
          if (sc.equiv.canonify(n1) !== sc.equiv.canonify(n2)) {
            sc.equiv.merge(n1, n2);
            doneSomething = true;
          }
        }
        if (y + 1 < h && !(sc.vbitmap[y * w + x] & 0xc)) {
          const n1 = y * w + x;
          const n2 = (y + 1) * w + x;
          if (sc.equiv.canonify(n1) !== sc.equiv.canonify(n2)) {
            sc.equiv.merge(n1, n2);
            doneSomething = true;
          }
        }

        // The rest works around interior clue points only.
        if (y === 0 || x === 0) continue;
        const c = clues[y * W + x];
        if (c < 0) continue;

        if (c === 1) {
          // A 1 clue can never have any v-shape pointing at it.
          doneSomething = vbitmapClear(w, sc, x - 1, y - 1, 0x5) || doneSomething;
          doneSomething = vbitmapClear(w, sc, x - 1, y, 0x2) || doneSomething;
          doneSomething = vbitmapClear(w, sc, x, y - 1, 0x8) || doneSomething;
        } else if (c === 3) {
          // A 3 clue can never have any v-shape pointing away from it.
          doneSomething = vbitmapClear(w, sc, x - 1, y - 1, 0xa) || doneSomething;
          doneSomething = vbitmapClear(w, sc, x - 1, y, 0x1) || doneSomething;
          doneSomething = vbitmapClear(w, sc, x, y - 1, 0x4) || doneSomething;
        } else if (c === 2) {
          // A v-shape ruled out on one side of a 2 is ruled out on the
          // other side too.
          doneSomething =
            vbitmapClear(
              w,
              sc,
              x - 1,
              y - 1,
              (sc.vbitmap[y * w + (x - 1)] & 0x3) ^ 0x3,
            ) || doneSomething;
          doneSomething =
            vbitmapClear(
              w,
              sc,
              x - 1,
              y - 1,
              (sc.vbitmap[(y - 1) * w + x] & 0xc) ^ 0xc,
            ) || doneSomething;
          doneSomething =
            vbitmapClear(
              w,
              sc,
              x - 1,
              y,
              (sc.vbitmap[(y - 1) * w + (x - 1)] & 0x3) ^ 0x3,
            ) || doneSomething;
          doneSomething =
            vbitmapClear(
              w,
              sc,
              x,
              y - 1,
              (sc.vbitmap[(y - 1) * w + (x - 1)] & 0xc) ^ 0xc,
            ) || doneSomething;
        }
      }
    }
  } while (doneSomething);

  // No more progress: solved iff the grid is full.
  return soln.includes(0) ? SOLVE_NOT_CONVERGED : SOLVE_UNIQUE;
}

/**
 * Run the Hard solver from the player's current marks, recording every
 * remaining forced firing in deduction order (the Range `deduceHintPlan`
 * pattern). Returns the ordered firings the player has not yet made — the
 * raw material for the hint plan.
 */
export function deduceHintPlan(
  w: number,
  h: number,
  clues: Int8Array,
  soln: Int8Array,
): SlantFiring[] {
  const sc = new SolverScratch(w, h);
  const scratch = new Int8Array(w * h);
  const firings: SlantFiring[] = [];
  slantSolve(w, h, clues, scratch, sc, DIFF_HARD, {
    seedFrom: soln,
    record: (f) => firings.push(f),
  });
  return firings;
}

/**
 * Solve a board's clues from scratch at Hard (the full solver), as
 * `solve()` and `findMistakes` need. Returns the solution array on a
 * unique solve, or the failure kind.
 */
export function solveFromClues(
  w: number,
  h: number,
  clues: Int8Array,
): { soln: Int8Array } | { error: "impossible" | "ambiguous" } {
  const sc = new SolverScratch(w, h);
  const soln = new Int8Array(w * h);
  const ret = slantSolve(w, h, clues, soln, sc, DIFF_HARD);
  if (ret === SOLVE_UNIQUE) return { soln };
  return { error: ret === SOLVE_IMPOSSIBLE ? "impossible" : "ambiguous" };
}
