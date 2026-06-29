/**
 * Unruly — native TS port of `unruly.c` (the binary puzzle Binairo).
 * Fill the grid with two colours so no row/column has three equal cells
 * in a row and each row/column holds equally many of each; an optional
 * variant also forbids two identical rows or columns.
 *
 * Left-click cycles a cell empty → one (black) → zero (white) → empty;
 * right-click cycles the other way; number keys place directly.
 */
import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import { winFlash } from "../../engine/flash.ts";
import {
  type Game,
  type HintResult,
  type HintStep,
  type HintTrackVerdict,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  MIDDLE_BUTTON,
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
  PLACE_ANIM_TIME,
  PREFERRED_TILE_SIZE,
  redraw,
  type UnrulyDrawState,
} from "./render.ts";
import {
  deduceHintPlan,
  findMistakes,
  type HintReason,
  solveToString,
} from "./solver.ts";
import {
  type Cell,
  decodeParams,
  defaultParams,
  EMPTY,
  encodeParams,
  executeMove,
  newState,
  ONE,
  presets,
  status,
  textFormat,
  type UnrulyMistake,
  type UnrulyMove,
  type UnrulyParams,
  type UnrulyState,
  type UnrulyUi,
  validateDesc,
  validateParams,
  ZERO,
} from "./state.ts";

function newUi(_state: UnrulyState): UnrulyUi {
  return { cx: 0, cy: 0, cursor: false };
}

function border(ts: number): number {
  return Math.floor(ts / 2);
}

/** The cell value a key/click decided to set (upstream's `c`), or `null`
 * for "no change requested". */
function decideValue(button: number, current: Cell): Cell | null {
  switch (button) {
    case 49: // '1'
      return ONE;
    case 48: // '0'
    case 50: // '2'
      return ZERO;
    case 8: // backspace
    case MIDDLE_BUTTON:
      return EMPTY;
    case CURSOR_SELECT2:
    case RIGHT_BUTTON:
      // empty → zero → one → empty
      return current === EMPTY ? ZERO : current === ZERO ? ONE : EMPTY;
    case CURSOR_SELECT:
    case LEFT_BUTTON:
      // empty → one → zero → empty
      return current === EMPTY ? ONE : current === ONE ? ZERO : EMPTY;
    default:
      return null;
  }
}

function interpretMove(
  state: UnrulyState,
  ui: UnrulyUi,
  ds: UnrulyDrawState | null,
  p: Point,
  rawButton: number,
): UnrulyMove | null | UiUpdate {
  const button = stripModifiers(rawButton);
  const { w2, h2 } = state;
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const b = border(ts);

  let hx = ui.cx;
  let hy = ui.cy;
  let nullret: null | UiUpdate = null;

  const isMouse =
    button === LEFT_BUTTON || button === RIGHT_BUTTON || button === MIDDLE_BUTTON;

  if (isMouse) {
    const gx = Math.floor((p.x - b) / ts);
    const gy = Math.floor((p.y - b) / ts);
    if (p.x >= b && gx < w2 && p.y >= b && gy < h2 && gx >= 0 && gy >= 0) {
      hx = gx;
      hy = gy;
      if (ui.cursor) {
        ui.cursor = false;
        nullret = UI_UPDATE;
      }
    } else {
      return null;
    }
  }

  // Keyboard cursor movement (clamped, no wrap). An edge no-op leaves
  // (cx, cy) but still reveals the cursor and repaints, as before.
  if (isCursorMove(button)) {
    const moved = gridCursorMove(button, ui.cx, ui.cy, w2, h2);
    if (moved) {
      ui.cx = moved.x;
      ui.cy = moved.y;
    }
    ui.cursor = true;
    return UI_UPDATE;
  }

  // Placement: a marking key while the cursor is shown, or any mouse click.
  const isKeyPlace =
    ui.cursor &&
    (button === CURSOR_SELECT ||
      button === CURSOR_SELECT2 ||
      button === 8 ||
      button === 48 ||
      button === 49 ||
      button === 50);

  if (isKeyPlace || isMouse) {
    const i = hy * w2 + hx;
    if (state.immutable[i]) return nullret;
    const value = decideValue(button, state.grid[i] as Cell);
    if (value === null || state.grid[i] === value) return nullret; // no-op
    return { type: "place", x: hx, y: hy, value };
  }

  return nullret;
}

