/**
 * Unequal — native TS port of `unequal.c`. Fill an `order × order` grid so every
 * row and column holds each number `1..order` once, subject to clues between
 * adjacent cells: greater-than signs (Unequal mode) or differ-by-1 bars
 * (Adjacent mode). Left-click selects a cell for an entry and right-click for
 * pencil marks; on the keyboard, select toggles pencil mode; a digit enters (or
 * pencil-toggles) that number; clicking a clue sign in the gap between two cells
 * grays it out ("spent"). Rule violations highlight live; Check & Save
 * additionally flags cells that contradict the unique solution.
 */

import { assertNever } from "../../engine/assert-never.ts";
import {
  adaptiveMarkAllMove,
  candidateHint,
  emitObviousCleanStep,
  firstUnreflectedPlaceIndex,
  keepCandidateHintTrack,
  lazyPopulate,
  nakedSingle,
  nextPlace,
  refreshCandidateHintStep,
  regionDuplicateMarks,
} from "../../engine/candidate-hint.ts";
import type { DifficultyContract } from "../../engine/difficulty.ts";
import { winFlash } from "../../engine/flash.ts";
import {
  type Game,
  type HintResult,
  type HintStep,
  type HintTrackVerdict,
  type PresetMenu,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { narrateLatinReason } from "../../engine/hint-text.ts";
import { clearKey } from "../../engine/key-labels.ts";
import { latinVerdict } from "../../engine/latin.ts";
import {
  forcingChainArea,
  hiddenSingleLine,
  rowColRegions,
  singlePlacementReason,
} from "../../engine/latin-hint.ts";
import {
  noOpEntryResult,
  pressNoteTakingCell,
  releaseHighlightAfterEntry,
} from "../../engine/note-taking-cell.ts";
import type { OrderedCell } from "../../engine/overlay-sidecar.ts";
import { parseConfigInt } from "../../engine/params.ts";
import {
  autoPencilPref,
  pencilKeepHighlightPref,
  stickyPencilPref,
} from "../../engine/pencil-prefs.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_UP,
  isCursorMove,
  LEFT_BUTTON,
  MOD_CTRL,
  MOD_SHFT,
  moveCursor,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import type { ConfigValues, KeyLabel, Point } from "../../engine/types.ts";
import { newUnequalDesc } from "./generator.ts";
import { say, unequalVocab } from "./hint-text.ts";
import {
  colors,
  computeSize,
  coord,
  FLASH_TIME,
  fromCoord,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
  type UnequalDrawState,
  type UnequalHint,
} from "./render.ts";
import {
  DIFF_AMBIGUOUS,
  DIFF_IMPOSSIBLE,
  type HintOp,
  type HintReason,
  recordUnequalDeductions,
  solveUnequal,
} from "./solver.ts";
import {
  ADJTHAN,
  adjToSpent,
  c2n,
  checkComplete,
  cloneState,
  DIFF_EXTREME,
  DIFF_NAMES,
  DIFF_RECURSIVE,
  decodeParams,
  defaultParams,
  diffFromLevel,
  diffName,
  diffToLevel,
  encodeParams,
  F_ADJ_DOWN,
  F_ADJ_LEFT,
  F_ADJ_RIGHT,
  F_ADJ_UP,
  F_SPENT_DOWN,
  F_SPENT_LEFT,
  F_SPENT_RIGHT,
  F_SPENT_UP,
  newState,
  newUi,
  PRESETS,
  status,
  textFormat,
  type UnequalMove,
  type UnequalParams,
  type UnequalState,
  type UnequalUi,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A player marking that contradicts the unique solution:
 * - `"cell"` — a filled-in number that is wrong;
 * - `"note"` — an empty cell whose non-empty pencil notes have crossed out the
 *   cell's solution value. */
export interface UnequalMistake {
  kind: "cell" | "note";
  x: number;
  y: number;
}

function presets(): PresetMenu<UnequalParams> {
  return {
    title: "Unequal",
    submenu: PRESETS.map((p) => ({
      title: `${p.mode === "adjacent" ? "Adjacent" : "Unequal"}: ${p.order}x${p.order} ${diffName(p.diff)}`,
      params: p,
    })),
  };
}

function interpretMove(
  state: UnequalState,
  ui: UnequalUi,
  ds: UnequalDrawState,
  p: Point,
  rawButton: number,
): UnequalMove | null | UiUpdate {
  const o = state.order;
  const ts = ds.tilesize;
  const shiftOrCtrl = (rawButton & (MOD_SHFT | MOD_CTRL)) !== 0;
  const button = stripModifiers(rawButton);

  const tx = fromCoord(p.x, ts);
  const ty = fromCoord(p.y, ts);
  const inGrid = tx >= 0 && tx < o && ty >= 0 && ty < o;

  if (inGrid && (button === LEFT_BUTTON || button === RIGHT_BUTTON)) {
    // A click in the gap below/right of a cell toggles that clue's spent flag.
    const gapBelow = p.y - coord(ty, ts) > ts;
    const gapRight = p.x - coord(tx, ts) > ts;
    if (gapBelow && gapRight) return null;
    if (gapBelow) {
      if (state.clueFlags[ty * o + tx] & F_ADJ_DOWN)
        return { type: "spent", x: tx, y: ty, flag: F_SPENT_DOWN };
      if (ty + 1 < o && state.clueFlags[(ty + 1) * o + tx] & F_ADJ_UP)
        return { type: "spent", x: tx, y: ty + 1, flag: F_SPENT_UP };
      return null;
    }
    if (gapRight) {
      if (state.clueFlags[ty * o + tx] & F_ADJ_RIGHT)
        return { type: "spent", x: tx, y: ty, flag: F_SPENT_RIGHT };
      if (tx + 1 < o && state.clueFlags[ty * o + tx + 1] & F_ADJ_LEFT)
        return { type: "spent", x: tx + 1, y: ty, flag: F_SPENT_LEFT };
      return null;
    }

    pressNoteTakingCell(ui, button, tx, ty, {
      canEnter: !state.immutable[ty * o + tx],
      canMark: state.grid[ty * o + tx] === 0,
    });
    return UI_UPDATE;
  }

  if (isCursorMove(button)) {
    if (shiftOrCtrl) {
      // Toggle the spent state of the clue between the cursor cell and the cell
      // the arrow points to.
      let nx = ui.cursor.x;
      let ny = ui.cursor.y;
      if (button === CURSOR_LEFT) nx = Math.max(nx - 1, 0);
      else if (button === CURSOR_RIGHT) nx = Math.min(nx + 1, o - 1);
      else if (button === CURSOR_UP) ny = Math.max(ny - 1, 0);
      else if (button === CURSOR_DOWN) ny = Math.min(ny + 1, o - 1);
      ui.cursor.visible = true;
      ui.cursorFromKeyboard = true;

      let i = 0;
      for (; i < 4; i++) {
        if (nx === ui.cursor.x + ADJTHAN[i].dx && ny === ui.cursor.y + ADJTHAN[i].dy)
          break;
      }
      if (i === 4) return UI_UPDATE; // not a single step in a clue direction

      const here = state.clueFlags[ui.cursor.y * o + ui.cursor.x];
      const there = state.clueFlags[ny * o + nx];
      if (!(here & ADJTHAN[i].f || there & ADJTHAN[i].fo)) return UI_UPDATE; // no clue

      // A sign's spent flag sits on its greater end; a bar's, which both ends
      // flag, on the cell above or left of it.
      const self =
        state.mode === "adjacent"
          ? ADJTHAN[i].dx >= 0 && ADJTHAN[i].dy >= 0
          : (here & ADJTHAN[i].f) !== 0;
      return self
        ? {
            type: "spent",
            x: ui.cursor.x,
            y: ui.cursor.y,
            flag: adjToSpent(ADJTHAN[i].f),
          }
        : { type: "spent", x: nx, y: ny, flag: adjToSpent(ADJTHAN[i].fo) };
    }
    ui.cursorFromKeyboard = true;
    return moveCursor(ui.cursor, button, o, o) ? UI_UPDATE : null;
  }

  if (ui.cursor.visible && button === CURSOR_SELECT) {
    ui.pencilMode = !ui.pencilMode;
    ui.cursorFromKeyboard = true;
    return UI_UPDATE;
  }

  // 'M' / 'm': fill all pencil marks, then (on a fully-noted board) clean the
  // obvious row/column candidates — the basic-region opening, in one press.
  if (button === 77 || button === 109)
    return adaptiveMarkAllMove<UnequalMove>(state.grid, state.pencil, o, (x, y) =>
      rowColRegions(x, y, o),
    );

  const n = c2n(button, o);
  if (ui.cursor.visible && n >= 0 && n <= o) {
    const i = ui.cursor.y * o + ui.cursor.x;
    if (state.immutable[i]) return null; // can't edit a given
    if (ui.pencilMode && state.grid[i] > 0) return null; // can't pencil a filled cell

    // No-op: setting a cell to what it already holds (and no pencil marks).
    if ((!ui.pencilMode || n === 0) && state.grid[i] === n && state.pencil[i] === 0)
      return noOpEntryResult(ui);

    const pencil = ui.pencilMode && n > 0;
    releaseHighlightAfterEntry(ui);
    return pencil
      ? { type: "set", x: ui.cursor.x, y: ui.cursor.y, n, pencil }
      : {
          type: "set",
          x: ui.cursor.x,
          y: ui.cursor.y,
          n,
          pencil,
          autoElim: ui.autoPencil,
        };
  }

  return null;
}

function executeMove(state: UnequalState, move: UnequalMove): UnequalState {
  const o = state.order;
  const next = cloneState(state);

  switch (move.type) {
    case "set": {
      const i = move.y * o + move.x;
      if (state.immutable[i]) throw new Error("unequal: move into an immutable cell");
      if (move.pencil && move.n > 0) {
        next.pencil[i] ^= 1 << move.n;
      } else {
        next.grid[i] = move.n;
        next.pencil[i] = 0;
        if (move.autoElim && move.n > 0) {
          const bit = ~(1 << move.n);
          for (let k = 0; k < o; k++) {
            if (k !== move.x) next.pencil[move.y * o + k] &= bit;
            if (k !== move.y) next.pencil[k * o + move.x] &= bit;
          }
        }
        if (!next.completed && checkComplete(next) > 0) next.completed = true;
      }
      return next;
    }
    case "spent": {
      next.spent[move.y * o + move.x] ^= move.flag;
      return next;
    }
    case "pencilAll": {
      const all = (1 << (o + 1)) - (1 << 1); // bits 1..o set
      // Additive — fill only note-less empty cells, never reset a narrowed one:
      // `candidate-hint.ts`'s `adaptiveMarkAll` § "The additive rule, stated once".
      for (let i = 0; i < o * o; i++) {
        if (!next.grid[i] && next.pencil[i] === 0) next.pencil[i] = all;
      }
      return next;
    }
    case "pencilStrike": {
      for (const { x, y, n } of move.marks) next.pencil[y * o + x] &= ~(1 << n);
      return next;
    }
    case "solve": {
      for (let i = 0; i < o * o; i++) {
        next.grid[i] = move.grid[i];
        next.pencil[i] = 0;
      }
      next.completed = true;
      next.cheated = true;
      return next;
    }
    default:
      return assertNever(move, "unequal: executeMove");
  }
}

function changedState(
  ui: UnequalUi,
  _old: UnequalState | null,
  newSt: UnequalState,
): void {
  const o = newSt.order;
  if (
    ui.cursor.visible &&
    ui.pencilMode &&
    !ui.cursorFromKeyboard &&
    newSt.grid[ui.cursor.y * o + ui.cursor.x] !== 0
  ) {
    ui.cursor.visible = false;
  }
}

function solve(
  orig: UnequalState,
  _curr: UnequalState,
  aux?: string,
): SolveResult<UnequalMove> {
  const o = orig.order;
  if (aux) {
    const grid: number[] = [];
    for (let i = 0; i < o * o; i++) grid[i] = c2n(aux.charCodeAt(i + 1), o);
    return { ok: true, move: { type: "solve", grid } };
  }
  const soln = Uint8Array.from(orig.immutable);
  const ret = solveUnequal(o, orig.mode, orig.clueFlags, soln, DIFF_RECURSIVE);
  if (ret === DIFF_IMPOSSIBLE)
    return { ok: false, error: "No solution exists for this puzzle" };
  if (ret === DIFF_AMBIGUOUS)
    return { ok: false, error: "Multiple solutions exist for this puzzle" };
  return { ok: true, move: { type: "solve", grid: Array.from(soln) } };
}

function findMistakes(state: UnequalState): readonly UnequalMistake[] {
  const o = state.order;
  // The solution is derived from the placed givens only — never from the notes.
  const soln = Uint8Array.from(state.immutable);
  const ret = solveUnequal(o, state.mode, state.clueFlags, soln, DIFF_RECURSIVE);
  if (ret === DIFF_IMPOSSIBLE || ret === DIFF_AMBIGUOUS) return [];
  const out: UnequalMistake[] = [];
  for (let i = 0; i < o * o; i++) {
    if (state.immutable[i]) continue;
    if (state.grid[i]) {
      if (state.grid[i] !== soln[i])
        out.push({ kind: "cell", x: i % o, y: (i / o) | 0 });
    } else if (state.pencil[i] !== 0 && !(state.pencil[i] & (1 << soln[i]))) {
      out.push({ kind: "note", x: i % o, y: (i / o) | 0 });
    }
  }
  return out;
}

// --- hint ------------------------------------------------------------------

/** Narrate *why* a firing is forced (docs/games/hints.md § "Writing the narration"): indication → reasoning →
 * necessity-voice conclusion. `ns` is the struck value list (a placement passes
 * its single height); `o` is the grid order. Two-mode aware. The words, and how
 * they read at the value extremes, are [`hint-text.ts`](./hint-text.ts)'s. */
function narrate(reason: HintReason, ns: number[], o: number): string {
  switch (reason.kind) {
    case "greater":
      return say.greater(reason.bound, ns, o);
    case "lesser":
      return say.lesser(reason.bound, o, ns);
    case "adjacent":
      return say.adjacent(reason.bar, reason.v, ns, o);
    case "adjacentSet":
      return say.adjacentSet(reason.bar, ns, o);
    // The generic Latin arms (single / hiddenSingle / forcedSingle / dup / set /
    // forcing) read identically to Keen's — narrated once, shared.
    default:
      return narrateLatinReason(reason, ns, unequalVocab(o));
  }
}

/** The deduction's evidence cells to shade `COL_HINT_CELL`: a clue deduction
 * names the acted-on cell *and* the cell across the sign/bar that constrains it,
 * so the player sees the pair; the generic Latin techniques have no clean local
 * area (the struck notes carry the premise). */
function reasonArea(reason: HintReason, target: Point): OrderedCell[] {
  switch (reason.kind) {
    case "greater":
    case "lesser":
    case "adjacent":
    case "adjacentSet":
      return [target, { x: reason.ox, y: reason.oy }];
    // A forcing chain names the cells it ran through, **numbered**, so the
    // narration can cite them and the player can walk it.
    case "forcing":
      return forcingChainArea(reason);
    default:
      return [];
  }
}

/** The next clue-deduction strike whose marks are still live, considering only
 * eliminations valid against the current grid. `dup` strikes are excluded (those
 * are placement bookkeeping). One returned strike groups the marks of a single
 * firing sharing the **same target cell** — so its narration (which names that
 * cell's relationship) matches the marks. A link's two ends (greater in one cell,
 * lesser in the other) come back across two calls and are linked as one journey
 * by the caller's `group` tracking. */
function nextClueStrike(
  ops: HintOp[],
  wGrid: Int8Array,
  wPen: Int32Array,
  o: number,
): {
  marks: { x: number; y: number; n: number }[];
  reason: HintReason;
  group: number;
} | null {
  const lim = firstUnreflectedPlaceIndex(ops, wGrid, o);
  const liveAt = (op: HintOp) =>
    op.kind === "elim" &&
    wGrid[op.y * o + op.x] === 0 &&
    (wPen[op.y * o + op.x] & (1 << op.n)) !== 0;
  let i = 0;
  while (i < lim) {
    const g = ops[i].group;
    const group: HintOp[] = [];
    while (i < lim && ops[i].group === g) group.push(ops[i++]);
    const live = group.filter((op) => liveAt(op) && op.reason.kind !== "dup");
    if (live.length === 0) continue;
    const first = live[0];
    const same = live.filter((op) => op.x === first.x && op.y === first.y);
    return {
      marks: same.map((op) => ({ x: op.x, y: op.y, n: op.n })),
      reason: first.reason,
      group: g,
    };
  }
  return null;
}

/** Emit a placement step and apply it to the working board, striking the placed
 * value from the rest of its row and column. With auto-pencil on (`autoClean`)
 * that cleanup is silent (the move's own `autoElim` does it on the real board);
 * with it off it becomes an explicit `pencilStrike` journey continuation. */
function emitPlacement(
  steps: HintStep<UnequalMove, UnequalHint>[],
  wGrid: Int8Array,
  wPen: Int32Array,
  o: number,
  x: number,
  y: number,
  n: number,
  reason: HintReason,
  autoClean: boolean,
): void {
  steps.push({
    move: { type: "set", x, y, n, pencil: false, autoElim: autoClean },
    explanation: narrate(reason, [n], o),
    highlights: {
      area:
        reason.kind === "hiddenSingle"
          ? hiddenSingleLine(reason.line, reason.index, o)
          : [],
      targets: [{ x, y }],
      marks: [],
    },
  });
  wGrid[y * o + x] = n;
  wPen[y * o + x] = 0;

  const dupMarks = regionDuplicateMarks(
    wGrid,
    wPen,
    x,
    y,
    n,
    o,
    rowColRegions(x, y, o),
  );
  for (const m of dupMarks) wPen[m.y * o + m.x] &= ~(1 << n);

  if (!autoClean && dupMarks.length > 0) {
    steps.push({
      move: { type: "pencilStrike", marks: dupMarks },
      explanation: narrate({ kind: "dup", n, px: x, py: y }, [], o),
      highlights: {
        area: [],
        targets: dupMarks.map((m) => ({ x: m.x, y: m.y })),
        marks: dupMarks,
      },
      continuesPrevious: true,
    });
  }
}

/** Build the hint plan by walking a working copy the way a person solves it: a
 * naked single first; else (after a lazy populate) the basic-Latin row/column
 * cull a given/placed value forces; else the next clue elimination; else a forced
 * placement. `autoClean` (the auto-pencil preference) decides whether a
 * placement's trivial row/column eliminations are silent or taught. */
function buildSteps(
  state: UnequalState,
  autoClean: boolean,
): HintStep<UnequalMove, UnequalHint>[] {
  const o = state.order;
  const steps: HintStep<UnequalMove, UnequalHint>[] = [];
  const wGrid = Int8Array.from(state.grid);
  const wPen = Int32Array.from(state.pencil);
  const maxdiff = Math.min(diffToLevel(state.diff), DIFF_EXTREME);
  const record = () =>
    recordUnequalDeductions(
      o,
      state.mode,
      state.clueFlags,
      Uint8Array.from(wGrid),
      maxdiff,
    );

  const pop = lazyPopulate<UnequalMove, UnequalHint>(
    state,
    wGrid,
    wPen,
    o,
    steps,
    say.populate,
  );
  // The obvious-candidate cleanup is emitted once, right after notes first exist
  // (just populated, or already present on a pre-noted board) — see step 3.
  let cleaned = false;

  let ops = record();
  const budget = stepBudget("unequal hint plan");
  const cap = o * o * o * 4 + 4;
  // The firing whose strike the previous step emitted, so a same-firing strike of
  // a *different* cell (a link's other end) continues the journey.
  let lastStrikeGroup = Number.NaN;
  for (let guard = 0; guard < cap; guard++) {
    budget.tick();
    if (!wGrid.includes(0)) break;

    // 1. A naked single — the next move a human makes.
    const ns = nakedSingle(wGrid, wPen, o);
    if (ns) {
      emitPlacement(
        steps,
        wGrid,
        wPen,
        o,
        ns.x,
        ns.y,
        ns.n,
        { kind: "single" },
        autoClean,
      );
      ops = record();
      lastStrikeGroup = Number.NaN;
      continue;
    }

    // 2. Pencil in the notes (once) before any elimination needs them.
    if (!pop.done()) {
      pop.ensure();
      lastStrikeGroup = Number.NaN;
      continue;
    }

    // 3. Once notes exist (just populated, or already present), bulk-clear the
    // obvious candidates in one step — the adaptive Mark-all second press — then
    // the walk goes straight to the real deductions (later placements keep notes
    // clean via `emitPlacement`).
    if (!cleaned) {
      cleaned = true;
      if (
        emitObviousCleanStep(
          steps,
          wGrid,
          wPen,
          o,
          (x, y) => rowColRegions(x, y, o),
          say.cleanObvious,
        )
      ) {
        lastStrikeGroup = Number.NaN;
        continue;
      }
    }

    // 4. The next clue elimination (the deduction worth teaching).
    const cs = nextClueStrike(ops, wGrid, wPen, o);
    if (cs) {
      const values = cs.marks.map((m) => m.n).sort((a, b) => a - b);
      steps.push({
        move: { type: "pencilStrike", marks: cs.marks },
        explanation: narrate(cs.reason, values, o),
        highlights: {
          area: reasonArea(cs.reason, { x: cs.marks[0].x, y: cs.marks[0].y }),
          targets: cs.marks.map((m) => ({ x: m.x, y: m.y })),
          marks: cs.marks,
        },
        continuesPrevious: cs.group === lastStrikeGroup,
      });
      for (const m of cs.marks) wPen[m.y * o + m.x] &= ~(1 << m.n);
      lastStrikeGroup = cs.group;
      continue;
    }

    // 5. A forced placement (a cube collapse the notes lag) — re-derive *why*
    // (naked vs hidden single) from the working board; the recorded `single`
    // reason conflates the two and would mis-narrate a hidden single.
    const pl = nextPlace(ops, wGrid, o);
    if (pl) {
      const reason =
        pl.reason.kind === "single"
          ? singlePlacementReason(wGrid, wPen, pl.x, pl.y, pl.n, o)
          : pl.reason;
      emitPlacement(steps, wGrid, wPen, o, pl.x, pl.y, pl.n, reason, autoClean);
      ops = record();
      lastStrikeGroup = Number.NaN;
      continue;
    }

    break; // stuck (e.g. a Recursive board now needing a guess)
  }

  return steps;
}

function hint(
  state: UnequalState,
  _aux?: string,
  ui?: UnequalUi,
): HintResult<UnequalMove, UnequalHint> {
  return candidateHint(state, ui, findMistakes, buildSteps);
}

/** Classify a player move against the displayed hint step (shared
 * candidate-elimination keep-track; `UnequalHint` is structurally
 * `CandidateHighlights`). */
function hintKeepTrack(
  m: UnequalMove,
  step: HintStep<UnequalMove, UnequalHint>,
  state: UnequalState,
): HintTrackVerdict {
  return keepCandidateHintTrack(m, step, state.pencil, state.order);
}

/** Re-validate a stored hint step against the current board before it is
 * (re-)displayed (shared "never show a stale step" guarantee). */
function refreshHintStep(
  step: HintStep<UnequalMove, UnequalHint>,
  state: UnequalState,
): HintStep<UnequalMove, UnequalHint> | null {
  return refreshCandidateHintStep(step, state.grid, state.pencil, state.order);
}

function flashLength(
  from: UnequalState,
  to: UnequalState,
  _dir: number,
  _ui: UnequalUi,
): number {
  return winFlash(from, to, FLASH_TIME);
}

/**
 * The on-screen keypad, faithful to upstream `game_request_keys`. Unlike the
 * shared `digitKeys`, Unequal switches to a `'0'`-based keypad for order ≥ 10
 * (`'0'..'9'` = 1..10, then `'a','b',…` = 11.., mirroring `c2n`), then the
 * clear key. Orders run 3..32, so the high range is genuinely reachable.
 */
function unequalKeys(order: number): KeyLabel[] {
  const keys: KeyLabel[] = [];
  let off = (order > 9 ? "0" : "1").charCodeAt(0);
  for (let i = 0; i < order; i++) {
    if (i === 10) off = "a".charCodeAt(0) - 10;
    const button = i + off;
    keys.push({ button, label: String.fromCharCode(button) });
  }
  keys.push(clearKey);
  return keys;
}

/** Unequal's difficulty contract (`engine/difficulty.ts`). `solveUnequal`
 * follows the shared latin-family return convention — the difficulty reached, or
 * one of `latin.ts`'s sentinels — so `latinVerdict` reads it. Seeded from the
 * immutable givens; `mode` and the clue flags come from the desc. */
const difficulty: DifficultyContract<UnequalParams> = {
  tierOf: (p) => diffToLevel(p.diff),
  withTier: (p, tier) => ({ ...p, diff: diffFromLevel(tier) }),
  solveAtCap: (p, desc, cap) => {
    const s = newState(p, desc);
    return latinVerdict(
      solveUnequal(s.order, s.mode, s.clueFlags, Uint8Array.from(s.immutable), cap),
    );
  },
};

export const unequalGame: Game<
  UnequalParams,
  UnequalState,
  UnequalMove,
  UnequalUi,
  UnequalDrawState,
  UnequalMistake
> = {
  id: "unequal",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  canMarkAll: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig: [
    {
      kw: "mode",
      name: "Mode",
      type: "choices",
      choices: ["Unequal", "Adjacent"],
      get: (p) => (p.mode === "adjacent" ? 1 : 0),
      set: (p, v) => {
        p.mode = v === 1 ? "adjacent" : "unequal";
      },
    },
    {
      kw: "size",
      name: "Size",
      type: "string",
      get: (p) => String(p.order),
      set: (p, v) => {
        p.order = parseConfigInt(v);
      },
    },
    {
      kw: "difficulty",
      name: "Difficulty",
      type: "choices",
      // The one list, not a second spelling of it — a hand-copied tier list is
      // how a rename ships a menu and a dialog that disagree.
      choices: [...DIFF_NAMES],
      get: (p) => diffToLevel(p.diff),
      set: (p, v) => {
        p.diff = diffFromLevel(v);
      },
    },
  ],
  // Keys match the `unequal` config template in `puzzle/augmentation.ts`.
  describeParams: (p): ConfigValues => ({
    mode: p.mode === "adjacent" ? 1 : 0,
    size: String(p.order),
    difficulty: diffToLevel(p.diff),
  }),

  newDesc: newUnequalDesc,
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status,

  solve,
  difficulty,
  hint,
  hintKeepTrack,
  refreshHintStep,
  findMistakes,
  requestKeys: (p): KeyLabel[] => unequalKeys(p.order),
  textFormat,

  prefs: [
    autoPencilPref<UnequalUi>(
      "When you place a number, remove it from pencil marks in its row and column",
    ),
    stickyPencilPref<UnequalUi>(),
    pencilKeepHighlightPref<UnequalUi>(),
  ],

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(unequalGame);
