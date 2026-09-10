/**
 * Tracks solver — a faithful port of `tracks_solve` and its deduction rungs
 * from `tracks.c`. Because the generator is solver-gated (it lays and strips
 * clues by re-running this solver and keeping only removals that stay soluble
 * at exactly the target difficulty), the desc is decided by this solver's
 * *verdict* on every intermediate board, so the port reproduces C's deductions
 * — and their order — verbatim (docs/games/solver-and-generator.md § "Solver-gated generation"). Reused by `solve()` and
 * `findMistakes`.
 *
 * **The ladder runs on the shared `runDeductionFixpoint`**
 * (`adopt-the-deduction-runner-where-it-rewires`, the first adoption). It was
 * written out by hand as eight repetitions of `if (diff >= TIER &&
 * technique(b)) { maxDiff = Math.max(maxDiff, TIER); continue; }`, which is that
 * runner's signature transcribed — so adoption was a rewiring, not a
 * restructuring. Three things made it exact, and each is worth checking before
 * adopting the next game:
 *
 *  - **The tier guard skips, it does not stop.** Each `diff >= TIER` was an
 *    independent guard with no `break`, and the runner likewise *skips* a rung
 *    above `maxTier` and keeps going. A game that breaks out of its ladder on
 *    the first over-cap rung is not this shape.
 *  - **The grade means the same number.** `maxDiff` was bumped only inside a
 *    fired branch, so it already meant *highest tier that fired*, which is what
 *    the runner returns. A game that bumps its grade on *reaching* a tier means
 *    "deepest tier reached" — a different number, and Boats' recorded reason for
 *    staying out.
 *  - **`b.impossible` is a board flag, not a `< 0` return.** The old loop tested
 *    it at the top of each pass; `settled` is checked in exactly that place.
 *
 * Proved by `tracks-ladder.test.ts`, not by the differential — see its header
 * for why the fixtures could not certify this on their own.
 */
import {
  type DeductionTechnique,
  type FiringTally,
  runDeductionFixpoint,
} from "../../engine/deduction-fixpoint.ts";
import { Dsf } from "../../engine/dsf.ts";
import { findLoops } from "../../engine/findloop.ts";
import type { StepBudget } from "../../engine/step-budget.ts";
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
  type TracksOp,
  type TracksRecorder,
  U,
} from "./state.ts";

// --- the recording projection: what a firing points at, and why ------------

/**
 * The board geometry one firing reasons **from**, captured inside the rung at
 * the moment it fires and before it changes anything.
 *
 * Captured there rather than reconstructed afterwards because a rung can
 * destroy its own premise: `looseEndSpans` cites the column's *unfinished*
 * squares and then finishes one of them, so a snapshot taken after the firing
 * would shade a different set than the sentence counts
 * (docs/games/hints.md § "Show the evidence as an area").
 */
export interface TracksEvidence {
  /** Cell indices (`y * w + x`). */
  cells: number[];
  /** Edges, as `(y * w + x) * 16 + dir`. */
  edges: number[];
  /** Clue indices: `0..w-1` are columns, `w..w+h-1` rows. */
  clues: number[];
}

/** Pack an edge for {@link TracksEvidence.edges}. */
const evEdge = (w: number, x: number, y: number, d: number): number =>
  (y * w + x) * 16 + d;

/**
 * Why one firing is forced — the half of a hint `runDeductionFixpoint` is
 * explicitly *oblivious* to, and the whole reason this game needed a recording
 * projection rather than the rung id its `FiringTally` already reports.
 *
 * One variant per narratable **premise**, not one per rung: `update-flags` is a
 * single technique holding two teachable rules and three that only restate what
 * the board already draws. Those three, and `check-single` (which fires on no
 * board this generator produces — `tracks-ladder.test.ts`'s `unreached`
 * ledger), declare no reason: their firings come back with a `null` one and the
 * plan hides them. `tracks-hint.test.ts` holds every such firing to being
 * evident on the player's board, so the list of reason-less rules is a
 * declaration checked against a derivation rather than a roster that can rot.
 */
