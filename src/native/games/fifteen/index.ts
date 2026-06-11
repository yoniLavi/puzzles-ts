import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type {
  Game,
  GameDrawing,
  HintResult,
  HintStep,
  UiUpdate,
} from "../../engine/game.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_UP,
  LEFT_BUTTON,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import { computeHint } from "./solver.ts";
import {
  decodeParams,
  defaultParams,
  encodeParams,
  type FifteenMove,
  type FifteenParams,
  type FifteenState,
  type FifteenUi,
  isCompletedTiles,
  newDesc,
  newState,
  presets,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

// --- constants --------------------------------------------------------

const PREFERRED_TILE_SIZE = 48;
const ANIM_TIME = 0.13;
const FLASH_FRAME = 0.13;
const HIGHLIGHT_WIDTH_DIV = 20;

// Button-modifier mask (ctrl/shift/numeric-keypad bits), stripped before
// dispatch — matches upstream `STRIP_BUTTON_MODIFIERS`.
const MOD_MASK = 0x7800;

// --- colour indices ---------------------------------------------------

const COL_BACKGROUND = 0;
const COL_TEXT = 1;
const COL_HIGHLIGHT = 2;
const COL_LOWLIGHT = 3;
const COL_HINT = 4;

// --- hint highlights --------------------------------------------------

/** Highlight data for a Fifteen hint step: the tile that should slide
 * into the gap. The renderer fills that tile's cell with `COL_HINT`. */
export interface FifteenHintHighlights {
  tile: number;
}

// --- coordinate helpers -----------------------------------------------

function border(ts: number): number {
  return Math.floor(ts / 2);
}

function coord(pos: number, ts: number): number {
  return pos * ts + border(ts);
}

function fromCoord(pixel: number, ts: number): number {
  return Math.floor((pixel - border(ts) + ts) / ts) - 1;
}

// --- move logic -------------------------------------------------------

export function executeMove(state: FifteenState, move: FifteenMove): FifteenState {
  const { w, h, n } = state;

  if (move.type === "solve") {
    const tiles = new Int32Array(n);
    for (let i = 0; i < n; i++) tiles[i] = (i + 1) % n;
    // Upstream snaps movecount and completed to 1 (Solve resets to a
    // clean solved board to practise from; "Moves since auto-solve: 0").
    return {
      ...state,
      tiles,
      gapPos: n - 1,
      usedSolve: true,
      completed: 1,
      moveCount: 1,
    };
  }

  const { x: dx, y: dy } = move;
  const gx = state.gapPos % w;
  const gy = Math.floor(state.gapPos / w);

  if (
    dx < 0 ||
    dx >= w ||
    dy < 0 ||
    dy >= h ||
    (dx === gx) === (dy === gy) // must share exactly one coordinate
  ) {
    throw new Error(`Illegal fifteen move to (${dx}, ${dy})`);
  }

  // Unit step from the old gap toward the destination, and its flat
  // stride.
  const ux = dx < gx ? -1 : dx > gx ? +1 : 0;
  const uy = dy < gy ? -1 : dy > gy ? +1 : 0;
  const up = uy * w + ux;

  const tiles = new Int32Array(state.tiles);
  const newGap = dy * w + dx;
  tiles[newGap] = 0;

  let moveCount = state.moveCount;
  for (let p = state.gapPos; p !== newGap; p += up) {
    tiles[p] = state.tiles[p + up];
    moveCount++;
  }

  let completed = state.completed;
  if (!completed && isCompletedTiles(tiles, n)) completed = moveCount;

  return { ...state, tiles, gapPos: newGap, moveCount, completed };
}

// --- UI / input -------------------------------------------------------

function newUi(_state: FifteenState): FifteenUi {
  return { invertCursor: false };
}

function isCursorMove(button: number): boolean {
  return button >= CURSOR_UP && button <= CURSOR_RIGHT;
}

function flipCursor(button: number): number {
  switch (button) {
    case CURSOR_UP:
      return CURSOR_DOWN;
    case CURSOR_DOWN:
      return CURSOR_UP;
    case CURSOR_LEFT:
      return CURSOR_RIGHT;
    case CURSOR_RIGHT:
      return CURSOR_LEFT;
    default:
      return 0;
  }
}

/** Move (x, y) one cell in the given cursor direction, clamped to the
 * board (no wrap) — upstream `move_cursor(..., wrap=false)`. */
function moveCursorClamped(
  button: number,
  x: number,
  y: number,
  w: number,
  h: number,
): { x: number; y: number } {
  let nx = x;
  let ny = y;
  if (button === CURSOR_UP) ny--;
  else if (button === CURSOR_DOWN) ny++;
  else if (button === CURSOR_LEFT) nx--;
  else if (button === CURSOR_RIGHT) nx++;
  nx = Math.max(0, Math.min(w - 1, nx));
  ny = Math.max(0, Math.min(h - 1, ny));
  return { x: nx, y: ny };
}

function interpretMove(
  state: FifteenState,
  ui: FifteenUi,
  ds: FifteenDrawState | null,
  p: Point,
  button: number,
): FifteenMove | null | UiUpdate {
  const w = state.w;
  const h = state.h;
  const cx = state.gapPos % w;
  const cy = Math.floor(state.gapPos / w);
  let nx = cx;
  let ny = cy;

  const raw = button & ~MOD_MASK;

  if (raw === LEFT_BUTTON) {
    const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
    nx = fromCoord(p.x, ts);
    ny = fromCoord(p.y, ts);
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) return null; // out of bounds
  } else if (isCursorMove(raw)) {
    // Default arrow semantics: the pressed arrow moves a *tile* in that
    // direction, so the gap moves the opposite way (flip). The
    // (never-set) invertCursor preference would undo the flip.
    let b = flipCursor(raw);
    if (ui.invertCursor) b = flipCursor(b);
    ({ x: nx, y: ny } = moveCursorClamped(b, cx, cy, w, h));
  } else {
    return null;
  }

  // A legal target shares exactly one coordinate with the gap.
  if ((cx === nx) !== (cy === ny)) {
    return { type: "move", x: nx, y: ny };
  }
  return null;
}

