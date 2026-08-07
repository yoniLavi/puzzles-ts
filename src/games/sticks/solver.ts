/**
 * Sticks contradiction solver — port of `sticks_make_dsf` /
 * `sticks_max_size_horizontal` / `sticks_max_size_vertical` /
 * `sticks_validate` / `sticks_try` / `sticks_solve_game` in
 * `puzzles/unreleased/sticks.c`.
 *
 * The one technique: for each blank cell, tentatively place a horizontal
 * line; if the board becomes provably invalid, the cell must be vertical
 * (and vice versa). `sticksValidate` is both the constraint checker and
 * the deduction oracle — it merges adjacent same-orientation line cells
 * into segments with a dsf, then checks each clued segment's length (too
 * long, or provably unable to reach its clue) and each clued black cell's
 * connected-line / free-neighbour counts. Generation gates on this solver
 * (a single implicit guess-free difficulty tier), so its exact deductive
 * power is byte-match surface: the two `x > 1` / `y > 1` reachability
 * quirks below are ported verbatim.
 *
 * The solver works on bare `(grid, numbers, w, h)` arrays (the caller owns
 * cloning); play-facing wrappers over immutable {@link SticksState} sit at
 * the bottom.
 */
import { Dsf } from "../../engine/dsf.ts";
import { deduceHintPlan } from "../../engine/hint-plan.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import {
  F_BLOCK,
  F_HOR,
  F_VER,
  type SticksLine,
  type SticksMistake,
  type SticksState,
} from "./state.ts";

export type SticksStatus = "complete" | "unfinished" | "invalid";

/**
 * *Why* a board is invalid, recorded at the point {@link sticksValidate}
 * detects it — one variant per branch the validator can fail on, which is the
 * whole of its vocabulary (docs/games/hints.md § "Read the reason off the validator": the classifier must be
 * total, and it is total here because it is written *inside* the oracle rather
 * than re-derived from its verdict).
 *
 * Each variant carries the clue that broke, its value, and the cells the
 * argument reasons over — the hint's evidence area, so the picture cannot
 * disagree with the words (§5.2).
 */
export type SticksReason =
  /** The clue's line would run longer than its number. */
  | { kind: "tooLong"; clue: number; value: number; size: number; segment: number[] }
  /** The clue's line could no longer stretch far enough to reach its number. */
  | { kind: "unreachable"; clue: number; value: number; max: number; span: number[] }
  /** One line would carry two numbers. */
  | { kind: "twoClues"; clues: number[]; segment: number[] }
  /** A black clue would gain more lines than it counts. */
  | { kind: "overConnected"; clue: number; value: number; lines: number[] }
  /**
   * A black clue would lose a side it still needed a line from. `open` is
   * every side a line can *still* reach it from — one already carrying a line
   * counts, an off-board or walled side does not — so on the trial board it
   * holds `value - 1` cells, the trial's own cell being the one just closed.
   */
  | { kind: "starved"; clue: number; value: number; open: number[] };

/** Reusable scratch for the hot validate path (upstream passes dsf+lengths). */
export interface SticksScratch {
  dsf: Dsf;
  /** Per segment root: -1 no clue, -2 two or more clues, else the clue cell. */
  lengths: Int32Array;
}

export function newScratch(s: number): SticksScratch {
  return { dsf: new Dsf(s), lengths: new Int32Array(s) };
}

/**
 * Merge adjacent same-orientation line cells into segments; when `lengths`
 * is given, record each segment's clue cell (`-1` none, `-2` duplicate).
 */
export function sticksMakeDsf(
  grid: Uint8Array,
  numbers: Int16Array | null,
  w: number,
  h: number,
  dsf: Dsf,
  lengths: Int32Array | null,
): void {
  const s = w * h;
  if (lengths) lengths.fill(-1);
  dsf.reinit();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x < w - 1 && grid[i] & F_HOR && grid[i + 1] & F_HOR) dsf.merge(i, i + 1);
      if (y < h - 1 && grid[i] & F_VER && grid[i + w] & F_VER) dsf.merge(i, i + w);
    }
  }
  if (lengths && numbers) {
    for (let i = 0; i < s; i++) {
      if (numbers[i] !== -1) {
        const c = dsf.canonify(i);
        lengths[c] = lengths[c] !== -1 ? -2 : i;
      }
    }
  }
}