export type TracksReason = { ev: TracksEvidence } & (
  | { kind: "onlyOneSideLeft"; x: number; y: number; open: number }
  | { kind: "bothSidesLeft"; x: number; y: number }
  | { kind: "clueFull"; line: number }
  | { kind: "clueExact"; line: number }
  | { kind: "wouldCloseLoop"; x: number; y: number; dir: number }
  | { kind: "wouldStrandTrack"; x: number; y: number; dir: number }
  | { kind: "wouldFinishEarly"; x: number; y: number; dir: number; unmet: number }
  | { kind: "looseEndsFill"; line: number }
  | { kind: "looseEndSpans"; line: number }
  | {
      kind: "sharedFate";
      line: number;
      x: number;
      y: number;
      dir: number;
      fills: boolean;
      empties: boolean;
    }
  | { kind: "crossingParity"; x: number; y: number; dir: number; crossings: number }
);

/** One firing: the flag changes it forced, and the premise that forced them —
 * `null` for a rule that restates what the board already shows. */
export interface TracksFiring {
  reason: TracksReason | null;
  ops: TracksOp[];
}

/*
 * How to read the recording arms below.
 *
 * **Every reason is built behind `const rec = b.rec; if (rec)`, and that is
 * load-bearing rather than stylistic.** A reason carries its evidence, and some
 * of that evidence costs a full-board scan (`cellsInClass`) or a line walk; a
 * helper taking the built reason as an argument would build all of it on the
 * generator's hot path, where nothing reads it.
 *
 * The two lines that follow every premise are the rest of the pattern:
 * `if (rec && did > before) return did;` is the **per-premise early return**
 * that keeps one firing = one hint step (a rung like `updateFlags` scans the
 * whole grid and would otherwise pile dozens of unrelated deductions into one
 * step — docs/games/hints.md § "Group one firing into one step"), and
 * `if (rec) rec.reason = null;` stops a premise that changed nothing from
 * lending its reason to the next one.
 */

// --- primitive flag setters (upstream solve_set_sflag / solve_set_eflag) ---

/**
 * Record a change for the firing `b.rec` is collecting — every change, whether
 * or not a premise is standing; what is worth showing is decided later, by the
 * plan loop.
 *
 * **This is the whole of the recording projection's plumbing** — every one of
 * the eight rungs changes the board through {@link setSflag} or
 * {@link setEflag} and through nothing else, so the *what* of a firing costs
 * these two calls. Only the *why* is per-rung work.
 */
function note(b: Board, op: TracksOp): void {
  b.rec?.ops.push(op);
}

function setSflag(b: Board, x: number, y: number, f: number): number {
  const i = y * b.w + x;
  if (b.sflags[i] & f) return 0;
  if (b.sflags[i] & (f === S_TRACK ? S_NOTRACK : S_TRACK)) b.impossible = true;
  else {
    b.sflags[i] |= f;
    if (b.rec) note(b, { kind: "square", x, y, track: f === S_TRACK, set: true });
  }
  return 1;
}

function setEflag(b: Board, x: number, y: number, d: number, f: number): number {
  const sf = sEFlags(b, x, y, d);
  if (sf & f) return 0;
  if (sf & (f === E_TRACK ? E_NOTRACK : E_TRACK)) b.impossible = true;
  else {
    sESet(b, x, y, d, f);
    if (b.rec) {
      note(b, { kind: "edge", x, y, dir: d, track: f === E_TRACK, set: true });
    }
  }
  return 1;
}

// --- Easy rungs -----------------------------------------------------------

/** The sides of `(x,y)` carrying `eflag`, as evidence edges. */
function sidesWith(b: Board, x: number, y: number, eflag: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    const d = 1 << i;
    if (sEFlags(b, x, y, d) & eflag) out.push(evEdge(b.w, x, y, d));
  }
  return out;
}

/**
 * Five local rules at one square, of which **two are narratable and three only
 * restate what the board already draws**:
 *
 *  - *a blocked square's four sides are blocked* adds four edge crosses around
 *    a square already showing its own cross;
 *  - *a square with a track side is a track square* changes nothing on screen
 *    at all: `s2dFlags` already sets `DS_TRACK` from the edge count;
 *  - *a finished piece's other two sides are blocked* — the player can see the
 *    piece is finished. This one was narrated until the owner's first playtest,
 *    where it was a third of every plan and redundant every single time it
 *    fired (671 of 671, measured).
 *
 * All three are real and needed by the deduction, so they run; none claims a
 * reason, so each comes back as a firing the plan hides (docs/games/hints.md
 * § "Show only what the board does not already say"). Each returns on its own
 * on the recording path, like every narrated premise, so a hidden firing never
 * shares a step with a shown one.
 */
