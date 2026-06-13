/**
 * Palisade — native TS port of `palisade.c` (Nikoli's "Five Cells").
 * Numeric clues count the walls around a cell; the player draws walls
 * so the grid divides into connected regions of exactly `k` cells, each
 * clue equal to its cell's wall count.
 *
 * Edges are three-valued (wall / no-wall-mark / unknown) and shared
 * between two cells, so each edit records both sides; input picks the
 * edge nearest the click (left toggles wall, right toggles no-wall mark)
 * and there is a half-grid keyboard cursor.
 */
import type { Colour, ConfigValues, Point, Size } from "../../../puzzle/types.ts";
import { type Game, UI_UPDATE, type UiUpdate } from "../../engine/game.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  cursorDelta,
  LEFT_BUTTON,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import {
  colours,
  computeSize,
  FLASH_TIME,
  fromCoord,
  margin,
  newDrawState,
  type PalisadeDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
} from "./render.ts";
import { newDesc, solveToBorders } from "./solver.ts";
import {
  BORDER,
  BORDER_MASK,
  DISABLED,
  DX,
  DY,
  decodeParams,
  defaultParams,
  encodeParams,
  executeMove,
  FLIP,
  newState,
  outOfBounds,
  type PalisadeMistake,
  type PalisadeMove,
  type PalisadeParams,
  type PalisadeState,
  type PalisadeUi,
  presets,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

const MOD_MASK = 0x7800;

// Edge states for the click toggle cycle.
const MAYBE = 0;
const YES = 1;
const NO = 2;

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(Math.max(v, lo), hi);

function newUi(_state: PalisadeState): PalisadeUi {
  return { x: 1, y: 1, show: false };
}

function paramsOf(state: PalisadeState): PalisadeParams {
  return { w: state.w, h: state.h, k: state.k };
}

// --- input -----------------------------------------------------------------

function interpretMove(
  state: PalisadeState,
  ui: PalisadeUi,
  ds: PalisadeDrawState | null,
  p: Point,
  rawButton: number,
): PalisadeMove | null | UiUpdate {
  const { w, h, borders } = state;
  const button = rawButton & ~MOD_MASK;
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;

  if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
    const gx = fromCoord(p.x, ts);
    const gy = fromCoord(p.y, ts);
    if (outOfBounds(gx, gy, w, h)) return null;

    // Find the edge of cell (gx,gy) closest to the click.
    let possible = BORDER_MASK;
    let px = (p.x - margin(ts)) % ts;
    let py = (p.y - margin(ts)) % ts;
    possible &= ~(2 * px < ts ? BORDER(1) : BORDER(3)); // R : L
    possible &= ~(2 * py < ts ? BORDER(2) : BORDER(0)); // D : U
    px = Math.min(px, ts - px);
    py = Math.min(py, ts - py);
    possible &= ~(px < py ? BORDER(0) | BORDER(2) : BORDER(3) | BORDER(1));

    let dir = 0;
    for (; dir < 4 && BORDER(dir) !== possible; dir++);
    if (dir === 4) return null; // not exactly one edge

    ui.x = clamp(2 * gx + 1 + DX[dir], 1, 2 * w - 1);
    ui.y = clamp(2 * gy + 1 + DY[dir], 1, 2 * h - 1);

    const hx = gx + DX[dir];
    const hy = gy + DY[dir];
    if (outOfBounds(hx, hy, w, h)) return null;

    ui.show = false;

    const i = gy * w + gx;
    const cur =
      borders[i] & BORDER(dir) ? YES : borders[i] & DISABLED(BORDER(dir)) ? NO : MAYBE;
    const next =
      button === LEFT_BUTTON ? (cur === YES ? MAYBE : YES) : cur === NO ? MAYBE : NO;

    let gdiff = 0;
    if ((cur === YES) !== (next === YES)) gdiff |= BORDER(dir);
    if ((cur === NO) !== (next === NO)) gdiff |= DISABLED(BORDER(dir));
    if (gdiff === 0) return null;

    const hdiff =
      ((gdiff >> dir) << FLIP(dir)) | ((gdiff >> (dir + 4)) << (FLIP(dir) + 4));
    return {
      type: "edges",
      edits: [
        { x: gx, y: gy, flag: gdiff },
        { x: hx, y: hy, flag: hdiff },
      ],
    };
  }

  const d = cursorDelta(button);
  if (d) {
    ui.show = true;
    ui.x = clamp(ui.x + d.dx, 1, 2 * w - 1);
    ui.y = clamp(ui.y + d.dy, 1, 2 * h - 1);
    return UI_UPDATE;
  }

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    const px = ui.x % 2;
    const py = ui.y % 2;
    const gx = Math.floor(ui.x / 2);
    const gy = Math.floor(ui.y / 2);
    const dir = px === 0 ? 3 : 0; // left : up
    const hx = gx + DX[dir];
    const hy = gy + DY[dir];
    const i = gy * w + gx;

    if (!ui.show) {
      ui.show = true;
      return UI_UPDATE;
    }
    if (px === py) return null; // a corner or centre: no edge

    const sel2 = button === CURSOR_SELECT2 ? 1 : 0;
    const key =
      sel2 |
      (((borders[i] & BORDER(dir)) >> dir) << 1) |
      (((borders[i] & DISABLED(BORDER(dir))) >> dir) >> 2);

    // key: MAYBE_LEFT=0, MAYBE_RIGHT=1, ON_LEFT=2, ON_RIGHT=3, OFF_LEFT=4, OFF_RIGHT=5
    if (key === 0 || key === 2 || key === 3) {
      return {
        type: "edges",
        edits: [
          { x: gx, y: gy, flag: BORDER(dir) },
          { x: hx, y: hy, flag: BORDER(FLIP(dir)) },
        ],
      };
    }
    return {
      type: "edges",
      edits: [
        { x: gx, y: gy, flag: DISABLED(BORDER(dir)) },
        { x: hx, y: hy, flag: DISABLED(BORDER(FLIP(dir))) },
      ],
    };
  }

  return null;
}

