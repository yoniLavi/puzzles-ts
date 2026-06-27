/**
 * solo (Sudoku) — native TS port. Implements the engine Game interface.
 *
 * NOTE: in-progress port. state.ts (params/desc codec, completion check) is
 * complete; solver / generator / render / move handling are stubs filled in by
 * later tasks. Not yet registered (see ts-ported-ids.ts) — runs on C/WASM until
 * the port is at parity.
 */

import type { Colour, GameStatus, Size } from "../../../puzzle/types.ts";
import type { Game } from "../../engine/game.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type { RandomState } from "../../random/index.ts";
import { newSoloDesc } from "./generator.ts";
import { redrawSolo } from "./render.ts";
import {
  cloneState,
  decodeParams,
  defaultParams,
  diffName,
  DIFF_BLOCK,
  DIFF_EXTREME,
  DIFF_INTERSECT,
  DIFF_KINTERSECT,
  DIFF_KMINMAX,
  DIFF_RECURSIVE,
  DIFF_SET,
  DIFF_SIMPLE,
  encodeParams,
  newState,
  newUi,
  status as soloStatus,
  SYMM_NONE,
  SYMM_ROT2,
  validateDesc,
  validateParams,
} from "./state.ts";
import type {
  SoloDrawState,
  SoloMistake,
  SoloMove,
  SoloParams,
  SoloState,
  SoloUi,
} from "./state.ts";

interface Preset {
  title: string;
  params: SoloParams;
}

/** Faithful to `game_presets` (the non-SLOW_SYSTEM entries are always shown). */
function soloPresets(): Preset[] {
  const P = (
    c: number,
    r: number,
    symm: number,
    diff: number,
    kdiff: number,
    xtype: boolean,
    killer: boolean,
    title: string,
  ): Preset => ({ title, params: { c, r, symm, diff, kdiff, xtype, killer } });
  const K = DIFF_KMINMAX;
  return [
    P(2, 2, SYMM_ROT2, DIFF_BLOCK, K, false, false, "2x2 Trivial"),
    P(2, 3, SYMM_ROT2, DIFF_SIMPLE, K, false, false, "2x3 Basic"),
    P(3, 3, SYMM_ROT2, DIFF_BLOCK, K, false, false, "3x3 Trivial"),
    P(3, 3, SYMM_ROT2, DIFF_SIMPLE, K, false, false, "3x3 Basic"),
    P(3, 3, SYMM_ROT2, DIFF_SIMPLE, K, true, false, "3x3 Basic X"),
    P(3, 3, SYMM_ROT2, DIFF_INTERSECT, K, false, false, "3x3 Intermediate"),
    P(3, 3, SYMM_ROT2, DIFF_SET, K, false, false, "3x3 Advanced"),
    P(3, 3, SYMM_ROT2, DIFF_SET, K, true, false, "3x3 Advanced X"),
    P(3, 3, SYMM_ROT2, DIFF_EXTREME, K, false, false, "3x3 Extreme"),
    P(3, 3, SYMM_ROT2, DIFF_RECURSIVE, K, false, false, "3x3 Unreasonable"),
    P(3, 3, SYMM_NONE, DIFF_BLOCK, DIFF_KINTERSECT, false, true, "3x3 Killer"),
    P(9, 1, SYMM_ROT2, DIFF_SIMPLE, K, false, false, "9 Jigsaw Basic"),
    P(9, 1, SYMM_ROT2, DIFF_SIMPLE, K, true, false, "9 Jigsaw Basic X"),
    P(9, 1, SYMM_ROT2, DIFF_SET, K, false, false, "9 Jigsaw Advanced"),
    P(3, 4, SYMM_ROT2, DIFF_SIMPLE, K, false, false, "3x4 Basic"),
    P(4, 4, SYMM_ROT2, DIFF_SIMPLE, K, false, false, "4x4 Basic"),
  ];
}

export const soloGame: Game<
  SoloParams,
  SoloState,
  SoloMove,
  SoloUi,
  SoloDrawState,
  SoloMistake
> = {
  id: "solo",
  wantsStatusbar: false,
  isTimed: false,
  // TODO: flip to true as each capability lands (solve, mark-all, mistakes).
  canSolve: false,
  canFormatAsText: false,

  defaultParams,
  presets() {
    return {
      title: "Solo",
      submenu: soloPresets().map((p) => ({ title: p.title, params: p.params })),
    };
  },
  encodeParams,
  decodeParams,
  validateParams,

  newDesc(p: SoloParams, rng: RandomState): { desc: string } {
    return newSoloDesc(p, rng);
  },
  validateDesc,
  newState,
  newUi,

  interpretMove(): SoloMove | null {
    return null; // TODO (task 4.2).
  },
  executeMove(_s: SoloState, _m: SoloMove): SoloState {
    throw new Error("solo executeMove: not implemented");
  },

  status(s: SoloState): GameStatus {
    return soloStatus(s);
  },

  colours(defaultBackground: Colour): Colour[] {
    const { background } = mkhighlight(defaultBackground);
    return [background]; // TODO: full palette (task 4.1).
  },
  computeSize(p: SoloParams, tileSize: number): Size {
    const cr = p.c * p.r;
    return { w: cr * tileSize, h: cr * tileSize };
  },
  redraw(dr, ds, prev, s): void {
    redrawSolo(dr, ds, prev, s);
  },
};

// Touch faithful helpers not yet wired into a code path so the in-progress
// module type-checks cleanly; consumed as the port lands.
void cloneState;
void diffName;

// Not registered yet — the port is incomplete (see ts-ported-ids.ts).
