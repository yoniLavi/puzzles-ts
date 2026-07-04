/**
 * Separate solver — faithful port of `separate.c`'s `solver_attempt`.
 *
 * Two deductions alternate to a fixpoint over a disjoint-set forest of squares:
 *
 *  1. **Disconnect on a shared letter.** Two grid-adjacent squares whose dsf
 *     components already contain a common letter can never be one region — mark
 *     the component pair disconnected.
 *  2. **Forced single extension.** A component below the target size `k` with
 *     exactly one legal neighbouring square to grow into must take it — merge.
 *
 * Per-component bookkeeping (all indexed by the dsf canonical root):
 *  - `size[root]` — component size.
 *  - `contents[root*k + letter]` — the grid index contributing `letter` to this
 *    component, or `-1` if the component lacks it. The C "add the two and add 1"
 *    merge trick (given at most one is ≥0) is kept verbatim.
 *  - `disconnect[root1*wh + root2]` — components known to be distinct regions.
 *
 * The generator only keeps a board the solver fully solves, so on a real board
 * running this to a fixpoint yields *the* unique partition.
 */
import { Dsf } from "../../engine/dsf.ts";
import {
  BORDER_D,
  BORDER_L,
  BORDER_R,
  BORDER_U,
  initBorders,
  type SeparateParams,
} from "./state.ts";

/** Solver verdict, mirroring upstream's 0/1/2. */
export const STUCK = 0;
export const PROGRESS = 1;
export const SOLVED = 2;

class SolverScratch {
  readonly w: number;
  readonly h: number;
  readonly k: number;
  readonly wh: number;
  dsf: Dsf;
  size: Int32Array;
  contents: Int32Array;
  disconnect: Uint8Array; // wh*wh boolean matrix
  tmp: Int32Array;

  constructor(w: number, h: number, k: number) {
    this.w = w;
    this.h = h;
    this.k = k;
    this.wh = w * h;
    this.dsf = new Dsf(this.wh);
    this.size = new Int32Array(this.wh);
    this.contents = new Int32Array(this.wh * k);
    this.disconnect = new Uint8Array(this.wh * this.wh);
    this.tmp = new Int32Array(this.wh);
  }

  init(): void {
    const { wh } = this;
    this.dsf = new Dsf(wh);
    this.size.fill(1);
    this.disconnect.fill(0);
  }

  connect(yx1: number, yx2: number): void {
    const { k, wh } = this;
    yx1 = this.dsf.canonify(yx1);
    yx2 = this.dsf.canonify(yx2);
    // assert(yx1 !== yx2)
    this.dsf.merge(yx1, yx2);
    const yxnew = this.dsf.canonify(yx2);

    this.size[yxnew] = this.size[yx1] + this.size[yx2];

    // Union the contents: at most one of the pair holds each letter, so
    // (a + b + 1) yields -1 iff both were -1, else the other index.
    for (let i = 0; i < k; i++) {
      this.contents[yxnew * k + i] =
        this.contents[yx1 * k + i] + this.contents[yx2 * k + i] + 1;
    }

    // Merge disconnect rows and columns.
    for (let i = 0; i < wh; i++)
      this.disconnect[yxnew * wh + i] =
        this.disconnect[yx1 * wh + i] || this.disconnect[yx2 * wh + i];
    for (let i = 0; i < wh; i++)
      this.disconnect[i * wh + yxnew] =
        this.disconnect[i * wh + yx1] || this.disconnect[i * wh + yx2];
  }

  disconnectPair(yx1: number, yx2: number): void {
    const { wh } = this;
    yx1 = this.dsf.canonify(yx1);
    yx2 = this.dsf.canonify(yx2);
    this.disconnect[yx1 * wh + yx2] = 1;
    this.disconnect[yx2 * wh + yx1] = 1;
  }
}

/**
 * One full solve attempt over `letters` on the given scratch (which must have
 * been `init()`ed). `genLock`, when supplied, records which grid squares' letters
 * a deduction has depended on (for the generator). Returns STUCK / PROGRESS /
 * SOLVED, mutating the scratch's dsf to the deduced partition.
 */
