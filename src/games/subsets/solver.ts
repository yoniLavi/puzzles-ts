/**
 * Subsets rule validator and deductive solver — port of `subsets_validate`
 * and the `subsets_solve_*` family in `puzzles/unreleased/subsets.c`.
 *
 * The solver is a candidate-elimination fixpoint over a **cube**
 * `cube[cell][value]`: for each cell and each of the `2^n` possible
 * set-values, whether that value is still a candidate.
 *
 * **Deductive strength is the difficulty axis, and it is capped explicitly.**
 * The generator keeps a cell blank only while this solver still reaches a
 * complete solution, so the precise set of deductions decides which cells stay
 * givens and therefore every generated desc. `DIFF_EASY` is upstream's compiled
 * strength exactly — rules and loop order verbatim, neither strengthened nor
 * weakened, which is what keeps the twelve C fixtures reproducing byte-for-byte
 * (subsets-differential.test.ts). `DIFF_TRICKY` adds one rule *on top*:
 * `add-subsets-difficulty-tiers` restored the half of `applyArrowsAdvanced`
 * that upstream wrote, commented out and never compiled. Adding above rather
 * than editing in place is why that change kept the oracle intact.
 */
import { deduceHintPlan as accumulateHintPlan } from "../../engine/hint-plan.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import {
  ADJTHAN,
  ALL_BITS,
  cloneState,
  DIFF_TRICKY,
  type SubsetsMistake,
  type SubsetsState,
} from "./state.ts";

export type SubsetsStatus = "complete" | "unfinished" | "invalid";

/**
 * Classify the board (upstream `subsets_validate`): `complete` when every
 * cell is decided and consistent, `invalid` on a duplicated placement or a
 * violated (missing-)arrow relation between decided cells, else
 * `unfinished`.
 *
 * With `flags` given, every violated edge is recorded as the `ADJTHAN` flag
 * bit on the cell it was found from (and the scan runs to completion instead
 * of early-exiting). With `counts` given, `counts[v]` receives the number of
 * decided cells holding set-value `v` (the solver's and the tally's input;
 * sized `w·h`, which equals `2^n` at the only legal params).
 */
export function subsetsValidate(
  state: SubsetsState,
  flags?: Uint8Array | null,
  counts?: Int32Array | null,
): SubsetsStatus {
  const { w, h } = state;
  const hasCounts = counts != null;

  let ret: SubsetsStatus = "complete";

  for (let i = 0; i < w * h; i++) {
    if (state.known[i] !== state.mask[i]) {
      if (!flags && !hasCounts) return "unfinished";
      ret = "unfinished";
    }
  }

  if (flags) flags.fill(0);
  const cnt = counts ?? new Int32Array(w * h);
  cnt.fill(0);

  // Validate counts (each set placed at most once).
  for (let i = 0; i < w * h; i++) {
    if (state.known[i] === state.mask[i]) {
      cnt[state.known[i]]++;
      if (cnt[state.known[i]] > 1) ret = "invalid";
      if (!flags && ret === "invalid") break;
    }
  }

  // Validate arrows between decided cells.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (ret === "invalid" && !flags) break;

      const i = y * w + x;
      if (state.known[i] !== state.mask[i]) continue;

      for (let dir = 0; dir < 4; dir++) {
        const x2 = x + ADJTHAN[dir].dx;
        const y2 = y + ADJTHAN[dir].dy;
        if (x2 < 0 || x2 >= w || y2 < 0 || y2 >= h) continue;

        const i2 = y2 * w + x2;
        if (state.known[i2] !== state.mask[i2]) continue;

        // Validate disjoint pairs only once.
        if (!(state.clues[i] & ADJTHAN[dir].f) && (x2 < x || y2 < y)) continue;

        const intersect = state.known[i] & state.known[i2];

        if (state.clues[i] & ADJTHAN[dir].f) {
          // Arrow i -> i2: set(i2) must be contained in set(i).
          if (intersect !== state.known[i2]) {
            ret = "invalid";
            if (flags) flags[i] |= ADJTHAN[dir].f;
          }
        } else if (!(state.clues[i2] & ADJTHAN[dir].fo)) {
          // No arrow either way: neither set may contain the other.
          if (intersect === state.known[i2] || intersect === state.known[i]) {
            ret = "invalid";
            if (flags) flags[i] |= ADJTHAN[dir].f;
          }
        }
      }
    }
  }

  return ret;
}

// --- the solver rules (upstream order and strength, exactly) -----------------

/** Drop a candidate value outside the cell's `mask` or missing a `known`
 * bit (upstream `subsets_sync_cube`). */
function syncCube(state: SubsetsState, cube: Uint8Array): void {
  const s = state.w * state.h;
  const n2 = 1 << state.n;
  for (let i = 0; i < s; i++) {
    for (let nj = 0; nj < n2; nj++) {
      if (!cube[i * n2 + nj]) continue;
      if ((state.mask[i] & nj) !== nj) cube[i * n2 + nj] = 0;
      if ((state.known[i] & nj) !== state.known[i]) cube[i * n2 + nj] = 0;
    }
  }
}

/** A value already placed exactly once is no candidate anywhere else
 * (upstream `subsets_cube_single_count`). */