/**
 * The most cells the horizontal segment through clue cell `idx` could ever
 * span: walk left then right past blanks/horizontals until a wall, a
 * vertical, or territory owned by a different clue. The `x > 1` bound on
 * the adjacent-segment look-behind is upstream's (not `x > 0`) — ported
 * verbatim, since the solver's exact power decides which boards generate.
 *
 * `span`, when given, collects the cells walked (`idx` first) — the hint's
 * `unreachable` evidence, which must be *this* walk's bounds and not an
 * approximation of them, or the narrated count is a lie (§2.3).
 */
function maxSizeHorizontal(
  grid: Uint8Array,
  w: number,
  dsf: Dsf,
  lengths: Int32Array,
  idx: number,
  span?: number[],
): number {
  const y = Math.floor(idx / w);
  let ret = 1;
  span?.push(idx);
  for (let action = -1; action < 2; action += 2) {
    let x = (idx % w) + action;
    while (x >= 0 && x < w) {
      if (grid[y * w + x] & (F_BLOCK | F_VER)) break;
      const c = dsf.canonify(y * w + x);
      if (lengths[c] !== -1 && lengths[c] !== idx) break;
      if (action === -1 && x > 1 && grid[y * w + x - 1] & F_HOR) {
        const other = lengths[dsf.canonify(y * w + x - 1)];
        if (other !== -1 && other !== idx) break;
      }
      if (action === 1 && x < w - 1 && grid[y * w + x + 1] & F_HOR) {
        const other = lengths[dsf.canonify(y * w + x + 1)];
        if (other !== -1 && other !== idx) break;
      }
      ret++;
      span?.push(y * w + x);
      x += action;
    }
  }
  return ret;
}

/** Vertical twin of {@link maxSizeHorizontal} (upstream `y > 1` quirk kept). */
function maxSizeVertical(
  grid: Uint8Array,
  w: number,
  h: number,
  dsf: Dsf,
  lengths: Int32Array,
  idx: number,
  span?: number[],
): number {
  const x = idx % w;
  let ret = 1;
  span?.push(idx);
  for (let action = -1; action < 2; action += 2) {
    let y = Math.floor(idx / w) + action;
    while (y >= 0 && y < h) {
      if (grid[y * w + x] & (F_BLOCK | F_HOR)) break;
      const c = dsf.canonify(y * w + x);
      if (lengths[c] !== -1 && lengths[c] !== idx) break;
      if (action === -1 && y > 1 && grid[(y - 1) * w + x] & F_VER) {
        const other = lengths[dsf.canonify((y - 1) * w + x)];
        if (other !== -1 && other !== idx) break;
      }
      if (action === 1 && y < h - 1 && grid[(y + 1) * w + x] & F_VER) {
        const other = lengths[dsf.canonify((y + 1) * w + x)];
        if (other !== -1 && other !== idx) break;
      }
      ret++;
      span?.push(y * w + x);
      y += action;
    }
  }
  return ret;
}

// --- evidence collection (recording path only) ------------------------------

/** Every line cell merged into segment root `c` — the run a length argument is
 * about. Allocated only when a reason is being recorded. */
function segmentCells(grid: Uint8Array, dsf: Dsf, c: number, s: number): number[] {
  const out: number[] = [];
  for (let j = 0; j < s; j++) {
    if (grid[j] & (F_HOR | F_VER) && dsf.canonify(j) === c) out.push(j);
  }
  return out;
}

/** The clue cells sharing segment root `c` — the two (or more) numbers a
 * `twoClues` contradiction would put on one line. */
function segmentClues(numbers: Int16Array, dsf: Dsf, c: number, s: number): number[] {
  const out: number[] = [];
  for (let j = 0; j < s; j++) {
    if (numbers[j] !== -1 && dsf.canonify(j) === c) out.push(j);
  }
  return out;
}

/**
 * A black clue's four sides, split the way {@link sticksValidate} counts them:
 * `lines` are the neighbours whose line runs into the clue (its `conn`), `open`
 * are the neighbours a line could still reach it from (the complement of
 * `other` — off-board sides and walls are in neither list, having no cell).
 */
function blackSides(
  grid: Uint8Array,
  w: number,
  h: number,
  i: number,
): { lines: number[]; open: number[] } {
  const x = i % w;
  const y = Math.floor(i / w);
  const lines: number[] = [];
  const open: number[] = [];
  // Each side's cell, and the bit that means "a line here runs into the clue".
  const sides: [boolean, number, number][] = [
    [x !== 0, i - 1, F_HOR],
    [x !== w - 1, i + 1, F_HOR],
    [y !== 0, i - w, F_VER],
    [y !== h - 1, i + w, F_VER],
  ];
  for (const [onBoard, j, towards] of sides) {
    if (!onBoard) continue;
    if (grid[j] & towards) lines.push(j);
    else if (!(grid[j] & (F_BLOCK | F_HOR | F_VER))) open.push(j);
  }
  return { lines, open };
}

