/**
 * Tracks solver — a faithful port of `tracks_solve` and its deduction rungs
 * from `tracks.c`. Because the generator is solver-gated (it lays and strips
 * clues by re-running this solver and keeping only removals that stay soluble
 * at exactly the target difficulty), the desc is decided by this solver's
 * *verdict* on every intermediate board, so the port reproduces C's deductions
 * — and their order — verbatim (playbook §4.4). Reused by `solve()` and
 * `findMistakes`.
 */
import { Dsf } from "../../engine/dsf.ts";
import { findLoops } from "../../engine/findloop.ts";
import {
  ALLDIR,
  type Board,
  checkCompletion,
  D,
  DIFF_EASY,
  DIFF_HARD,
  DIFF_TRICKY,
  DX,
  DY,
  E_NOTRACK,
  E_TRACK,
  inGrid,
  L,
  NBITS,
  R,
  S_CLUE,
  S_MARK,
  S_NOTRACK,
  S_TRACK,
  sEClear,
  sECount,
  sEDirs,
  sEFlags,
  sESet,
  U,
} from "./state.ts";

// --- primitive flag setters (upstream solve_set_sflag / solve_set_eflag) ---

function setSflag(b: Board, x: number, y: number, f: number): number {
  const i = y * b.w + x;
  if (b.sflags[i] & f) return 0;
  if (b.sflags[i] & (f === S_TRACK ? S_NOTRACK : S_TRACK)) b.impossible = true;
  else b.sflags[i] |= f;
  return 1;
}

function setEflag(b: Board, x: number, y: number, d: number, f: number): number {
  const sf = sEFlags(b, x, y, d);
  if (sf & f) return 0;
  if (sf & (f === E_TRACK ? E_NOTRACK : E_TRACK)) b.impossible = true;
  else sESet(b, x, y, d, f);
  return 1;
}

// --- Easy rungs -----------------------------------------------------------

function updateFlags(b: Board): number {
  const { w, h } = b;
  let did = 0;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      // A NOTRACK square's four edges are all NOTRACK.
      if (b.sflags[y * w + x] & S_NOTRACK) {
        for (let i = 0; i < 4; i++) did += setEflag(b, x, y, 1 << i, E_NOTRACK);
      }
      // 3+ NOTRACK edges → the square is NOTRACK.
      if (sECount(b, x, y, E_NOTRACK) >= 3) did += setSflag(b, x, y, S_NOTRACK);
      // Any TRACK edge → the square is TRACK.
      if (sECount(b, x, y, E_TRACK) > 0) did += setSflag(b, x, y, S_TRACK);
      // TRACK square with 2 NOTRACK edges → the other two are TRACK.
      if (
        b.sflags[y * w + x] & S_TRACK &&
        sECount(b, x, y, E_NOTRACK) === 2 &&
        sECount(b, x, y, E_TRACK) < 2
      ) {
        for (let i = 0; i < 4; i++) {
          const d = 1 << i;
          if (!(sEFlags(b, x, y, d) & (E_TRACK | E_NOTRACK))) {
            did += setEflag(b, x, y, d, E_TRACK);
          }
        }
      }
      // TRACK square with 2 TRACK edges → the other two are NOTRACK.
      if (
        b.sflags[y * w + x] & S_TRACK &&
        sECount(b, x, y, E_TRACK) === 2 &&
        sECount(b, x, y, E_NOTRACK) < 2
      ) {
        for (let i = 0; i < 4; i++) {
          const d = 1 << i;
          if (!(sEFlags(b, x, y, d) & (E_TRACK | E_NOTRACK))) {
            did += setEflag(b, x, y, d, E_NOTRACK);
          }
        }
      }
    }
  }
  return did;
}

function countCol(b: Board, col: number, f: number): number {
  let c = 0;
  for (let n = 0, i = col; n < b.h; n++, i += b.w) if (b.sflags[i] & f) c++;
  return c;
}

function countRow(b: Board, row: number, f: number): number {
  let c = 0;
  for (let n = 0, i = b.w * row; n < b.w; n++, i++) if (b.sflags[i] & f) c++;
  return c;
}

