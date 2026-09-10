/**
 * Every sentence Sixteen's hint speaks.
 *
 * Goal:tactic narration, shared in shape with Fifteen: the prefix names the
 * tile being worked toward home (the engine's `workingOn`), the tactic states
 * the line this move sends it to, and a trailing clause says *why* — ", its
 * final spot" when the journey ends in the tile's solved cell, else the shared
 * staging marker. Which tile, which lines and whether it arrives are
 * `index.ts`'s `narrateStep` to decide; this file decides only how it reads.
 */

import { HINT_SETTING_UP, workingOn } from "../../engine/hint-text.ts";

/** A row or column as the player counts it, 1-based. */
export interface Line {
  axis: "row" | "column";
  n: number;
}

const lineName = (l: Line): string => `${l.axis} ${l.n}`;

export const say = {
  /**
   * One slide of `tile`'s journey to `first`, previewing `second` when the
   * next slide continues the same journey perpendicular to this one. A
   * continuation leg (`continues`) repeats neither the verb nor the why — leg
   * 0 of its journey already carried both and is still on screen. `home` is
   * whether the journey ends in the tile's solved cell.
   */
  step: (p: {
    tile: number;
    continues: boolean;
    first: Line;
    second: Line | null;
    home: boolean;
  }): string => {
    let tactic = p.continues
      ? `then to ${lineName(p.first)}`
      : `move it to ${lineName(p.first)}`;
    if (p.second) tactic += `, then ${lineName(p.second)}`;
    const suffix = p.continues
      ? ""
      : p.home
        ? ", its final spot"
        : ` ${HINT_SETTING_UP}`;
    return `${workingOn(p.tile)}${tactic}${suffix}`;
  },
};
