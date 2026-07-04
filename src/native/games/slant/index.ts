/**
 * Slant — native TS port of `slant.c` (Gokigen Naname). Fill every square
 * with a `/` or `\` diagonal so each vertex clue counts its incident
 * diagonals and no closed loop forms.
 *
 * Left-click cycles a square blank → `\` → `/` → blank; right-click the
 * reverse (swappable via the mouse-button-order preference); `\`, `/` and
 * backspace place directly at the keyboard cursor.
 */
import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import { Dsf } from "../../engine/dsf.ts";
import type {
  Game,
  HintResult,
  HintStep,
  HintTrackVerdict,
  UiUpdate,
} from "../../engine/game.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import { newDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type SlantDrawState,
} from "./render.ts";
import { deduceHintPlan, type SlantFiring, solveFromClues } from "./solver.ts";
import {
  DIFF_NAMES,
  decodeParams,
  defaultParams,
  encodeParams,
  executeMove,
  newState,
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
    cx: 0,
    cy: 0,
    cursorVisible: false,
    swapButtons: false,
    fadeGrounded: false,
  };
}

// Keyboard char codes handled directly.
const KEY_BACKSLASH = 92;
const KEY_SLASH = 47;
const KEY_BACKSPACE = 8;

/** Cycle a square's value: left-click runs blank→`\`→`/`→blank
 * ("clockwise"), right-click the reverse. */
function cycle(current: number, clockwise: boolean): Slash {
  if (clockwise) {
    let v = current - 1;
    if (v === -2) v = 1;
    return v as Slash;
  }
  let v = current + 1;
  if (v === 2) v = -1;
  return v as Slash;
}

function interpretMove(
  state: SlantState,
  ui: SlantUi,
  ds: SlantDrawState | null,
  p: Point,
  rawButton: number,
): SlantMove | null | UiUpdate {
  const button = stripModifiers(rawButton);
  const { w, h } = state;
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const b = Math.floor(ts / 3) + 1; // render.ts border (NARROW_BORDERS)
  const fromCoord = (v: number) => Math.floor((v - b + ts) / ts) - 1;

  if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
    let effective = button;
    if (ui.swapButtons) {
      effective = button === LEFT_BUTTON ? RIGHT_BUTTON : LEFT_BUTTON;
    }
    const x = fromCoord(p.x);
    const y = fromCoord(p.y);
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    ui.cursorVisible = false;
    return {
      type: "set",
      x,
      y,
      v: cycle(state.soln[y * w + x], effective === LEFT_BUTTON),
    };
  }

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    if (!ui.cursorVisible) {
      ui.cursorVisible = true;
      return UI_UPDATE;
    }
    const x = ui.cx;
    const y = ui.cy;
    return {
      type: "set",
      x,
      y,
      v: cycle(state.soln[y * w + x], button === CURSOR_SELECT),
    };
  }

  if (isCursorMove(button)) {
    const moved = gridCursorMove(button, ui.cx, ui.cy, w, h);
    if (moved) {
      ui.cx = moved.x;
      ui.cy = moved.y;
    }
    ui.cursorVisible = true;
    return UI_UPDATE;
  }

  if (button === KEY_BACKSLASH || button === KEY_SLASH || button === KEY_BACKSPACE) {
    const x = ui.cx;
    const y = ui.cy;
    const v: Slash = button === KEY_BACKSLASH ? -1 : button === KEY_SLASH ? 1 : 0;
    if (state.soln[y * w + x] === v) return null; // no effect
    return { type: "set", x, y, v };
  }

  return null;
}

function flashLength(
  oldState: SlantState,
  newState_: SlantState,
  _dir: number,
  _ui: SlantUi,
): number {
  return !oldState.completed &&
    newState_.completed &&
    !oldState.usedSolve &&
    !newState_.usedSolve
    ? FLASH_TIME
    : 0;
}