function cubeSingleCount(
  state: SubsetsState,
  counts: Int32Array,
  cube: Uint8Array,
): void {
  const s = state.w * state.h;
  const n2 = 1 << state.n;
  for (let ni = 0; ni < n2; ni++) {
    if (counts[ni] !== 1) continue;
    for (let j = 0; j < s; j++) {
      if (state.mask[j] === state.known[j]) continue;
      if (!cube[j * n2 + ni]) continue;
      cube[j * n2 + ni] = 0;
    }
  }
}

/** An arrow `i1 -> i2` means set(i2) ⊆ set(i1): confirmed letters of the
 * subset propagate up, ruled-out letters of the superset propagate down
 * (upstream `subsets_solve_apply_arrows`). Returns the progress count. */
function applyArrows(state: SubsetsState): number {
  const { w, h } = state;
  let ret = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let d = 0; d < 4; d++) {
        const i1 = y * w + x;
        if (!(state.clues[i1] & ADJTHAN[d].f)) continue;
        const i2 = i1 + ADJTHAN[d].dy * w + ADJTHAN[d].dx;

        let prev = state.known[i1];
        state.known[i1] |= state.known[i2];
        if (prev !== state.known[i1]) ret++;

        prev = state.mask[i2];
        state.mask[i2] &= state.mask[i1];
        if (prev !== state.mask[i2]) ret++;
      }
    }
  }
  return ret;
}

/** A value placed nowhere with exactly one remaining candidate cell is
 * placed there (upstream `subsets_solve_single_position`). */
function solveSinglePosition(
  state: SubsetsState,
  counts: Int32Array,
  cube: Uint8Array,
): number {
  const s = state.w * state.h;
  const n2 = 1 << state.n;
  let ret = 0;
  for (let nj = 0; nj < n2; nj++) {
    if (counts[nj] !== 0) continue;
    let found = -1;
    for (let i = 0; i < s && found !== -2; i++) {
      if (!cube[i * n2 + nj]) continue;
      found = found === -1 ? i : -2;
    }
    if (found < 0) continue;
    state.known[found] = nj;
    state.mask[found] = nj;
    ret++;
  }
  return ret;
}

/** Collapse the surviving candidates back into `known`/`mask` (upstream
 * `subsets_bits_from_cube`). A cell with no surviving candidate — a
 * contradiction — gets `known |= ~0`, upstream behaviour reproduced: the
 * Uint16Array stores 0xFFFF where C stores 0xFFFFFFFF, which is
 * observationally identical because `mask` never exceeds `ALL_BITS(n)`, so
 * such a cell can never read as decided or index the counts array. */
function bitsFromCube(state: SubsetsState, cube: Uint8Array): number {
  const s = state.w * state.h;
  const n2 = 1 << state.n;
  let ret = 0;
  for (let i = 0; i < s; i++) {
    let newmask = 0;
    let newknown = ~0;
    for (let nj = 0; nj < n2; nj++) {
      if (cube[i * n2 + nj]) {
        newmask |= nj;
        newknown &= nj;
      }
    }

    let prev = state.known[i];
    state.known[i] |= newknown;
    if (prev !== state.known[i]) ret++;

    prev = state.mask[i];
    state.mask[i] &= newmask;
    if (prev !== state.mask[i]) ret++;
  }
  return ret;
}

/**
 * For an arrow `i1 -> i2` (meaning set(i2) ⊂ set(i1)), eliminate candidates
 * that no partner on the other end can satisfy (upstream
 * `subsets_solve_apply_arrows_advanced`).
 *
 * Both halves rest on the arrow forcing a **proper** subset — which the arrow
 * rule alone does not say (`subsetsValidate` accepts equality) but the
 * separate "each set is placed at most once" rule does, since two cells cannot
 * hold the same value. That is why each half looks for a *strictly* smaller /
 * larger partner.
 *
 * - **Tail half** (every tier): drop a superset candidate at `i1` that has no
 *   strictly-smaller live candidate at `i2`.
 * - **Head half** (`strong` only): the mirror — drop a subset candidate at
 *   `i2` that has no strictly-larger live candidate at `i1`. Upstream wrote
 *   this, commented it out under `// TODO repair this`, and shipped without
 *   it; `add-subsets-difficulty-tiers` restored it as the Tricky rung. See
 *   that change's `design.md` D1 for what was actually wrong with it.
 */
function applyArrowsAdvanced(
  state: SubsetsState,
  cube: Uint8Array,
  strong: boolean,
): number {
  const { w, h } = state;
  const n2 = 1 << state.n;
  let ret = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let d = 0; d < 4; d++) {
        const i1 = y * w + x;
        if (!(state.clues[i1] & ADJTHAN[d].f)) continue;
        const i2 = i1 + ADJTHAN[d].dy * w + ADJTHAN[d].dx;

        for (let sup = 0; sup < n2; sup++) {
          if (!cube[i1 * n2 + sup]) continue;
          let found = false;
          for (let sub = 0; sub < sup && !found; sub++) {
            if ((sup & sub) !== sub || !cube[i2 * n2 + sub]) continue;
            found = true;
          }
          if (!found) {
            cube[i1 * n2 + sup] = 0;
            ret++;
          }
        }

        if (!strong) continue;

        for (let sub = 0; sub < n2; sub++) {
          if (!cube[i2 * n2 + sub]) continue;
          let found = false;
          for (let sup = sub + 1; sup < n2 && !found; sup++) {
            if ((sup & sub) !== sub || !cube[i1 * n2 + sup]) continue;
            found = true;
          }
          if (!found) {
            cube[i2 * n2 + sub] = 0;
            ret++;
          }
        }
      }
    }
  }
  return ret;
}

