import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import { type Game, UI_UPDATE, type UiUpdate } from "../../engine/game.ts";
import { fromCoord } from "../../engine/geometry.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { dimensionParamConfig, parseConfigInt } from "../../engine/params.ts";
import { registerGame } from "../../engine/registry.ts";
import {
  colours,
  computeSize,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type SamegameDrawState,
  setTileSize,
} from "./render.ts";
import {
  check,
  decodeParams,
  defaultParams,
  encodeParams,
  newDesc,
  newState,
  npoints,
  presets,
  type SamegameMove,
  type SamegameParams,
  type SamegameState,
  type SamegameUi,
  snuggle,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

const FLASH_FRAME = 0.13;

// --- UI / selection ---------------------------------------------------

function newUi(state: SamegameState): SamegameUi {
  return {
    selected: new Array<boolean>(state.w * state.h).fill(false),
    nselected: 0,
    xsel: 0,
    ysel: 0,
    displaySel: false,
  };
}

/** Upstream `sel_clear`. */
function selClear(ui: SamegameUi): void {
  ui.selected.fill(false);
  ui.nselected = 0;
}

/** Upstream `game_changed_state` → `sel_clear`: the picked region resets
 * across every real transition (design D2). */
function changedState(
  ui: SamegameUi,
  _old: SamegameState | null,
  _new: SamegameState,
): void {
  selClear(ui);
}

/** Upstream `sel_expand`: flood the connected same-colour region from
 * (tx,ty) into the selection. A lone tile (region size 1) cannot be
 * removed, so the selection collapses. */
function selExpand(ui: SamegameUi, state: SamegameState, tx: number, ty: number): void {
  const { w, h, tiles } = state;
  const c = tiles[ty * w + tx];
  const start = ty * w + tx;
  ui.selected[start] = true;
  const queue = [start];
  let qi = 0;
  let ns = 1;
  while (qi < queue.length) {
    const k = queue[qi++];
    const x = k % w;
    const y = Math.floor(k / w);
    const tryCell = (nx: number, ny: number) => {
      const ni = ny * w + nx;
      if (!ui.selected[ni] && tiles[ni] === c) {
        ui.selected[ni] = true;
        ns++;
        queue.push(ni);
      }
    };
    if (x > 0) tryCell(x - 1, y);
    if (x + 1 < w) tryCell(x + 1, y);
    if (y > 0) tryCell(x, y - 1);
    if (y + 1 < h) tryCell(x, y + 1);
  }
  if (ns > 1) ui.nselected = ns;
  else selClear(ui);
}

/** Upstream `sel_movedesc`: collect the selected indices into a `remove`
 * move and clear the selection. */
function selMovedesc(ui: SamegameUi): SamegameMove {
  const tiles: number[] = [];
  for (let i = 0; i < ui.selected.length; i++) if (ui.selected[i]) tiles.push(i);
  selClear(ui);
  return { type: "remove", tiles };
}

/** Wrapping keyboard cursor (upstream `move_cursor(..., wrap=true)`). */
function moveCursor(
  ui: SamegameUi,
  button: number,
  w: number,
  h: number,
): UiUpdate | null {
  // Cursor wraps toroidally on this board.
  const moved = gridCursorMove(button, ui.xsel, ui.ysel, w, h, true);
  const changed = moved !== null;
  if (moved) {
    ui.xsel = moved.x;
    ui.ysel = moved.y;
  }
  if (!ui.displaySel) {
    ui.displaySel = true;
    return UI_UPDATE;
  }
  return changed ? UI_UPDATE : null;
}

// --- input ------------------------------------------------------------

function interpretMove(
  state: SamegameState,
  ui: SamegameUi,
  ds: SamegameDrawState | null,
  p: Point,
  rawButton: number,
): SamegameMove | null | UiUpdate {
  const { w, h } = state;
  const button = stripModifiers(rawButton);
  let tx: number;
  let ty: number;

  if (button === RIGHT_BUTTON || button === LEFT_BUTTON) {
    ui.displaySel = false;
    const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
    const bd = Math.floor(ts / 2);
    tx = fromCoord(p.x, ts, bd);
    ty = fromCoord(p.y, ts, bd);
  } else if (isCursorMove(button)) {
    return moveCursor(ui, button, w, h);
  } else if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    ui.displaySel = true;
    tx = ui.xsel;
    ty = ui.ysel;
  } else {
    return null;
  }

  if (tx < 0 || tx >= w || ty < 0 || ty >= h) return null;
  if (state.tiles[ty * w + tx] === 0) return null; // empty tile: no effect

  if (ui.selected[ty * w + tx]) {
    if (button === RIGHT_BUTTON || button === CURSOR_SELECT2) {
      selClear(ui);
      return UI_UPDATE;
    }
    return selMovedesc(ui);
  }
  selClear(ui); // might be a no-op
  selExpand(ui, state, tx, ty);
  return UI_UPDATE;
}

