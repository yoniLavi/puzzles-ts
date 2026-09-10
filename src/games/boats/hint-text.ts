/**
 * Every sentence Boats' hint speaks, and the words inside them.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `narrate`); this file decides only how it reads. Each sentence runs
 * indication, reasoning, conclusion in the necessity voice
 * (docs/games/hints.md § "Writing the narration"). The never-touch water a
 * placement drags along is deliberately **not** narrated — it is a rule of the
 * game, shown by the highlight rather than restated every step (§2.9, owner
 * decision 2026-07-28).
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
 * can see, so a narration citing it says where it came from first (§2.8: name a
 * board element by what the player can see or count). Only reachable with
 * "Remove numbers" on.
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
        : "too little open water would be left to fit the rest of the fleet";
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

  // Read at both extremes (§2.7): "shows the 0 ships its number allows" is
  // nonsense, and a 0 line is the common case worth its own sentence.
  lineSatisfied: (t: T<"lineSatisfied">): string =>
    t.line.clue === 0
      ? `${lineIntro(t.line)}${lineName(t.line)}'s number is 0, so every square in it must be water.`
      : `${lineIntro(t.line)}${lineName(t.line)} already shows the ${t.line.clue} ship${plural(t.line.clue)} its number allows, so every remaining square in it must be water.`,

  lineForced: (t: T<"lineForced">, ships: number): string =>
    ships === 1
      ? `${lineIntro(t.line)}${lineName(t.line)} still needs one more ship and has just one free square left, so that square must hold a boat segment.`
      : `${lineIntro(t.line)}${lineName(t.line)} still needs ${ships} more ships and has only ${ships} free squares left, so every one of them must hold a boat segment.`,

  allWaterPlaced:
    "Every square of water the puzzle has room for is already marked, so every square still free must hold a boat segment.",

  centerForced: (t: T<"centerForced">): string =>
    t.vertical
      ? "This middle segment has water beside it, so its boat can't lie across; it must run up and down through here."
      : "This middle segment has water above or below it, so its boat must lie across, through the squares either side.",

  isolated:
    "Every 1-boat is already placed, and this square is walled in by water on all four sides, so it must be water.",

  mustExtend:
    "With every 1-boat already placed, this segment can't stand alone, and water blocks three sides, so its boat must continue here.",

  centerCount: (t: T<"centerCount">): string => {
    const room = t.line.clue;
    const lie = t.vertical ? "lying across" : "standing up through";
    return `${lineIntro(t.line)}${lineName(t.line)} has ${room === 0 ? "no room for another ship" : "room for only one more ship"}, but a boat ${lie} this middle segment needs two, so it can't go that way.`;
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