/**
 * The constraint checker (upstream `sticks_validate`): complete when every
 * cell is filled and no clue is violated; invalid when some clue provably
 * cannot be met. When `errors` is given, the violating clue cells' indices
 * are collected (upstream's `F_ERROR` marking, kept out of the grid here —
 * the renderer reds those clue numbers).
 *
 * When `violations` is given, each failure additionally records **which**
 * clause broke and the cells it reasons over ({@link SticksReason}) — the
 * hint's reason source. Every allocation that costs is behind that check, so
 * the generator's calls (which pass neither out-param) run exactly as before.
 */
export function sticksValidate(
  grid: Uint8Array,
  numbers: Int16Array,
  w: number,
  h: number,
  scratch?: SticksScratch,
  errors?: number[],
  violations?: SticksReason[],
): SticksStatus {
  const { dsf, lengths } = scratch ?? newScratch(w * h);
  let ret: SticksStatus = "complete";
  const s = w * h;

  sticksMakeDsf(grid, numbers, w, h, dsf, lengths);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;

      if (!grid[i]) {
        if (ret === "complete") ret = "unfinished";
        continue;
      }
      if (numbers[i] === -1) continue;

      let error = false;
      if (grid[i] & F_BLOCK) {
        // A black clue: `conn` lines connected, `other` neighbours that can
        // never connect (walls and edges count as unconnectable).
        let conn = 0;
        let other = 0;
        if (x === 0 || grid[i - 1] & (F_VER | F_BLOCK)) other++;
        if (x === w - 1 || grid[i + 1] & (F_VER | F_BLOCK)) other++;
        if (y === 0 || grid[i - w] & (F_HOR | F_BLOCK)) other++;
        if (y === h - 1 || grid[i + w] & (F_HOR | F_BLOCK)) other++;
        if (x !== 0 && grid[i - 1] & F_HOR) conn++;
        if (x !== w - 1 && grid[i + 1] & F_HOR) conn++;
        if (y !== 0 && grid[i - w] & F_VER) conn++;
        if (y !== h - 1 && grid[i + w] & F_VER) conn++;
        // Split for the recorder; `error` is set by exactly the same disjunction.
        if (conn > numbers[i]) {
          error = true;
          if (violations) {
            violations.push({
              kind: "overConnected",
              clue: i,
              value: numbers[i],
              lines: blackSides(grid, w, h, i).lines,
            });
          }
        } else if (other > 4 - numbers[i]) {
          error = true;
          if (violations) {
            const { lines, open } = blackSides(grid, w, h, i);
            violations.push({
              kind: "starved",
              clue: i,
              value: numbers[i],
              open: [...lines, ...open],
            });
          }
        }
      } else {
        const c = dsf.canonify(i);
        if (lengths[c] < 0) {
          // -2: two clues on one segment ("a line can't overlap more than
          // one number"). A clued cell's own segment always has a clue, so
          // -1 is unreachable here.
          error = true;
          if (violations) {
            violations.push({
              kind: "twoClues",
              clues: segmentClues(numbers, dsf, c, s),
              segment: segmentCells(grid, dsf, c, s),
            });
          }
        } else {
          const size = dsf.size(c);
          // `i` is clued and in segment `c`, so `lengths[c] === i` here.
          const target = numbers[lengths[c]];
          if (size > target) {
            error = true;
            if (violations) {
              violations.push({
                kind: "tooLong",
                clue: i,
                value: target,
                size,
                segment: segmentCells(grid, dsf, c, s),
              });
            }
          } else if (size < target && grid[i] & F_HOR) {
            const span = violations ? [] : undefined;
            if (maxSizeHorizontal(grid, w, dsf, lengths, i, span) < target) {
              error = true;
              if (span) {
                violations?.push({
                  kind: "unreachable",
                  clue: i,
                  value: target,
                  max: span.length,
                  span,
                });
              }
            }
          } else if (size < target && grid[i] & F_VER) {
            const span = violations ? [] : undefined;
            if (maxSizeVertical(grid, w, h, dsf, lengths, i, span) < target) {
              error = true;
              if (span) {
                violations?.push({
                  kind: "unreachable",
                  clue: i,
                  value: target,
                  max: span.length,
                  span,
                });
              }
            }
          }
        }
      }

      if (error) {
        errors?.push(i);
        ret = "invalid";
      }
    }
  }
  return ret;
}

