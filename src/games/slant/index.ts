/**
 * Slant — native TS port of `slant.c` (Gokigen Naname). Fill every square
 * with a `/` or `\` diagonal so each vertex clue counts its incident
 * diagonals and no closed loop forms.
 *
 * Left-click cycles a square blank → `\` → `/` → blank; right-click the
 * reverse (swappable via the mouse-button-order preference); `\`, `/` and
 * backspace place directly at the keyboard cursor.
 */

import type { DifficultyContract } from "../../engine/difficulty.ts";
import { Dsf } from "../../engine/dsf.ts";
import { winFlash } from "../../engine/flash.ts";
import type {
  Game,
  HintResult,
  HintStep,
  HintTrackVerdict,
  SolveResult,
  UiUpdate,
} from "../../engine/game.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import { fromCoord } from "../../engine/geometry.ts";
import { commonHintRefusal, DEDUCTION_EXHAUSTED } from "../../engine/hint-refusal.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  hideCursor,
  isCursorMove,
  isEraseKey,
  LEFT_BUTTON,
  moveCursor,
  newCursor,
  RIGHT_BUTTON,
  showCursor,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { Point } from "../../engine/types.ts";
import { newDesc } from "./generator.ts";
import { say } from "./hint-text.ts";
import {
  border,
  colors,
  computeSize,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type SlantDrawState,
} from "./render.ts";
import {
  deduceHintPlan,
  type SlantFiring,
  SOLVE_IMPOSSIBLE,
  SOLVE_UNIQUE,
  SolverScratch,
  slantSolve,
  solveFromClues,
} from "./solver.ts";
import {
  decodeParams,
  defaultParams,
  encodeParams,
  executeMove,
  newState,
  paramConfig,
  presets,
  type SlantMistake,
  type SlantMove,
  type SlantParams,
  type SlantState,
  type SlantUi,
  type Slash,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

function newUi(_state: SlantState): SlantUi {
  return {
    cursor: newCursor(),
    swapButtons: false,
    fadeGrounded: false,
  };
}

const KEY_BACKSLASH = 92;
const KEY_SLASH = 47;

/** Cycle a square's value: left-click runs blank→`\`→`/`→blank
 * ("clockwise"), right-click the reverse. */
function cycle(current: number, clockwise: boolean): Slash {
  const v = clockwise ? current - 1 : current + 1;
  if (v < -1) return 1;
  if (v > 1) return -1;
  return v as Slash;
}

function interpretMove(
  state: SlantState,
  ui: SlantUi,
  ds: SlantDrawState,
  p: Point,
  rawButton: number,
): SlantMove | null | UiUpdate {
  const button = stripModifiers(rawButton);
  const { w, h } = state;

  if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
    const ts = ds.tileSize;
    const x = fromCoord(p.x, ts, border(ts));
    const y = fromCoord(p.y, ts, border(ts));
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    hideCursor(ui.cursor);
    return {
      type: "set",
      x,
      y,
      v: cycle(state.soln[y * w + x], (button === LEFT_BUTTON) !== ui.swapButtons),
    };
  }

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    if (showCursor(ui.cursor)) return UI_UPDATE;
    const { x, y } = ui.cursor;
    return {
      type: "set",
      x,
      y,
      v: cycle(state.soln[y * w + x], button === CURSOR_SELECT),
    };
  }

  if (isCursorMove(button)) {
    moveCursor(ui.cursor, button, w, h);
    return UI_UPDATE;
  }

  if (button === KEY_BACKSLASH || button === KEY_SLASH || isEraseKey(button)) {
    const { x, y } = ui.cursor;
    const v: Slash = button === KEY_BACKSLASH ? -1 : button === KEY_SLASH ? 1 : 0;
    if (state.soln[y * w + x] === v) return null;
    return { type: "set", x, y, v };
  }

  return null;
}

function solve(
  orig: SlantState,
  _curr: SlantState,
  aux?: string,
): SolveResult<SlantMove> {
  if (aux && aux.length === orig.w * orig.h) {
    return { ok: true, move: { type: "solve", grid: aux } };
  }
  const result = solveFromClues(orig.w, orig.h, orig.clues);
  if ("error" in result) {
    return {
      ok: false,
      error:
        result.error === "impossible"
          ? "This puzzle is not self-consistent"
          : "Unable to find a unique solution for this puzzle",
    };
  }
  const grid = Array.from(result.soln, (s) => (s < 0 ? "\\" : "/")).join("");
  return { ok: true, move: { type: "solve", grid } };
}