function solve(
  orig: SlantState,
  _curr: SlantState,
  aux?: string,
): ReturnType<NonNullable<Game<SlantParams, SlantState, SlantMove>["solve"]>> {
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
  let grid = "";
  for (let i = 0; i < orig.w * orig.h; i++) {
    grid += result.soln[i] < 0 ? "\\" : "/";
  }
  return { ok: true, move: { type: "solve", grid } };
}

/** Boards this fork generates are uniquely solvable at Hard or below:
 * re-solve the clues and flag every placed diagonal that contradicts the
 * unique solution. Blank squares are never mistakes; a non-uniquely-solvable
 * (hand-typed) board degrades to "no detectable mistakes". */
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
 * forces (blue `COL_HINT`, no slash preview); `siblings` are the same
 * firing's still-to-do squares (also blue — they share its fate); `area`
 * is the deduction's evidence to shade light-blue (a clue's decided
 * neighbours, a loop chain, the trapped dead-end components); `ref` rings a
 * cited already-filled square (an equivalence anchor); `clue` recolours a
 * driving clue's digit. */
export interface SlantHint {
  target: { x: number; y: number };
  siblings?: { x: number; y: number }[];
  area?: { x: number; y: number }[];
  ref?: { x: number; y: number };
  clue?: { x: number; y: number };
}

const SLASH_WORD = (v: number): string => (v < 0 ? "a backslash" : "a forward slash");

/** The up-to-four square indices around a clue vertex, geometrically. */
function clueNeighbourSquares(
  cx: number,
  cy: number,
  w: number,
  h: number,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  if (cx > 0 && cy > 0) out.push({ x: cx - 1, y: cy - 1 });
  if (cx > 0 && cy < h) out.push({ x: cx - 1, y: cy });
  if (cx < w && cy < h) out.push({ x: cx, y: cy });
  if (cx < w && cy > 0) out.push({ x: cx, y: cy - 1 });
  return out;
}