// --- drawing ----------------------------------------------------------

interface FifteenDrawState {
  started: boolean;
  w: number;
  h: number;
  bgcolour: number;
  /** Per-cell cache of the last-drawn tile value; `-1` forces a redraw
   * (unknown, or animating). */
  tiles: Int32Array;
  tilesize: number;
  /** Tile value currently highlighted as a hint, or null. */
  hintTile: number | null;
}

function newDrawState(state: FifteenState): FifteenDrawState {
  return {
    started: false,
    w: state.w,
    h: state.h,
    bgcolour: COL_BACKGROUND,
    tiles: new Int32Array(state.n).fill(-1),
    tilesize: 0,
    hintTile: null,
  };
}

function computeSize(p: FifteenParams, ts: number): Size {
  const b = border(ts);
  return { w: ts * p.w + 2 * b, h: ts * p.h + 2 * b };
}

function colours(defaultBackground: Colour): Colour[] {
  const {
    background: bg,
    highlight: hi,
    lowlight: lo,
  } = mkhighlight(defaultBackground);
  const text: Colour = [0, 0, 0];
  const hint: Colour = [0.3, 0.5, 0.9];
  return [bg, text, hi, lo, hint];
}

function drawTile(
  dr: GameDrawing,
  ts: number,
  hw: number,
  x: number,
  y: number,
  tile: number,
  bgColour: number,
): void {
  if (tile === 0) {
    dr.drawRect({ x, y, w: ts, h: ts }, bgColour);
  } else {
    // Lowlight triangle (bottom-right).
    dr.drawPolygon(
      [
        { x: x + ts - 1, y: y + ts - 1 },
        { x: x + ts - 1, y },
        { x, y: y + ts - 1 },
      ],
      COL_LOWLIGHT,
      COL_LOWLIGHT,
    );
    // Highlight triangle (top-left).
    dr.drawPolygon(
      [
        { x, y },
        { x, y: y + ts - 1 },
        { x: x + ts - 1, y },
      ],
      COL_HIGHLIGHT,
      COL_HIGHLIGHT,
    );
    // Centre fill.
    dr.drawRect({ x: x + hw, y: y + hw, w: ts - 2 * hw, h: ts - 2 * hw }, bgColour);
    // Number.
    dr.drawText(
      { x: x + Math.floor(ts / 2), y: y + Math.floor(ts / 2) },
      { align: "center", baseline: "mathematical", fontType: "variable", size: ts / 3 },
      COL_TEXT,
      String(tile),
    );
  }
  dr.drawUpdate({ x, y, w: ts, h: ts });
}

function drawRecessedBorder(
  dr: GameDrawing,
  w: number,
  h: number,
  ts: number,
  hw: number,
): void {
  // Highlight bevel (top/right).
  dr.drawPolygon(
    [
      { x: coord(w, ts) + hw - 1, y: coord(h, ts) + hw - 1 },
      { x: coord(w, ts) + hw - 1, y: coord(0, ts) - hw },
      { x: coord(w, ts) + hw - 1 - ts, y: coord(0, ts) - hw + ts },
      { x: coord(0, ts) - hw + ts, y: coord(h, ts) + hw - 1 - ts },
      { x: coord(0, ts) - hw, y: coord(h, ts) + hw - 1 },
    ],
    COL_HIGHLIGHT,
    COL_HIGHLIGHT,
  );
  // Lowlight bevel (bottom/left).
  dr.drawPolygon(
    [
      { x: coord(0, ts) - hw, y: coord(0, ts) - hw },
      { x: coord(0, ts) - hw, y: coord(h, ts) + hw - 1 },
      { x: coord(0, ts) - hw + ts, y: coord(h, ts) + hw - 1 - ts },
      { x: coord(w, ts) + hw - 1 - ts, y: coord(0, ts) - hw + ts },
      { x: coord(w, ts) + hw - 1, y: coord(0, ts) - hw },
    ],
    COL_LOWLIGHT,
    COL_LOWLIGHT,
  );
}

