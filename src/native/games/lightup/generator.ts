/**
 * Light Up board generation — faithful port of the generator half of
 * `lightup.c` (`set_blacks` / `place_lights` / `place_numbers` /
 * `puzzle_is_good` / `strip_unused_nums` / `new_game_desc`).
 *
 * Every RNG draw is reproduced in upstream order, so for the same seed
 * the published desc byte-matches the C reference (asserted by
 * `lightup-differential.test.ts`).
 */

import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import type { RandomState } from "../../random/index.ts";
import { randomUpto } from "../../random/index.ts";
import {
  type DepthTracker,
  dosolve,
  F_SOLVE_ALLOWRECURSE,
  flagsFromDifficulty,
  unplaceLights,
} from "./solver.ts";
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
  SYMM_NONE,
  SYMM_REF2,
  SYMM_REF4,
  SYMM_ROT2,
  SYMM_ROT4,
  setLight,
} from "./state.ts";

/** Clear the board for regeneration (upstream `clean_board`). */
function cleanBoard(state: LightupState, leaveBlacks: boolean): void {
  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      const i = idx(x, y, state.w);
      state.flags[i] = leaveBlacks ? state.flags[i] & F_BLACK : 0;
      state.lights[i] = 0;
    }
  }
  state.nlights = 0;
}

/** Randomise the black squares over the symmetry-reduced region, then
 * mirror/rotate the region over the whole board (upstream `set_blacks`). */
export function setBlacks(
  state: LightupState,
  params: LightupParams,
  rs: RandomState,
): void {
  const { w, h } = state;
  const wodd = w % 2 ? 1 : 0;
  const hodd = h % 2 ? 1 : 0;
  let degree: number;
  let rotate: boolean;
  switch (params.symm) {
    case SYMM_NONE:
      degree = 1;
      rotate = false;
      break;
    case SYMM_ROT2:
      degree = 2;
      rotate = true;
      break;
    case SYMM_REF2:
      degree = 2;
      rotate = false;
      break;
    case SYMM_ROT4:
      degree = 4;
      rotate = true;
      break;
    case SYMM_REF4:
      degree = 4;
      rotate = false;
      break;
    default:
      throw new Error(`Unknown symmetry type ${params.symm}`);
  }
  if (params.symm === SYMM_ROT4 && h !== w)
    throw new Error("4-fold symmetry unavailable without square grid");

  let rw: number;
  let rh: number;
  if (degree === 4) {
    rw = Math.floor(w / 2);
    rh = Math.floor(h / 2);
    if (!rotate) rw += wodd; // ... but see below (upstream comment)
    rh += hodd;
  } else if (degree === 2) {
    rw = w;
    rh = Math.floor(h / 2) + hodd;
  } else {
    rw = w;
    rh = h;
  }

  // Clear, then randomise, the required region.
  cleanBoard(state, false);
  const nblack = Math.floor((rw * rh * params.blackpc) / 100);
  const pick = retryLimit("lightup: setBlacks", MAX_BLACK_PICKS);
  for (let i = 0; i < nblack; i++) {
    let x: number;
    let y: number;
    do {
      pick();
      x = randomUpto(rs, rw);
      y = randomUpto(rs, rh);
    } while (state.flags[idx(x, y, w)] & F_BLACK);
    state.flags[idx(x, y, w)] |= F_BLACK;
  }

  // Copy the required region per the symmetry.
  if (params.symm === SYMM_NONE) return;
  for (let x = 0; x < rw; x++) {
    for (let y = 0; y < rh; y++) {
      const xs: number[] = [x];
      const ys: number[] = [y];
      if (degree === 4) {
        xs.push(w - 1 - (rotate ? y : x));
        ys.push(rotate ? x : y);
        xs.push(rotate ? w - 1 - x : x);
        ys.push(h - 1 - y);
        xs.push(rotate ? y : w - 1 - x);
        ys.push(h - 1 - (rotate ? x : y));
      } else {
        xs.push(rotate ? w - 1 - x : x);
        ys.push(h - 1 - y);
      }
      for (let i = 1; i < degree; i++) {
        state.flags[idx(xs[i], ys[i], w)] = state.flags[idx(xs[0], ys[0], w)];
      }
    }
  }
  // SYMM_ROT4 misses the middle square above; fix that here.
  if (degree === 4 && rotate && wodd && randomUpto(rs, 100) <= params.blackpc) {
    state.flags[idx(Math.floor(w / 2) + wodd - 1, Math.floor(h / 2) + hodd - 1, w)] |=
      F_BLACK;
  }
}

/** Would removing a bulb at (x, y) leave some square it lights dark? */
function checkDark(state: LightupState, x: number, y: number): number {
  for (const pt of litCells(state, x, y, true)) {
    if (state.lights[idx(pt.x, pt.y, state.w)] === 1) return 1;
  }
  return 0;
}

/**
 * Set up a random correct position (every open square lit, no bulb lit
 * by another) by filling the whole grid with bulbs and then removing
 * shadowed clusters in a random order (upstream `place_lights`).
 */