function countCluesSub(
  b: Board,
  si: number,
  id: number,
  n: number,
  target: number,
): number {
  const { w } = b;
  let ctrack = 0;
  let cnotrack = 0;
  let did = 0;
  for (let j = 0, i = si; j < n; j++, i += id) {
    if (b.sflags[i] & S_TRACK) ctrack++;
    if (b.sflags[i] & S_NOTRACK) cnotrack++;
  }
  if (ctrack === target) {
    for (let j = 0, i = si; j < n; j++, i += id) {
      if (!(b.sflags[i] & S_TRACK))
        did += setSflag(b, i % w, Math.floor(i / w), S_NOTRACK);
    }
  }
  if (cnotrack === n - target) {
    for (let j = 0, i = si; j < n; j++, i += id) {
      if (!(b.sflags[i] & S_NOTRACK))
        did += setSflag(b, i % w, Math.floor(i / w), S_TRACK);
    }
  }
  return did;
}

function countClues(b: Board): number {
  const { w, h } = b;
  let did = 0;
  for (let x = 0; x < w; x++) did += countCluesSub(b, x, w, h, b.numbers[x]);
  for (let y = 0; y < h; y++) did += countCluesSub(b, y * w, 1, w, b.numbers[w + y]);
  return did;
}

function checkLoopSub(
  b: Board,
  x: number,
  y: number,
  dir: number,
  dsf: Dsf,
  startc: number,
  endc: number,
): number {
  const { w, h } = b;
  const i = y * w + x;
  const j = (y + DY(dir)) * w + (x + DX(dir));
  if (
    b.sflags[i] & S_TRACK &&
    b.sflags[j] & S_TRACK &&
    !(sEDirs(b, x, y, E_TRACK) & dir) &&
    !(sEDirs(b, x, y, E_NOTRACK) & dir)
  ) {
    const ic = dsf.canonify(i);
    const jc = dsf.canonify(j);
    if (ic === jc) return setEflag(b, x, y, dir, E_NOTRACK);
    if ((ic === startc && jc === endc) || (ic === endc && jc === startc)) {
      // Joining start to end is only allowed when it misses no other track
      // and every clue is already satisfied.
      for (let k = 0; k < w * h; k++) {
        if (
          b.sflags[k] & S_TRACK &&
          dsf.canonify(k) !== startc &&
          dsf.canonify(k) !== endc
        ) {
          return setEflag(b, x, y, dir, E_NOTRACK);
        }
      }
      let satisfied = true;
      for (let k = 0; k < w; k++)
        if (countCol(b, k, S_TRACK) < b.numbers[k]) satisfied = false;
      for (let k = 0; k < h; k++) {
        if (countRow(b, k, S_TRACK) < b.numbers[w + k]) satisfied = false;
      }
      if (!satisfied) return setEflag(b, x, y, dir, E_NOTRACK);
    }
  }
  return 0;
}

function checkLoop(b: Board): number {
  const { w, h } = b;
  let did = 0;
  const dsf = new Dsf(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      if (x < w - 1 && sEDirs(b, x, y, E_TRACK) & R) dsf.merge(i, y * w + (x + 1));
      if (y < h - 1 && sEDirs(b, x, y, E_TRACK) & D) dsf.merge(i, (y + 1) * w + x);
    }
  }
  const startc = dsf.canonify(b.rowS * w);
  const endc = dsf.canonify((h - 1) * w + b.colS);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (x < w - 1) did += checkLoopSub(b, x, y, R, dsf, startc, endc);
      if (y < h - 1) did += checkLoopSub(b, x, y, D, dsf, startc, endc);
    }
  }
  return did;
}

// --- Tricky rungs ---------------------------------------------------------

function checkSingleSub(
  b: Board,
  si: number,
  id: number,
  n: number,
  target: number,
  perpf: number,
): number {
  const { w } = b;
  let ctrack = 0;
  let nperp = 0;
  let n1edge = 0;
  let i1edge = 0;
  let did = 0;
  for (let j = 0, i = si; j < n; j++, i += id) {
    if (b.sflags[i] & S_TRACK) ctrack++;
    const notrackDirs = sEDirs(b, i % w, Math.floor(i / w), E_NOTRACK);
    if ((perpf & notrackDirs) === 0) nperp++;
    if (sECount(b, i % w, Math.floor(i / w), E_TRACK) <= 1) {
      n1edge++;
      i1edge = i;
    }
  }
  if (ctrack !== target - 1) return 0;
  if (nperp > 0 || n1edge !== 1) return 0;

  const ox = i1edge % w;
  const oy = Math.floor(i1edge / w);
  for (let j = 0, i = si; j < n; j++, i += id) {
    const x = i % w;
    const y = Math.floor(i / w);
    if (Math.abs(ox - x) > 1 || Math.abs(oy - y) > 1) {
      if (!(b.sflags[i] & S_TRACK)) did += setSflag(b, x, y, S_NOTRACK);
    }
  }
  return did;
}