/** Generated boards are uniquely solvable by the full solver: re-solve the
 * clues and flag every placed diagonal that contradicts the unique solution.
 * Blank squares are never mistakes; a non-uniquely-solvable (hand-typed)
 * board degrades to "no detectable mistakes". */
function findMistakes(state: SlantState): readonly SlantMistake[] {
  const { w, h } = state;
  const result = solveFromClues(w, h, state.clues);
  if ("error" in result) return [];
  const out: SlantMistake[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = state.soln[y * w + x];
      if (s !== 0 && s !== result.soln[y * w + x]) out.push({ x, y });
    }
  }
  return out;
}

// --- hint ------------------------------------------------------------------

/** Highlight data for a Slant hint step. `target` is the square this leg
 * forces and `siblings` the same firing's still-to-do squares, all ringed
 * `COL_HINT` with no slash preview (they share its fate); `area` is the
 * deduction's evidence to outline (a clue's decided neighbors, a loop chain,
 * the trapped dead-end components); `ref` rings a cited already-filled square
 * (an equivalence anchor); `clue` recolors a driving clue's digit. */
export interface SlantHint {
  target: Point;
  siblings?: Point[];
  area?: Point[];
  ref?: Point;
  clue?: Point;
}

/** The up-to-four squares touching a grid point. */
function incidentSquares(px: number, py: number, w: number, h: number): Point[] {
  const out: Point[] = [];
  if (px > 0 && py > 0) out.push({ x: px - 1, y: py - 1 });
  if (px > 0 && py < h) out.push({ x: px - 1, y: py });
  if (px < w && py > 0) out.push({ x: px, y: py - 1 });
  if (px < w && py < h) out.push({ x: px, y: py });
  return out;
}

/** Squares whose diagonal lies in the connectivity component of any of the
 * given grid points, computed from a `soln` snapshot (the loop chain / the
 * trapped dead-end components a firing reasons over). */
function componentSquares(
  grid: Int8Array,
  w: number,
  h: number,
  points: number[],
): Point[] {
  const W = w + 1;
  const dsf = new Dsf(W * (h + 1));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = grid[y * w + x];
      if (s === -1) dsf.merge(y * W + x, (y + 1) * W + (x + 1));
      else if (s === 1) dsf.merge((y + 1) * W + x, y * W + (x + 1));
    }
  }
  const roots = new Set(points.map((p) => dsf.canonify(p)));
  const out: Point[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = grid[y * w + x];
      if (s === 0) continue;
      const endpoint = s === -1 ? y * W + x : (y + 1) * W + x;
      if (roots.has(dsf.canonify(endpoint))) out.push({ x, y });
    }
  }
  return out;
}

/** Narrate why this leg's move is forced. The words are
 * [`hint-text.ts`](./hint-text.ts)'s. */
function narrate(firing: SlantFiring, leg: number): string {
  if (leg > 0) return say.continuation(firing.technique === "clue-empty");
  switch (firing.technique) {
    case "clue-fill":
      return say.clueFill(firing.clue?.c ?? 0);
    case "clue-empty":
      return say.clueEmpty(firing.clue?.c ?? 0);
    case "loop":
      return say.loop;
    case "deadend":
      return say.deadend;
    case "equiv":
      return say.equiv(firing.moves[0].v);
  }
}