export function placeLights(state: LightupState, rs: RandomState): void {
  const { w, h } = state;
  const wh = w * h;
  const numindices = Array.from({ length: wh }, (_, i) => i);
  shuffle(numindices, rs);

  // Bulb on every open square (also clear the F_MARK scratch bit).
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = idx(x, y, w);
      state.flags[i] &= ~F_MARK;
      if (state.flags[i] & F_BLACK) continue;
      setLight(state, x, y, true);
    }
  }

  for (let i = 0; i < wh; i++) {
    const y = Math.floor(numindices[i] / w);
    const x = numindices[i] % w;
    const ii = idx(x, y, w);
    if (!(state.flags[ii] & F_LIGHT)) continue;
    if (state.flags[ii] & F_MARK) continue;
    const cells = [...litCells(state, x, y, false)];

    // If we're not lighting any bulbs ourself, don't remove anything.
    let n = 0;
    for (const pt of cells) {
      if (state.flags[idx(pt.x, pt.y, w)] & F_LIGHT) n++;
    }
    if (n === 0) continue;

    // Would removing the bulbs we light leave anything dark?
    n = 0;
    for (const pt of cells) {
      if (state.flags[idx(pt.x, pt.y, w)] & F_LIGHT) {
        n += checkDark(state, pt.x, pt.y);
      }
    }
    if (n === 0) {
      // No: remove them all.
      for (const pt of cells) setLight(state, pt.x, pt.y, false);
      state.flags[ii] |= F_MARK;
    }

    if (!gridOverlap(state)) return; // done
  }
  if (gridOverlap(state)) {
    throw new Error("place_lights failed to resolve overlapping lights!");
  }
}

/** Fill every black square with the count of adjacent bulbs. */
export function placeNumbers(state: LightupState): void {
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
  const sflags = flagsFromDifficulty(difficulty);
  unplaceLights(state);
  const mdepth: DepthTracker = { value: 0 };
  const nsol = dosolve(state, sflags, mdepth);
  // If we wanted an easy puzzle, make sure we didn't need recursion.
  if (!(sflags & F_SOLVE_ALLOWRECURSE) && mdepth.value > 0) return false;
  return nsol === 1;
}

/** Remove clue numbers the last solve never used. */
export function stripUnusedNums(state: LightupState): number {
  let n = 0;
  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      const i = idx(x, y, state.w);
      if (state.flags[i] & F_NUMBERED && !(state.flags[i] & F_NUMBERUSED)) {
        state.flags[i] &= ~F_NUMBERED;
        state.lights[i] = 0;
        n++;
      }
    }
  }
  return n;
}

const MAX_GRIDGEN_TRIES = 20;

/** Rounds of the blackpc ramp (each already ≤ MAX_GRIDGEN_TRIES attempts, so
 * ≈20k grids in total). The ramp stops at 90, after which every round retries
 * identical parameters — so this is a real escape, not just insurance. */
const MAX_RAMP_ROUNDS = 1000;

/** Draws allowed when picking a non-black cell. blackpc never exceeds 90, so a
 * free cell always exists and the rejection sampling ends with probability 1 —
 * but "probably" is not a bound (see engine/retry-limit.ts). */
const MAX_BLACK_PICKS = 1_000_000;

/**
 * Generate a puzzle: the most complex grid honouring a unique solution
 * and the difficulty floor/ceiling, ramping the black-square percentage
 * when a layout keeps failing (upstream `new_game_desc`).
 */
export function newLightupDesc(
  paramsIn: LightupParams,
  rs: RandomState,
): { desc: string } {
  const params = { ...paramsIn }; // blackpc is ramped locally on failure
  let news = emptyState(params);
  const wh = params.w * params.h;

  // One shuffled list of grid positions for the number-removal order —
  // shuffled once, exactly as upstream (a per-grid reshuffle would draw
  // different RNG).
  const numindices = Array.from({ length: wh }, (_, i) => i);
  shuffle(numindices, rs);

  const round = retryLimit("lightup: generation (blackpc ramp)", MAX_RAMP_ROUNDS);
  for (;;) {
    round();

    for (let tries = 0; tries < MAX_GRIDGEN_TRIES; tries++) {
      setBlacks(news, params, rs); // also cleans the board
      placeLights(news, rs);
      placeNumbers(news);
      if (!puzzleIsGood(news, params.difficulty)) continue;

      // Remove the numbers the solver didn't use, if the puzzle stays good.
      const copys = cloneState(news);
      stripUnusedNums(copys);
      if (puzzleIsGood(copys, params.difficulty)) news = copys;

      // Remove numbers one-by-one in the shuffled order, reverting any
      // removal that breaks the puzzle.
      for (let j = 0; j < wh; j++) {
        const y = Math.floor(numindices[j] / params.w);
        const x = numindices[j] % params.w;
        const i = idx(x, y, params.w);
        if (!(news.flags[i] & F_NUMBERED)) continue;
        const num = news.lights[i];
        news.lights[i] = 0;
        news.flags[i] &= ~F_NUMBERED;
        if (!puzzleIsGood(news, params.difficulty)) {
          news.lights[i] = num;
          news.flags[i] |= F_NUMBERED;
        }
      }

      if (params.difficulty > 0) {
        // Is the maximally-difficult puzzle difficult enough? It must not
        // fall to the next-simpler solver.
        if (puzzleIsGood(news, params.difficulty - 1)) continue;
      }

      return { desc: encodeDesc(news) };
    }
    // Couldn't generate a good puzzle in that many goes; ramp up the
    // percentage of black squares and try again.
    if (params.blackpc < 90) params.blackpc += 5;
  }
}