export function solverAttempt(
  sc: SolverScratch,
  letters: Uint8Array,
  genLock: Uint8Array | null,
): number {
  const { w, h, k, wh } = sc;
  let doneOverall = false;

  // Set up the contents array from the grid + current dsf.
  sc.contents.fill(-1);
  for (let i = 0; i < wh; i++) sc.contents[sc.dsf.canonify(i) * k + letters[i]] = i;

  for (;;) {
    let done = false;

    // (1) Disconnect pass: adjacent squares in distinct, not-yet-disconnected
    // components that share a letter.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let dir = 0; dir < 2; dir++) {
          const x2 = x + dir;
          const y2 = y + 1 - dir;
          if (x2 >= w || y2 >= h) continue;
          const yx = sc.dsf.canonify(y * w + x);
          const yx2 = sc.dsf.canonify(y2 * w + x2);
          if (yx === yx2) continue;
          if (sc.disconnect[yx * wh + yx2]) continue;

          let i = 0;
          for (; i < k; i++)
            if (sc.contents[yx * k + i] >= 0 && sc.contents[yx2 * k + i] >= 0) break;
          if (i === k) continue; // no letter in common

          sc.disconnectPair(yx, yx2);
          done = doneOverall = true;
          if (genLock) {
            genLock[sc.contents[yx * k + i]] = 1;
            genLock[sc.contents[yx2 * k + i]] = 1;
          }
        }
      }
    }

    // (2) Forced-extension pass: an under-size component with exactly one legal
    // square to grow into.
    sc.tmp.fill(-1);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const yx = sc.dsf.canonify(y * w + x);
        if (sc.size[yx] === k) continue;
        for (let dir = 0; dir < 4; dir++) {
          const x2 = x + (dir === 0 ? -1 : dir === 2 ? 1 : 0);
          const y2 = y + (dir === 1 ? -1 : dir === 3 ? 1 : 0);
          if (y2 < 0 || y2 >= h || x2 < 0 || x2 >= w) continue;
          const yx2 = y2 * w + x2;
          const yx2c = sc.dsf.canonify(yx2);
          if (yx2c !== yx && !sc.disconnect[yx2c * wh + yx]) {
            if (sc.tmp[yx] === -1) sc.tmp[yx] = yx2;
            else if (sc.tmp[yx] !== yx2) sc.tmp[yx] = -2; // multiple choices
          }
        }
      }
    }
    for (let i = 0; i < wh; i++) {
      if (sc.tmp[i] >= 0) {
        // Skip if the two ends were already connected this loop (can happen if
        // this was the sole extension for both components).
        if (sc.dsf.canonify(i) === sc.dsf.canonify(sc.tmp[i])) continue;
        sc.connect(i, sc.tmp[i]);
        done = doneOverall = true;
        break;
      }
    }

    if (!done) break;
  }

  for (let i = 0; i < wh; i++)
    if (sc.size[sc.dsf.canonify(i)] !== k) {
      return doneOverall ? PROGRESS : STUCK;
    }
  return SOLVED;
}

/** A fresh scratch (for the generator, which reuses it across letter fills). */
export function newSolverScratch(w: number, h: number, k: number): SolverScratch {
  return new SolverScratch(w, h, k);
}
export type { SolverScratch };

/**
 * Solve a board from its letters. Returns the deduced partition dsf if fully
 * solved, else `null` (not uniquely deducible by these rules).
 */
export function solve(p: SeparateParams, letters: Uint8Array): Dsf | null {
  const sc = new SolverScratch(p.w, p.h, p.k);
  sc.init();
  const r = solverAttempt(sc, letters, null);
  return r === SOLVED ? sc.dsf : null;
}

/**
 * The unique solution's wall bytes (only wall bits set, including the rim), or
 * `null` if the board is not fully deducible. A wall lies on every edge between
 * two different components.
 */
export function solveToBorders(
  p: SeparateParams,
  letters: Uint8Array,
): Uint8Array | null {
  const dsf = solve(p, letters);
  if (!dsf) return null;
  const { w, h } = p;
  const sol = initBorders(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x + 1 < w && !dsf.equivalent(i, i + 1)) {
        sol[i] |= BORDER_R;
        sol[i + 1] |= BORDER_L;
      }
      if (y + 1 < h && !dsf.equivalent(i, i + w)) {
        sol[i] |= BORDER_D;
        sol[i + w] |= BORDER_U;
      }
    }
  }
  return sol;
}