function redraw(
  dr: GameDrawing,
  ds: FifteenDrawState | null,
  prev: FifteenState | null,
  state: FifteenState,
  _dir: number,
  _ui: FifteenUi,
  animTime: number,
  flashTime: number,
  activeHint?: HintStep<FifteenMove, FifteenHintHighlights>,
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { w, h, n } = state;
  const hw = Math.max(1, Math.floor(ts / HIGHLIGHT_WIDTH_DIV));

  let bgcolour = COL_BACKGROUND;
  if (flashTime > 0) {
    const frame = Math.floor(flashTime / FLASH_FRAME);
    bgcolour = frame % 2 ? COL_LOWLIGHT : COL_HIGHLIGHT;
  }

  if (!ds.started) {
    // The engine paints no pixels of its own: fill our own background
    // (the recessed border leaves a margin around the playfield).
    const size = computeSize({ w, h }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    drawRecessedBorder(dr, w, h, ts, hw);
    ds.started = true;
  }

  const hintTile = activeHint?.highlights?.tile ?? null;

  // Two passes so a whole sliding line animates cleanly: pass 0 blanks
  // the cells vacated by moving tiles, pass 1 draws the moving tiles
  // interpolated toward the gap.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      // A cell whose tile differs from the previous state is animating
      // (-1 = "always redraw"); otherwise it shows its settled value.
      let t = prev && prev.tiles[i] !== state.tiles[i] ? -1 : state.tiles[i];
      const t0 = t;

      if (
        ds.bgcolour !== bgcolour ||
        ds.hintTile !== hintTile ||
        ds.tiles[i] !== t ||
        ds.tiles[i] === -1 ||
        t === -1
      ) {
        let x: number;
        let y: number;

        if (t === -1) {
          if (pass === 0) {
            // Blank the vacated cell.
            x = coord(i % w, ts);
            y = coord(Math.floor(i / w), ts);
            t = 0;
          } else {
            t = state.tiles[i];
            // Don't draw the moving gap; just leave it blank.
            if (t === 0) continue;

            const x1 = coord(i % w, ts);
            const y1 = coord(Math.floor(i / w), ts);
            // Find where this tile was in the previous state.
            let j = 0;
            for (; j < (prev as FifteenState).n; j++) {
              if ((prev as FifteenState).tiles[j] === state.tiles[i]) break;
            }
            const x0 = coord(j % w, ts);
            const y0 = coord(Math.floor(j / w), ts);

            let c = animTime / ANIM_TIME;
            c = Math.max(0, Math.min(1, c));
            x = x0 + Math.floor(c * (x1 - x0));
            y = y0 + Math.floor(c * (y1 - y0));
          }
        } else {
          if (pass === 0) continue;
          x = coord(i % w, ts);
          y = coord(Math.floor(i / w), ts);
        }

        const cellBg = t !== 0 && t === hintTile ? COL_HINT : bgcolour;
        drawTile(dr, ts, hw, x, y, t, cellBg);
      }
      ds.tiles[i] = t0;
    }
  }

  ds.bgcolour = bgcolour;
  ds.hintTile = hintTile;
}

// --- status bar -------------------------------------------------------

function statusbarText(state: FifteenState, _ui: FifteenUi): string {
  if (state.usedSolve) {
    return `Moves since auto-solve: ${state.moveCount - state.completed}`;
  }
  const prefix = state.completed ? "COMPLETED! " : "";
  const moves = state.completed || state.moveCount;
  return `${prefix}Moves: ${moves}`;
}

// --- hint -------------------------------------------------------------

function hint(state: FifteenState): HintResult<FifteenMove, FifteenHintHighlights> {
  if (isCompletedTiles(state.tiles, state.n)) {
    return { ok: false, error: "Already solved" };
  }
  const dest = computeHint(state);
  if (!dest) return { ok: false, error: "No helpful hint found" };

  // The tile at the hinted destination cell is the one that slides into
  // the gap.
  const tile = state.tiles[dest.y * state.w + dest.x];
  const step: HintStep<FifteenMove, FifteenHintHighlights> = {
    move: { type: "move", x: dest.x, y: dest.y },
    explanation: `Slide tile ${tile} into the space`,
    highlights: { tile },
  };
  return { ok: true, steps: [step] };
}

// --- Game object ------------------------------------------------------

export const fifteenGame: Game<
  FifteenParams,
  FifteenState,
  FifteenMove,
  FifteenUi,
  FifteenDrawState
> = {
  id: "fifteen",
  wantsStatusbar: true,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,

  newDesc: (p, rng) => newDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve(_orig, _curr) {
    return { ok: true, move: { type: "solve" as const } };
  },

  hint,

  textFormat,
  statusbarText,

  colours,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize: (ds, ts) => {
    ds.tilesize = ts;
  },
  newDrawState,
  redraw,

  animLength: () => ANIM_TIME,
  flashLength: (oldState, newState) => {
    if (
      !oldState.completed &&
      newState.completed &&
      !oldState.usedSolve &&
      !newState.usedSolve
    )
      return 2 * FLASH_FRAME;
    return 0;
  },
};

registerGame(fifteenGame);
