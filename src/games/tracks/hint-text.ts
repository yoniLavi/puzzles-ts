/**
 * Every sentence the Tracks hint speaks, and every word inside one.
 *
 * The deduction decides *which* sentence and *with what values*
 * ([`hint.ts`](./hint.ts)'s `narrate`); this file decides only how it reads,
 * so a wording pass happens here and nowhere else. Values arrive as the board
 * means them (an axis, a count, a direction), never as words: the plural, the
 * "both" at two and the name of a direction are this file's to choose.
 *
 * Each sentence runs indication, reasoning, conclusion, with the conclusion in
 * the necessity voice (docs/games/hints.md § "Writing the narration"), and a
 * line is always "this column" / "this row" because its clue digit is what the
 * hint highlights: Tracks draws no line numbers to name it by.
 */

import { D, L, U } from "./state.ts";

export type Axis = "row" | "column";

/** Where a neighbor sits, as in "none above" / "none to the left". */
function towards(dir: number): string {
  if (dir === U) return "above";
  if (dir === D) return "below";
  return dir === L ? "to the left" : "to the right";
}

/** Which way a track carries on, as in "carry on upward". */
function onward(dir: number): string {
  if (dir === U) return "upward";
  if (dir === D) return "downward";
  return dir === L ? "to the left" : "to the right";
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

export const say = {
  /** A square with `open` sides left, fewer than the two a track needs. */
  onlyOneSideLeft: (open: number): string =>
    open === 0
      ? "Every side of this square is blocked, so no track can reach it: it must be empty."
      : "Only one side of this square is still open, and track needs two, so it must be empty.",

  bothSidesLeft:
    "This square carries a track with only two of its sides still open, so there's only one way for it to go.",

  /** A line whose `target` track squares are all laid. */
  clueFull: (axis: Axis, target: number): string => {
    if (target === 0) {
      return `This ${axis}'s clue is 0, so no track can run along it at all: every square in it must be empty.`;
    }
    const has =
      target === 1
        ? "the one track square its clue allows"
        : target === 2
          ? "both of the track squares its clue allows"
          : `all ${target} of the track squares its clue allows`;
    return `This ${axis} already has ${has}, so every other square in it must be empty.`;
  },

  /** A line of `len` squares whose empties are all marked, `target` short of
   * full. */
  clueExact: (axis: Axis, target: number, len: number): string => {
    const room = len - target;
    if (room === 0) {
      return `This ${axis}'s clue is ${target} and it is ${len} squares long, so every square in it must carry track.`;
    }
    const marked = plural(room, "it is already marked", "they are already marked");
    return `This ${axis} can leave only ${room} ${plural(room, "square", "squares")} empty and ${marked}, so every other square in it must carry track.`;
  },

  wouldCloseLoop:
    "The outlined track already joins these two squares, so linking them here would close a loop; this side must be blocked.",

  wouldStrandTrack:
    "Joining here would link A's run to B's and finish the track, stranding the outlined track; this side must be blocked.",

  /** Finishing here would leave the highlighted line's clue unmet. */
  wouldFinishEarly: (axis: Axis): string =>
    `Joining A's run to B's here would finish the track with the highlighted ${axis} clue short, so this side must be blocked.`,

  looseEndsFill: (axis: Axis, target: number): string =>
    `The outlined squares fill this ${axis}'s clue of ${target}, so this loose end can't run along it: that side must be blocked.`,

  // "No way across it": every unfinished square has a side blocked across the
  // line, which is what the outlined squares and their bars show.
  looseEndSpans: (axis: Axis): string =>
    `With two track squares left in this ${axis} and no way across it, this loose end must run straight on.`,

  /** Track here would carry on toward `dir`, which the line can afford once:
   * this square empties and the next fills. */
  sharedFateBoth: (axis: Axis, dir: number): string =>
    `Track here would run on ${onward(dir)}; this ${axis} has one track and one empty left: this must be empty, the next track.`,

  sharedFateFills: (axis: Axis, dir: number): string =>
    `Track here would carry on ${onward(dir)}, but this ${axis} has room for one more track square, so this must be empty.`,

  /** No track here means none in the neighbor toward `behind` either. */
  sharedFateEmpties: (axis: Axis, behind: number): string =>
    `No track here means none ${towards(behind)} either, but this ${axis} can spare just one more empty, so this must carry track.`,

  // "Every entry needs an exit" is the parity argument in the player's terms:
  // the track begins and ends off the board, so it crosses any closed block's
  // border an even number of times.
  crossingParity: (crossings: number, carries: boolean): string => {
    const marked =
      crossings === 0
        ? "none marked yet"
        : `${crossings} ${plural(crossings, "crossing", "crossings")} marked`;
    return `Every time the track enters the outlined block it must leave; with ${marked}, this last side must ${carries ? "carry track" : "be blocked"}.`;
  },
};