/** A missing arrow between adjacent cells means neither contains the other:
 * an undecided such cell can be neither the empty nor the full set, and
 * next to a decided one loses every improperly-overlapping candidate
 * (upstream `subsets_disjoint`). */
function disjoint(state: SubsetsState, cube: Uint8Array): number {
  const { w, h } = state;
  const n2 = 1 << state.n;
  let ret = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let d = 0; d < 4; d++) {
        const i1 = y * w + x;
        if (state.clues[i1] & ADJTHAN[d].f) continue;
        if (
          x + ADJTHAN[d].dx < 0 ||
          x + ADJTHAN[d].dx >= w ||
          y + ADJTHAN[d].dy < 0 ||
          y + ADJTHAN[d].dy >= h
        )
          continue;
        const i2 = i1 + ADJTHAN[d].dy * w + ADJTHAN[d].dx;
        if (state.clues[i2] & ADJTHAN[d].fo) continue;

        if (state.known[i1] !== state.mask[i1]) {
          // Remove the minimum and maximum sets.
          if (cube[i1 * n2] || cube[i1 * n2 + (n2 - 1)]) {
            cube[i1 * n2] = 0;
            cube[i1 * n2 + (n2 - 1)] = 0;
            ret++;
          }
        } else if (state.known[i2] !== state.mask[i2]) {
          // Rule out every set at i2 that is not disjoint with the set at i1
          // (i.e. one contains the other; a partial overlap is fine).
          for (let opt = 0; opt < n2; opt++) {
            if (!cube[i2 * n2 + opt]) continue;
            if (
              (state.known[i1] & opt) !== opt &&
              (state.known[i1] & opt) !== state.known[i1]
            )
              continue;
            cube[i2 * n2 + opt] = 0;
            ret++;
          }
        }
      }
    }
  }
  return ret;
}

/**
 * Run the solver to a fixpoint (upstream `subsets_solve_game`), mutating
 * `state` in place: every non-given cell is reset, then the rules run in
 * upstream's fixed order, restarting on the first that makes progress.
 * Callers pass a clone when they need the original preserved.
 *
 * `maxdiff` caps the deduction ladder: {@link DIFF_EASY} is upstream's shipped
 * strength exactly, {@link DIFF_TRICKY} adds the head half of
 * {@link applyArrowsAdvanced}. The rungs nest — Tricky runs every Easy rule —
 * so a board solvable at Easy is solvable at Tricky. Required, not defaulted:
 * an implicit cap is how a caller silently measures the wrong tier.
 */
export function subsetsSolveGame(state: SubsetsState, maxdiff: number): SubsetsStatus {
  const s = state.w * state.h;
  const n2 = 1 << state.n;
  const counts = new Int32Array(s);
  const cube = new Uint8Array(s * n2).fill(1);

  for (let i = 0; i < s; i++) {
    if (state.immutable[i]) continue;
    state.known[i] = 0;
    state.mask[i] = ALL_BITS(state.n);
  }

  for (;;) {
    const ret = subsetsValidate(state, null, counts);
    if (ret !== "unfinished") return ret;

    syncCube(state, cube);
    cubeSingleCount(state, counts, cube);

    if (applyArrows(state)) continue;
    if (disjoint(state, cube)) continue;
    if (bitsFromCube(state, cube)) continue;
    if (solveSinglePosition(state, counts, cube)) continue;
    if (applyArrowsAdvanced(state, cube, maxdiff >= DIFF_TRICKY)) continue;

    return ret;
  }
}

// --- findMistakes (design D5: the rule validator's error set) ----------------

/**
 * The Check & Save mistake set: exactly what upstream's own error display
 * highlights — every set-value fully placed in more than one cell (each
 * offending cell flagged), and every edge whose horseshoe or
 * missing-horseshoe relation two decided cells violate. A rule-based check,
 * not a re-solve-and-diff, matching the C's live `COL_ERROR` verdicts.
 */
export function findMistakes(state: SubsetsState): readonly SubsetsMistake[] {
  const { w, h } = state;
  const flags = new Uint8Array(w * h);
  const counts = new Int32Array(w * h);
  if (subsetsValidate(state, flags, counts) !== "invalid") return [];

  const mistakes: SubsetsMistake[] = [];
  for (let i = 0; i < w * h; i++) {
    if (state.known[i] === state.mask[i] && counts[state.known[i]] > 1)
      mistakes.push({ kind: "cell", pos: i });
  }
  for (let i = 0; i < w * h; i++) {
    for (let d = 0; d < 4; d++) {
      if (flags[i] & ADJTHAN[d].f) mistakes.push({ kind: "edge", pos: i, dir: d });
    }
  }
  return mistakes;
}

/** Solve a copy of `state`, returning the solved copy and its status — the
 * shared entry for `solve()` and tests. Defaults to the top of the ladder,
 * which is right for the Solve button whatever tier the board was generated
 * at: an Easy board solves at Tricky too (the rungs nest). */
export function solveCopy(
  state: SubsetsState,
  maxdiff: number = DIFF_TRICKY,
): {
  solved: SubsetsState;
  result: SubsetsStatus;
} {
  const solved = cloneState(state);
  return { solved, result: subsetsSolveGame(solved, maxdiff) };
}