function updateFlags(b: Board): number {
  const { w, h } = b;
  let did = 0;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      // A NOTRACK square's four edges are all NOTRACK. (No reason: see above.)
      if (b.sflags[y * w + x] & S_NOTRACK) {
        const before = did;
        for (let i = 0; i < 4; i++) did += setEflag(b, x, y, 1 << i, E_NOTRACK);
        if (b.rec && did > before) return did;
      }
      // 3+ NOTRACK edges → the square is NOTRACK.
      if (sECount(b, x, y, E_NOTRACK) >= 3) {
        const before = did;
        const rec = b.rec;
        if (rec) {
          rec.reason = {
            kind: "onlyOneSideLeft",
            x,
            y,
            open: 4 - sECount(b, x, y, E_NOTRACK),
            ev: { cells: [], edges: sidesWith(b, x, y, E_NOTRACK), clues: [] },
          };
        }
        did += setSflag(b, x, y, S_NOTRACK);
        if (rec && did > before) return did;
        if (rec) rec.reason = null;
      }
      // Any TRACK edge → the square is TRACK. (No reason: see above.)
      if (sECount(b, x, y, E_TRACK) > 0) {
        const before = did;
        did += setSflag(b, x, y, S_TRACK);
        if (b.rec && did > before) return did;
      }
      // TRACK square with 2 NOTRACK edges → the other two are TRACK.
      if (
        b.sflags[y * w + x] & S_TRACK &&
        sECount(b, x, y, E_NOTRACK) === 2 &&
        sECount(b, x, y, E_TRACK) < 2
      ) {
        const before = did;
        const rec = b.rec;
        if (rec) {
          // The **sides**, not the square: the sentence counts sides, and a
          // full-cell outline sits exactly on top of the side marks and hides
          // them (the same square carries both roles, so the outline wins).
          rec.reason = {
            kind: "bothSidesLeft",
            x,
            y,
            ev: { cells: [], edges: sidesWith(b, x, y, E_NOTRACK), clues: [] },
          };
        }
        for (let i = 0; i < 4; i++) {
          const d = 1 << i;
          if (!(sEFlags(b, x, y, d) & (E_TRACK | E_NOTRACK))) {
            did += setEflag(b, x, y, d, E_TRACK);
          }
        }
        if (rec && did > before) return did;
        if (rec) rec.reason = null;
      }
      // TRACK square with 2 TRACK edges → the other two are NOTRACK.
      if (
        b.sflags[y * w + x] & S_TRACK &&
        sECount(b, x, y, E_TRACK) === 2 &&
        sECount(b, x, y, E_NOTRACK) < 2
      ) {
        // (No reason: see above.)
        const before = did;
        for (let i = 0; i < 4; i++) {
          const d = 1 << i;
          if (!(sEFlags(b, x, y, d) & (E_TRACK | E_NOTRACK))) {
            did += setEflag(b, x, y, d, E_NOTRACK);
          }
        }
        if (b.rec && did > before) return did;
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

/** The squares of a line satisfying `pred`, as evidence cells. */
function lineCellsWhere(
  si: number,
  id: number,
  n: number,
  pred: (i: number) => boolean,
): number[] {
  const out: number[] = [];
  for (let j = 0, i = si; j < n; j++, i += id) if (pred(i)) out.push(i);
  return out;
}

/** The squares of a line carrying `sflag`, as evidence cells. */
const lineCellsWith = (
  b: Board,
  si: number,
  id: number,
  n: number,
  sflag: number,
): number[] => lineCellsWhere(si, id, n, (i) => (b.sflags[i] & sflag) !== 0);

function countCluesSub(
  b: Board,
  si: number,
  id: number,
  n: number,
  target: number,
  line: number,
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
    const before = did;
    const rec = b.rec;
    if (rec) {
      rec.reason = {
        kind: "clueFull",
        line,
        ev: { cells: lineCellsWith(b, si, id, n, S_TRACK), edges: [], clues: [line] },
      };
    }
    for (let j = 0, i = si; j < n; j++, i += id) {
      if (!(b.sflags[i] & S_TRACK))
        did += setSflag(b, i % w, Math.floor(i / w), S_NOTRACK);
    }
    if (rec && did > before) return did;
    if (rec) rec.reason = null;
  }
  if (cnotrack === n - target) {
    const before = did;
    const rec = b.rec;
    if (rec) {
      rec.reason = {
        kind: "clueExact",
        line,
        ev: { cells: lineCellsWith(b, si, id, n, S_NOTRACK), edges: [], clues: [line] },
      };
    }
    for (let j = 0, i = si; j < n; j++, i += id) {
      if (!(b.sflags[i] & S_NOTRACK))
        did += setSflag(b, i % w, Math.floor(i / w), S_TRACK);
    }
    if (rec && did > before) return did;
    if (rec) rec.reason = null;
  }
  return did;
}

function countClues(b: Board): number {
  const { w, h } = b;
  let did = 0;
  for (let x = 0; x < w; x++) {
    did += countCluesSub(b, x, w, h, b.numbers[x], x);
    if (b.rec?.ops.length) return did;
  }
  for (let y = 0; y < h; y++) {
    did += countCluesSub(b, y * w, 1, w, b.numbers[w + y], w + y);
    if (b.rec?.ops.length) return did;
  }
  return did;
}

/** Every cell in `dsf`'s class `c`, as evidence cells. */
function cellsInClass(b: Board, dsf: Dsf, c: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < b.w * b.h; k++) if (dsf.canonify(k) === c) out.push(k);
  return out;
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
    if (ic === jc) {
      if (b.rec) {
        b.rec.reason = {
          kind: "wouldCloseLoop",
          x,
          y,
          dir,
          // The run that already links the two squares: what makes it a loop.
          ev: { cells: cellsInClass(b, dsf, ic), edges: [], clues: [] },
        };
      }
      return setEflag(b, x, y, dir, E_NOTRACK);
    }
    if ((ic === startc && jc === endc) || (ic === endc && jc === startc)) {
      // Joining start to end is only allowed when it misses no other track
      // and every clue is already satisfied.
      const stranded: number[] = [];
      for (let k = 0; k < w * h; k++) {
        if (
          b.sflags[k] & S_TRACK &&
          dsf.canonify(k) !== startc &&
          dsf.canonify(k) !== endc
        ) {
          if (!b.rec) return setEflag(b, x, y, dir, E_NOTRACK);
          stranded.push(k);
        }
      }
      if (stranded.length > 0) {
        if (b.rec) {
          b.rec.reason = {
            kind: "wouldStrandTrack",
            x,
            y,
            dir,
            ev: { cells: stranded, edges: [], clues: [] },
          };
        }
        return setEflag(b, x, y, dir, E_NOTRACK);
      }
      let satisfied = true;
      let unmet = -1;
      for (let k = 0; k < w; k++)
        if (countCol(b, k, S_TRACK) < b.numbers[k]) {
          satisfied = false;
          if (unmet < 0) unmet = k;
        }
      for (let k = 0; k < h; k++) {
        if (countRow(b, k, S_TRACK) < b.numbers[w + k]) {
          satisfied = false;
          if (unmet < 0) unmet = w + k;
        }
      }
      if (!satisfied) {
        if (b.rec) {
          b.rec.reason = {
            kind: "wouldFinishEarly",
            x,
            y,
            dir,
            unmet,
            ev: {
              cells:
                unmet < w
                  ? lineCellsWith(b, unmet, w, h, S_TRACK)
                  : lineCellsWith(b, (unmet - w) * w, 1, w, S_TRACK),
              edges: [],
              clues: [unmet],
            },
          };
        }
        return setEflag(b, x, y, dir, E_NOTRACK);
      }
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
      if (b.rec?.ops.length) return did;
      if (y < h - 1) did += checkLoopSub(b, x, y, D, dsf, startc, endc);
      if (b.rec?.ops.length) return did;
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
  line: number,
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
    const before = did;
    const rec = b.rec;
    if (rec) {
      // The `target` squares that account for the whole clue: the finished ones
      // and the loose ends. The narration counts them, so the picture holds
      // exactly that many cells.
      rec.reason = {
        kind: "looseEndsFill",
        line,
        ev: {
          cells: lineCellsWhere(
            si,
            id,
            n,
            (i) =>
              sECount(b, i % w, Math.floor(i / w), E_TRACK) === 2 ||
              (b.sflags[i] & S_MARK) !== 0,
          ),
          edges: [],
          clues: [line],
        },
      };
    }
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
    if (rec && did > before) return did;
    if (rec) rec.reason = null;
  }
  if (nloose === 1 && target - e2count === 2 && nperp === 0) {
    const before = did;
    const rec = b.rec;
    if (rec) {
      // `nperp === 0` says every unfinished square in the line already has one
      // side blocked across the line, so none of them can be crossed straight
      // through. Show that: the unfinished squares, and the blocked side on each.
      const unfinished = lineCellsWhere(
        si,
        id,
        n,
        (i) => sECount(b, i % w, Math.floor(i / w), E_TRACK) !== 2,
      );
      rec.reason = {
        kind: "looseEndSpans",
        line,
        ev: {
          cells: unfinished,
          edges: unfinished.flatMap((i) =>
            sidesWith(b, i % w, Math.floor(i / w), E_NOTRACK).filter(
              (e) => (e % 16) & perpf,
            ),
          ),
          clues: [line],
        },
      };
    }
    for (let j = 0, i = si; j < n; j++, i += id) {
      if (!(b.sflags[i] & S_MARK)) continue;
      for (let k = 0; k < 4; k++) {
        if (parf & (1 << k))
          did += setEflag(b, i % w, Math.floor(i / w), 1 << k, E_TRACK);
      }
    }
    if (rec && did > before) return did;
    if (rec) rec.reason = null;
  }
  return did;
}

