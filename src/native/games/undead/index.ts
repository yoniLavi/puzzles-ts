/**
 * Undead — native TS port of `undead.c` ("Haunted Mirror Mazes"). Place a Ghost,
 * Vampire, or Zombie in every monster cell so the edge sighting clues (counting
 * monsters visible along the mirror-bouncing sightlines: vampires before a
 * reflection, ghosts after one, zombies always) and the monster totals all hold.
 *
 * Left-click / cursor select highlights a monster cell for a real entry;
 * right-click toggles pencil mode (sticky, a fork divergence); G/V/Z (or 1/2/3,
 * or a click on the matching count block) place a monster; E/0/Backspace clear;
 * clicking an edge clue strikes it through ("done"); `M` fills all pencil marks.
 * Live errors recolour the counts and clues; Check & Save additionally flags
 * cells that contradict the unique solution.
 */

import type { Colour, ConfigValues, GameStatus, Point, Size } from "../../../puzzle/types.ts";
import { type Game, type PresetMenu, type SolveResult, UI_UPDATE, type UiUpdate } from "../../engine/game.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  isCursorMove,
  LEFT_BUTTON,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { RandomState } from "../../random/index.ts";
import { newUndeadDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  countBlockAt,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
  type UndeadDrawState,
} from "./render.ts";
import { findUndeadSolution } from "./solver.ts";
import {
  cloneState,
  clueIndex,
  decodeParams,
  defaultParams,
  diffName,
  diffToLevel,
  encodeParams,
  isClue,
  MON_GHOST,
  MON_NONE,
  MON_VAMPIRE,
  MON_ZOMBIE,
  newState,
  newUi,
  PRESETS,
  recomputeErrors,
  status,
  textFormat,
  type UndeadMove,
  type UndeadParams,
  type UndeadState,
  type UndeadUi,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A player marking that contradicts the unique solution:
 * - `"cell"` — a placed monster that is wrong;
 * - `"note"` — an empty cell whose non-empty pencil notes have crossed out the
 *   cell's solution monster.
 * `x`/`y` are the interior grid coordinates (1-based), matching `redraw`. */
export interface UndeadMistake {
  kind: "cell" | "note";
  x: number;
  y: number;
}

// Keyboard codes used in interpretMove.
const KEY_G = 71;
const KEY_g = 103;
const KEY_V = 86;
const KEY_v = 118;
const KEY_Z = 90;
const KEY_z = 122;
const KEY_E = 69;
const KEY_e = 101;
const KEY_A = 65;
const KEY_a = 97;
const KEY_M = 77;
const KEY_m = 109;
const KEY_1 = 49;
const KEY_2 = 50;
const KEY_3 = 51;
const KEY_0 = 48;
const KEY_BACKSPACE = 8;

function presets(): PresetMenu<UndeadParams> {
  return {
    title: "Undead",
    submenu: PRESETS.map((p) => ({
      title: `${p.w}x${p.h} ${diffName(p.diff)}`,
      params: p,
    })),
  };
}

function interpretMove(
  state: UndeadState,
  ui: UndeadUi,
  ds: UndeadDrawState | null,
  point: Point,
  rawButton: number,
): UndeadMove | null | UiUpdate {
  const common = state.common;
  const w = common.w;
  const h = common.h;
  const stride = w + 2;
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const b = Math.floor(ts / 4);
  const button = stripModifiers(rawButton);
  const gx = Math.trunc((point.x - b - 1) / ts);
  const gy = Math.trunc((point.y - b - 2) / ts) - 1;

  // A left-click on a count block (place/remove by clicking the tally).
  let cc = -1;
  if (button === LEFT_BUTTON && ds) cc = countBlockAt(ds, point.x, point.y);

  // Pictures/letters toggle.
  if (button === KEY_A || button === KEY_a) {
    ui.ascii = !ui.ascii;
    return UI_UPDATE;
  }

  // Fill all pencil marks.
  if (button === KEY_M || button === KEY_m) return { type: "markAll" };

  const xinfo = common.xinfo;

  // Real-entry mode: highlight shown, not pencilling.
  if (ui.hshow && !ui.hpencil) {
    const xi = xinfo[ui.hx + ui.hy * stride];
    if (xi >= 0 && !common.fixed[xi]) {
      let ccLocal = cc;
      if (ccLocal >= 0 && state.guess[xi] === 1 << ccLocal) ccLocal = 127; // already there → delete
      const place = (monster: number): UndeadMove | null | UiUpdate => {
        if (!ui.hcursor) ui.hshow = false;
        if (state.guess[xi] === monster) return ui.hcursor ? null : UI_UPDATE;
        return { type: "set", cell: xi, monster };
      };
      if (button === KEY_G || button === KEY_g || button === KEY_1 || ccLocal === 0)
        return place(MON_GHOST);
      if (button === KEY_V || button === KEY_v || button === KEY_2 || ccLocal === 1)
        return place(MON_VAMPIRE);
      if (button === KEY_Z || button === KEY_z || button === KEY_3 || ccLocal === 2)
        return place(MON_ZOMBIE);
      if (
        button === KEY_E ||
        button === KEY_e ||
        button === CURSOR_SELECT2 ||
        button === KEY_0 ||
        button === KEY_BACKSPACE ||
        ccLocal === 127
      ) {
        if (!ui.hcursor) ui.hshow = false;
        if (state.guess[xi] === MON_NONE && state.pencils[xi] === 0)
          return ui.hcursor ? null : UI_UPDATE;
        return { type: "clear", cell: xi };
      }
    }
  }

  // Keyboard cursor movement.
  if (isCursorMove(button)) {
    if (ui.hx === 0 && ui.hy === 0) {
      ui.hx = 1;
      ui.hy = 1;
    } else if (button === CURSOR_UP) ui.hy -= ui.hy > 1 ? 1 : 0;
    else if (button === CURSOR_DOWN) ui.hy += ui.hy < h ? 1 : 0;
    else if (button === CURSOR_RIGHT) ui.hx += ui.hx < w ? 1 : 0;
    else if (button === CURSOR_LEFT) ui.hx -= ui.hx > 1 ? 1 : 0;
    ui.hshow = true;
    ui.hcursor = true;
    return UI_UPDATE;
  }

  // Select toggles pencil mode.
  if (ui.hshow && button === CURSOR_SELECT) {
    ui.hpencil = !ui.hpencil;
    ui.hcursor = true;
    return UI_UPDATE;
  }

  // Pencil-entry mode.
  if (ui.hshow && ui.hpencil) {
    const xi = xinfo[ui.hx + ui.hy * stride];
    if (xi >= 0 && !common.fixed[xi]) {
      let move: UndeadMove | null = null;
      if (button === KEY_G || button === KEY_g || button === KEY_1 || cc === 0)
        move = { type: "pencil", cell: xi, monster: MON_GHOST };
      else if (button === KEY_V || button === KEY_v || button === KEY_2 || cc === 1)
        move = { type: "pencil", cell: xi, monster: MON_VAMPIRE };
      else if (button === KEY_Z || button === KEY_z || button === KEY_3 || cc === 2)
        move = { type: "pencil", cell: xi, monster: MON_ZOMBIE };
      else if (
        button === KEY_E ||
        button === KEY_e ||
        button === CURSOR_SELECT2 ||
        button === KEY_0 ||
        button === KEY_BACKSPACE
      ) {
        if (state.pencils[xi] === 0) return ui.hcursor ? null : UI_UPDATE;
        move = { type: "clear", cell: xi };
      }
      if (move) {
        if (!ui.hcursor && !(ui.hpencil && ui.pencilKeepHighlight)) {
          ui.hpencil = false;
          ui.hshow = false;
        }
        return move;
      }
    }
  }

  // Grid clicks (selection / mode), with the fork sticky-pencil behaviour.
  if (gx >= 1 && gx <= w && gy >= 1 && gy <= h) {
    const xi = xinfo[gx + gy * stride];
    if (xi >= 0 && !common.fixed[xi]) {
      const g = state.guess[xi];
      if (button === LEFT_BUTTON) {
        if (gx === ui.hx && gy === ui.hy && ui.hshow && (ui.pencilSticky || !ui.hpencil)) {
          ui.hshow = false;
        } else {
          ui.hx = gx;
          ui.hy = gy;
          ui.hshow = true;
          if (!ui.pencilSticky) ui.hpencil = false;
        }
        ui.hcursor = false;
        return UI_UPDATE;
      }
      if (button === RIGHT_BUTTON) {
        if (ui.pencilSticky) {
          ui.hpencil = !ui.hpencil;
          if (g === MON_NONE) {
            ui.hx = gx;
            ui.hy = gy;
            ui.hshow = true;
          }
          ui.hcursor = false;
          return UI_UPDATE;
        }
        // Non-sticky (upstream): right-click an empty cell enters pencil mode.
        if (!ui.hpencil && g === MON_NONE) {
          ui.hshow = true;
          ui.hpencil = true;
          ui.hcursor = false;
          ui.hx = gx;
          ui.hy = gy;
          return UI_UPDATE;
        }
        if (gx === ui.hx && gy === ui.hy && ui.hshow) {
          ui.hshow = false;
          ui.hpencil = false;
          ui.hcursor = false;
          return UI_UPDATE;
        }
        if (g === MON_NONE) {
          ui.hshow = true;
          ui.hpencil = true;
          ui.hcursor = false;
          ui.hx = gx;
          ui.hy = gy;
          return UI_UPDATE;
        }
      }
    }
    return null;
  }

  if (button === LEFT_BUTTON && isClue(w, h, gx, gy)) {
    return { type: "hintDone", clue: clueIndex(w, h, gx, gy) };
  }

  return null;
}

function executeMove(state: UndeadState, move: UndeadMove): UndeadState {
  const next = cloneState(state);
  const common = next.common;
  let solver = false;

  switch (move.type) {
    case "set":
      next.guess[move.cell] = move.monster;
      break;
    case "clear":
      next.guess[move.cell] = MON_NONE;
      next.pencils[move.cell] = 0;
      break;
    case "pencil":
      next.pencils[move.cell] ^= move.monster;
      break;
    case "markAll":
      for (let i = 0; i < common.numTotal; i++) {
        if (next.guess[i] === MON_NONE) next.pencils[i] = 7;
      }
      break;
    case "hintDone":
      next.hintsDone[move.clue] ^= 1;
      break;
    case "solve":
      for (let i = 0; i < common.numTotal; i++) next.guess[i] = move.placements[i];
      solver = true;
      break;
  }

  const correct = recomputeErrors(next);
  if (correct && !solver) next.solved = true;
  if (solver) {
    next.solved = true;
    next.cheated = true;
  }
  return next;
}

function changedState(ui: UndeadUi, _old: UndeadState | null, newSt: UndeadState): void {
  if (ui.hshow && ui.hpencil && !ui.hcursor) {
    const stride = newSt.common.w + 2;
    const xi = newSt.common.xinfo[ui.hx + ui.hy * stride];
    if (xi >= 0) {
      const g = newSt.guess[xi];
      if (g === MON_GHOST || g === MON_VAMPIRE || g === MON_ZOMBIE) ui.hshow = false;
    }
  }
}

function solve(orig: UndeadState, _curr: UndeadState, aux?: string): SolveResult<UndeadMove> {
  const numTotal = orig.common.numTotal;
  if (aux) {
    const placements: number[] = [];
    for (let i = 0; i < numTotal; i++) {
      const c = aux[i + 1];
      placements[i] = c === "G" ? MON_GHOST : c === "V" ? MON_VAMPIRE : MON_ZOMBIE;
    }
    return { ok: true, move: { type: "solve", placements } };
  }
  const sol = findUndeadSolution(orig);
  if (!sol.ok) return { ok: false, error: sol.error };
  return { ok: true, move: { type: "solve", placements: Array.from(sol.guess) } };
}

function findMistakes(state: UndeadState): readonly UndeadMistake[] {
  const common = state.common;
  const sol = findUndeadSolution(state);
  if (!sol.ok) return [];

  // Monster index → interior grid coords.
  const stride = common.w + 2;
  const cellXY: { x: number; y: number }[] = [];
  for (let y = 1; y <= common.h; y++) {
    for (let x = 1; x <= common.w; x++) {
      const xi = common.xinfo[x + y * stride];
      if (xi >= 0) cellXY[xi] = { x, y };
    }
  }

  const out: UndeadMistake[] = [];
  for (let i = 0; i < common.numTotal; i++) {
    if (common.fixed[i]) continue;
    const at = cellXY[i];
    if (!at) continue;
    const g = state.guess[i];
    if (g === MON_GHOST || g === MON_VAMPIRE || g === MON_ZOMBIE) {
      if (g !== sol.guess[i]) out.push({ kind: "cell", x: at.x, y: at.y });
    } else if (state.pencils[i] !== 0 && !(state.pencils[i] & sol.guess[i])) {
      out.push({ kind: "note", x: at.x, y: at.y });
    }
  }
  return out;
}

function flashLength(from: UndeadState, to: UndeadState): number {
  if (!from.solved && to.solved && !from.cheated && !to.cheated) return FLASH_TIME;
  return 0;
}

export const undeadGame: Game<
  UndeadParams,
  UndeadState,
  UndeadMove,
  UndeadUi,
  UndeadDrawState,
  UndeadMistake
> = {
  id: "undead",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  canMarkAll: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  // Keys match the `undead` config template in augmentation.ts
  // ("{width}x{height} {difficulty:Easy|Normal|Tricky}").
  describeParams: (p): ConfigValues => ({
    width: String(p.w),
    height: String(p.h),
    difficulty: diffToLevel(p.diff),
  }),

  newDesc: (p, rng: RandomState) => newUndeadDesc(p, rng),
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status: (s): GameStatus => status(s),

  solve,
  findMistakes,
  textFormat,

  prefs: [
    {
      kw: "sticky-pencil-mode",
      name: "Right-click toggles a sticky pencil mode (stays on until right-clicked again)",
      type: "boolean",
      get: (ui) => ui.pencilSticky,
      set: (ui, v) => {
        ui.pencilSticky = v;
      },
    },
    {
      kw: "pencil-keep-highlight",
      name: "Keep mouse highlight after changing a pencil mark",
      type: "boolean",
      get: (ui) => ui.pencilKeepHighlight,
      set: (ui, v) => {
        ui.pencilKeepHighlight = v;
      },
    },
    {
      kw: "monsters",
      name: "Monster representation",
      type: "choices",
      choices: ["Pictures", "Letters"],
      get: (ui) => (ui.ascii ? 1 : 0),
      set: (ui, v) => {
        ui.ascii = v === 1;
      },
    },
    {
      kw: "count-style",
      name: "Monster count display",
      type: "choices",
      choices: ["Total", "Remaining", "Placed/Total", "Left/Total"],
      get: (ui) => ui.countStyle,
      set: (ui, v) => {
        ui.countStyle = v;
      },
    },
  ],

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: UndeadParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(undeadGame);