// --- hint recorder (add-subsets-hint) ---------------------------------------
//
// A *parallel recorder* over the same six rules (the Undead §9.4 / Clusters F1
// shape): separate code reusing this module's primitives, run **from the
// player's current marks** (no reset — a hint continues from where the player
// is), emitting the deductions one narratable letter-firing at a time. Because
// `subsetsSolveGame`/`subsetsValidate` — the byte-match differential surface —
// never call any of this, the generator's desc is unaffected *by construction*
// (design D1); there is no recorder flag on the hot path.
//
// The projection problem (design D3): three of the six rules — `cubeSingleCount`,
// `disjoint`, `applyArrowsAdvanced` — eliminate candidate *values* the player
// never sees. They are not steps of their own (there is no letter move to
// attach them to); instead they set up a `bitsFromCube` collapse, whose firing
// carries the elimination *evidence* that drove it. Only three rules produce a
// player-visible letter change: `applyArrows` (a horseshoe propagating letters),
// `bitsFromCube` (a candidate collapse), and `solveSinglePosition` (a set with
// one place left). Those are the three reason kinds a firing can have.
//
// Confluence makes the one-firing-at-a-time order safe: every rule only *adds*
// information (letters confirmed/cleared, candidates removed) monotonically, so
// the mutual fixpoint is order-independent — the recorder reaches exactly the
// same decided board as `subsetsSolveGame` would from the same position, using
// exactly the same rules, i.e. never deducing more than the uniqueness gate
// vetted.

/** One letter slot a firing decides. */
export interface SubsetsDeductionSet {
  /** Letter index (bit position), `0..n-1`. */
  bit: number;
  type: "known" | "cleared";
}

/** Why a firing is forced. `from`/`to` name an arrow `from -> to` meaning
 * `set(to) ⊆ set(from)` (`from` the superset at the arrow's tail, `to` the
 * subset at its head). */
export type SubsetsReason =
  /** The subset `to`'s confirmed letters propagate up to the superset `from`
   * (`pos === from`). */
  | { kind: "arrowKnown"; from: number; to: number }
  /** The superset `from`'s ruled-out letters propagate down to the subset `to`
   * (`pos === to`). */
  | { kind: "arrowMask"; from: number; to: number }
  /** A *hidden single* (Dominosa `onlySpot` analog): set `value` fits — shallow,
   * from the board — in only the one cell `pos`, so it must go there. The
   * spotlight of `value`'s candidate cells is that single cell (design owner
   * redesign 2026-07-21). */
  | { kind: "hiddenSingle"; value: number }
  /** A candidate collapse (`bitsFromCube`): the sets that can still go in the
   * cell all agree on the decided letters. `survivors` is that surviving
   * set-value list (the self-contained premise — every one contains each
   * now-Known letter, none contains a now-Cleared letter; design D3, measured
   * ≤3 in 94% of collapses). `neighbours` are the few local arrow/adjacency
   * cells whose relation removed candidates (shaded as evidence);
   * `placedDriven` is true when exactly-once placements elsewhere also
   * removed candidates (narrated generically, shown ambiently in the tally —
   * §5.6, up to 14 cells, never enumerated). */
  | {
      kind: "collapse";
      survivors: number[];
      neighbours: number[];
      placedDriven: boolean;
    }
  /** A set placed nowhere with exactly one candidate cell left goes there —
   * the whole cell is decided at once. */
  | { kind: "singlePosition"; value: number };

/** One recorded firing: the cell acted on, the letters it decides together
 * (one journey — design D4), and the deduction that forces them. */
export interface SubsetsDeduction {
  pos: number;
  sets: SubsetsDeductionSet[];
  reason: SubsetsReason;
}

/** The remaining plan from the player's position. `status` is the board's
 * verdict when the recorder stopped: `complete` means the deductions solve it
 * (which also certifies the position — the rules are monotone, so a wrong mark
 * can only end `invalid` or stall `unfinished`). */
export interface SubsetsHintPlan {
  status: SubsetsStatus;
  deductions: SubsetsDeduction[];
}

/** Bit positions set in `mask`, ascending. */
function bitList(mask: number, n: number): number[] {
  const out: number[] = [];
  for (let b = 0; b < n; b++) if (mask & (1 << b)) out.push(b);
  return out;
}

/** Why a cube candidate was eliminated, for a collapse's evidence (design D3).
 * `undefined` in the sink means "not eliminated, or eliminated by the cell's
 * own marks (syncCube)" — the latter carries no external evidence cell. */
type ElimEvidence =
  | { kind: "placed"; cell: number }
  | { kind: "neighbour"; cell: number };

/** The first arrow with a player-visible letter change, applied and recorded
 * (mirrors `applyArrows`, one side of one arrow at a time). */
function nextArrowFiring(state: SubsetsState): SubsetsDeduction | null {
  const { w, h, n } = state;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let d = 0; d < 4; d++) {
        const i1 = y * w + x;
        if (!(state.clues[i1] & ADJTHAN[d].f)) continue;
        const i2 = i1 + ADJTHAN[d].dy * w + ADJTHAN[d].dx;

        // set(i2) ⊆ set(i1): a letter confirmed in the subset i2 is in i1.
        const gainedKnown = state.known[i2] & ~state.known[i1];
        if (gainedKnown) {
          state.known[i1] |= state.known[i2];
          return {
            pos: i1,
            sets: bitList(gainedKnown, n).map((bit) => ({ bit, type: "known" })),
            reason: { kind: "arrowKnown", from: i1, to: i2 },
          };
        }
        // A letter ruled out of the superset i1 is ruled out of the subset i2.
        const lostMask = state.mask[i2] & ~state.mask[i1];
        if (lostMask) {
          state.mask[i2] &= state.mask[i1];
          return {
            pos: i2,
            sets: bitList(lostMask, n).map((bit) => ({ bit, type: "cleared" })),
            reason: { kind: "arrowMask", from: i1, to: i2 },
          };
        }
      }
    }
  }
  return null;
}

