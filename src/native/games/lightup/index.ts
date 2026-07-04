/**
 * Light Up (Akari) — native TS port of `lightup.c`. Place bulbs on open
 * squares so every open square is lit, no bulb shines on another, and
 * every numbered black square has exactly that many adjacent bulbs.
 *
 * Left-click toggles a bulb; right-click toggles the player's "no bulb
 * here" impossible-mark (each placing clears the other). Keyboard: arrow
 * cursor, Enter/select for a bulb, `i`/select2 for a mark. Clue numbers
 * turn red when provably wrong; bulbs turn red when they light each
 * other. Check & Save additionally flags bulbs/marks contradicting the
 * unique solution.
 */
import type { Colour, ConfigValues, Point, Size } from "../../../puzzle/types.ts";
import type { SolveResult } from "../../engine/game.ts";
import { type Game, UI_UPDATE, type UiUpdate } from "../../engine/game.ts";
import { parseConfigInt } from "../../engine/params.ts";
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
import { newLightupDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  FLASH_TIME,
  fromCoord,
  type LightupDrawState,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import {
  dosolve,
  F_SOLVE_ALLOWRECURSE,
  F_SOLVE_DISCOUNTSETS,
  solveUnique,
} from "./solver.ts";
import {
  cloneState,
  decodeParams,
  defaultParams,
  encodeParams,
  F_BLACK,
  F_IMPOSSIBLE,
  F_LIGHT,
  gridCorrect,
  idx,
  type LightupMove,
  type LightupOp,
  type LightupParams,
  type LightupState,
  type LightupUi,
  newState,
  presets,
  setLight,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A cell Check & Save flags: a bulb the unique solution doesn't have
 * (`"light"`), or an impossible-mark sitting on a solution bulb
 * (`"mark"`). */
export interface LightupMistake {
  x: number;
  y: number;
  kind: "light" | "mark";
}

const KEY_I_LOWER = "i".charCodeAt(0);
const KEY_I_UPPER = "I".charCodeAt(0);

function newUi(_state: LightupState): LightupUi {
  return { x: 0, y: 0, cursorShow: false, drawBlobsWhenLit: true };
}

function changedState(
  ui: LightupUi,
  _old: LightupState | null,
  next: LightupState,
): void {
  if (next.completed) ui.cursorShow = false;
}

function interpretMove(
  state: LightupState,
  ui: LightupUi,
  ds: LightupDrawState | null,
  p: Point,
  rawButton: number,
): LightupMove | null | UiUpdate {
  const button = stripModifiers(rawButton);
  const { w, h } = state;

  let action: "light" | "impossible" | null = null;
  let cx = -1;
  let cy = -1;
  /** What an ineffective pointer action returns: hiding a visible cursor
   * is itself a UI change (upstream's `nullret = empty`). */
  let nullret: null | UiUpdate = null;

  if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
    if (ui.cursorShow) nullret = UI_UPDATE;
    ui.cursorShow = false;
    const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
    cx = fromCoord(p.x, ts);
    cy = fromCoord(p.y, ts);
    action = button === LEFT_BUTTON ? "light" : "impossible";
  } else if (
    button === CURSOR_SELECT ||
    button === CURSOR_SELECT2 ||
    button === KEY_I_LOWER ||
    button === KEY_I_UPPER
  ) {
    if (ui.cursorShow) {
      // Cursor-effect operations only apply to a visible cursor.
      cx = ui.x;
      cy = ui.y;
      action = button === CURSOR_SELECT ? "light" : "impossible";
    } else {
      ui.cursorShow = true;
      return UI_UPDATE;
    }
  } else if (isCursorMove(button)) {
    // Upstream `move_cursor`: move (clamped), reveal if hidden; a
    // clamped-edge no-op with a visible cursor is no effect.
    const pos = gridCursorMove(button, ui.x, ui.y, w, h);
    if (pos) {
      ui.x = pos.x;
      ui.y = pos.y;
    }
    if (!ui.cursorShow) {
      ui.cursorShow = true;
      return UI_UPDATE;
    }
    return pos ? UI_UPDATE : null;
  } else {
    return null;
  }

  if (action) {
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) return nullret;
    const flags = state.flags[idx(cx, cy, w)];
    if (flags & F_BLACK) return nullret;
    if (action === "light" && flags & F_IMPOSSIBLE) return nullret;
    if (action === "impossible" && flags & F_LIGHT) return nullret;
    return { ops: [{ kind: action, x: cx, y: cy }] };
  }
  return nullret;
}