function flashLength(
  oldState: UnrulyState,
  newState_: UnrulyState,
  _dir: number,
  _ui: UnrulyUi,
): number {
  return winFlash(oldState, newState_, FLASH_TIME);
}

// --- hint -----------------------------------------------------------------

/** Highlight data for an Unruly hint step. `target` is the cell the
 * deduction forces (filled `COL_HINT` with a preview of the forced colour).
 * `area` cells are the deduction's other forced cells — the journey's
 * siblings — light-shaded `COL_HINT_CELL` *where still empty*, so the player
 * sees the whole "this line fills" deduction at a glance. `ring` cells are
 * **filled** premise cells whose colour is the evidence (the same-colour
 * pair, the completed quota, the near-complete reserved window); a light
 * shade would hide the colour that *is* the reason, so they are ringed in
 * `COL_HINT` instead. */
export interface UnrulyHint {
  target: { x: number; y: number; value: Cell };
  area: number[];
  ring: number[];
}

const colourName = (c: number): string => (c === ONE ? "black" : "white");

/** Every cell index of a row (`horizontal`) or column. */
function lineCells(
  line: number,
  horizontal: boolean,
  w2: number,
  h2: number,
): number[] {
  const n = horizontal ? w2 : h2;
  const out: number[] = [];
  for (let j = 0; j < n; j++) out.push(horizontal ? line * w2 + j : j * w2 + line);
  return out;
}

/** Narrate *why* the move is forced, per the deduction technique, so the
 * words match the highlighted evidence — the fork's explain-why bar. */
function narrate(reason: HintReason): string {
  const line = reason.kind === "threes" ? "" : reason.horizontal ? "row" : "column";
  switch (reason.kind) {
    case "threes": {
      const c = colourName(reason.colour);
      return `Two of these three cells are already ${c}; a third ${c} would make three in a row, which isn't allowed — so this cell must be ${colourName(reason.colour === ONE ? ZERO : ONE)}.`;
    }
    case "complete":
      return `This ${line} already holds all of its ${colourName(reason.full)} cells, so every remaining cell in it must be ${colourName(reason.fill)}.`;
    case "unique":
      return `A full ${line} already matches this one everywhere it is filled except this cell; making this cell ${colourName(reason.fill === ONE ? ZERO : ONE)} would make the two ${line}s identical, which the unique-rows variant forbids — so it must be ${colourName(reason.fill)}.`;
    case "nearcomplete":
      return `Only one ${colourName(reason.fill === ONE ? ZERO : ONE)} cell is left to place in this ${line}; anywhere but the ringed cells would force three ${colourName(reason.fill)} in a row, so every other empty cell must be ${colourName(reason.fill)}.`;
  }
}

/** Build the highlight payload for a forced move from its reason: the
 * evidence to shade (siblings) and to ring (filled premise cells). */