/** `cubeSingleCount`, recording each elimination's evidence cell. Separate copy
 * of the private rule (does not touch the solve path). */
function recCubeSingleCount(
  state: SubsetsState,
  counts: Int32Array,
  cube: Uint8Array,
  elim: (ElimEvidence | undefined)[],
): number {
  const s = state.w * state.h;
  const n2 = 1 << state.n;
  let ret = 0;
  for (let ni = 0; ni < n2; ni++) {
    if (counts[ni] !== 1) continue;
    // The single decided cell holding value `ni` — the evidence for every
    // elimination this value causes.
    let placedAt = -1;
    for (let k = 0; k < s; k++) {
      if (state.known[k] === state.mask[k] && state.known[k] === ni) {
        placedAt = k;
        break;
      }
    }
    for (let j = 0; j < s; j++) {
      if (state.mask[j] === state.known[j]) continue;
      if (!cube[j * n2 + ni]) continue;
      cube[j * n2 + ni] = 0;
      elim[j * n2 + ni] ??= { kind: "placed", cell: placedAt };
      ret++;
    }
  }
  return ret;
}

/** `disjoint`, recording the incomparable/decided neighbour as evidence. */
function recDisjoint(
  state: SubsetsState,
  cube: Uint8Array,
  elim: (ElimEvidence | undefined)[],
): number {
  const { w, h } = state;
  const n2 = 1 << state.n;
  let ret = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let d = 0; d < 4; d++) {
        const i1 = y * w + x;
        if (state.clues[i1] & ADJTHAN[d].f) continue;
        if (
          x + ADJTHAN[d].dx < 0 ||
          x + ADJTHAN[d].dx >= w ||
          y + ADJTHAN[d].dy < 0 ||
          y + ADJTHAN[d].dy >= h
        )
          continue;
        const i2 = i1 + ADJTHAN[d].dy * w + ADJTHAN[d].dx;
        if (state.clues[i2] & ADJTHAN[d].fo) continue;

        if (state.known[i1] !== state.mask[i1]) {
          if (cube[i1 * n2] || cube[i1 * n2 + (n2 - 1)]) {
            if (cube[i1 * n2]) elim[i1 * n2] ??= { kind: "neighbour", cell: i2 };
            if (cube[i1 * n2 + (n2 - 1)])
              elim[i1 * n2 + (n2 - 1)] ??= { kind: "neighbour", cell: i2 };
            cube[i1 * n2] = 0;
            cube[i1 * n2 + (n2 - 1)] = 0;
            ret++;
          }
        } else if (state.known[i2] !== state.mask[i2]) {
          for (let opt = 0; opt < n2; opt++) {
            if (!cube[i2 * n2 + opt]) continue;
            if (
              (state.known[i1] & opt) !== opt &&
              (state.known[i1] & opt) !== state.known[i1]
            )
              continue;
            cube[i2 * n2 + opt] = 0;
            elim[i2 * n2 + opt] ??= { kind: "neighbour", cell: i1 };
            ret++;
          }
        }
      }
    }
  }
  return ret;
}

/**
 * `applyArrowsAdvanced`, recording the arrow neighbour as evidence. `strong`
 * adds the head half exactly as the solve path does — and, exactly as there,
 * the recorder reaches for it only once the cheaper vocabulary is exhausted
 * (see {@link deduceHintPlan}).
 */
function recApplyArrowsAdvanced(
  state: SubsetsState,
  cube: Uint8Array,
  elim: (ElimEvidence | undefined)[],
  strong: boolean,
): number {
  const { w, h } = state;
  const n2 = 1 << state.n;
  let ret = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let d = 0; d < 4; d++) {
        const i1 = y * w + x;
        if (!(state.clues[i1] & ADJTHAN[d].f)) continue;
        const i2 = i1 + ADJTHAN[d].dy * w + ADJTHAN[d].dx;

        for (let sup = 0; sup < n2; sup++) {
          if (!cube[i1 * n2 + sup]) continue;
          let found = false;
          for (let sub = 0; sub < sup && !found; sub++) {
            if ((sup & sub) !== sub || !cube[i2 * n2 + sub]) continue;
            found = true;
          }
          if (!found) {
            cube[i1 * n2 + sup] = 0;
            elim[i1 * n2 + sup] ??= { kind: "neighbour", cell: i2 };
            ret++;
          }
        }

        if (!strong) continue;

        for (let sub = 0; sub < n2; sub++) {
          if (!cube[i2 * n2 + sub]) continue;
          let found = false;
          for (let sup = sub + 1; sup < n2 && !found; sup++) {
            if ((sup & sub) !== sub || !cube[i1 * n2 + sup]) continue;
            found = true;
          }
          if (!found) {
            cube[i2 * n2 + sub] = 0;
            elim[i2 * n2 + sub] ??= { kind: "neighbour", cell: i1 };
            ret++;
          }
        }
      }
    }
  }
  return ret;
}

/** Shrink the cube to a fixpoint from the current marks, recording evidence.
 * `syncCube` (own-marks elimination) needs no evidence — a collapse detects
 * own-marks culprits directly. `counts` is fixed (no letter changes here), so
 * `recCubeSingleCount` runs once; `recDisjoint`/`recApplyArrowsAdvanced`
 * interact through the cube, so they iterate. */
