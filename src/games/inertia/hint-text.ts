/**
 * Every sentence Inertia's hint speaks, and the words inside them.
 *
 * Which sentence a move gets is `hint.ts`'s `narrate` to decide, from what it
 * has checked about the move; this file decides only how it reads. Every
 * sentence states only what was checked — see `narrate` for which check backs
 * which branch.
 *
 * The refusals are not here: they are held to one list by `hint-refusal.ts`
 * and its test, and a game-specific one (the dead ball) is a named exception
 * there.
 */

import type { SlidePath } from "./state.ts";

const DIR_NAMES = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
] as const;

const NUMBER_WORDS = ["no", "a", "two", "three", "four", "five", "six"] as const;

/** "a gem", "three gems": also what the stranded-ball refusal says. */
export const gemsPhrase = (n: number): string =>
  n === 1 ? "a gem" : `${NUMBER_WORDS[n] ?? n} gems`;

/** What brings the ball to a halt — the rule the whole game turns on, so the
 * collecting narration always names it. */
function stopClause(stopper: SlidePath["stopper"]): string {
  return stopper === "stop"
    ? "the stop square at the end catches you"
    : "the wall at the end brings you up short";
}

/** Why this is the only move: every other way is walled off, or runs onto a
 * mine. */
type Only = "mines" | "walls";

const working = "Working on the marked gem";

export const say = {
  /** The leg's payoff: the slide sweeps up the marked gem, after `extras`
   * others on the way, and stops against `stopper`. */
  collect: (
    dir: number,
    extras: number,
    only: Only | null,
    stopper: SlidePath["stopper"],
  ): string => {
    const d = DIR_NAMES[dir];
    const sweep = extras
      ? `it sweeps up ${gemsPhrase(extras)} and then the marked gem`
      : "it sweeps up the marked gem";
    if (only === "mines") {
      return `Slide ${d}: ${sweep}, the only direction that doesn't run you onto a mine.`;
    }
    if (only === "walls") {
      return `Slide ${d}: ${sweep}, and walls block every other direction.`;
    }
    return `Slide ${d}: ${sweep}, and ${stopClause(stopper)}.`;
  },

  // A move that collects nothing says what it is *for*.
  /** The only move the ball has, collecting nothing. */
  forced: (dir: number, only: Only): string =>
    only === "mines"
      ? `${working}: slide ${DIR_NAMES[dir]}, because every other direction you can set off in runs you onto a mine.`
      : `${working}: slide ${DIR_NAMES[dir]}, because walls block every other direction.`,

  /** Sliding `grab` would take the gem but strand `stranded` others. */
  strands: (grab: number, stranded: number, dir: number): string =>
    `Sliding ${DIR_NAMES[grab]} grabs the marked gem, but you don't choose where you stop, and it strands ${gemsPhrase(stranded)}: slide ${DIR_NAMES[dir]} instead.`,

  // The route declines a grab it could take. Which side the ball comes at a
  // gem from decides where it fetches up, so this is a real trade-off — but we
  // have not proved the grab is a trap, so we don't say it is.
  declined: (dir: number): string =>
    `${working}: slide ${DIR_NAMES[dir]}. Sweeping it up straight from here is possible, but the route comes at it from another side.`,

  /** No slide reaches the gem yet; `oneMore` when the plan's next slide does. */
  positioning: (dir: number, oneMore: boolean): string =>
    oneMore
      ? `${working}: no slide from here reaches it. Slide ${DIR_NAMES[dir]}, and one more slide sweeps it up.`
      : `${working}: no slide from here reaches it. Slide ${DIR_NAMES[dir]} to work the ball round toward it.`,
};