function buildHighlights(
  reason: HintReason,
  target: { x: number; y: number; value: Cell },
  state: UnrulyState,
): UnrulyHint {
  const { w2, h2, grid } = state;
  const ti = target.y * w2 + target.x;
  const notTarget = (i: number) => i !== ti;

  switch (reason.kind) {
    case "threes":
      return { target, area: [], ring: [...reason.refs] };
    case "complete": {
      const cells = lineCells(reason.line, reason.horizontal, w2, h2);
      return {
        target,
        // Other empty cells of the line are the journey's siblings; the
        // already-placed `full` cells are the quota evidence — ring them.
        area: cells.filter((i) => notTarget(i) && grid[i] === EMPTY),
        ring: cells.filter((i) => grid[i] === reason.full),
      };
    }
    case "unique": {
      const rowA = lineCells(reason.rowA, reason.horizontal, w2, h2);
      const rowB = lineCells(reason.rowB, reason.horizontal, w2, h2);
      return {
        target,
        area: rowB.filter((i) => notTarget(i) && grid[i] === EMPTY),
        ring: rowA, // the full reference row that would be duplicated
      };
    }
    case "nearcomplete": {
      const cells = lineCells(reason.line, reason.horizontal, w2, h2);
      const ring =
        reason.anchor >= 0 ? [...reason.window, reason.anchor] : [...reason.window];
      const windowSet = new Set(reason.window);
      return {
        target,
        area: cells.filter(
          (i) => notTarget(i) && grid[i] === EMPTY && !windowSet.has(i),
        ),
        ring,
      };
    }
  }
}

function hint(state: UnrulyState): HintResult<UnrulyMove, UnrulyHint> {
  if (state.completed) return { ok: false, error: "This board is already solved." };
  if (findMistakes(state).length > 0) {
    return {
      ok: false,
      error:
        "Fix the highlighted mistakes first — a hint can't deduce from a wrong board.",
    };
  }
  const plan = deduceHintPlan(state);
  if (plan.length === 0) {
    return { ok: false, error: "No further move can be deduced from this position." };
  }
  const steps: HintStep<UnrulyMove, UnrulyHint>[] = plan.map((m) => {
    const value = m.value as Cell;
    const x = m.index % state.w2;
    const y = Math.floor(m.index / state.w2);
    const target = { x, y, value };
    return {
      move: { type: "place", x, y, value },
      explanation: narrate(m.reason),
      highlights: buildHighlights(m.reason, target, state),
      continuesPrevious: m.continuesPrevious,
    };
  });
  return { ok: true, steps };
}

/** A move completes the hint step iff it sets the hinted cell to the hinted
 * value; anything else drops the plan to recompute. */
function hintKeepTrack(
  m: UnrulyMove,
  step: HintStep<UnrulyMove, UnrulyHint>,
  _state: UnrulyState,
): HintTrackVerdict {
  if (m.type !== "place") return "off";
  const t = step.highlights?.target;
  if (!t) return "off";
  if (m.x !== t.x || m.y !== t.y) return "off";
  return m.value === t.value ? "completed" : "off";
}

/** Animate a placement that changes exactly one cell (so `solve`'s bulk fill
 * and no-ops stay instant); the midend stretches this to the uniform
 * hint-step duration, so auto-hint reads as continuous fills. */
function animLength(
  oldState: UnrulyState,
  newState_: UnrulyState,
  _dir: number,
  _ui: UnrulyUi,
): number {
  let changed = 0;
  const g0 = oldState.grid;
  const g1 = newState_.grid;
  for (let i = 0; i < g0.length; i++) {
    if (g0[i] !== g1[i] && ++changed > 1) return 0;
  }
  return changed === 1 ? PLACE_ANIM_TIME : 0;
}

export const unrulyGame: Game<
  UnrulyParams,
  UnrulyState,
  UnrulyMove,
  UnrulyUi,
  UnrulyDrawState,
  UnrulyMistake
> = {
  id: "unruly",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  describeParams: (p) => ({
    width: String(p.w2),
    height: String(p.h2),
    difficulty: p.diff,
    "unique-rows-and-columns": p.unique,
  }),

  newDesc: (p, rng) => newDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve(orig) {
    const grid = solveToString(orig);
    if (!grid) return { ok: false, error: "No solution found" };
    return { ok: true, move: { type: "solve", grid } };
  },

  hint,
  hintKeepTrack,
  findMistakes,

  textFormat,

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: UnrulyParams, ts: number): Size => computeSize(p, ts),
  setTileSize: (ds, ts) => {
    ds.tilesize = ts;
  },
  newDrawState,
  redraw,

  animLength,
  flashLength,
};

registerGame(unrulyGame);
