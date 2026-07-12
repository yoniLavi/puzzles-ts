/**
 * Bridges (Hashiwokakero) — native TS port of `puzzles/bridges.c`.
 *
 * Connect the numbered islands with horizontal/vertical bridges so every island
 * carries its number of bridge-ends, at most `maxb` join any pair, bridges never
 * cross, and all islands form one connected group.
 *
 * WORK IN PROGRESS (add-bridges-ts-port): `state.ts` (data model + codec) is
 * complete; the solver, generator, renderer and input model are typed stubs
 * that throw until their tasks land. The game is NOT yet registered, so these
 * stubs never run in the app.
 */
import type { Colour, GameStatus, Size } from "../../../puzzle/types.ts";
import type { Game, GamePref, PresetMenu, SolveResult, UiUpdate } from "../../engine/game.ts";
import type { RandomState } from "../../random/index.ts";
import { newBridgesDesc } from "./generator.ts";
import {
  type BridgesDrawState,
  colours,
  computeSize,
  newDrawState,
  redrawBridges,
} from "./render.ts";
import {
  BRIDGES_PRESETS,
  type BridgesMistake,
  type BridgesMove,
  type BridgesParams,
  type BridgesState,
  type BridgesUi,
  cloneBridgesState,
  decodeParams,
  defaultParams,
  DIFFICULTY_NAMES,
  encodeParams,
  newStateFromDesc,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

function newUi(state: BridgesState): BridgesUi {
  const first = state.islands[0];
  return {
    dragxSrc: -1,
    dragySrc: -1,
    dragxDst: -1,
    dragyDst: -1,
    todraw: 0,
    dragging: false,
    dragIsNoline: false,
    nlines: 0,
    curX: first ? first.x : 0,
    curY: first ? first.y : 0,
    curVisible: false,
    showHints: false,
  };
}

const prefs: GamePref<BridgesUi>[] = [
  {
    kw: "show-hints",
    name: "Show possible bridge locations",
    type: "boolean",
    get: (ui) => ui.showHints,
    set: (ui, v) => {
      ui.showHints = v as boolean;
    },
  },
];

export const bridgesGame: Game<
  BridgesParams,
  BridgesState,
  BridgesMove,
  BridgesUi,
  BridgesDrawState,
  BridgesMistake
> = {
  id: "bridges",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  needsRightButton: true,

  defaultParams,
  presets(): PresetMenu<BridgesParams> {
    return {
      title: "Type",
      submenu: BRIDGES_PRESETS.map((p) => ({
        title: `${p.w}x${p.h} ${DIFFICULTY_NAMES[p.difficulty]}`,
        params: { ...p },
      })),
    };
  },
  encodeParams,
  decodeParams,
  validateParams,

  newDesc(p: BridgesParams, rng: RandomState): { desc: string; aux?: string } {
    return newBridgesDesc(p, rng);
  },
  validateDesc,
  newState(p: BridgesParams, desc: string): BridgesState {
    return newStateFromDesc(p, desc);
  },
  newUi,

  interpretMove(): BridgesMove | null | UiUpdate {
    throw new Error("bridges interpretMove: not implemented");
  },
  executeMove(_s: BridgesState, _m: BridgesMove): BridgesState {
    throw new Error("bridges executeMove: not implemented");
  },

  status(s: BridgesState): GameStatus {
    return s.completed ? "solved" : "ongoing";
  },

  solve(_orig: BridgesState, _curr: BridgesState): SolveResult<BridgesMove> {
    throw new Error("bridges solve: not implemented");
  },

  textFormat,
  prefs,

  colours(defaultBackground: Colour): Colour[] {
    return colours(defaultBackground);
  },
  computeSize(p: BridgesParams, tileSize: number): Size {
    return computeSize(p, tileSize);
  },
  setTileSize(ds: BridgesDrawState, tileSize: number): void {
    ds.tileSize = tileSize;
  },
  redraw(dr, ds, prev, s): void {
    redrawBridges(dr, ds, prev, s);
  },
};

// Keep the drawstate factory + clone referenced (used by the midend once
// registered; wired here so the stub file is self-consistent).
export const _newDrawState = newDrawState;
export const _cloneBridgesState = cloneBridgesState;

// NOT registered yet — registration (registerGame) happens at stage 1 once the
// solver/generator/render/input are implemented and the suite is green.