// --- flash -----------------------------------------------------------------

function flashLength(
  oldState: PalisadeState,
  newState_: PalisadeState,
  _dir: number,
  _ui: PalisadeUi,
): number {
  if (newState_.completed && !newState_.cheated && !oldState.completed)
    return FLASH_TIME;
  return 0;
}

// --- mistakes --------------------------------------------------------------

function findMistakes(state: PalisadeState): readonly PalisadeMistake[] {
  const sol = solveToBorders(paramsOf(state), state.clues);
  if (!sol) return [];
  const { w, h, borders } = state;
  const out: PalisadeMistake[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      for (let dir = 0; dir < 4; dir++) {
        const b = BORDER(dir);
        const solWall = sol[i] & b;
        if (borders[i] & b && !solWall) out.push({ x, y, dir });
        else if (borders[i] & DISABLED(b) && solWall) out.push({ x, y, dir });
      }
    }
  }
  return out;
}

// --- Game object -----------------------------------------------------------

export const palisadeGame: Game<
  PalisadeParams,
  PalisadeState,
  PalisadeMove,
  PalisadeUi,
  PalisadeDrawState,
  PalisadeMistake
> = {
  id: "palisade",
  wantsStatusbar: true,
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
    "region-size": String(p.k),
  }),

  newDesc: (p, rng) => newDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve(orig, _curr) {
    const sol = solveToBorders(paramsOf(orig), orig.clues);
    if (!sol) return { ok: false, error: "Sorry, I can't solve this puzzle" };
    const full = Array.from(sol, (b) => (b & BORDER_MASK) | DISABLED(~b & BORDER_MASK));
    return { ok: true, move: { type: "solve", borders: full } };
  },

  findMistakes,

  textFormat,
  statusbarText: (s) => `Region size: ${s.k}`,

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: PalisadeParams, ts: number): Size => computeSize(p, ts),
  setTileSize: (ds, ts) => {
    ds.tilesize = ts;
  },
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(palisadeGame);
