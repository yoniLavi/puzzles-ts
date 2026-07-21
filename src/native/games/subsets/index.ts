/**
 * Subsets — native TS port of `puzzles/unreleased/subsets.c` (Lennard
 * Sprong's implementation of Inaba Naoki's puzzle; openspec
 * add-subsets-ts-port).
 *
 * Place every set over an `n`-letter universe into the grid exactly once. A
 * horseshoe arrow points from a superset to a subset it contains, and *all*
 * valid arrows are shown — so a missing arrow between two neighbours is
 * itself a constraint (neither contains the other).
 *
 * Input targets one letter slot of a cell: left-click / Enter cycles it
 * unknown → present → absent, right-click / Space cycles the other way, and
 * middle-click / Backspace resets it to unknown; a keyboard cursor walks the
 * slots, skipping the gaps between cell blocks. Upstream locks the game to
 * one configuration (4×4, four letters), so there is one preset and no
 * custom-params dialog.
 */
import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import {
  type Game,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  cursorDelta,
  isMouseDown,
  LEFT_BUTTON,
  MIDDLE_BUTTON,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { RandomState } from "../../random/index.ts";
import { newSubsetsDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type SubsetsDrawState,
  setTileSize,
} from "./render.ts";
import { findMistakes, solveCopy, subsetsValidate } from "./solver.ts";
import {
  CELL_HEIGHT,
  CELL_WIDTH,
  cloneState,
  decodeParams,
  defaultParams,
  encodeParams,
  newState,
  presets,
  type SubsetsMistake,
  type SubsetsMove,
  type SubsetsParams,
  type SubsetsState,
  type SubsetsUi,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

const BACKSPACE = 8;

function newUi(_state: SubsetsState): SubsetsUi {
  return { cx: 0, cy: 0, cshow: false };
}

type SlotType = "known" | "unknown" | "cleared";

function interpretMove(
  state: SubsetsState,
  ui: SubsetsUi,
  ds: SubsetsDrawState | null,
  p: Point,
  rawButton: number,
): SubsetsMove | null | UiUpdate {
  const { w, h } = state;
  const cw = CELL_WIDTH;
  const ch = CELL_HEIGHT;
  const button = stripModifiers(rawButton);
  const ts = ds?.tilesize || PREFERRED_TILE_SIZE;

  // --- cursor movement over the virtual slot grid, skipping the gaps -------
  const delta = cursorDelta(button);
  if (delta) {
    const gw = w * (cw + 1) - 1;
    const gh = h * (ch + 1) - 1;
    // Upstream repeats move_cursor while the cursor rests on a gap row or
    // column between cell blocks; gaps never touch the clamped edges, so
    // this always terminates.
    do {
      ui.cx = Math.max(0, Math.min(gw - 1, ui.cx + delta.dx));
      ui.cy = Math.max(0, Math.min(gh - 1, ui.cy + delta.dy));
      ui.cshow = true;
    } while (ui.cx % (cw + 1) === cw || ui.cy % (ch + 1) === ch);
    return UI_UPDATE;
  }

  // --- pick the targeted slot (cursor select or pointer) --------------------
  const isSelect =
    button === CURSOR_SELECT || button === CURSOR_SELECT2 || button === BACKSPACE;

  let gx: number;
  let gy: number;
  if (isSelect && ui.cshow) {
    gx = ui.cx;
    gy = ui.cy;
  } else if (!isMouseDown(button) || p.x < ts / 2 || p.y < ts / 2) {
    return null;
  } else {
    // Upstream FROM_COORD: the board is inset by half a tile.
    gx = Math.floor((p.x - Math.floor(ts / 2)) / ts);
    gy = Math.floor((p.y - Math.floor(ts / 2)) / ts);
  }

  const cellx = Math.floor(gx / (cw + 1));
  const celly = Math.floor(gy / (ch + 1));
  const numx = gx % (cw + 1);
  const numy = gy % (ch + 1);

  if (cellx >= w || celly >= h) return null;
  if (numx >= cw || numy >= ch) return null;

  const pos = celly * w + cellx;
  const num = numy * cw + numx;
  const bit = 1 << num;

  if (state.immutable[pos] & bit) return null;

  const oldtype: SlotType =
    state.known[pos] & bit ? "known" : state.mask[pos] & bit ? "unknown" : "cleared";

  let newtype: SlotType = oldtype;
  switch (button) {
    case LEFT_BUTTON:
    case CURSOR_SELECT:
      newtype =
        oldtype === "unknown" ? "known" : oldtype === "known" ? "cleared" : "unknown";
      break;
    case RIGHT_BUTTON:
    case CURSOR_SELECT2:
      newtype =
        oldtype === "unknown" ? "cleared" : oldtype === "cleared" ? "known" : "unknown";
      break;
    case MIDDLE_BUTTON:
    case BACKSPACE:
      newtype = "unknown";
      break;
    default:
      break;
  }

  if (oldtype === newtype) return null;
  if (isMouseDown(button)) ui.cshow = false;

  return { kind: "set", type: newtype, pos, bit: num };
}

function executeMove(state: SubsetsState, move: SubsetsMove): SubsetsState {
  if (move.kind === "solve") {
    const next = cloneState(state);
    for (let i = 0; i < next.w * next.h; i++) {
      next.known[i] = move.known[i];
      next.mask[i] = move.mask[i];
    }
    // Upstream's 'S' branch returns before the completion check, so a
    // solved-by-solver board deliberately does not set `completed` (and
    // subsets.c never sets `cheated` at all). Reproduced faithfully.
    return next;
  }

  const { pos, bit } = move;
  if (pos < 0 || pos >= state.w * state.h)
    throw new Error("subsets: move position out of range");
  if (bit < 0 || bit >= state.n) throw new Error("subsets: move letter out of range");
  if (state.immutable[pos] & (1 << bit))
    throw new Error("subsets: cannot change a given slot");

  const next = cloneState(state);
  const b = 1 << bit;
  switch (move.type) {
    case "known":
      next.known[pos] |= b;
      next.mask[pos] |= b;
      break;
    case "cleared":
      next.known[pos] &= ~b;
      next.mask[pos] &= ~b;
      break;
    case "unknown":
      next.known[pos] &= ~b;
      next.mask[pos] |= b;
      break;
  }

  if (subsetsValidate(next) === "complete") next.completed = true;
  return next;
}

function solve(orig: SubsetsState): SolveResult<SubsetsMove> {
  const { solved, result } = solveCopy(orig);
  if (result === "invalid") return { ok: false, error: "Puzzle is invalid." };
  // An unfinished solve still emits the partial deduction (upstream).
  return {
    ok: true,
    move: {
      kind: "solve",
      known: Array.from(solved.known),
      mask: Array.from(solved.mask),
    },
  };
}

function flashLength(
  from: SubsetsState,
  to: SubsetsState,
  _dir: number,
  _ui: SubsetsUi,
): number {
  if (!from.completed && to.completed && !from.cheated && !to.cheated)
    return FLASH_TIME;
  return 0;
}

export const subsetsGame: Game<
  SubsetsParams,
  SubsetsState,
  SubsetsMove,
  SubsetsUi,
  SubsetsDrawState,
  SubsetsMistake
> = {
  id: "subsets",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,

  // No paramConfig: upstream's configure slot is false — 4x4 n=4 is the
  // only legal configuration, so there is nothing to configure (design D8).

  newDesc: (p: SubsetsParams, rng: RandomState) => newSubsetsDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve,
  findMistakes,
  textFormat,

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: SubsetsParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(subsetsGame);
