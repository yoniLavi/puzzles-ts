/**
 * Subsets rule validator and deductive solver — port of `subsets_validate`
 * and the `subsets_solve_*` family in `puzzles/unreleased/subsets.c`.
 *
 * The solver is a candidate-elimination fixpoint over a **cube**
 * `cube[cell][value]`: for each cell and each of the `2^n` possible
 * set-values, whether that value is still a candidate. Its exact deductive
 * strength is byte-match surface: the generator keeps a cell blank only
 * while this solver still reaches a complete solution (generator.ts), so
 * the precise set of deductions — no more, no less — decides which cells
 * stay givens and therefore every generated desc. Port rules and loop
 * order verbatim; do not strengthen or weaken (design D2 of
 * add-subsets-ts-port).
 */
import {
  ADJTHAN,
  ALL_BITS,
  cloneState,
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
 * For an arrow `i1 -> i2`, drop a superset candidate at `i1` with no
 * strictly-smaller subset candidate at `i2` (upstream
 * `subsets_solve_apply_arrows_advanced`).
 *
 * Upstream's second half — "remove options that don't fit the larger set",
 * the mirror-image elimination on the subset cell — is commented out in the
 * C ("TODO repair this") and therefore NOT compiled. It is deliberately not
 * ported: the generator's blanking gate runs on this solver's exact
 * strength, so restoring that block would change every generated board
 * (design D2). Do not "fix" this.
 */
function applyArrowsAdvanced(state: SubsetsState, cube: Uint8Array): number {
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
 */
export function subsetsSolveGame(state: SubsetsState): SubsetsStatus {
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
    if (applyArrowsAdvanced(state, cube)) continue;

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

/** Solve a copy of `state`, returning the solved copy and its status —
 * the shared entry for `solve()` and tests. */
export function solveCopy(state: SubsetsState): {
  solved: SubsetsState;
  result: SubsetsStatus;
} {
  const solved = cloneState(state);
  return { solved, result: subsetsSolveGame(solved) };
}