/**
 * One deduction (upstream `sticks_try`): find the first blank cell where one
 * orientation is provably invalid, commit the other, and report progress.
 */
export function sticksTry(
  grid: Uint8Array,
  numbers: Int16Array,
  w: number,
  h: number,
  scratch: SticksScratch,
): boolean {
  const s = w * h;
  for (let i = 0; i < s; i++) {
    if (grid[i]) continue;

    grid[i] = F_HOR;
    if (sticksValidate(grid, numbers, w, h, scratch) === "invalid") {
      grid[i] = F_VER;
      return true;
    }
    grid[i] = F_VER;
    if (sticksValidate(grid, numbers, w, h, scratch) === "invalid") {
      grid[i] = F_HOR;
      return true;
    }
    grid[i] = 0;
  }
  return false;
}

/**
 * Clear every white cell, then iterate {@link sticksTry} to a fixpoint
 * (upstream `sticks_solve_game`). Mutates `grid`; returns the final verdict —
 * `"complete"` exactly when the deduction alone solves the board.
 */
export function sticksSolveGame(
  grid: Uint8Array,
  numbers: Int16Array,
  w: number,
  h: number,
): SticksStatus {
  const s = w * h;
  const scratch = newScratch(s);
  for (let i = 0; i < s; i++) {
    if (!(grid[i] & F_BLOCK)) grid[i] = 0;
  }
  let ret = sticksValidate(grid, numbers, w, h, scratch);
  while (ret === "unfinished") {
    if (!sticksTry(grid, numbers, w, h, scratch)) break;
    ret = sticksValidate(grid, numbers, w, h, scratch);
  }
  return ret;
}

// --- hint deduction (a recording twin of the same one technique) ------------

/** One forced cell with the contradiction that forces it. */
export interface SticksFiring {
  index: number;
  to: Exclude<SticksLine, "none">;
  reason: SticksReason;
}

/**
 * Which contradiction to narrate when a trial breaks more than one clue.
 *
 * Most-immediately-checkable first: a black clue's lines and a run's length are
 * things the player can count off the board in a glance, while the two "not yet
 * wrong, but can no longer come right" arguments (`starved`, `unreachable`)
 * take a moment's thought. Fixed, so the plan is recompute-stable.
 */
const REASON_PRIORITY: SticksReason["kind"][] = [
  "overConnected",
  "tooLong",
  "twoClues",
  "starved",
  "unreachable",
];

/** Re-run the (already rejected) trial board collecting reasons, and pick the
 * clearest. Called once per firing, not once per trial, so the scan above stays
 * allocation-free. */
function classifyTrial(
  grid: Uint8Array,
  numbers: Int16Array,
  w: number,
  h: number,
  scratch: SticksScratch,
): SticksReason {
  const violations: SticksReason[] = [];
  sticksValidate(grid, numbers, w, h, scratch, undefined, violations);
  for (const kind of REASON_PRIORITY) {
    const hit = violations.find((v) => v.kind === kind);
    if (hit) return hit;
  }
  // Unreachable: the caller only classifies a board `sticksValidate` has
  // already called invalid, and every one of its `error = true` branches
  // records a reason (docs/games/hints.md § "Read the reason off the validator" — the classifier is total because
  // it lives inside the oracle).
  throw new Error("sticks hint: invalid board produced no reason");
}

/**
 * The recording twin of {@link sticksTry} for one cell: which orientation is
 * provably invalid there, and why. Restores the cell before returning.
 */
function forcedAt(
  grid: Uint8Array,
  numbers: Int16Array,
  w: number,
  h: number,
  scratch: SticksScratch,
  i: number,
): SticksFiring | null {
  grid[i] = F_HOR;
  if (sticksValidate(grid, numbers, w, h, scratch) === "invalid") {
    const reason = classifyTrial(grid, numbers, w, h, scratch);
    grid[i] = 0;
    return { index: i, to: "ver", reason };
  }
  grid[i] = F_VER;
  if (sticksValidate(grid, numbers, w, h, scratch) === "invalid") {
    const reason = classifyTrial(grid, numbers, w, h, scratch);
    grid[i] = 0;
    return { index: i, to: "hor", reason };
  }
  grid[i] = 0;
  return null;
}

/** Identity of an *argument*: the rule that fired and the clue it fired on.
 * Two cells sharing one are forced by the same insight, not merely by the same
 * rule — which is what quality-bar rule 2 groups on. */
function reasonKey(r: SticksReason): string {
  return r.kind === "twoClues"
    ? `twoClues:${[...r.clues].sort((a, b) => a - b).join(",")}`
    : `${r.kind}:${r.clue}`;
}

