/**
 * Netslide — Richard Boulton's cross between Net and Sixteen.
 *
 * The board is a Net wiring grid whose solved form is a spanning tree rooted at
 * the centre. Instead of rotating a tile, you slide a whole row or column, and
 * it wraps around. The centre row and centre column cannot be slid — that one
 * restriction is what turns a shuffle into a puzzle.
 *
 * There is no solver: the generator saves the unshuffled grid as `aux` and
 * `solve` replays it, faithful to upstream.
 */

import type { ConfigValues, GameStatus, Point } from "../../../puzzle/types.ts";
import type { Game, SolveResult } from "../../engine/game.ts";
import { UI_UPDATE, type UiUpdate } from "../../engine/game.ts";
import { dimensionParamConfig, parseConfigInt } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  isCursorMove,
  LEFT_BUTTON,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { RandomState } from "../../random/index.ts";
import { newDesc } from "./generator.ts";
import { netslideHint, netslideHintKeepTrack, parseAux } from "./hint.ts";
import { reconstructSolution } from "./reconstruct.ts";
import {
  ANIM_TIME,
  colours,
  computeSize,
  FLASH_FRAME,
  type NetslideDrawState,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import {
  atof,
  c2diff,
  c2pos,
  cloneState,
  computeActive,
  decodeParams,
  defaultParams,
  encodeParams,
  formatG,
  isComplete,
  type NetslideMove,
  type NetslideParams,
  type NetslideState,
  type NetslideUi,
  newState,
  newUi,
  pos2c,
  slideCol,
  slideRow,
  validateDesc,
  validateParams,
} from "./state.ts";

/** The 9 upstream presets. "Difficulty" is entirely a matter of how much help
 * the barriers give: at probability 1 every wall the solution permits is drawn
 * in, which pins most tiles; at 0 you get none; wrapping removes the border
 * walls too, which is harder again. */
const PRESETS: NetslideParams[] = [
  { w: 3, h: 3, wrapping: false, barrierProbability: 1, movetarget: 0 },
  { w: 3, h: 3, wrapping: false, barrierProbability: 0, movetarget: 0 },
  { w: 3, h: 3, wrapping: true, barrierProbability: 0, movetarget: 0 },
  { w: 4, h: 4, wrapping: false, barrierProbability: 1, movetarget: 0 },
  { w: 4, h: 4, wrapping: false, barrierProbability: 0, movetarget: 0 },
  { w: 4, h: 4, wrapping: true, barrierProbability: 0, movetarget: 0 },
  { w: 5, h: 5, wrapping: false, barrierProbability: 1, movetarget: 0 },
  { w: 5, h: 5, wrapping: false, barrierProbability: 0, movetarget: 0 },
  { w: 5, h: 5, wrapping: true, barrierProbability: 0, movetarget: 0 },
];

function presetTitle(p: NetslideParams): string {
  const difficulty = p.wrapping
    ? "hard"
    : p.barrierProbability === 1
      ? "easy"
      : "medium";
  return `${p.w}x${p.h} ${difficulty}`;
}

/* ----------------------------------------------------------------------
 * Moves.
 */

function executeMove(s: NetslideState, m: NetslideMove): NetslideState {
  if (m.type === "solve") {
    if (m.tiles.length !== s.w * s.h) throw new Error("solve move has the wrong size");
    return {
      ...cloneState(s),
      tiles: Uint8Array.from(m.tiles),
      usedSolve: true,
      completed: 1,
      moveCount: 1,
      // Upstream leaves the previous move's line here, so Solve animates a
      // phantom slide of the finished grid. Clearing it is a small deliberate
      // improvement (the byte-parity bar covers the generator, not the
      // display — playbook §4 intro): Solve simply shows the answer.
      lastMoveRow: -1,
      lastMoveCol: -1,
      lastMoveDir: 0,
    };
  }

  const limit = m.axis === "col" ? s.w : s.h;
  if (m.index < 0 || m.index >= limit) throw new Error(`no such ${m.axis} ${m.index}`);

  const next = cloneState(s);
  if (m.axis === "col") slideCol(s.w, s.h, next.tiles, m.dir, m.index);
  else slideRow(s.w, next.tiles, m.dir, m.index);

  const moveCount = s.moveCount + 1;
  const slid: NetslideState = {
    ...next,
    moveCount,
    lastMoveRow: m.axis === "col" ? -1 : m.index,
    lastMoveCol: m.axis === "col" ? m.index : -1,
    lastMoveDir: m.dir,
  };

  if (slid.completed) return slid;
  return isComplete(slid) ? { ...slid, completed: moveCount } : slid;
}

/**
 * A click in the gutter beside a row or column slides that line; the **right
 * button reverses** the direction. A click beside the centre row or centre
 * column does nothing — those lines cannot be slid.
 *
 * The keyboard cursor walks the ring of arrow positions and select slides the
 * line it is on. (As upstream, `CURSOR_SELECT2` does *not* reverse — only the
 * real right mouse button does.)
 */
function interpretMove(
  s: NetslideState,
  ui: NetslideUi,
  ds: NetslideDrawState | null,
  p: Point,
  rawButton: number,
): NetslideMove | null | UiUpdate {
  const button = stripModifiers(rawButton);
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;

  if (isCursorMove(button)) {
    const diff = c2diff(s.w, s.h, ui.curX, ui.curY, button);
    if (diff !== 0) {
      let pos = c2pos(s.w, s.h, ui.curX, ui.curY);
      // Step along the ring until we land on a line that can actually be slid.
      do {
        pos += diff;
        const c = pos2c(s.w, s.h, pos);
        ui.curX = c.cx;
        ui.curY = c.cy;
      } while (ui.curX === s.cx || ui.curY === s.cy);
    }
    ui.curVisible = true;
    return UI_UPDATE;
  }

  let cx: number;
  let cy: number;

  if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
    // The gutter cells are indices −1 and w (resp. h); the `+2 … −2` shuffle
    // keeps the division positive so it truncates the way C's does.
    const b = Math.floor((3 * ts) / 4) + 1; // BORDER, NARROW_BORDERS variant
    cx = Math.floor((p.x - (b + 1) + 2 * ts) / ts) - 2;
    cy = Math.floor((p.y - (b + 1) + 2 * ts) / ts) - 2;
    ui.curVisible = false;
  } else if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    if (!ui.curVisible) {
      // A select with no cursor showing just reveals it.
      ui.curVisible = true;
      return UI_UPDATE;
    }
    cx = ui.curX;
    cy = ui.curY;
  } else {
    return null;
  }

  let dx: number;
  let dy: number;

  if (cy >= 0 && cy < s.h && cy !== s.cy) {
    // Beside a row: the left gutter slides it left, the right gutter right.
    if (cx === -1) dx = +1;
    else if (cx === s.w) dx = -1;
    else return null;
    dy = 0;
  } else if (cx >= 0 && cx < s.w && cx !== s.cx) {
    // Beside a column: the top gutter slides it up, the bottom gutter down.
    if (cy === -1) dy = +1;
    else if (cy === s.h) dy = -1;
    else return null;
    dx = 0;
  } else {
    return null;
  }

  if (button === RIGHT_BUTTON) {
    dx = -dx;
    dy = -dy;
  }

  return dx === 0
    ? { type: "slide", axis: "col", index: cx, dir: dy as 1 | -1 }
    : { type: "slide", axis: "row", index: cy, dir: dx as 1 | -1 };
}