function shrinkCube(
  state: SubsetsState,
  cube: Uint8Array,
  counts: Int32Array,
  elim: (ElimEvidence | undefined)[],
  strong: boolean,
): void {
  syncCube(state, cube);
  recCubeSingleCount(state, counts, cube, elim);
  for (;;) {
    let changed = 0;
    changed += recDisjoint(state, cube, elim);
    changed += recApplyArrowsAdvanced(state, cube, elim, strong);
    if (!changed) break;
  }
}

/** The first cell whose surviving cube-candidates collapse into a new letter
 * conclusion (`bitsFromCube`), applied and recorded with its evidence. */
function nextCollapseFiring(
  state: SubsetsState,
  cube: Uint8Array,
  elim: (ElimEvidence | undefined)[],
): SubsetsDeduction | null {
  const s = state.w * state.h;
  const n2 = 1 << state.n;
  const n = state.n;
  for (let i = 0; i < s; i++) {
    let newmask = 0;
    let newknown = ~0;
    const survivors: number[] = [];
    for (let nj = 0; nj < n2; nj++) {
      if (cube[i * n2 + nj]) {
        newmask |= nj;
        newknown &= nj;
        survivors.push(nj);
      }
    }
    // A cell with no surviving candidate is a contradiction — the position is
    // unsolvable. Skip it (the hint refuses such boards up front, design D5);
    // never emit a garbage firing.
    if (survivors.length === 0) continue;

    const gainedKnown = newknown & ALL_BITS(n) & ~state.known[i];
    const lostMask = state.mask[i] & ~newmask;
    if (!gainedKnown && !lostMask) continue;

    const sets: SubsetsDeductionSet[] = [
      ...bitList(gainedKnown, n).map((bit) => ({ bit, type: "known" as const })),
      ...bitList(lostMask, n).map((bit) => ({ bit, type: "cleared" as const })),
    ];

    // Attribute the eliminations that are *culprits* for a decided letter — a
    // Known letter L is forced because every set lacking L was ruled out; a
    // Cleared letter L because every set holding L was. Shade only the few
    // local arrow/adjacency neighbours; note whether exactly-once placements
    // contributed (narrated generically — the tally shows them). The
    // surviving-set list is the self-contained premise for the conclusion.
    const neighbours = new Set<number>();
    let placedDriven = false;
    for (let nj = 0; nj < n2; nj++) {
      if (cube[i * n2 + nj]) continue; // still a candidate — not a culprit
      const culprit = (gainedKnown & ~nj) !== 0 || (lostMask & nj) !== 0;
      if (!culprit) continue;
      const ev = elim[i * n2 + nj];
      if (ev?.kind === "neighbour") neighbours.add(ev.cell);
      else if (ev?.kind === "placed") placedDriven = true;
    }

    state.known[i] |= newknown;
    state.mask[i] &= newmask;
    return {
      pos: i,
      sets,
      reason: {
        kind: "collapse",
        survivors,
        neighbours: [...neighbours],
        placedDriven,
      },
    };
  }
  return null;
}

/** A set placed nowhere with exactly one candidate cell left is placed there
 * (`solveSinglePosition`) — the whole cell decided at once. */
function nextSinglePosition(
  state: SubsetsState,
  counts: Int32Array,
  cube: Uint8Array,
): SubsetsDeduction | null {
  const s = state.w * state.h;
  const n2 = 1 << state.n;
  const n = state.n;
  for (let nj = 0; nj < n2; nj++) {
    if (counts[nj] !== 0) continue;
    let found = -1;
    for (let i = 0; i < s && found !== -2; i++) {
      if (!cube[i * n2 + nj]) continue;
      found = found === -1 ? i : -2;
    }
    if (found < 0) continue;

    const sets: SubsetsDeductionSet[] = [];
    for (let b = 0; b < n; b++) {
      if (nj & (1 << b)) {
        if (!(state.known[found] & (1 << b))) sets.push({ bit: b, type: "known" });
      } else if (state.mask[found] & (1 << b)) {
        sets.push({ bit: b, type: "cleared" });
      }
    }
    state.known[found] = nj;
    state.mask[found] = nj;
    return { pos: found, sets, reason: { kind: "singlePosition", value: nj } };
  }
  return null;
}

/** Why placing a set in an undecided cell breaks a *visible* rule — the
 * shallow reason a player can see, for the reference aid and the "why not X"
 * hint clause. `null` from {@link whyCantPlace} means it fits. */
export type PlacementBlock =
  /** The cell's own marks forbid it (it lacks a marked letter, or holds a
   * cleared one). */
  | { kind: "marks" }
  /** A horseshoe to decided `neighbour` requires `value` to contain / be
   * contained in the neighbour's set, and it isn't: `mustContain` says which
   * direction, `letters` are the offending letters. */
  | { kind: "arrow"; neighbour: number; mustContain: boolean; letters: number }
  /** A missing horseshoe to decided `neighbour` forbids one set containing the
   * other, but `value` and the neighbour's set are comparable. */
  | { kind: "adjacent"; neighbour: number };

/** The visible rule (if any) that stops `value` sitting in undecided cell `i`,
 * judged shallowly from the board (marks + decided-neighbour horseshoes). */