function checkLooseEnds(b: Board): number {
  const { w, h } = b;
  let did = 0;
  for (let x = 0; x < w; x++) {
    did += checkLooseSub(b, x, w, h, b.numbers[x], R | L, x);
    if (b.rec?.ops.length) return did;
  }
  for (let y = 0; y < h; y++) {
    did += checkLooseSub(b, y * w, 1, w, b.numbers[w + y], U | D, w + y);
    if (b.rec?.ops.length) return did;
  }
  return did;
}

function neighborsCount(
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

function neighborsTry(
  b: Board,
  x: number,
  y: number,
  X: number,
  Y: number,
  onefill: boolean,
  oneempty: boolean,
  dir: number,
  line: number,
  lineStart: number,
  lineStep: number,
  lineLen: number,
): number {
  const { w } = b;
  const p = y * w + x;
  const P = Y * w + X;
  if ((b.sflags[p] | b.sflags[P]) & (S_TRACK | S_NOTRACK)) return 0;
  const possibleExitsExceptDir = NBITS[ALLDIR & ~dir & ~sEDirs(b, x, y, E_NOTRACK)];
  if (possibleExitsExceptDir >= 2) return 0;
  // If p is filled, P must be too.
  let did = 0;
  // The blocked sides that leave `dir` as the only way through `p` are half the
  // premise; the clue count is the other half, and which half of *it* holds
  // decides which of the two squares is forced. This is the one place a rung
  // sets a flag without going through the two primitive setters (upstream does
  // the same), so it is also the one place that has to record by hand.
  if (b.rec) {
    b.rec.reason = {
      kind: "sharedFate",
      line,
      x,
      y,
      dir,
      fills: onefill,
      empties: oneempty,
      ev: {
        cells:
          onefill && oneempty
            ? []
            : lineCellsWith(
                b,
                lineStart,
                lineStep,
                lineLen,
                onefill ? S_TRACK : S_NOTRACK,
              ),
        edges: sidesWith(b, x, y, E_NOTRACK),
        clues: [line],
      },
    };
  }
  if (onefill) {
    b.sflags[p] |= S_NOTRACK;
    if (b.rec) note(b, { kind: "square", x, y, track: false, set: true });
    did++;
  }
  if (oneempty) {
    b.sflags[P] |= S_TRACK;
    if (b.rec) note(b, { kind: "square", x: X, y: Y, track: true, set: true });
    did++;
  }
  // Only when this premise recorded nothing: the reset exists to stop a
  // premise that changed nothing lending its reason to the next one, and
  // clearing it after a firing would hand the driver ops with no reason.
  if (b.rec && b.rec.ops.length === 0) b.rec.reason = null;
  return did;
}

function checkNeighbors(b: Board, bothWays: boolean): number {
  const { w, h } = b;
  let did = 0;
  for (let x = 0; x < w; x++) {
    const { onefill, oneempty: oe } = neighborsCount(b, x, w, h, x);
    const oneempty = bothWays ? oe : false;
    if (!onefill && !oneempty) continue;
    for (let y = 0; y + 1 < h; y++) {
      did += neighborsTry(b, x, y, x, y + 1, onefill, oneempty, D, x, x, w, h);
      if (b.rec?.ops.length) return did;
      did += neighborsTry(b, x, y + 1, x, y, onefill, oneempty, U, x, x, w, h);
      if (b.rec?.ops.length) return did;
    }
  }
  for (let y = 0; y < h; y++) {
    const { onefill, oneempty: oe } = neighborsCount(b, y * w, 1, w, w + y);
    const oneempty = bothWays ? oe : false;
    if (!onefill && !oneempty) continue;
    for (let x = 0; x + 1 < w; x++) {
      did += neighborsTry(b, x, y, x + 1, y, onefill, oneempty, R, w + y, y * w, 1, w);
      if (b.rec?.ops.length) return did;
      did += neighborsTry(b, x + 1, y, x, y, onefill, oneempty, L, w + y, y * w, 1, w);
      if (b.rec?.ops.length) return did;
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
  const rec = b.rec;
  const cells: number[] = [];
  const edges: number[] = [];
  let parity = 0;
  let crossings = 0;
  for (let xi = 0; xi < w; xi++) {
    for (let yi = 0; yi < h; yi++) {
      if (dsf.canonify(yi * w + xi) !== component) continue;
      if (rec) cells.push(yi * w + xi);
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
          if (rec) {
            crossings++;
            edges.push(evEdge(w, xi, yi, di));
          }
        }
      }
    }
  }
  // The block and the crossings the sentence counts are the *whole* premise
  // here, so the picture is the argument: no other rung's evidence is this
  // literally what the words say.
  if (rec) {
    rec.reason = {
      kind: "crossingParity",
      x,
      y,
      dir: d,
      crossings,
      ev: { cells, edges, clues: [] },
    };
  }
  setEflag(b, x, y, d, parity ? E_TRACK : E_NOTRACK);
  return 1;
}

function* bridgeNeighbors(b: Board, vertex: number): Iterable<number> {
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
  const fls = findLoops(w * h, (v) => bridgeNeighbors(b, v));
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (y + 1 < h && !fls.isLoopEdge(y * w + x, (y + 1) * w + x)) {
        did += bridgeSub(b, x, y, D, dsf);
        if (b.rec?.ops.length) return did;
      }
      if (x + 1 < w && !fls.isLoopEdge(y * w + x, y * w + (x + 1))) {
        did += bridgeSub(b, x, y, R, dsf);
        if (b.rec?.ops.length) return did;
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
/** The eight rungs, easiest first — the ladder `tracksSolve` runs.
 *
 * A factory rather than a constant because the rungs close over per-solve state:
 * every one needs the board, and `check-bridge-parity` needs a scratch dsf that
 * must not be shared between solves.
 *
 * **The rung ids are load-bearing beyond documentation**: `runDeductionFixpoint`
 * names them when a step budget trips, and `tracks-ladder.test.ts` asserts which
 * of them a corpus ever fires — which is how `check-single` was found to fire
 * nowhere at all. */
function tracksLadder(b: Board, bridgeDsf: Dsf): DeductionTechnique[] {
  return [
    { id: "update-flags", tier: DIFF_EASY, run: () => updateFlags(b) },
    { id: "count-clues", tier: DIFF_EASY, run: () => countClues(b) },
    { id: "check-loop", tier: DIFF_EASY, run: () => checkLoop(b) },
    { id: "check-single", tier: DIFF_TRICKY, run: () => checkSingle(b) },
    { id: "check-loose-ends", tier: DIFF_TRICKY, run: () => checkLooseEnds(b) },
    { id: "check-neighbors", tier: DIFF_TRICKY, run: () => checkNeighbors(b, false) },
    {
      id: "check-neighbors-both-ways",
      tier: DIFF_HARD,
      run: () => checkNeighbors(b, true),
    },
    {
      id: "check-bridge-parity",
      tier: DIFF_HARD,
      run: () => checkBridgeParity(b, bridgeDsf),
    },
  ];
}

/** The setup both `tracksSolve` and its equivalence oracle need: clear the
 * impossible flag, discount the four outside edges, and hand back the scratch
 * dsf the parity rung uses. */
function tracksSolveInit(b: Board): Dsf {
  const { w, h } = b;
  b.impossible = false;
  for (let x = 0; x < w; x++) {
    discountEdge(b, x, 0, U);
    discountEdge(b, x, h - 1, D);
  }
  for (let y = 0; y < h; y++) {
    discountEdge(b, 0, y, L);
    discountEdge(b, w - 1, y, R);
  }
  return new Dsf(w * h);
}

/**
 * @param firings test seam — the runner tallies each rung's firings into it.
 * Unused in production and deliberately so: it exists because
 * `tracks-ladder.test.ts` has to prove its corpus reaches every rung, and a
 * ladder-equivalence test that could pass over boards needing only the easiest
 * rung would certify nothing. Costs one optional parameter and no work when
 * absent.
 */
export function tracksSolve(
  b: Board,
  diff: number,
  firings?: FiringTally,
): { ret: number; maxDiff: number } {
  const bridgeDsf = tracksSolveInit(b);
  const ladder = tracksLadder(b, bridgeDsf);

  const { grade: maxDiff } = runDeductionFixpoint({
    techniques: ladder,
    firings,
    maxTier: diff,
    baseGrade: DIFF_EASY,
    // The hand-written loop was `while (!b.impossible)`, tested at the top of
    // every pass — which is exactly where `settled` is checked. A rung here
    // never returns `< 0`; it raises the board's own flag instead, so the
    // runner's `impossible` is always false and this function keeps deriving
    // `ret` from `b.impossible` as it always did.
    settled: () => b.impossible,
  });

  const ret = b.impossible ? -1 : checkCompletion(b, false) ? 1 : 0;
  return { ret, maxDiff };
}

/**
 * The **recording projection**: the same eight rungs, the same runner, one
 * firing at a time with its premise attached.
 *
 * `runDeductionFixpoint` is not bypassed here and gains nothing new. Two hooks
 * it already had do the whole job:
 *
 *  - **`settled`** — documented as broader than "solved" (Undead stops on a
 *    contradiction, Spokes on a spent action budget). `rec.ops.length > 0` is
 *    another such reason: *stop, this pass has a firing to narrate*. Checked at
 *    the top of an iteration, so the ladder always finishes the rung it is in.
 *  - **`beforeTechnique`** — `latinSolverTop` bumps a group id here; Tracks
 *    clears the standing reason, so a rung that declares none comes back with
 *    `null` rather than the previous rung's premise.
 *
 * **Every change is a firing, including the ones nobody should be shown.**
 * Deciding what is worth a step is the plan loop's job (`deduceHintPlan`'s
 * `showable`), not the recorder's, so the recorder never has to know.
 *
 * The returned closure ignores its argument so it can be handed straight to
 * `deduceHintPlan`'s `next(board)`; the board it walks is the one passed here,
 * and the rungs mutate it as they detect, so the plan loop supplies no `apply`.
 */
export function tracksRecordingPass(
  b: Board,
  cap: number,
  budget: StepBudget,
): () => TracksFiring | null {
  // Init *before* the recorder is attached, deliberately: it blocks the four
  // outer borders, which are not a deduction and are not something the player
  // could mark even if they were (`uiCanFlipEdge` needs both squares in grid).
  const bridgeDsf = tracksSolveInit(b);
  const ladder = tracksLadder(b, bridgeDsf);
  const rec: TracksRecorder = { reason: null, ops: [] };
  b.rec = rec;

  return (): TracksFiring | null => {
    rec.ops = [];
    rec.reason = null;
    runDeductionFixpoint({
      techniques: ladder,
      maxTier: cap,
      baseGrade: DIFF_EASY,
      budget,
      beforeTechnique: () => {
        rec.reason = null;
      },
      settled: () => b.impossible || rec.ops.length > 0,
    });
    if (b.impossible || rec.ops.length === 0) return null;
    return { reason: rec.reason as TracksReason | null, ops: rec.ops };
  };
}

/**
 * The hand-written ladder this solver ran until
 * `adopt-the-deduction-runner-where-it-rewires`, kept **only** as the oracle
 * `tracks-ladder.test.ts` proves the adoption against — the rungs are
 * module-private, so the comparison has to live on this side of the file.
 *
 * Delete it when the adoption sweep finishes and the shape is no longer
 * novel; until then it is what makes "the rewiring changed nothing" a checked
 * claim rather than an assertion.
 */
export function tracksSolveLegacy(
  b: Board,
  diff: number,
): { ret: number; maxDiff: number } {
  let maxDiff = DIFF_EASY;
  const bridgeDsf = tracksSolveInit(b);

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
    if (diff >= DIFF_TRICKY && checkNeighbors(b, false)) {
      maxDiff = Math.max(maxDiff, DIFF_TRICKY);
      continue;
    }
    if (diff >= DIFF_HARD && checkNeighbors(b, true)) {
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