/**
 * The next deduction *firing* — every cell the same clue-and-rule forces on
 * **this** board, in cell order, or `null` when the deduction is exhausted.
 *
 * Deliberately a **parallel** function rather than a recorder threaded through
 * `sticksTry` (docs/games/hints.md § "Read the reason off the validator"): the generator's deduction is then
 * untouched by construction, so the frozen differential cannot drift. It runs
 * from whatever board it is handed — unlike {@link sticksSolveGame}, which
 * wipes every white cell first and so can never be a hint's engine — and
 * rescans every blank cell on every call, which is why a mid-game board needs
 * no cascade priming (§7.1).
 *
 * Where `sticksTry` returns at its first success, this keeps scanning: a black
 * clue that has run out of lines to give rules out *all* its open neighbours at
 * once, and telling the player that four times over is four hints for one
 * insight. Measured over 20 boards at the 7×7 preset, 21% of firings decide
 * more than one cell (mean 1.2, max 5), and the black-clue rules cluster hardest
 * (mean 1.5). Every cell in the returned group is forced on the board *as
 * handed in*, so the group is simultaneous, not a chain — a chain would stay
 * separate steps (§3).
 */
export function nextSticksFiring(
  grid: Uint8Array,
  numbers: Int16Array,
  w: number,
  h: number,
  scratch: SticksScratch,
): SticksFiring[] | null {
  const s = w * h;
  let group: SticksFiring[] | null = null;
  let key = "";
  for (let i = 0; i < s; i++) {
    if (grid[i]) continue;
    const firing = forcedAt(grid, numbers, w, h, scratch, i);
    if (!firing) continue;
    if (!group) {
      group = [firing];
      key = reasonKey(firing.reason);
    } else if (reasonKey(firing.reason) === key) {
      group.push(firing);
    }
  }
  return group;
}

/** Runaway/UX cap on plan length — the player rarely follows more than a few
 * steps before diverging, and a recompute yields the next batch. */
export const HINT_PLAN_MAX = 40;

/**
 * The ordered plan from the player's own board: one entry per deduction
 * firing, each holding the cells that firing decides. Deterministic (cell-order
 * scan, fixed reason priority), so it is recompute-stable. The caller
 * guarantees the board agrees with the unique solution, so every move is
 * correct.
 */
export function deduceSticksPlan(state: SticksState): SticksFiring[][] {
  const { w, h, numbers } = state;
  const scratch = newScratch(w * h);
  return deduceHintPlan<Uint8Array, SticksFiring[], SticksStatus>({
    board: state.grid.slice(),
    status: (grid) => sticksValidate(grid, numbers, w, h, scratch),
    incomplete: "unfinished",
    next: (grid) => nextSticksFiring(grid, numbers, w, h, scratch),
    apply: (grid, group) => {
      for (const f of group) grid[f.index] = f.to === "hor" ? F_HOR : F_VER;
    },
    planCap: HINT_PLAN_MAX,
    budget: stepBudget("sticks hint"),
  }).plan;
}

// --- play-facing wrappers over immutable state ------------------------------

/** The current verdict on a play state (no marking, no mutation). */
export function sticksStatus(state: SticksState): SticksStatus {
  return sticksValidate(state.grid, state.numbers, state.w, state.h);
}

/** Clue cells currently violating a constraint — the live red-number
 * highlight (upstream's `F_ERROR` bit, recomputed pure per frame). */
export function findLiveErrors(state: SticksState): number[] {
  const errors: number[] = [];
  sticksValidate(state.grid, state.numbers, state.w, state.h, undefined, errors);
  return errors;
}

/**
 * Re-solve from the fixed clues and flag every white cell whose placed line
 * contradicts the unique solution (docs/games/solver-and-generator.md § "The solvable-game contract"). A *missing* line is
 * merely incomplete, never a mistake. Returns `[]` when the clues do not
 * deduce a complete board (defensive — generated boards always do).
 */
export function findMistakes(state: SticksState): SticksMistake[] {
  const { w, h, numbers } = state;
  const solved = state.grid.slice();
  if (sticksSolveGame(solved, numbers, w, h) !== "complete") return [];
  const mistakes: SticksMistake[] = [];
  for (let i = 0; i < w * h; i++) {
    const placed = state.grid[i] & (F_HOR | F_VER);
    if (!placed || state.grid[i] & F_BLOCK) continue;
    if (placed !== (solved[i] & (F_HOR | F_VER))) mistakes.push({ index: i });
  }
  return mistakes;
}