function checkSingle(b: Board): number {
  const { w, h } = b;
  let did = 0;
  for (let x = 0; x < w; x++) did += checkSingleSub(b, x, w, h, b.numbers[x], R | L);
  for (let y = 0; y < h; y++)
    did += checkSingleSub(b, y * w, 1, w, b.numbers[w + y], U | D);
  return did;
}

function checkLooseSub(
  b: Board,
  si: number,
  id: number,
  n: number,
  target: number,
  perpf: number,
): number {
  const { w } = b;
  let nperp = 0;
  let nloose = 0;
  let e2count = 0;
  let did = 0;
  const parf = ALLDIR & ~perpf;

  for (let j = 0, i = si; j < n; j++, i += id) {
    const fcount = sECount(b, i % w, Math.floor(i / w), E_TRACK);
    if (fcount === 2) e2count++;
    b.sflags[i] &= ~S_MARK;
    if (fcount === 1 && parf & sEDirs(b, i % w, Math.floor(i / w), E_TRACK)) {
      nloose++;
      b.sflags[i] |= S_MARK;
    }
    if (fcount !== 2 && !(perpf & sEDirs(b, i % w, Math.floor(i / w), E_NOTRACK)))
      nperp++;
  }

  if (nloose > target - e2count) b.impossible = true;
  if (nloose > 0 && nloose === target - e2count) {
    for (let j = 0, i = si; j < n; j++, i += id) {
      if (!(b.sflags[i] & S_MARK)) continue;
      if (j > 0 && b.sflags[i - id] & S_MARK) continue;
      if (j < n - 1 && b.sflags[i + id] & S_MARK) continue;
      for (let k = 0; k < 4; k++) {
        if (
          parf & (1 << k) &&
          !(sEDirs(b, i % w, Math.floor(i / w), E_TRACK) & (1 << k))
        ) {
          did += setEflag(b, i % w, Math.floor(i / w), 1 << k, E_NOTRACK);
        }
      }
    }
  }
  if (nloose === 1 && target - e2count === 2 && nperp === 0) {
    for (let j = 0, i = si; j < n; j++, i += id) {
      if (!(b.sflags[i] & S_MARK)) continue;
      for (let k = 0; k < 4; k++) {
        if (parf & (1 << k))
          did += setEflag(b, i % w, Math.floor(i / w), 1 << k, E_TRACK);
      }
    }
  }
  return did;
}

function checkLooseEnds(b: Board): number {
  const { w, h } = b;
  let did = 0;
  for (let x = 0; x < w; x++) did += checkLooseSub(b, x, w, h, b.numbers[x], R | L);
  for (let y = 0; y < h; y++)
    did += checkLooseSub(b, y * w, 1, w, b.numbers[w + y], U | D);
  return did;
}

function neighboursCount(
  b: Board,
  start: number,
  step: number,
  n: number,
  clueindex: number,
): { onefill: boolean; oneempty: boolean } {
  let toFill = b.numbers[clueindex];
  let toEmpty = n - toFill;
  for (let i = 0; i < n; i++) {
    const p = start + i * step;
    if (b.sflags[p] & S_TRACK) toFill--;
    if (b.sflags[p] & S_NOTRACK) toEmpty--;
  }
  return { onefill: toFill === 1, oneempty: toEmpty === 1 };
}