export function whyCantPlace(
  state: SubsetsState,
  i: number,
  value: number,
): PlacementBlock | null {
  const { w } = state;
  const x = i % w;
  const y = Math.floor(i / w);
  if ((state.known[i] & value) !== state.known[i] || (value & state.mask[i]) !== value)
    return { kind: "marks" };
  for (let d = 0; d < 4; d++) {
    const x2 = x + ADJTHAN[d].dx;
    const y2 = y + ADJTHAN[d].dy;
    if (x2 < 0 || x2 >= w || y2 < 0 || y2 >= state.h) continue;
    const j = y2 * w + x2;
    if (state.known[j] !== state.mask[j]) continue; // only decided neighbours constrain
    const kj = state.known[j];
    if (state.clues[i] & ADJTHAN[d].f) {
      // Arrow i -> j: set(j) ⊆ value — value must contain kj.
      if ((kj & value) !== kj)
        return { kind: "arrow", neighbour: j, mustContain: true, letters: kj & ~value };
    } else if (state.clues[j] & ADJTHAN[d].fo) {
      // Arrow j -> i: value ⊆ set(j) — value must fit inside kj.
      if ((value & kj) !== value)
        return {
          kind: "arrow",
          neighbour: j,
          mustContain: false,
          letters: value & ~kj,
        };
    } else if ((value & kj) === value || (value & kj) === kj) {
      // No arrow: neither may contain the other, but they are comparable.
      return { kind: "adjacent", neighbour: j };
    }
  }
  return null;
}

/**
 * The cells set-value `value` can still legally occupy, judged **shallowly from
 * the board** — the Dominosa "no solver, no solution leak" rule (owner redesign
 * 2026-07-21). A **placed** set can go nowhere else, so its decided home
 * cell(s) are returned alone; an **unplaced** set returns every undecided cell
 * where placing it breaks no visible rule (marks + decided-neighbour
 * horseshoes). This powers the reference-aid spotlight and the hidden-single
 * hint.
 */
export function candidateCells(state: SubsetsState, value: number): number[] {
  const s = state.w * state.h;
  const placed: number[] = [];
  for (let i = 0; i < s; i++)
    if (state.known[i] === state.mask[i] && state.known[i] === value) placed.push(i);
  if (placed.length) return placed; // placed already — nowhere else

  const out: number[] = [];
  for (let i = 0; i < s; i++) {
    if (state.known[i] === state.mask[i]) continue; // decided as something else
    if (whyCantPlace(state, i, value) === null) out.push(i);
  }
  return out;
}

/** The reverse of {@link candidateCells}: the set-values that can still go in
 * undecided cell `i` — consistent with its marks and horseshoes, and not
 * already placed elsewhere. A decided cell returns just its own set. */
export function candidateSets(state: SubsetsState, i: number): number[] {
  const n2 = 1 << state.n;
  if (state.known[i] === state.mask[i]) return [state.known[i]];
  const placedElsewhere = new Set<number>();
  const s = state.w * state.h;
  for (let k = 0; k < s; k++)
    if (k !== i && state.known[k] === state.mask[k])
      placedElsewhere.add(state.known[k]);
  const out: number[] = [];
  for (let value = 0; value < n2; value++) {
    if (placedElsewhere.has(value)) continue;
    if (whyCantPlace(state, i, value) === null) out.push(value);
  }
  return out;
}

/** A representative excluded competitor of a collapse. `block` is why it can't
 * sit in the cell — a visible on-board rule, or `placed` (it is already on the
 * board, at `cell`). */
export type CollapseExclusion = {
  value: number;
  block: PlacementBlock | { kind: "placed"; cell: number };
};

/** For a collapse at `cell` (only `survivors` fit), a representative *excluded*
 * competitor and why — a set the player might expect but that a visible rule
 * blocks. Prefers an on-board reason (horseshoe/adjacency) over placement, and
 * a nearest-miss competitor. `null` when nothing illustrative is found. */
export function pickExclusion(
  state: SubsetsState,
  cell: number,
  survivors: number[],
): CollapseExclusion | null {
  const n2 = 1 << state.n;
  const surv = new Set(survivors);
  const s = state.w * state.h;
  const placedAt = (value: number): number => {
    for (let k = 0; k < s; k++)
      if (k !== cell && state.known[k] === state.mask[k] && state.known[k] === value)
        return k;
    return -1;
  };
  // Rank the exclusion reason by how clearly it teaches: an arrow (shows the
  // horseshoe logic) over a placement (concrete counting) over adjacency (the
  // subtle missing-horseshoe rule); ties broken by nearest miss.
  const rankOf = (block: CollapseExclusion["block"]): number =>
    block.kind === "arrow" ? 0 : block.kind === "placed" ? 1 : 2;
  let best: {
    value: number;
    block: CollapseExclusion["block"];
    rank: number;
    dist: number;
  } | null = null;
  for (let value = 0; value < n2; value++) {
    if (surv.has(value)) continue;
    // Only competitors consistent with the cell's own marks are illustrative
    // (a mark-excluded set is visibly impossible already).
    if (
      (state.known[cell] & value) !== state.known[cell] ||
      (value & state.mask[cell]) !== value
    )
      continue;
    let block: CollapseExclusion["block"];
    const home = placedAt(value);
    if (home >= 0) {
      block = { kind: "placed", cell: home };
    } else {
      const b = whyCantPlace(state, cell, value);
      if (!b || b.kind === "marks") continue;
      block = b;
    }
    const rank = rankOf(block);
    let dist = state.n + 1;
    for (const sv of survivors) dist = Math.min(dist, popcount(sv ^ value));
    if (!best || rank < best.rank || (rank === best.rank && dist < best.dist))
      best = { value, block, rank, dist };
  }
  return best ? { value: best.value, block: best.block } : null;
}

