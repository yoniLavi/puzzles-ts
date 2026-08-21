/**
 * Separate ("Block Puzzle") — native TS port. Upstream (`separate.c`) is an
 * *unfinished* puzzle: only its solver/generator were written, so this finishes
 * it into a playable game. Every cell holds one of `k` letters; the player draws
 * walls so the grid divides into connected `k`-ominoes, each holding one of each
 * letter.
 *
 * The interaction is Palisade's: edges are three-valued (wall / no-wall-mark /
 * unknown) and shared between two cells, so each edit records both sides; input
 * picks the edge nearest the click (left toggles wall, right toggles no-wall
 * mark) with a half-grid keyboard cursor. The explained hint is a follow-up
 * change (`add-separate-hint`).
 */

import {
  BORDER,
  BORDER_MASK,
  DISABLED,
  interpretBorderGridInput,
} from "../../engine/border-grid.ts";
import { type Game, UI_UPDATE, type UiUpdate } from "../../engine/game.ts";
import { dimensionParamConfig, parseConfigInt } from "../../engine/params.ts";
import { stripModifiers } from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { Colour, ConfigValues, Point, Size } from "../../engine/types.ts";
import { newSeparateDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type SeparateDrawState,
} from "./render.ts";
import { solveToBorders } from "./solver.ts";
import {
  decodeParams,
  defaultParams,
  encodeParams,
  executeMove,
  newState,
  presets,
  type SeparateMistake,
  type SeparateMove,
  type SeparateParams,
  type SeparateState,
  type SeparateUi,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

// Edge states for the click toggle cycle.

function newUi(_state: SeparateState): SeparateUi {
  return { x: 1, y: 1, show: false };
}

function paramsOf(state: SeparateState): SeparateParams {
  return { w: state.w, h: state.h, k: state.k };
}

// --- input -----------------------------------------------------------------

function interpretMove(
  state: SeparateState,
  ui: SeparateUi,
  ds: SeparateDrawState,
  p: Point,
  rawButton: number,
): SeparateMove | null | UiUpdate {
  const r = interpretBorderGridInput(
    state,
    ui,
    p,
    stripModifiers(rawButton),
    ds.tilesize,
  );
  if (r === null) return null;
  return r === "ui" ? UI_UPDATE : { type: "edges", edits: r };
}

// --- flash -----------------------------------------------------------------

function flashLength(
  oldState: SeparateState,
  newState_: SeparateState,
  _dir: number,
  _ui: SeparateUi,
): number {
  // Flash when a *player* move completes the board, but not the Solve command
  // (the move where `cheated` flips false→true). Mirrors Palisade.
  const becameSolved = newState_.completed && !oldState.completed;
  const thisMoveWasSolve = newState_.cheated && !oldState.cheated;
  if (becameSolved && !thisMoveWasSolve) return FLASH_TIME;
  return 0;
}

// --- mistakes --------------------------------------------------------------

function findMistakes(state: SeparateState): readonly SeparateMistake[] {
  const sol = solveToBorders(paramsOf(state), state.letters);
  if (!sol) return [];
  const { w, h, borders } = state;
  const out: SeparateMistake[] = [];
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

export const separateGame: Game<
  SeparateParams,
  SeparateState,
  SeparateMove,
  SeparateUi,
  SeparateDrawState,
  SeparateMistake
> = {
  id: "separate",
  wantsStatusbar: true,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig: [
    ...dimensionParamConfig<SeparateParams>(),
    {
      kw: "letters",
      name: "Letters",
      type: "string",
      get: (p) => String(p.k),
      set: (p, v) => {
        p.k = parseConfigInt(v);
      },
    },
  ],
  describeParams: (p): ConfigValues => ({
    width: String(p.w),
    height: String(p.h),
    letters: String(p.k),
  }),

  newDesc: (p, rng) => newSeparateDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve(orig, _curr) {
    const sol = solveToBorders(paramsOf(orig), orig.letters);
    if (!sol) return { ok: false, error: "Sorry, I can't solve this puzzle" };
    const full = Array.from(sol, (b) => (b & BORDER_MASK) | DISABLED(~b & BORDER_MASK));
    return { ok: true, move: { type: "solve", borders: full } };
  },

  findMistakes,

  textFormat,
  statusbarText: (s) => `${s.k} letters per region`,

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: SeparateParams, ts: number): Size => computeSize(p, ts),
  setTileSize: (ds, ts) => {
    ds.tilesize = ts;
  },
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(separateGame);
