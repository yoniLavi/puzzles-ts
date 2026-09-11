/**
 * Every sentence Boats' hint speaks, and the words inside them.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `narrate`); this file decides only how it reads. Each sentence runs
 * indication, reasoning, conclusion in the necessity voice
 * (docs/games/hints.md § "Writing the narration"). The never-touch water a
 * placement drags along is deliberately **not** narrated — it is a rule of the
 * game, shown by the highlight rather than restated every step
 * (docs/games/hints.md § "Rules belong in the help").
 */

import type { BoatsBreach, BoatsLine, BoatsTechnique } from "./hint-solver.ts";
import { SHIP_BOTTOM, SHIP_LEFT, SHIP_SINGLE, SHIP_TOP } from "./state.ts";

type T<K extends BoatsTechnique["kind"]> = Extract<BoatsTechnique, { kind: K }>;

const plural = (n: number): string => (n === 1 ? "" : "s");

/** A line as the player reads it: 1-based, counting from the top / the left. */
function lineName(line: BoatsLine): string {
  return `${line.horizontal ? "Row" : "Column"} ${line.index + 1}`;
}

/**
 * A hidden occupancy number the deduction recovered is not a number the player
 * can see, so a narration citing it says where it came from first
 * (docs/games/hints.md § "Name elements by what the player can see"). Only
 * reachable with "Remove numbers" on.
 */
function lineIntro(line: BoatsLine): string {
  return line.deduced
    ? `${lineName(line)}'s hidden number can only be ${line.clue}. `
    : "";
}

/** The consequence clause of a refutation — the rule the rejected trial broke,
 * read off the validator's own rejection (docs/games/hints.md § "Read the reason off the validator"). */
function breachClause(breach: BoatsBreach): string {
  switch (breach.kind) {
    case "collision":
      return "two boats would end up touching corner to corner";
    case "count":
      return `${lineName(breach.line).toLowerCase()} could no longer reach its ${breach.line.clue}`;
    case "fleet":
      return "it would complete a boat the fleet has no room for";
    case "fleetTotal":
      return breach.tooMany
        ? "there would be more boat squares than the whole fleet has"
        : "the rest of the fleet would no longer fit";
    case "clue":
      return "a given segment's own shape would be contradicted";
    case "unfinishable":
      return "the rest of the fleet could no longer be placed legally";
  }
}

export const say = {
  /** A given segment, with `ships` boat squares and `waters` water squares
   * to decide around it. */
  givenClue: (t: T<"givenClue">, ships: number, waters: number): string => {
    const side =
      t.shape === SHIP_TOP
        ? { on: "top", into: "below it", behind: "above it" }
        : t.shape === SHIP_BOTTOM
          ? { on: "bottom", into: "above it", behind: "below it" }
          : t.shape === SHIP_LEFT
            ? { on: "left", into: "to its right", behind: "to its left" }
            : { on: "right", into: "to its left", behind: "to its right" };
    if (t.shape === SHIP_SINGLE)
      return "This given segment is a whole one-square boat, so all four squares beside it must be water.";
    if (ships === 0)
      return `This segment is a boat's ${side.on} end, so nothing can sit ${side.behind}; that square must be water.`;
    if (waters === 0)
      return `This segment is a boat's ${side.on} end, so its boat must continue into the square ${side.into}.`;
    return `This segment is a boat's ${side.on} end, so its boat must continue ${side.into}, and the square ${side.behind} must be water.`;
  },

  neverTouch: (waters: number): string =>
    `Boats never touch, not even at a corner, so the square${plural(waters)} diagonally beside this segment must be water.`,

  // Read at both extremes (docs/games/hints.md § "Sanity-read at the
  // degenerate extremes"): "shows the 0 ships its number allows" is nonsense,
  // and a 0 line is the common case worth its own sentence.
  lineSatisfied: (t: T<"lineSatisfied">): string =>
    t.line.clue === 0
      ? `${lineName(t.line)}'s ${t.line.deduced ? "hidden number can only be" : "number is"} 0, so every square in it must be water.`
      : t.line.deduced
        ? `${lineName(t.line)}'s hidden number can only be ${t.line.clue}, and it already has that many boat squares, so the rest must be water.`
        : `${lineName(t.line)} already has the ${t.line.clue} boat square${plural(t.line.clue)} its number allows, so every remaining square in it must be water.`,

  lineForced: (t: T<"lineForced">, ships: number): string =>
    ships === 1
      ? t.line.deduced
        ? `${lineName(t.line)}'s hidden number can only be ${t.line.clue}, so its one free square must hold a boat segment.`
        : `${lineName(t.line)} still needs one more boat square and has just one free square left, so that square must hold a boat segment.`
      : t.line.deduced
        ? `${lineName(t.line)}'s hidden number can only be ${t.line.clue}, so all ${ships} of its free squares must hold boat segments.`
        : `${lineName(t.line)} still needs ${ships} more boat squares and has only ${ships} free squares left, so each must hold a boat segment.`,

  allWaterPlaced:
    "Every square of water the puzzle has room for is already marked, so every square still free must hold a boat segment.",

  centerForced: (t: T<"centerForced">): string =>
    t.vertical
      ? "This middle segment has water beside it, so its boat can't lie across; it must run up and down through here."
      : "This middle segment has water above or below it, so its boat must lie across, through the squares either side.",

  isolated:
    "Every 1-boat is already placed, and water or the board's edge surrounds this square, so it must be water.",

  mustExtend:
    "Every 1-boat is placed, and water or the edge closes three sides, so this segment's boat must continue here.",

  centerCount: (t: T<"centerCount">): string => {
    const way = t.vertical ? "across" : "up and down";
    const room = t.room === 0 ? "no more boat squares" : "only one more boat square";
    return t.line.deduced
      ? `${lineName(t.line)}'s hidden number, ${t.line.clue}, leaves room for ${room}, so a boat can't run ${way} through here.`
      : `${lineName(t.line)} has room for ${room}, so a boat can't run ${way} through this middle segment.`;
  },

  growTooLong: (t: T<"growTooLong">): string =>
    t.largest === 0
      ? "Every boat in the fleet has been found, so any square still free must be water."
      : `Filling this square would make a boat of ${t.joined}, and the largest one still missing is ${t.largest}, so it must be water.`,

  mustGrow: (t: T<"mustGrow">): string =>
    `Every ${t.length}-boat is already placed, so this unfinished boat can't stop at ${t.length}; it must continue into this square.`,

  runTooShort: (t: T<"runTooShort">): string =>
    `Filling this run would make a boat of ${t.length}, but every ${t.length}-boat is already placed, so the free square must be water.`,

  onlyRunsLeft: (t: T<"onlyRunsLeft">): string =>
    t.runs === 1
      ? `Only one run can still hold the ${t.size}-boat, so it must go there, and these squares are covered wherever it sits.`
      : `Only ${t.runs} runs can still hold the ${t.runs} remaining ${t.size}-boats, so every one is used, and these squares are covered either way.`,

  sharedDiagonal: (t: T<"sharedDiagonal">): string => {
    const side = t.line.horizontal ? "above and below" : "either side of";
    return `${lineIntro(t.line)}${lineName(t.line)} can take only ${t.room} more water square${plural(t.room)}, so one of these must be a boat segment; either way, the squares ${side} the middle one must be water.`;
  },

  refuted: (t: T<"refuted">): string =>
    t.trialShip
      ? `If this square held a boat segment, ${breachClause(t.breach)}, so it must be water.`
      : `If this square were water, ${breachClause(t.breach)}, so it must hold a boat segment.`,
};