function popcount(x: number): number {
  let n = 0;
  let v = x;
  while (v) {
    v &= v - 1;
    n++;
  }
  return n;
}

/** A *hidden single*: an unplaced set with exactly one candidate cell must go
 * there (the whole cell decided at once). Shallow (via {@link candidateCells}),
 * so its "only this cell" claim is verifiable against the reference-aid
 * spotlight. Applied and recorded. */
function nextHiddenSingle(
  state: SubsetsState,
  counts: Int32Array,
): SubsetsDeduction | null {
  const n2 = 1 << state.n;
  const n = state.n;
  for (let value = 0; value < n2; value++) {
    if (counts[value] !== 0) continue; // placed already (or duplicated)
    const cells = candidateCells(state, value);
    if (cells.length !== 1) continue;
    const pos = cells[0];
    const sets: SubsetsDeductionSet[] = [];
    for (let b = 0; b < n; b++) {
      if (value & (1 << b)) {
        if (!(state.known[pos] & (1 << b))) sets.push({ bit: b, type: "known" });
      } else if (state.mask[pos] & (1 << b)) {
        sets.push({ bit: b, type: "cleared" });
      }
    }
    if (sets.length === 0) continue;
    state.known[pos] = value;
    state.mask[pos] = value;
    return { pos, sets, reason: { kind: "hiddenSingle", value } };
  }
  return null;
}

/**
 * Record the deduction plan from the player's current marks (design D1):
 * continue from the position (no reset of non-given cells), emitting one
 * narratable firing at a time. Rung order surfaces the most teachable form
 * first (owner redesign 2026-07-21): horseshoe arrows → **hidden single**
 * (a set with one spot left — the crisp, spotlight-shaped counting) → the
 * cube collapse (a cell with one set left) → a last-place cube placement.
 * Stops at `complete`/`invalid`, or `unfinished` when no rule fires.
 *
 * `maxdiff` mirrors {@link subsetsSolveGame}'s cap and defaults to the top of
 * the ladder, which is what production wants: the Tricky rung is a *fallback*,
 * so a board that never exhausts the cheaper vocabulary never reaches it and an
 * Easy plan is unaffected by the default. Passing `DIFF_EASY` is how a test
 * asserts that rather than assuming it.
 */
export function deduceHintPlan(
  orig: SubsetsState,
  maxdiff: number = DIFF_TRICKY,
): SubsetsHintPlan {
  const work = cloneState(orig);
  const s = work.w * work.h;
  const n2 = 1 << work.n;
  const cube = new Uint8Array(s * n2).fill(1);
  const counts = new Int32Array(s);
  const elim: (ElimEvidence | undefined)[] = new Array(s * n2);
  const budget = stepBudget("subsets hint");

  // Every rung *applies as it detects* (each `next*Firing` writes the letter or
  // clears the mask it found), so the shared loop takes no `apply` callback.
  const nextFiring = (state: SubsetsState): SubsetsDeduction | null => {
    // Rung 1: horseshoe arrows — direct letter propagation, no cube needed.
    const arrow = nextArrowFiring(state);
    if (arrow) return arrow;

    // Rung 2: a hidden single — "this set fits only one cell" (shallow, so the
    // player can verify it with the same spotlight). Tried before the collapse
    // so the crisp counting form wins where it exists.
    const hidden = nextHiddenSingle(state, counts);
    if (hidden) return hidden;

    // Rungs 3+: engage the cube. Shrink it to a fixpoint (the value-only
    // rules), then look for a letter collapse, then a last-place placement.
    // `cube` and `elim` both persist across iterations (the cube shrinks
    // monotonically, so an elimination's reason is stable) — refilling `elim`
    // would lose the provenance of candidates removed in an earlier iteration.
    shrinkCube(state, cube, counts, elim, false);
    const easy =
      nextCollapseFiring(state, cube, elim) ?? nextSinglePosition(state, counts, cube);
    if (easy) return easy;

    // Rung 4 (`DIFF_TRICKY`): only once every cheaper rung is exhausted, add
    // the head half of the advanced arrow rule and try the cube again. Reaching
    // for it *last* is what keeps an Easy board's plan identical to the one it
    // had before the tier existed — the rung is unreachable there, because the
    // cheaper vocabulary never runs out on a board vetted as solvable without
    // it. (This is the shape the Clusters hint uses for its lookahead rung; the
    // first cut of this change ran the head half unconditionally instead, which
    // is *sound* but silently re-planned Easy boards — a render snapshot caught
    // it.) Both `next*Firing` calls above returned null without mutating, so
    // re-running them here repeats no work and drops no firing.
    if (maxdiff < DIFF_TRICKY) return null;
    shrinkCube(state, cube, counts, elim, true);
    return (
      nextCollapseFiring(state, cube, elim) ?? nextSinglePosition(state, counts, cube)
    );
  };

  const { status, plan } = accumulateHintPlan<
    SubsetsState,
    SubsetsDeduction,
    SubsetsStatus
  >({
    board: work,
    // Recounts into `counts`, which rung 2 and the cube shrink both read.
    status: (state) => subsetsValidate(state, null, counts),
    incomplete: "unfinished",
    next: nextFiring,
    budget,
  });
  return { status, deductions: plan };
}