/** The up-to-four squares touching a grid point (its "neighbourhood"). */
function incidentSquares(
  px: number,
  py: number,
  w: number,
  h: number,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const [dx, dy] of [
    [-1, -1],
    [-1, 0],
    [0, -1],
    [0, 0],
  ]) {
    const x = px + dx;
    const y = py + dy;
    if (x >= 0 && x < w && y >= 0 && y < h) out.push({ x, y });
  }
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
): { x: number; y: number }[] {
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
  const out: { x: number; y: number }[] = [];
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

/** Narrate why this leg's move is forced (§2: indication-first, necessity
 * voice, terse; the honest locked-slant voice for equivalence — D3). */
function narrate(firing: SlantFiring, leg: number): string {
  // Continuation legs belong to a clue firing (only clue firings force
  // several squares); keep them in the necessity voice.
  if (leg > 0) {
    return firing.technique === "clue-empty"
      ? "The same clue forces this square too — it must slant away."
      : "The same clue forces this square too — it must slant toward the clue.";
  }
  const m = firing.moves[0];
  switch (firing.technique) {
    case "clue-fill": {
      const c = firing.clue?.c ?? 0;
      if (c === 4) {
        return "A 4 clue must be touched by all four diagonals, so this square must slant toward it.";
      }
      return `This ${c} clue still needs a line for every empty square left around it, so each one must slant toward it.`;
    }
    case "clue-empty": {
      const c = firing.clue?.c ?? 0;
      if (c === 0) {
        return "A 0 clue is touched by no diagonals, so every square around it must slant away.";
      }
      const has = c === 1 ? "its one diagonal" : `its ${c} diagonals`;
      return `This ${c} clue already touches ${has}, so every other square around it must slant away.`;
    }
    case "loop":
      return "Two corners of this square are already joined by a chain of diagonals. Slanting it one way would close that chain into a loop, which isn't allowed — so it must slant the other way.";
    case "deadend":
      return "These points are boxed in — each has just one diagonal left to place and neither reaches the grid's edge. Slanting this square that way would seal them into a closed loop, so it must slant the other way.";
    case "equiv":
      // The anchor shares this square's equivalence class, hence its slash
      // (m.v), so name it once.
      return `This square is locked to the same slant as the ringed one — the clues around them leave no other pairing — so since that one is ${SLASH_WORD(m.v)}, this must be ${SLASH_WORD(m.v)} too.`;
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
  const target = { x: m.x, y: m.y };
  const siblings = firing.moves.slice(leg + 1).map((s) => ({ x: s.x, y: s.y }));
  const hint: SlantHint = { target };
  if (siblings.length) hint.siblings = siblings;

  switch (firing.technique) {
    case "clue-fill":
    case "clue-empty": {
      if (firing.clue) {
        hint.clue = { x: firing.clue.x, y: firing.clue.y };
        // Evidence: the clue's already-decided neighbours (its context) —
        // the squares NOT being placed by this firing.
        const inFiring = new Set(firing.moves.map((s) => s.y * w + s.x));
        hint.area = clueNeighbourSquares(firing.clue.x, firing.clue.y, w, h).filter(
          (s) => !inFiring.has(s.y * w + s.x) && firing.grid[s.y * w + s.x] !== 0,
        );
      }
      break;
    }
    case "loop":
    case "deadend": {
      const W = w + 1;
      // The ruled-out diagonal is −v; its two corners are the points at
      // issue. Shade the chain / components they belong to (from the board
      // with this square removed) plus their incident squares — so a
      // dead-end point that carries no diagonal yet is still located.
      const grid = firing.grid.slice();
      grid[m.y * w + m.x] = 0;
      const [pa, pb] =
        m.v === 1
          ? [
              [m.x, m.y],
              [m.x + 1, m.y + 1],
            ] // backslash corners
          : [
              [m.x + 1, m.y],
              [m.x, m.y + 1],
            ]; // forward corners
      const pts = [pa[1] * W + pa[0], pb[1] * W + pb[0]];
      const byKey = new Map<number, { x: number; y: number }>();
      for (const s of [
        ...componentSquares(grid, w, h, pts),
        ...incidentSquares(pa[0], pa[1], w, h),
        ...incidentSquares(pb[0], pb[1], w, h),
      ]) {
        if (s.x === m.x && s.y === m.y) continue; // target owns its blue cell
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
  if (state.completed) return { ok: false, error: "This board is already solved." };
  if (findMistakes(state).length > 0) {
    return {
      ok: false,
      error: "There's a mistake on the board — fix it before asking for a hint.",
    };
  }
  const plan = deduceHintPlan(state.w, state.h, state.clues, state.soln);
  if (plan.length === 0) {
    return { ok: false, error: "I can't find a deduction from here." };
  }
  const steps: HintStep<SlantMove, SlantHint>[] = [];
  for (const firing of plan) {
    for (let leg = 0; leg < firing.moves.length; leg++) {
      steps.push({
        move: {
          type: "set",
          x: firing.moves[leg].x,
          y: firing.moves[leg].y,
          v: firing.moves[leg].v,
        },
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
  paramConfig: [
    ...dimensionParamConfig<SlantParams>(),
    {
      kw: "difficulty",
      name: "Difficulty",
      type: "choices",
      choices: [...DIFF_NAMES],
      get: (p) => p.diff,
      set: (p, v) => {
        p.diff = v;
      },
    },
  ],
  describeParams: (p) => ({
    width: String(p.w),
    height: String(p.h),
    difficulty: p.diff,
  }),

  newDesc: (p, rng) => newDesc(p, rng),
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

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: SlantParams, ts: number): Size => computeSize(p, ts),
  setTileSize: (ds, ts) => {
    ds.tilesize = ts;
  },
  newDrawState,
  redraw,

  flashLength,
};

registerGame(slantGame);