function neighboursTry(
  b: Board,
  x: number,
  y: number,
  X: number,
  Y: number,
  onefill: boolean,
  oneempty: boolean,
  dir: number,
): number {
  const { w } = b;
  const p = y * w + x;
  const P = Y * w + X;
  if ((b.sflags[p] | b.sflags[P]) & (S_TRACK | S_NOTRACK)) return 0;
  const possibleExitsExceptDir = NBITS[ALLDIR & ~dir & ~sEDirs(b, x, y, E_NOTRACK)];
  if (possibleExitsExceptDir >= 2) return 0;
  // If p is filled, P must be too.
  let did = 0;
  if (onefill) {
    b.sflags[p] |= S_NOTRACK;
    did++;
  }
  if (oneempty) {
    b.sflags[P] |= S_TRACK;
    did++;
  }
  return did;
}

function checkNeighbours(b: Board, bothWays: boolean): number {
  const { w, h } = b;
  let did = 0;
  for (let x = 0; x < w; x++) {
    const { onefill, oneempty: oe } = neighboursCount(b, x, w, h, x);
    const oneempty = bothWays ? oe : false;
    if (!onefill && !oneempty) continue;
    for (let y = 0; y + 1 < h; y++) {
      did += neighboursTry(b, x, y, x, y + 1, onefill, oneempty, D);
      did += neighboursTry(b, x, y + 1, x, y, onefill, oneempty, U);
    }
  }
  for (let y = 0; y < h; y++) {
    const { onefill, oneempty: oe } = neighboursCount(b, y * w, 1, w, w + y);
    const oneempty = bothWays ? oe : false;
    if (!onefill && !oneempty) continue;
    for (let x = 0; x + 1 < w; x++) {
      did += neighboursTry(b, x, y, x + 1, y, onefill, oneempty, R);
      did += neighboursTry(b, x + 1, y, x, y, onefill, oneempty, L);
    }
  }
  return did;
}

// --- Hard rung: bridge parity ---------------------------------------------

function bridgeSub(b: Board, x: number, y: number, d: number, dsf: Dsf): number {
  const { w, h } = b;
  const X = x + DX(d);
  const Y = y + DY(d);
  dsf.reinit();
  for (let xi = 0; xi < w; xi++) {
    for (let yi = 0; yi < h; yi++) {
      if (
        yi + 1 < h &&
        !sEFlags(b, xi, yi, D) &&
        !(xi === x && yi === y && xi === X && yi + 1 === Y)
      ) {
        dsf.merge(yi * w + xi, (yi + 1) * w + xi);
      }
      if (
        xi + 1 < w &&
        !sEFlags(b, xi, yi, R) &&
        !(xi === x && yi === y && xi + 1 === X && yi === Y)
      ) {
        dsf.merge(yi * w + xi, yi * w + (xi + 1));
      }
    }
  }
  const component = dsf.canonify(y * w + x);
  let parity = 0;
  for (let xi = 0; xi < w; xi++) {
    for (let yi = 0; yi < h; yi++) {
      if (dsf.canonify(yi * w + xi) !== component) continue;
      for (let di = 1; di < 16; di *= 2) {
        const Xi = xi + DX(di);
        const Yi = yi + DY(di);
        if (
          (Xi < 0 ||
            Xi >= w ||
            Yi < 0 ||
            Yi >= h ||
            dsf.canonify(Yi * w + Xi) !== component) &&
          sEDirs(b, xi, yi, E_TRACK) & di
        ) {
          parity ^= 1;
        }
      }
    }
  }
  setEflag(b, x, y, d, parity ? E_TRACK : E_NOTRACK);
  return 1;
}

function* bridgeNeighbours(b: Board, vertex: number): Iterable<number> {
  const { w } = b;
  const x = vertex % w;
  const y = Math.floor(vertex / w);
  const dirs = ALLDIR & ~sEDirs(b, x, y, E_TRACK) & ~sEDirs(b, x, y, E_NOTRACK);
  for (let di = 1; di < 16; di *= 2) {
    if (dirs & di) {
      const xr = x + DX(di);
      const yr = y + DY(di);
      if (inGrid(b, xr, yr)) yield yr * w + xr;
    }
  }
}

function checkBridgeParity(b: Board, dsf: Dsf): number {
  const { w, h } = b;
  let did = 0;
  const fls = findLoops(w * h, (v) => bridgeNeighbours(b, v));
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (y + 1 < h && !fls.isLoopEdge(y * w + x, (y + 1) * w + x)) {
        did += bridgeSub(b, x, y, D, dsf);
      }
      if (x + 1 < w && !fls.isLoopEdge(y * w + x, y * w + (x + 1))) {
        did += bridgeSub(b, x, y, R, dsf);
      }
    }
  }
  return did;
}

