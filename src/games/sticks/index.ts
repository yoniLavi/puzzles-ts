/**
 * Sticks (Tatebo-Yokobo) — native TS port of `puzzles/unreleased/sticks.c`.
 * Fill every white cell with a horizontal or vertical line: a number on a
 * line states that line's exact length (and a line may overlap at most one
 * number); a number in a black cell states how many lines connect to it.
 *
 * Input is the upstream drag machine: press then drag along an axis to draw
 * that orientation across the cells passed (starting on a matching line
 * turns the drag into a clearing drag); a plain left click cycles
 * blank→vertical→horizontal→blank and a right click cycles the other way;
 * middle-drag clears; a keyboard cursor places lines with Enter/Space/
 * 0/1/2/backspace and draws across two cells with Shift/Ctrl+arrows.
 * Violated clue numbers red live (upstream behavior); Check & Save
 * additionally flags lines contradicting the unique solution
 * (`findMistakes`).
 */

import { assertNever } from "../../engine/assert-never.ts";
import { winFlash } from "../../engine/flash.ts";
import {
  type Game,
  type HintResult,
  type HintStep,
  type HintTrackVerdict,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { commonHintRefusal, DEDUCTION_EXHAUSTED } from "../../engine/hint-refusal.ts";
import { dimensionParamConfig, parseConfigInt } from "../../engine/params.ts";
import {
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  digitOf,
  gridCursorMove,
  isCursorMove,
  isEraseKey,
  isMouseDown,
  isMouseDrag,
  isMouseRelease,
  LEFT_BUTTON,
  LEFT_RELEASE,
  MIDDLE_BUTTON,
  MOD_CTRL,
  MOD_SHFT,
  newCursor,
  RIGHT_BUTTON,
  RIGHT_RELEASE,
  stripModifiers,
} from "../../engine/pointer.ts";
import type { RandomState } from "../../engine/random/index.ts";
import { registerGame } from "../../engine/registry.ts";
import { SYMMETRY_CHOICES } from "../../engine/symmetric-blacks.ts";
import type { Color, ConfigValues, Point, Size } from "../../engine/types.ts";
import { newSticksDesc } from "./generator.ts";
import { say } from "./hint-text.ts";
import {
  border,
  colors,
  computeSize,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type SticksDrawState,
  setTileSize,
} from "./render.ts";
import {
  deduceSticksPlan,
  findMistakes,
  type SticksFiring,
  type SticksReason,
  sticksSolveGame,
  sticksValidate,
} from "./solver.ts";
import {
  cloneState,
  decodeParams,
  defaultParams,
  encodeParams,
  F_BLOCK,
  F_HOR,
  F_VER,
  newState,
  presets,
  type SticksHint,
  type SticksLine,
  type SticksMistake,
  type SticksMove,
  type SticksParams,
  type SticksState,
  type SticksUi,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

function newUi(_state: SticksState): SticksUi {
  return {
    cursor: newCursor(),
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
    dragType: "none",
    drag: [],
    dragMove: [],
  };
}

const lineBits = (line: SticksLine): number =>
  line === "hor" ? F_HOR : line === "ver" ? F_VER : 0;

const bitsLine = (bits: number): SticksLine =>
  bits & F_HOR ? "hor" : bits & F_VER ? "ver" : "none";

function interpretMove(
  state: SticksState,
  ui: SticksUi,
  ds: SticksDrawState,
  p: Point,
  rawButton: number,
): SticksMove | null | UiUpdate {
  const { w, h, grid } = state;
  const shift = (rawButton & MOD_SHFT) !== 0;
  const control = (rawButton & MOD_CTRL) !== 0;
  const button = stripModifiers(rawButton);
  const ts = ds.tilesize;
  const b = border(ts);
  // C's FROMCOORD is truncating integer division, so a pointer slightly
  // inside the border still maps to row/column 0 — keep trunc, not floor.
  const fromC = (v: number): number => Math.trunc((v - b) / ts);
  const dragDelta = ts * 0.4;

  if (isMouseDown(button) || isMouseDrag(button)) ui.cursor.visible = false;

  // --- keyboard cursor movement (draws across two cells with Shift/Ctrl) ---
  if (isCursorMove(button)) {
    const ox = ui.cursor.x;
    const oy = ui.cursor.y;
    const moved = gridCursorMove(button, ui.cursor.x, ui.cursor.y, w, h);
    if (moved) {
      ui.cursor.x = moved.x;
      ui.cursor.y = moved.y;
    }
    ui.cursor.visible = true;

    if (shift || control) {
      const horizontalArrow = button === CURSOR_LEFT || button === CURSOR_RIGHT;
      const line: SticksLine =
        shift && control
          ? "none"
          : control
            ? horizontalArrow
              ? "hor"
              : "ver"
            : horizontalArrow
              ? "ver"
              : "hor";
      const i1 = oy * w + ox;
      const i2 = ui.cursor.y * w + ui.cursor.x;
      const inert = (i: number): boolean =>
        !!(grid[i] & F_BLOCK) ||
        (line === "hor" && !!(grid[i] & F_HOR)) ||
        (line === "ver" && !!(grid[i] & F_VER)) ||
        (line === "none" && !grid[i]);
      const changes: { index: number; line: SticksLine }[] = [];
      if (!inert(i1)) changes.push({ index: i1, line });
      if (i1 !== i2 && !inert(i2)) changes.push({ index: i2, line });
      if (changes.length > 0) return { kind: "set", changes };
    }
    return UI_UPDATE;
  }

  // --- begin a normal drag -------------------------------------------------
  if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
    ui.minX = ui.maxX = p.x;
    ui.minY = ui.maxY = p.y;
    ui.drag = [];
    ui.dragMove = [];
    ui.dragType = "start";
    return UI_UPDATE;
  }

  // --- perform a normal drag -----------------------------------------------
  if (isMouseDrag(button) && (ui.dragType === "start" || ui.dragType === "line")) {
    ui.minX = Math.min(ui.minX, p.x);
    ui.maxX = Math.max(ui.maxX, p.x);
    ui.minY = Math.min(ui.minY, p.y);
    ui.maxY = Math.max(ui.maxY, p.y);

    const dx = ui.maxX - ui.minX;
    const dy = ui.maxY - ui.minY;
    let dragMove: number;
    if (dx > dy && dx > dragDelta) dragMove = F_HOR;
    else if (dy > dx && dy > dragDelta) dragMove = F_VER;
    else return null;

    const hx = fromC((ui.minX + ui.maxX) / 2);
    const hy = fromC((ui.minY + ui.maxY) / 2);

    ui.minX = ui.maxX = p.x;
    ui.minY = ui.maxY = p.y;

    if (hx < 0 || hx >= w || hy < 0 || hy >= h) return null;
    const i = hy * w + hx;
    if (grid[i] & F_BLOCK) return null;

    if (ui.dragType === "start" && grid[i] & dragMove) {
      // Starting on a matching line: the drag clears instead of draws.
      ui.dragType = "clear";
      dragMove = 0;
    } else {
      ui.dragType = "line";
      const d = ui.drag.indexOf(i);
      if (d !== -1) {
        ui.dragMove[d] = dragMove;
        return UI_UPDATE;
      }
    }

    ui.drag.push(i);
    ui.dragMove.push(dragMove);
    return UI_UPDATE;
  }

  // --- begin a clearing drag (middle button) -------------------------------
  if (button === MIDDLE_BUTTON) {
    const hx = fromC(p.x);
    const hy = fromC(p.y);
    ui.drag = [];
    ui.dragMove = [];
    ui.dragType = "clear";
    // C reads the grid unchecked here (out of bounds is UB); bounds-check.
    if (hx >= 0 && hx < w && hy >= 0 && hy < h) {
      const i = hy * w + hx;
      if (grid[i] & (F_HOR | F_VER)) {
        ui.drag.push(i);
        ui.dragMove.push(0);
      }
    }
    return UI_UPDATE;
  }

  // --- perform a clearing drag ---------------------------------------------
  if (isMouseDrag(button) && ui.dragType === "clear") {
    const hx = fromC(p.x);
    const hy = fromC(p.y);
    if (hx < 0 || hx >= w || hy < 0 || hy >= h) return null; // C: UB read
    const i = hy * w + hx;
    if (!(grid[i] & (F_HOR | F_VER))) return null;
    if (ui.drag.includes(i)) return null;
    ui.drag.push(i);
    ui.dragMove.push(0);
    return UI_UPDATE;
  }

  if (isMouseRelease(button)) {
    // --- a click (release without a qualifying drag) cycles the cell -------
    if (ui.dragType === "start") {
      const hx = fromC((ui.minX + ui.maxX) / 2);
      const hy = fromC((ui.minY + ui.maxY) / 2);
      if (hx < 0 || hx >= w || hy < 0 || hy >= h) {
        ui.dragType = "none";
        return UI_UPDATE;
      }
      const i = hy * w + hx;
      const old = grid[i];
      let value = 0;
      if (button === LEFT_RELEASE) value = old === 0 ? F_VER : old & F_VER ? F_HOR : 0;
      if (button === RIGHT_RELEASE) value = old === 0 ? F_HOR : old & F_HOR ? F_VER : 0;
      ui.drag = [i];
      ui.dragMove = [value];
    }

    ui.dragType = "none";

    // --- confirm clicks and drags as one batched move ----------------------
    if (ui.drag.length > 0) {
      const changes: { index: number; line: SticksLine }[] = [];
      for (let d = 0; d < ui.drag.length; d++) {
        const j = ui.drag[d];
        if (grid[j] & F_BLOCK) continue;
        changes.push({ index: j, line: bitsLine(ui.dragMove[d]) });
      }
      ui.drag = [];
      ui.dragMove = [];
      if (changes.length > 0) return { kind: "set", changes };
      return UI_UPDATE;
    }
    return null;
  }

  // --- keyboard place-one at the cursor ------------------------------------
  const digit = digitOf(button);
  if (
    ui.cursor.visible &&
    (button === CURSOR_SELECT ||
      button === CURSOR_SELECT2 ||
      isEraseKey(button) ||
      digit === 0 ||
      digit === 1 ||
      digit === 2)
  ) {
    const i = ui.cursor.y * w + ui.cursor.x;
    if (grid[i] & F_BLOCK) return null;
    const old = grid[i];
    let line: SticksLine = "none";
    if (digit === 0 || digit === 2) line = "hor";
    else if (digit === 1) line = "ver";
    else if (button === CURSOR_SELECT2)
      line = old === 0 ? "hor" : old & F_HOR ? "ver" : "none";
    else if (button === CURSOR_SELECT)
      line = old === 0 ? "ver" : old & F_VER ? "hor" : "none";

    // Don't put no-ops on the undo chain (upstream comment).
    if (
      (old & F_HOR && line === "hor") ||
      (old & F_VER && line === "ver") ||
      (old === 0 && line === "none")
    ) {
      return null;
    }
    return { kind: "set", changes: [{ index: i, line }] };
  }

  return null;
}

function executeMove(state: SticksState, move: SticksMove): SticksState {
  const next = cloneState(state);
  if (move.kind === "solve") {
    for (let i = 0; i < next.grid.length; i++) {
      if (state.grid[i] & F_BLOCK) continue;
      next.grid[i] = lineBits(move.grid[i]);
    }
  } else if (move.kind === "set") {
    for (const { index, line } of move.changes) {
      if (state.grid[index] & F_BLOCK) continue;
      next.grid[index] = lineBits(line);
    }
  } else {
    return assertNever(move, "sticks: executeMove");
  }
  if (sticksValidate(next.grid, next.numbers, next.w, next.h) === "complete")
    next.completed = true;
  // Upstream: `if (cheated) ret->cheated = ret->completed;` — a solve marks
  // the game cheated only when it actually completed the board.
  if (move.kind === "solve") next.cheated = next.completed;
  return next;
}

function solve(orig: SticksState): SolveResult<SticksMove> {
  const grid = orig.grid.slice();
  const result = sticksSolveGame(grid, orig.numbers, orig.w, orig.h);
  if (result === "invalid") return { ok: false, error: "Puzzle is invalid." };
  // An unfinished solve still emits the partial deduction (upstream).
  const lines: SticksLine[] = Array.from(grid, (t) => bitsLine(t));
  return { ok: true, move: { kind: "solve", grid: lines } };
}

// --- hint (a second projection of the one contradiction technique) ----------

/**
 * The cells a reason reasons over. Each list is exactly what its sentence
 * claims, so the player can count the picture against the words (§5.2).
 *
 * The forced square is deliberately **kept** in the three length arguments and
 * left out of the two black-clue ones, because that is where it honestly
 * belongs: the run a length argument measures does contain the square being
 * decided ("would run the 2's line to 3 squares" shades all three, with the
 * blue bar on the one to act on), while the lines a black clue already counts
 * do not include the one being ruled out. Dropping it everywhere — the obvious
 * first cut — left an `unreachable` step whose whole evidence *was* the target
 * with nothing at all on the board (§5.2's Range `connect` case).
 */
function evidenceOf(reason: SticksReason, target: number): number[] {
  switch (reason.kind) {
    case "tooLong":
      return reason.segment;
    case "unreachable":
      return reason.span;
    case "twoClues":
      return [...reason.segment, ...reason.clues];
    case "overConnected":
      return [reason.clue, ...reason.lines.filter((c) => c !== target)];
    case "starved":
      return [reason.clue, ...reason.open];
  }
}

/**
 * Narrate *why* the square can only take one orientation, reading the clue
 * numbers the sentence names off the board. `continues` is a later leg of the
 * same firing. The words are [`hint-text.ts`](./hint-text.ts)'s.
 */
function narrate(firing: SticksFiring, state: SticksState, continues: boolean): string {
  const { reason, to } = firing;
  // The square's own clue, or -1: what the closing sentence names it by.
  const clue = state.numbers[firing.index];
  switch (reason.kind) {
    case "tooLong":
      return say.tooLong(reason, to, clue, continues);
    case "unreachable":
      return say.unreachable(reason, to, clue, continues);
    case "twoClues":
      return say.twoClues(
        reason.clues.map((c) => state.numbers[c]),
        to,
        clue,
        continues,
      );
    case "overConnected":
      return say.overConnected(reason, to, clue, continues);
    case "starved":
      return say.starved(reason, to, clue, continues);
  }
}

function hint(state: SticksState): HintResult<SticksMove, SticksHint> {
  // A wrong line makes every deduction from here worthless, so refuse and let
  // the midend light the offenders through findMistakes (§4).
  const refusal = commonHintRefusal(state.completed, findMistakes(state).length);
  if (refusal) return refusal;

  const plan = deduceSticksPlan(state);
  if (plan.length === 0) {
    return { ok: false, error: DEDUCTION_EXHAUSTED };
  }

  const steps: HintStep<SticksMove, SticksHint>[] = [];
  for (const group of plan) {
    // One firing = one journey: a clue that rules out several squares at once
    // is one insight, so its later squares continue the step rather than
    // queueing up as separate hints (quality-bar rule 2).
    group.forEach((f, leg) => {
      steps.push({
        move: { kind: "set", changes: [{ index: f.index, line: f.to }] },
        explanation: narrate(f, state, leg > 0),
        highlights: {
          target: f.index,
          to: f.to,
          evidence: evidenceOf(f.reason, f.index),
        },
        continuesPrevious: leg > 0,
      });
    });
  }
  return { ok: true, steps };
}

/**
 * A move completes the step when it sets the hinted square to the hinted
 * orientation. Steps are single-square (a journey's legs arrive one at a time),
 * so there is no partial-subset `"onTrack"` case; a drag that sweeps the target
 * still completes it, and any move that leaves the target alone is off-plan.
 *
 * No `refreshHintStep` (§7.3): Sticks has no pencil notes and no preference
 * that edits the board, so a kept step cannot be silently resolved by a side
 * effect — only by the player making its own move, which the midend sees.
 */
function hintKeepTrack(
  m: SticksMove,
  step: HintStep<SticksMove, SticksHint>,
  _state: SticksState,
): HintTrackVerdict {
  const hl = step.highlights;
  if (!hl || m.kind !== "set") return "off";
  for (const c of m.changes) {
    if (c.index === hl.target) return c.line === hl.to ? "completed" : "off";
  }
  return "off";
}

function flashLength(
  from: SticksState,
  to: SticksState,
  _dir: number,
  _ui: SticksUi,
): number {
  return winFlash(from, to, FLASH_TIME);
}

export const sticksGame: Game<
  SticksParams,
  SticksState,
  SticksMove,
  SticksUi,
  SticksDrawState,
  SticksMistake
> = {
  id: "sticks",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,

  describeParams: (p): ConfigValues => ({
    width: String(p.w),
    height: String(p.h),
    "percentage-of-black-squares": String(p.blackpc),
    symmetry: p.symm,
  }),
  paramConfig: [
    ...dimensionParamConfig<SticksParams>(),
    {
      kw: "percentage-of-black-squares",
      name: "%age of black squares",
      type: "string",
      get: (p) => String(p.blackpc),
      set: (p, v) => {
        p.blackpc = parseConfigInt(v);
      },
    },
    {
      kw: "symmetry",
      name: "Symmetry",
      type: "choices",
      choices: SYMMETRY_CHOICES,
      get: (p) => p.symm,
      set: (p, v) => {
        p.symm = v;
      },
    },
  ],

  newDesc: (p: SticksParams, rng: RandomState) => newSticksDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve,
  findMistakes,
  hint,
  hintKeepTrack,
  textFormat,

  colors: (defaultBackground: Color): Color[] => colors(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: SticksParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(sticksGame);
