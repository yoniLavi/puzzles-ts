/**
 * Light Up board generation — port of the generator half of `lightup.c`
 * (`set_blacks` / `place_lights` / `place_numbers` / `puzzle_is_good` /
 * `strip_unused_nums` / `new_game_desc`).
 *
 * Every RNG draw is reproduced in upstream order, so for the same seed
 * the published desc byte-matches the C reference (asserted by
 * `lightup-differential.test.ts`).
 */

import type { RandomState } from "../../engine/random/index.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { placeSymmetricBlacks } from "../../engine/symmetric-blacks.ts";
import type { Point } from "../../engine/types.ts";
import { dosolve, flagsFromDifficulty, unplaceLights } from "./solver.ts";
import {
  cloneState,
  emptyState,
  encodeDesc,
  F_BLACK,
  F_LIGHT,
  F_MARK,
  F_NUMBERED,
  F_NUMBERUSED,
  getSurrounds,
  gridOverlap,
  idx,
  type LightupParams,
  type LightupState,
  litCells,
  setLight,
} from "./state.ts";

/** Clear the board, then randomize the black squares over the
 * symmetry-reduced region and mirror/rotate it over the whole board
 * (upstream `clean_board` + `set_blacks`, via the shared engine helper). */
function setBlacks(state: LightupState, params: LightupParams, rs: RandomState): void {
  const { w } = state;
  state.flags.fill(0);
  state.lights.fill(0);
  state.nlights = 0;
  placeSymmetricBlacks({
    w,
    h: state.h,
    blackpc: params.blackpc,
    symm: params.symm,
    rs,
    isBlack: (x, y) => (state.flags[idx(x, y, w)] & F_BLACK) !== 0,
    setBlack: (x, y, black) => {
      if (black) state.flags[idx(x, y, w)] |= F_BLACK;
      else state.flags[idx(x, y, w)] &= ~F_BLACK;
    },
  });
}

/** Would removing the bulb at (x, y) leave some square it lights dark? */
function leavesDark(state: LightupState, x: number, y: number): boolean {
  for (const pt of litCells(state, x, y, true)) {
    if (state.lights[idx(pt.x, pt.y, state.w)] === 1) return true;
  }
  return false;
}

/**
 * Set up a random correct position (every open square lit, no bulb lit
 * by another) by filling the whole grid with bulbs and then removing
 * shadowed clusters in a random order (upstream `place_lights`).
 */
function placeLights(state: LightupState, rs: RandomState): void {
  const { w, h } = state;
  const numindices = Array.from({ length: w * h }, (_, i) => i);
  shuffle(numindices, rs);

  // Bulb on every open square (`setBlacks` has just cleared F_MARK).
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (!(state.flags[idx(x, y, w)] & F_BLACK)) setLight(state, x, y, true);
    }
  }

  const isBulb = (pt: Point): boolean =>
    (state.flags[idx(pt.x, pt.y, w)] & F_LIGHT) !== 0;
  for (const i of numindices) {
    if (!(state.flags[i] & F_LIGHT) || state.flags[i] & F_MARK) continue;
    const cells = [...litCells(state, i % w, Math.floor(i / w), false)];

    // If we're not lighting any bulbs ourself, don't remove anything.
    if (!cells.some(isBulb)) continue;

    // If removing the bulbs we light leaves nothing dark, remove them all.
    if (!cells.some((pt) => isBulb(pt) && leavesDark(state, pt.x, pt.y))) {
      for (const pt of cells) setLight(state, pt.x, pt.y, false);
      state.flags[i] |= F_MARK;
    }

    if (!gridOverlap(state)) return; // done
  }
  if (gridOverlap(state)) {
    throw new Error("place_lights failed to resolve overlapping lights!");
  }
}

/** Fill every black square with the count of adjacent bulbs. */
function placeNumbers(state: LightupState): void {
  const { w, h } = state;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = idx(x, y, w);
      if (!(state.flags[i] & F_BLACK)) continue;
      let n = 0;
      for (const pt of getSurrounds(w, h, x, y)) {
        if (state.flags[idx(pt.x, pt.y, w)] & F_LIGHT) n++;
      }
      state.flags[i] |= F_NUMBERED;
      state.lights[i] = n;
    }
  }
}

/** Strip the bulbs and re-solve: is this layout uniquely solvable at the
 * given difficulty (with no recursion unless the difficulty allows it)?
 * Leaves `state` solved (with `F_NUMBERUSED` set on the clues the solver
 * used) on success. */
export function puzzleIsGood(state: LightupState, difficulty: number): boolean {
  unplaceLights(state);
  // Below Unreasonable the flags forbid a guess, so a board that needs one
  // solves to -1 ("don't know"), never 1. (Upstream also checks the depth
  // reached, which without recursion is always 0.)
  return dosolve(state, flagsFromDifficulty(difficulty)) === 1;
}

/** Remove clue numbers the last solve never used. */
function stripUnusedNums(state: LightupState): void {
  for (let i = 0; i < state.flags.length; i++) {
    if (state.flags[i] & F_NUMBERED && !(state.flags[i] & F_NUMBERUSED)) {
      state.flags[i] &= ~F_NUMBERED;
      state.lights[i] = 0;
    }
  }
}

const MAX_GRIDGEN_TRIES = 20;

/** Rounds of the blackpc ramp (each already ≤ MAX_GRIDGEN_TRIES attempts, so
 * ≈20k grids in total). The ramp stops at 90, after which every round retries
 * identical parameters — so this is a real escape, not just insurance. */
const MAX_RAMP_ROUNDS = 1000;

/**
 * Generate a puzzle: the most complex grid honoring a unique solution
 * and the difficulty floor/ceiling, ramping the black-square percentage
 * when a layout keeps failing (upstream `new_game_desc`).
 */
export function newLightupDesc(
  paramsIn: LightupParams,
  rs: RandomState,
): { desc: string } {
  const params = { ...paramsIn }; // blackpc is ramped locally on failure
  let news = emptyState(params);

  // The number-removal order is shuffled once, as upstream: a per-grid
  // reshuffle would draw different RNG.
  const numindices = Array.from({ length: params.w * params.h }, (_, i) => i);
  shuffle(numindices, rs);

  const round = retryLimit("lightup: generation (blackpc ramp)", MAX_RAMP_ROUNDS);
  for (;;) {
    round();

    for (let tries = 0; tries < MAX_GRIDGEN_TRIES; tries++) {
      setBlacks(news, params, rs);
      placeLights(news, rs);
      placeNumbers(news);
      if (!puzzleIsGood(news, params.difficulty)) continue;

      // Remove the numbers the solver didn't use, if the puzzle stays good.
      const copys = cloneState(news);
      stripUnusedNums(copys);
      if (puzzleIsGood(copys, params.difficulty)) news = copys;

      // Remove numbers one-by-one in the shuffled order, reverting any
      // removal that breaks the puzzle.
      for (const i of numindices) {
        if (!(news.flags[i] & F_NUMBERED)) continue;
        const num = news.lights[i];
        news.lights[i] = 0;
        news.flags[i] &= ~F_NUMBERED;
        if (!puzzleIsGood(news, params.difficulty)) {
          news.lights[i] = num;
          news.flags[i] |= F_NUMBERED;
        }
      }

      // The maximally-stripped puzzle must not fall to the next-simpler solver.
      if (params.difficulty > 0 && puzzleIsGood(news, params.difficulty - 1)) continue;

      return { desc: encodeDesc(news) };
    }
    // Couldn't generate a good puzzle in that many goes; ramp up the
    // percentage of black squares and try again.
    if (params.blackpc < 90) params.blackpc += 5;
  }
}
