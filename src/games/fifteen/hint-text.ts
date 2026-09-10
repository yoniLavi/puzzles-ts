/**
 * Every sentence Fifteen's hint speaks.
 *
 * Each step names the stable goal tile it is working toward home (the
 * engine's `workingOn`, shared with Sixteen) and then says what this slide does
 * for it. Which case a step is — and which tile is the goal — is `index.ts`'s
 * `narrateFifteenStep` to decide; this file decides only how it reads.
 */

import { workingOn } from "../../engine/hint-text.ts";

export const say = {
  /** The goal tile lands in its solved cell. */
  goalHome: (goal: number): string => `${workingOn(goal)}slide it into place.`,

  /** The goal tile slides nearer its home. */
  goalCloser: (goal: number): string => `${workingOn(goal)}slide it closer.`,

  /** The goal tile slides without getting nearer: the solver is routing the
   * gap round it. */
  goalReposition: (goal: number): string => `${workingOn(goal)}reposition it.`,

  /** Another tile, displaced earlier in the rotation, lands in its own home. */
  tileHome: (goal: number, tile: number): string =>
    `${workingOn(goal)}slide tile ${tile} into place.`,

  /** Any other slide clears the way. */
  outOfWay: (goal: number, tile: number): string =>
    `${workingOn(goal)}slide tile ${tile} out of the way.`,
};