/* ----------------------------------------------------------------------
 * The Game.
 */

export const netslideGame: Game<
  NetslideParams,
  NetslideState,
  NetslideMove,
  NetslideUi,
  NetslideDrawState
> = {
  id: "netslide",
  wantsStatusbar: true,
  isTimed: false,
  canSolve: true,
  canFormatAsText: false,

  defaultParams,
  presets: () => ({
    title: "Netslide",
    submenu: PRESETS.map((p) => ({ title: presetTitle(p), params: { ...p } })),
  }),
  encodeParams,
  decodeParams,
  validateParams,

  describeParams: (p): ConfigValues => ({
    width: String(p.w),
    height: String(p.h),
    "walls-wrap-around": p.wrapping,
    "barrier-probability": p.barrierProbability,
    "number-of-shuffling-moves": p.movetarget,
  }),

  paramConfig: [
    ...dimensionParamConfig<NetslideParams>(),
    {
      kw: "walls-wrap-around",
      name: "Walls wrap around",
      type: "boolean",
      get: (p) => p.wrapping,
      set: (p, v) => {
        p.wrapping = v;
      },
    },
    {
      kw: "barrier-probability",
      name: "Barrier probability",
      type: "string",
      get: (p) => formatG(p.barrierProbability),
      // The C stores this as a `float`, and the board depends on the exact
      // value, so round to single precision here rather than at generation.
      set: (p, v) => {
        p.barrierProbability = Math.fround(atof(v));
      },
    },
    {
      kw: "number-of-shuffling-moves",
      name: "Number of shuffling moves",
      type: "string",
      get: (p) => String(p.movetarget),
      set: (p, v) => {
        p.movetarget = parseConfigInt(v);
      },
    },
  ],

  newDesc: (p: NetslideParams, rng: RandomState) => newDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,

  // The midend upgrades this to "solved-with-help" when Solve was used.
  status: (s): GameStatus => (s.completed ? "solved" : "ongoing"),

  // Netslide has no solver, so the answer is the generator's unshuffled grid.
  // A game that arrived as a shared link or a bookmark carries no `aux`, and
  // upstream simply gives up on those; we recover the finished grid from the
  // board instead (`reconstruct.ts`), so Solve — and Hint — work on any board a
  // player can actually be looking at.
  solve: (_orig, curr, aux): SolveResult<NetslideMove> => {
    const tiles = parseAux(aux, curr.w * curr.h) ?? reconstructSolution(curr);
    if (!tiles) return { ok: false, error: "Solution not known for this puzzle" };
    return { ok: true, move: { type: "solve", tiles: Array.from(tiles) } };
  },

  hint: netslideHint,
  hintKeepTrack: netslideHintKeepTrack,

  statusbarText: (s) => {
    const active = computeActive(s, -1, -1).reduce<number>(
      (n, a) => n + (a ? 1 : 0),
      0,
    );
    const total = s.w * s.h;

    let text = s.usedSolve
      ? `Moves since auto-solve: ${s.moveCount - s.completed}`
      : `${s.completed ? "COMPLETED! " : ""}Moves: ${s.completed || s.moveCount}`;
    if (s.movetarget) text += ` (target ${s.movetarget})`;
    return `${text} Active: ${active}/${total}`;
  },

  colours,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => ANIM_TIME,

  flashLength: (a, b) => {
    if (a.completed || !b.completed || a.usedSolve || b.usedSolve) return 0;
    // The flash ripples outward from the centre, so it must run long enough to
    // reach the furthest corner and then finish that tile's four frames.
    const reach = Math.max(b.cx + 1, b.cy + 1, b.w - b.cx, b.h - b.cy);
    return FLASH_FRAME * (reach + 4);
  },
};

registerGame(netslideGame);