/** Build the highlight payload for one leg of a firing. */
function buildHighlights(
  firing: SlantFiring,
  leg: number,
  w: number,
  h: number,
): SlantHint {
  const m = firing.moves[leg];
  const hint: SlantHint = { target: { x: m.x, y: m.y } };
  const siblings = firing.moves.slice(leg + 1).map((s) => ({ x: s.x, y: s.y }));
  if (siblings.length) hint.siblings = siblings;

  switch (firing.technique) {
    case "clue-fill":
    case "clue-empty": {
      if (firing.clue) {
        hint.clue = { x: firing.clue.x, y: firing.clue.y };
        // Evidence: the clue's already-decided neighbors, not the squares
        // this firing places.
        const inFiring = new Set(firing.moves.map((s) => s.y * w + s.x));
        hint.area = incidentSquares(firing.clue.x, firing.clue.y, w, h).filter(
          (s) => !inFiring.has(s.y * w + s.x) && firing.grid[s.y * w + s.x] !== 0,
        );
      }
      break;
    }
    case "loop":
    case "deadend": {
      // The ruled-out diagonal is −v; its two corners are the points at
      // issue. Outline the chain / components they belong to (from the board
      // with this square removed) plus their incident squares, so a dead-end
      // point that carries no diagonal yet is still located.
      const grid = firing.grid.slice();
      grid[m.y * w + m.x] = 0;
      // A ruled-out `\` runs from (x, y), a ruled-out `/` from (x+1, y).
      const dx = m.v === 1 ? 0 : 1;
      const corners: Point[] = [
        { x: m.x + dx, y: m.y },
        { x: m.x + 1 - dx, y: m.y + 1 },
      ];
      const byKey = new Map<number, Point>();
      for (const s of [
        ...componentSquares(
          grid,
          w,
          h,
          corners.map((p) => p.y * (w + 1) + p.x),
        ),
        ...corners.flatMap((p) => incidentSquares(p.x, p.y, w, h)),
      ]) {
        if (s.x === m.x && s.y === m.y) continue; // the target carries its own ring
        byKey.set(s.y * w + s.x, s);
      }
      hint.area = [...byKey.values()];
      break;
    }
    case "equiv": {
      if (firing.anchor) hint.ref = { x: firing.anchor.x, y: firing.anchor.y };
      break;
    }
  }
  return hint;
}

function hint(state: SlantState): HintResult<SlantMove, SlantHint> {
  const refusal = commonHintRefusal(state.completed, findMistakes(state).length);
  if (refusal) return refusal;
  const plan = deduceHintPlan(state.w, state.h, state.clues, state.soln);
  if (plan.length === 0) return { ok: false, error: DEDUCTION_EXHAUSTED };
  const steps: HintStep<SlantMove, SlantHint>[] = [];
  for (const firing of plan) {
    for (let leg = 0; leg < firing.moves.length; leg++) {
      steps.push({
        move: { type: "set", ...firing.moves[leg] },
        explanation: narrate(firing, leg),
        ...(leg > 0 ? { continuesPrevious: true } : {}),
        highlights: buildHighlights(firing, leg, state.w, state.h),
      });
    }
  }
  return { ok: true, steps };
}

/** The player's move completes the step iff it sets the hinted square to the
 * hinted slash; anything else drops the plan to recompute. */
function hintKeepTrack(
  m: SlantMove,
  step: HintStep<SlantMove, SlantHint>,
  _state: SlantState,
): HintTrackVerdict {
  if (m.type !== "set" || step.move.type !== "set") return "off";
  return m.x === step.move.x && m.y === step.move.y && m.v === step.move.v
    ? "completed"
    : "off";
}

const difficulty: DifficultyContract<SlantParams> = {
  tierOf: (p) => p.diff,
  withTier: (p, tier) => ({ ...p, diff: tier }),
  solveAtCap: (p, desc, cap) => {
    const s = newState(p, desc);
    const soln = new Int8Array(s.w * s.h);
    const ret = slantSolve(s.w, s.h, s.clues, soln, new SolverScratch(s.w, s.h), cap);
    if (ret === SOLVE_UNIQUE) return "solved";
    return ret === SOLVE_IMPOSSIBLE ? "impossible" : "unsolved";
  },
};

export const slantGame: Game<
  SlantParams,
  SlantState,
  SlantMove,
  SlantUi,
  SlantDrawState,
  SlantMistake
> = {
  id: "slant",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig,
  describeParams: (p) => ({
    width: String(p.w),
    height: String(p.h),
    difficulty: p.diff,
  }),

  newDesc,
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve,
  difficulty,
  findMistakes,
  hint,
  hintKeepTrack,

  textFormat,

  prefs: [
    {
      kw: "left-button",
      name: "Mouse button order",
      type: "choices",
      choices: ["Left \\, right /", "Left /, right \\"],
      get: (ui) => (ui.swapButtons ? 1 : 0),
      set: (ui, v) => {
        ui.swapButtons = v === 1;
      },
    },
    {
      kw: "fade-grounded",
      name: "Fade grounded components",
      type: "boolean",
      get: (ui) => ui.fadeGrounded,
      set: (ui, v) => {
        ui.fadeGrounded = v;
      },
    },
  ],

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize: (ds, ts) => {
    ds.tileSize = ts;
  },
  newDrawState,
  redraw,

  flashLength: (a, b) => winFlash(a, b, FLASH_TIME),
};

registerGame(slantGame);
