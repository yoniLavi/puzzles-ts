/**
 * Keen (KenKen / Inshi No Heya) — native TS port of `keen.c`. Fill a `w × w`
 * grid with digits `1..w` so every row and column holds each digit once, and so
 * each arithmetic cage's digits satisfy its clue (target value + operation).
 * Left-click / cursor select highlights a cell for a real entry; right-click /
 * select2 highlights it for a pencil mark (or toggles sticky pencil mode); a
 * digit enters (or pencil-toggles) that value; backspace/space clears. Rule
 * violations highlight live; Check & Save additionally flags cells that
 * contradict the unique solution.
 */

import type {
  Colour,
  ConfigValues,
  GameStatus,
  KeyLabel,
  Point,
  Size,
} from "../../../puzzle/types.ts";
import {
  adaptiveMarkAllMove,
  candidateHint,
  cleanObviousText,
  emitObviousCleanStep,
  joinNums,
  keepCandidateHintTrack,
  lazyPopulate,
  nakedSingle,
  nextPlace,
  nextStrike,
  populateText,
  refreshCandidateHintStep,
  regionDuplicateMarks,
} from "../../engine/candidate-hint.ts";
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
import { digitKeys } from "../../engine/key-labels.ts";
import {
  hiddenSingleLine,
  narrateLatinReason,
  rowColRegions,
  singlePlacementReason,
} from "../../engine/latin-hint.ts";
import { parseConfigInt } from "../../engine/params.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  isCursorMove,
  LEFT_BUTTON,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import type { RandomState } from "../../random/index.ts";
import { newKeenDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  FLASH_TIME,
  fromCoord,
  type KeenDrawState,
  type KeenHint,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import {
  DIFF_AMBIGUOUS,
  DIFF_IMPOSSIBLE,
  type HintOp,
  type HintReason,
  recordKeenDeductions,
  solveKeen,
} from "./solver.ts";
import {
  C_ADD,
  C_DIV,
  C_MUL,
  C_SUB,
  checkErrors,
  cloneState,
  DIFF_EXTREME,
  DIFF_UNREASONABLE,
  decodeParams,
  defaultParams,
  diffFromLevel,
  diffName,
  diffToLevel,
  encodeParams,
  type KeenMove,
  type KeenParams,
  type KeenState,
  type KeenUi,
  newState,
  newUi,
  status,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A player marking that contradicts the unique solution:
 * - `"cell"` — a filled-in digit that is wrong;
 * - `"note"` — an empty cell whose non-empty pencil notes have crossed out the
 *   cell's solution digit. */
export interface KeenMistake {
  kind: "cell" | "note";
  x: number;
  y: number;
}

const PRESETS: KeenParams[] = [
  { w: 4, diff: "easy", multiplicationOnly: false },
  { w: 5, diff: "easy", multiplicationOnly: false },
  { w: 5, diff: "easy", multiplicationOnly: true },
  { w: 6, diff: "easy", multiplicationOnly: false },
  { w: 6, diff: "normal", multiplicationOnly: false },
  { w: 6, diff: "normal", multiplicationOnly: true },
  { w: 6, diff: "hard", multiplicationOnly: false },
  { w: 6, diff: "extreme", multiplicationOnly: false },
  { w: 6, diff: "unreasonable", multiplicationOnly: false },
  { w: 9, diff: "normal", multiplicationOnly: false },
];

function presetTitle(p: KeenParams): string {
  return `${p.w}x${p.w} ${diffName(p.diff)}${p.multiplicationOnly ? ", multiplication only" : ""}`;
}

function presets(): PresetMenu<KeenParams> {
  return {
    title: "Keen",
    submenu: PRESETS.map((p) => ({ title: presetTitle(p), params: p })),
  };
}

function inGrid(w: number, x: number, y: number): boolean {
  return x >= 0 && x < w && y >= 0 && y < w;
}

/** Move the keyboard cursor (clamped); reveal it on first press. Mirrors
 * `move_cursor`: the position moves even on the reveal press. */
function moveCursor(button: number, ui: KeenUi, w: number): UiUpdate | null {
  const ox = ui.hx;
  const oy = ui.hy;
  if (button === CURSOR_UP) ui.hy = Math.max(ui.hy - 1, 0);
  else if (button === CURSOR_DOWN) ui.hy = Math.min(ui.hy + 1, w - 1);
  else if (button === CURSOR_LEFT) ui.hx = Math.max(ui.hx - 1, 0);
  else if (button === CURSOR_RIGHT) ui.hx = Math.min(ui.hx + 1, w - 1);
  if (!ui.hshow) {
    ui.hshow = true;
    return UI_UPDATE;
  }
  return ui.hx !== ox || ui.hy !== oy ? UI_UPDATE : null;
}

function interpretMove(
  state: KeenState,
  ui: KeenUi,
  ds: KeenDrawState | null,
  p: Point,
  rawButton: number,
): KeenMove | null | UiUpdate {
  const w = state.params.w;
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const button = stripModifiers(rawButton);

  const tx = fromCoord(p.x, ts);
  const ty = fromCoord(p.y, ts);

  if (inGrid(w, tx, ty)) {
    if (button === LEFT_BUTTON) {
      // Sticky pencil mode: a left-click keeps the current pencil/real mode (it
      // only moves the highlight); non-sticky (upstream) reverts to real entry.
      if (
        tx === ui.hx &&
        ty === ui.hy &&
        ui.hshow &&
        (ui.pencilSticky || !ui.hpencil)
      ) {
        ui.hshow = false;
      } else {
        ui.hx = tx;
        ui.hy = ty;
        ui.hshow = true; // Keen has no immutable givens
        if (!ui.pencilSticky) ui.hpencil = false;
      }
      ui.hcursor = false;
      return UI_UPDATE;
    }
    if (button === RIGHT_BUTTON) {
      if (ui.pencilSticky) {
        // Toggle the persistent pencil mode (CapsLock-style). Only move the
        // highlight onto an empty cell — a filled cell can't take a pencil mark.
        ui.hpencil = !ui.hpencil;
        if (state.grid[ty * w + tx] === 0) {
          ui.hx = tx;
          ui.hy = ty;
          ui.hshow = true;
        }
      } else if (state.grid[ty * w + tx] === 0) {
        if (tx === ui.hx && ty === ui.hy && ui.hshow && ui.hpencil) {
          ui.hshow = false;
        } else {
          ui.hpencil = true;
          ui.hx = tx;
          ui.hy = ty;
          ui.hshow = true;
        }
      } else {
        ui.hshow = false;
      }
      ui.hcursor = false;
      return UI_UPDATE;
    }
  }

  if (isCursorMove(button)) {
    ui.hcursor = true;
    return moveCursor(button, ui, w);
  }

  if (ui.hshow && button === CURSOR_SELECT) {
    ui.hpencil = !ui.hpencil;
    ui.hcursor = true;
    return UI_UPDATE;
  }

  const isNum = button >= 48 && button <= 57 && button - 48 <= w;
  const isClear = button === CURSOR_SELECT2 || button === 8 || button === 127;
  if (ui.hshow && (isNum || isClear)) {
    const n = isClear ? 0 : button - 48;
    const i = ui.hy * w + ui.hx;

    // Can't pencil-mark a filled square (reachable only via the cursor).
    if (ui.hpencil && state.grid[i]) return null;

    // No-op: setting a square to what it already holds (and no pencil marks).
    if ((!ui.hpencil || n === 0) && state.grid[i] === n && state.pencil[i] === 0) {
      if (!ui.hcursor) {
        ui.hshow = false;
        return UI_UPDATE;
      }
      return null;
    }

    const pencil = ui.hpencil && n > 0;
    if (!ui.hcursor && !(ui.hpencil && ui.pencilKeepHighlight)) ui.hshow = false;
    return pencil
      ? { type: "set", x: ui.hx, y: ui.hy, n, pencil }
      : { type: "set", x: ui.hx, y: ui.hy, n, pencil, autoElim: ui.autoPencil };
  }

  // 'M' / 'm': fill all pencil marks, then (on a fully-noted board) clean the
  // obvious row/column candidates. Keen cages are arithmetic, NOT uniqueness
  // regions, so a legal cage duplicate is never struck (design D3).
  if (button === 77 || button === 109)
    return adaptiveMarkAllMove<KeenMove>(state.grid, state.pencil, w, (x, y) =>
      rowColRegions(x, y, w),
    );

  return null;
}

function executeMove(state: KeenState, move: KeenMove): KeenState {
  const w = state.params.w;
  const next = cloneState(state);

  switch (move.type) {
    case "set": {
      const i = move.y * w + move.x;
      if (move.pencil && move.n > 0) {
        next.pencil[i] ^= 1 << move.n;
      } else {
        next.grid[i] = move.n;
        next.pencil[i] = 0;
        if (move.autoElim && move.n > 0) {
          const bit = ~(1 << move.n);
          for (let k = 0; k < w; k++) {
            if (k !== move.x) next.pencil[move.y * w + k] &= bit;
            if (k !== move.y) next.pencil[k * w + move.x] &= bit;
          }
        }
        if (!next.completed && !checkErrors(next)) next.completed = true;
      }
      return next;
    }
    case "pencilAll": {
      const all = (1 << (w + 1)) - (1 << 1);
      for (let i = 0; i < w * w; i++) if (!next.grid[i]) next.pencil[i] = all;
      return next;
    }
    case "pencilStrike": {
      for (const { x, y, n } of move.marks) next.pencil[y * w + x] &= ~(1 << n);
      return next;
    }
    case "solve": {
      for (let i = 0; i < w * w; i++) {
        next.grid[i] = move.grid[i];
        next.pencil[i] = 0;
      }
      next.completed = true;
      next.cheated = true;
      return next;
    }
  }
}

function changedState(ui: KeenUi, _old: KeenState | null, newSt: KeenState): void {
  const w = newSt.params.w;
  if (ui.hshow && ui.hpencil && !ui.hcursor && newSt.grid[ui.hy * w + ui.hx] !== 0) {
    ui.hshow = false;
  }
}

function solve(orig: KeenState, _curr: KeenState, aux?: string): SolveResult<KeenMove> {
  const w = orig.params.w;
  if (aux) {
    const grid: number[] = [];
    for (let i = 0; i < w * w; i++) grid[i] = aux.charCodeAt(i + 1) - 48;
    return { ok: true, move: { type: "solve", grid } };
  }
  const soln = new Uint8Array(w * w);
  const ret = solveKeen(w, orig.clues, soln, DIFF_UNREASONABLE);
  if (ret === DIFF_IMPOSSIBLE)
    return { ok: false, error: "No solution exists for this puzzle" };
  if (ret === DIFF_AMBIGUOUS)
    return { ok: false, error: "Multiple solutions exist for this puzzle" };
  return { ok: true, move: { type: "solve", grid: Array.from(soln, (v) => v) } };
}

function findMistakes(state: KeenState): readonly KeenMistake[] {
  const w = state.params.w;
  // The solution is derived from the cage clue structure only (Keen has no
  // givens) — never from the player's notes (a note can be wrong; that is what
  // we are checking).
  const soln = new Uint8Array(w * w);
  const ret = solveKeen(w, state.clues, soln, DIFF_UNREASONABLE);
  if (ret === DIFF_IMPOSSIBLE || ret === DIFF_AMBIGUOUS) return [];
  const out: KeenMistake[] = [];
  for (let i = 0; i < w * w; i++) {
    if (state.grid[i]) {
      if (state.grid[i] !== soln[i])
        out.push({ kind: "cell", x: i % w, y: (i / w) | 0 });
    } else if (state.pencil[i] !== 0 && !(state.pencil[i] & (1 << soln[i]))) {
      out.push({ kind: "note", x: i % w, y: (i / w) | 0 });
    }
  }
  return out;
}

// --- hint ------------------------------------------------------------------

const POPULATE_TEXT = populateText("number");

const CLEAN_OBVIOUS_TEXT = cleanObviousText("number", "standing", "row or column");

/** The cage's arithmetic goal as a verb phrase, read off its packed clue — the
 * indication a cage deduction leads with (hint-authoring §2.2). Reads across the
 * whole operation set: `sum to 15`, `multiply to 72`, `differ by 3`,
 * `have a ratio of 2`. */
function cageGoal(op: number, value: number): string {
  switch (op) {
    case C_ADD:
      return `sum to ${value}`;
    case C_MUL:
      return `multiply to ${value}`;
    case C_SUB:
      return `differ by ${value}`;
    case C_DIV:
      return `have a ratio of ${value}`;
    default:
      return `total ${value}`;
  }
}

/** Narrate *why* a firing is forced (hint-authoring §2): indication → reasoning →
 * necessity-voice conclusion. `ns` is the struck value list (a placement passes
 * its single digit); `w` is the grid order. Cage deductions name the cage by its
 * clue; the generic Latin techniques carry no clean local area (the struck notes
 * carry the premise). */
function narrate(reason: HintReason, ns: number[], _w: number): string {
  switch (reason.kind) {
    case "cage":
      return `No way to make this cage ${cageGoal(reason.op, reason.value)} leaves room for ${joinNums(ns)} in this cell, so we must cross out ${joinNums(ns)}.`;
    case "cageLine":
      return `This cage must ${cageGoal(reason.op, reason.value)}, and every way to fill it places a ${ns[0]} in this ${reason.horizontal ? "row" : "column"} — so the ${ns[0]} here must be crossed out.`;
    // The generic Latin arms (single / hiddenSingle / forcedSingle / dup / set /
    // forcing) read identically to Unequal's — narrated once, shared.
    default:
      return narrateLatinReason(reason, ns);
  }
}

/** The deduction's evidence cells to shade `COL_HINT_CELL`: a cage deduction
 * names the whole cage (the player sees the block the arithmetic reasons over);
 * the generic Latin techniques have no clean local area. */
function reasonArea(reason: HintReason): { x: number; y: number }[] {
  return reason.kind === "cage" || reason.kind === "cageLine" ? reason.cells : [];
}

/** A placement's evidence cells: a hidden single shades the whole row/column it
 * reasons over (so the player sees that no *other* cell in the line can take the
 * digit); a naked single needs no area (its own collapsed candidates are the
 * premise). */
function placementArea(reason: HintReason, w: number): { x: number; y: number }[] {
  return reason.kind === "hiddenSingle"
    ? hiddenSingleLine(reason.line, reason.index, w)
    : [];
}

/** Emit one firing's strikes as a single journey: split the firing's live ops by
 * cell (one cell = one leg), so each leg narrates "this cell" and highlights a
 * single target, with the legs flagged `continuesPrevious` (quality-bar rule 2 —
 * one firing = one journey). Applies each leg's strikes to the working notes. */
function emitStrikeJourney(
  steps: HintStep<KeenMove, KeenHint>[],
  wPen: Int32Array,
  w: number,
  groupOps: HintOp[],
): void {
  const byCell = new Map<number, HintOp[]>();
  for (const op of groupOps) {
    const key = op.y * w + op.x;
    const arr = byCell.get(key);
    if (arr) arr.push(op);
    else byCell.set(key, [op]);
  }
  let first = true;
  for (const [key, cellOps] of byCell) {
    const x = key % w;
    const y = (key / w) | 0;
    const marks = cellOps.map((op) => ({ x, y, n: op.n }));
    const values = marks.map((m) => m.n).sort((a, b) => a - b);
    const reason = cellOps[0].reason;
    steps.push({
      move: { type: "pencilStrike", marks },
      explanation: narrate(reason, values, w),
      highlights: { area: reasonArea(reason), targets: [{ x, y }], marks },
      continuesPrevious: !first,
    });
    for (const m of marks) wPen[m.y * w + m.x] &= ~(1 << m.n);
    first = false;
  }
}

/** Emit a placement step and apply it to the working board, striking the placed
 * value from the rest of its row and column. With auto-pencil on (`autoClean`)
 * that cleanup is silent (the move's own `autoElim` does it on the real board);
 * with it off it becomes an explicit `pencilStrike` journey continuation. */
function emitPlacement(
  steps: HintStep<KeenMove, KeenHint>[],
  wGrid: Int8Array,
  wPen: Int32Array,
  w: number,
  x: number,
  y: number,
  n: number,
  reason: HintReason,
  autoClean: boolean,
): void {
  steps.push({
    move: { type: "set", x, y, n, pencil: false, autoElim: autoClean },
    explanation: narrate(reason, [n], w),
    highlights: { area: placementArea(reason, w), targets: [{ x, y }], marks: [] },
  });
  wGrid[y * w + x] = n;
  wPen[y * w + x] = 0;

  const dupMarks = regionDuplicateMarks(
    wGrid,
    wPen,
    x,
    y,
    n,
    w,
    rowColRegions(x, y, w),
  );
  for (const m of dupMarks) wPen[m.y * w + m.x] &= ~(1 << n);

  if (!autoClean && dupMarks.length > 0) {
    steps.push({
      move: { type: "pencilStrike", marks: dupMarks },
      explanation: narrate({ kind: "dup", n, px: x, py: y }, [], w),
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
 * naked single first; else (after a lazy populate) the basic-Latin row/column cull
 * a placed value forces; else the next cage elimination; else a forced placement.
 * `autoClean` (the auto-pencil preference) decides whether a placement's trivial
 * row/column eliminations are silent or taught. */
function buildSteps(
  state: KeenState,
  autoClean: boolean,
): HintStep<KeenMove, KeenHint>[] {
  const w = state.params.w;
  const steps: HintStep<KeenMove, KeenHint>[] = [];
  const wGrid = Int8Array.from(state.grid);
  const wPen = Int32Array.from(state.pencil);
  const maxdiff = Math.min(diffToLevel(state.params.diff), DIFF_EXTREME);

  const pop = lazyPopulate<KeenMove, KeenHint>(
    state,
    wGrid,
    wPen,
    w,
    steps,
    POPULATE_TEXT,
  );
  // The obvious-candidate cleanup is emitted once, right after notes first exist
  // (just populated, or already present on a pre-noted board) — see step 3.
  let cleaned = false;

  let ops = recordKeenDeductions(w, state.clues, Uint8Array.from(wGrid), maxdiff);
  const budget = stepBudget("keen hint plan");
  const cap = w * w * w * 4 + 4;
  for (let guard = 0; guard < cap; guard++) {
    budget.tick();
    let filled = true;
    for (let i = 0; i < w * w; i++) if (!wGrid[i]) filled = false;
    if (filled) break;

    // 1. A naked single — the next move a human makes.
    const ns = nakedSingle(wGrid, wPen, w);
    if (ns) {
      emitPlacement(
        steps,
        wGrid,
        wPen,
        w,
        ns.x,
        ns.y,
        ns.n,
        { kind: "single" },
        autoClean,
      );
      ops = recordKeenDeductions(w, state.clues, Uint8Array.from(wGrid), maxdiff);
      continue;
    }

    // 2. Pencil in the notes (once) before any elimination needs them.
    if (!pop.done()) {
      pop.ensure();
      continue;
    }

    // 3. Once notes exist (just populated, or already present), bulk-clear the
    // obvious candidates in one step — the adaptive Mark-all second press — then
    // the walk goes straight to the real cage deductions (later placements keep
    // notes clean via `emitPlacement`).
    if (!cleaned) {
      cleaned = true;
      if (
        emitObviousCleanStep(
          steps,
          wGrid,
          wPen,
          w,
          (x, y) => rowColRegions(x, y, w),
          CLEAN_OBVIOUS_TEXT,
        )
      ) {
        continue;
      }
    }

    // 4. The next cage elimination (the deduction worth teaching).
    const cs = nextStrike(ops, wGrid, wPen, w);
    if (cs) {
      emitStrikeJourney(steps, wPen, w, cs);
      continue;
    }

    // 5. A forced placement (a cube collapse the notes lag) — re-derive *why*
    // (naked vs hidden single) from the working board; the recorded `single`
    // reason conflates the two and would mis-narrate a hidden single.
    const pl = nextPlace(ops, wGrid, w);
    if (pl) {
      const reason = singlePlacementReason(wGrid, wPen, pl.x, pl.y, pl.n, w);
      emitPlacement(steps, wGrid, wPen, w, pl.x, pl.y, pl.n, reason, autoClean);
      ops = recordKeenDeductions(w, state.clues, Uint8Array.from(wGrid), maxdiff);
      continue;
    }

    break; // stuck (e.g. an Unreasonable board now needing a guess)
  }

  return steps;
}

function hint(
  state: KeenState,
  _aux?: string,
  ui?: KeenUi,
): HintResult<KeenMove, KeenHint> {
  return candidateHint(state, ui, findMistakes, buildSteps);
}

/** Classify a player move against the displayed hint step (shared
 * candidate-elimination keep-track; `KeenHint` is structurally
 * `CandidateHighlights`). */
function hintKeepTrack(
  m: KeenMove,
  step: HintStep<KeenMove, KeenHint>,
  state: KeenState,
): HintTrackVerdict {
  return keepCandidateHintTrack(m, step, state.pencil, state.params.w);
}

/** Re-validate a stored hint step against the current board before it is
 * (re-)displayed (shared "never show a stale step" guarantee). */
function refreshHintStep(
  step: HintStep<KeenMove, KeenHint>,
  state: KeenState,
): HintStep<KeenMove, KeenHint> | null {
  return refreshCandidateHintStep(step, state.grid, state.pencil, state.params.w);
}

function flashLength(
  from: KeenState,
  to: KeenState,
  _dir: number,
  _ui: KeenUi,
): number {
  return winFlash(from, to, FLASH_TIME);
}

export const keenGame: Game<
  KeenParams,
  KeenState,
  KeenMove,
  KeenUi,
  KeenDrawState,
  KeenMistake
> = {
  id: "keen",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: false,
  canMarkAll: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  // Keys/shape match the `keen` config template in augmentation.ts
  // ("{grid-size}x{grid-size} {difficulty:...}{multiplication-only:|, …}").
  paramConfig: [
    {
      kw: "grid-size",
      name: "Grid size",
      type: "string",
      get: (p) => String(p.w),
      set: (p, v) => {
        p.w = parseConfigInt(v);
      },
    },
    {
      kw: "difficulty",
      name: "Difficulty",
      type: "choices",
      choices: ["Easy", "Normal", "Hard", "Extreme", "Unreasonable"],
      get: (p) => diffToLevel(p.diff),
      set: (p, v) => {
        p.diff = diffFromLevel(v);
      },
    },
    {
      kw: "multiplication-only",
      name: "Multiplication only",
      type: "boolean",
      get: (p) => p.multiplicationOnly,
      set: (p, v) => {
        p.multiplicationOnly = v;
      },
    },
  ],
  describeParams: (p): ConfigValues => ({
    "grid-size": String(p.w),
    difficulty: diffToLevel(p.diff),
    "multiplication-only": p.multiplicationOnly ? 1 : 0,
  }),

  newDesc: (p, rng: RandomState) => newKeenDesc(p, rng),
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status: (s): GameStatus => status(s),

  solve,
  hint,
  hintKeepTrack,
  refreshHintStep,
  findMistakes,
  requestKeys: (p): KeyLabel[] => digitKeys(p.w),

  prefs: [
    {
      kw: "auto-pencil",
      name: "When you place a number, remove it from pencil marks in its row and column",
      type: "boolean",
      get: (ui) => ui.autoPencil,
      set: (ui, v) => {
        ui.autoPencil = v;
      },
    },
    {
      kw: "sticky-pencil-mode",
      name: "Right-click toggles a sticky pencil mode (stays on until right-clicked again)",
      type: "boolean",
      get: (ui) => ui.pencilSticky,
      set: (ui, v) => {
        ui.pencilSticky = v;
      },
    },
    {
      kw: "pencil-keep-highlight",
      name: "Keep mouse highlight after changing a pencil mark",
      type: "boolean",
      get: (ui) => ui.pencilKeepHighlight,
      set: (ui, v) => {
        ui.pencilKeepHighlight = v;
      },
    },
  ],

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: KeenParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(keenGame);