// --- outer border + driver ------------------------------------------------

function discountEdge(b: Board, x: number, y: number, d: number): void {
  if (sEDirs(b, x, y, E_TRACK) & d) return; // only clue squares carry outer edges
  setEflag(b, x, y, d, E_NOTRACK);
}

/**
 * Run the solver to a fixpoint at the given max difficulty. Returns the
 * verdict (`-1` impossible, `0` non-converged, `1` uniquely solved) and the
 * maximum difficulty rung that fired (upstream `tracks_solve`).
 */
export function tracksSolve(b: Board, diff: number): { ret: number; maxDiff: number } {
  const { w, h } = b;
  let maxDiff = DIFF_EASY;
  b.impossible = false;

  for (let x = 0; x < w; x++) {
    discountEdge(b, x, 0, U);
    discountEdge(b, x, h - 1, D);
  }
  for (let y = 0; y < h; y++) {
    discountEdge(b, 0, y, L);
    discountEdge(b, w - 1, y, R);
  }

  const bridgeDsf = new Dsf(w * h);

  while (!b.impossible) {
    if (diff >= DIFF_EASY && updateFlags(b)) {
      maxDiff = Math.max(maxDiff, DIFF_EASY);
      continue;
    }
    if (diff >= DIFF_EASY && countClues(b)) {
      maxDiff = Math.max(maxDiff, DIFF_EASY);
      continue;
    }
    if (diff >= DIFF_EASY && checkLoop(b)) {
      maxDiff = Math.max(maxDiff, DIFF_EASY);
      continue;
    }
    if (diff >= DIFF_TRICKY && checkSingle(b)) {
      maxDiff = Math.max(maxDiff, DIFF_TRICKY);
      continue;
    }
    if (diff >= DIFF_TRICKY && checkLooseEnds(b)) {
      maxDiff = Math.max(maxDiff, DIFF_TRICKY);
      continue;
    }
    if (diff >= DIFF_TRICKY && checkNeighbours(b, false)) {
      maxDiff = Math.max(maxDiff, DIFF_TRICKY);
      continue;
    }
    if (diff >= DIFF_HARD && checkNeighbours(b, true)) {
      maxDiff = Math.max(maxDiff, DIFF_HARD);
      continue;
    }
    if (diff >= DIFF_HARD && checkBridgeParity(b, bridgeDsf)) {
      maxDiff = Math.max(maxDiff, DIFF_HARD);
      continue;
    }
    break;
  }

  const ret = b.impossible ? -1 : checkCompletion(b, false) ? 1 : 0;
  return { ret, maxDiff };
}

/**
 * A clues-only copy of a board with all non-clue square/edge marks stripped
 * (upstream `copy_and_strip` with no clue flip). Optionally flips one clue
 * flag first (`flipClueI`, an index into `w*h`, or −1). Used by the generator
 * and by `findMistakes` to re-solve from the givens alone.
 */
export function copyAndStrip(b: Board, flipClueI: number): Board {
  const { w, h } = b;
  const ret: Board = {
    w,
    h,
    sflags: Int32Array.from(b.sflags),
    numbers: b.numbers,
    rowS: b.rowS,
    colS: b.colS,
    numErrors: new Uint8Array(w + h),
    impossible: false,
  };
  if (flipClueI !== -1) ret.sflags[flipClueI] ^= S_CLUE;
  for (let i = 0; i < w * h; i++) {
    if (!(ret.sflags[i] & S_CLUE)) {
      ret.sflags[i] &= ~(S_TRACK | S_NOTRACK | 4 /* S_ERROR */ | S_MARK);
      for (let j = 0; j < 4; j++) {
        const f = 1 << j;
        const xx = (i % w) + DX(f);
        const yy = Math.floor(i / w) + DY(f);
        if (!inGrid(b, xx, yy) || !(ret.sflags[yy * w + xx] & S_CLUE)) {
          sEClear(ret, i % w, Math.floor(i / w), f, E_TRACK);
          sEClear(ret, i % w, Math.floor(i / w), f, E_NOTRACK);
        }
      }
    }
  }
  return ret;
}