function executeMove(state: LightupState, move: LightupMove): LightupState {
  const next = cloneState(state);
  const { w, h } = next;
  for (const op of move.ops) {
    if (op.x < 0 || op.y < 0 || op.x >= w || op.y >= h)
      throw new Error("Light Up move out of bounds");
    const i = idx(op.x, op.y, w);
    const flags = next.flags[i];
    if (flags & F_BLACK) throw new Error("Light Up move targets a black square");
    // Bulb and impossible-mark are mutually exclusive; each is a toggle.
    if (op.kind === "light") {
      next.flags[i] &= ~F_IMPOSSIBLE;
      setLight(next, op.x, op.y, !(flags & F_LIGHT));
    } else {
      setLight(next, op.x, op.y, false);
      next.flags[i] ^= F_IMPOSSIBLE;
    }
  }
  if (move.solve) next.usedSolve = true;
  if (gridCorrect(next)) next.completed = true;
  return next;
}

function solve(orig: LightupState, curr: LightupState): SolveResult<LightupMove> {
  // We don't care about uniqueness here; if the player typed an ambiguous
  // desc, any solution will do.
  const sflags = F_SOLVE_ALLOWRECURSE | F_SOLVE_DISCOUNTSETS;

  // Try solving from where we are now (for a non-unique puzzle this may
  // produce a different answer than from scratch)...
  let solved = cloneState(curr);
  if (dosolve(solved, sflags) <= 0) {
    // ... then from the clean puzzle.
    solved = cloneState(orig);
    if (dosolve(solved, sflags) <= 0) {
      return { ok: false, error: "Unable to find a solution to this puzzle." };
    }
  }

  const ops: LightupOp[] = [];
  for (let x = 0; x < curr.w; x++) {
    for (let y = 0; y < curr.h; y++) {
      const i = idx(x, y, curr.w);
      if ((curr.flags[i] & F_LIGHT) !== (solved.flags[i] & F_LIGHT)) {
        ops.push({ kind: "light", x, y });
      } else if ((curr.flags[i] & F_IMPOSSIBLE) !== (solved.flags[i] & F_IMPOSSIBLE)) {
        ops.push({ kind: "impossible", x, y });
      }
    }
  }
  return { ok: true, move: { solve: true, ops } };
}

function findMistakes(state: LightupState): readonly LightupMistake[] {
  const solution = solveUnique(state);
  if (!solution) return [];
  const out: LightupMistake[] = [];
  for (let y = 0; y < state.h; y++) {
    for (let x = 0; x < state.w; x++) {
      const i = idx(x, y, state.w);
      if (state.flags[i] & F_BLACK) continue;
      if (state.flags[i] & F_LIGHT && !(solution.flags[i] & F_LIGHT)) {
        out.push({ x, y, kind: "light" });
      } else if (state.flags[i] & F_IMPOSSIBLE && solution.flags[i] & F_LIGHT) {
        // A mark asserts "no bulb here"; it is provably wrong only when
        // the solution puts a bulb on that very square.
        out.push({ x, y, kind: "mark" });
      }
    }
  }
  return out;
}

function flashLength(
  from: LightupState,
  to: LightupState,
  _dir: number,
  _ui: LightupUi,
): number {
  if (!from.completed && to.completed && !from.usedSolve && !to.usedSolve)
    return FLASH_TIME;
  return 0;
}

const SYMMETRY_CHOICES = [
  "None",
  "2-way mirror",
  "2-way rotational",
  "4-way mirror",
  "4-way rotational",
];

export const lightupGame: Game<
  LightupParams,
  LightupState,
  LightupMove,
  LightupUi,
  LightupDrawState,
  LightupMistake
> = {
  id: "lightup",
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
    difficulty: p.difficulty,
  }),
  paramConfig: [
    {
      kw: "width",
      name: "Width",
      type: "string",
      get: (p) => String(p.w),
      set: (p, v) => {
        p.w = parseConfigInt(v);
      },
    },
    {
      kw: "height",
      name: "Height",
      type: "string",
      get: (p) => String(p.h),
      set: (p, v) => {
        p.h = parseConfigInt(v);
      },
    },
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
    {
      kw: "difficulty",
      name: "Difficulty",
      type: "choices",
      choices: ["Easy", "Tricky", "Hard"],
      get: (p) => p.difficulty,
      set: (p, v) => {
        p.difficulty = v;
      },
    },
  ],

  newDesc: (p, rng) => newLightupDesc(p, rng),
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status,

  solve,
  findMistakes,

  textFormat,

  prefs: [
    {
      kw: "show-lit-blobs",
      name: "Draw non-light marks even when lit",
      type: "boolean",
      get: (ui) => ui.drawBlobsWhenLit,
      set: (ui, v) => {
        ui.drawBlobsWhenLit = v;
      },
    },
  ],

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: LightupParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(lightupGame);