// --- move execution ---------------------------------------------------

export function executeMove(state: SamegameState, move: SamegameMove): SamegameState {
  const { w, h } = state;
  const area = w * h;
  const tiles = state.tiles.slice();
  let n = 0;
  for (const idx of move.tiles) {
    if (idx < 0 || idx >= area) throw new Error(`Move index ${idx} out of range`);
    n++;
    tiles[idx] = 0;
  }
  const score = state.score + npoints(state.scoresub, n);
  snuggle(tiles, w, h); // shift blanks down and to the left
  const { complete, impossible } = check(tiles, w, h);
  return { ...state, tiles, score, complete, impossible };
}

// --- status bar -------------------------------------------------------

function statusbarText(state: SamegameState, ui: SamegameUi): string {
  const score = `Score: ${state.score}`;
  if (state.complete) return `COMPLETE! ${score}`;
  if (state.impossible) return `Cannot move! ${score}`;
  if (ui.nselected)
    return `${score}  Selected: ${ui.nselected} (${npoints(state.scoresub, ui.nselected)})`;
  return score;
}

// --- flash ------------------------------------------------------------

function flashLength(
  oldState: SamegameState,
  newState: SamegameState,
  _dir: number,
  _ui: SamegameUi,
): number {
  if (
    (!oldState.complete && newState.complete) ||
    (!oldState.impossible && newState.impossible)
  )
    return 2 * FLASH_FRAME;
  return 0;
}

// --- Game object ------------------------------------------------------

export const samegameGame: Game<
  SamegameParams,
  SamegameState,
  SamegameMove,
  SamegameUi,
  SamegameDrawState
> = {
  id: "samegame",
  wantsStatusbar: true,
  isTimed: false,
  canSolve: false,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig: [
    ...dimensionParamConfig<SamegameParams>(),
    {
      kw: "no-of-colours",
      name: "No. of colours",
      type: "string",
      get: (p) => String(p.ncols),
      set: (p, v) => {
        p.ncols = parseConfigInt(v);
      },
    },
    {
      // Upstream C_CHOICES: `scoresub = selected + 1` (index 0 = "(n-1)²",
      // index 1 = "(n-2)²"), mirroring describeParams' `scoresub - 1`.
      kw: "scoring-system",
      name: "Scoring system",
      type: "choices",
      choices: ["(n-1)²", "(n-2)²"],
      get: (p) => p.scoresub - 1,
      set: (p, v) => {
        p.scoresub = v + 1;
      },
    },
    {
      kw: "ensure-solubility",
      name: "Ensure solubility",
      type: "boolean",
      get: (p) => p.soluble,
      set: (p, v) => {
        p.soluble = v;
      },
    },
  ],
  describeParams: (p) => ({
    "no-of-colours": String(p.ncols),
    // C_CHOICES `selected = scoresub - 1` (0 = "(n-1)^2", 1 = "(n-2)^2").
    "scoring-system": p.scoresub - 1,
    "ensure-solubility": p.soluble,
  }),

  newDesc: (p, rng) => newDesc(p, rng),
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status,

  textFormat,
  statusbarText,

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: SamegameParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(samegameGame);
