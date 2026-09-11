/**
 * Every sentence Undead's hint speaks, and the words inside them.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `narrate`, which reads a sightline's two clues off the board); this file
 * decides only how it reads: the spotted indication first, then the reasoning,
 * then a necessity-voice conclusion (docs/games/hints.md § "Writing the
 * narration"). A monster set arrives as its bitmask.
 */

import { MON_GHOST, MON_VAMPIRE, MONSTERS } from "./state.ts";

/** Singular monster name for a single bit. */
function monsterName(bit: number): string {
  return bit === MON_GHOST ? "ghost" : bit === MON_VAMPIRE ? "vampire" : "zombie";
}

/** Human list of the monsters in a bitmask: "ghost", "ghost or vampire",
 * "ghost, vampire or zombie". */
function joinMonsters(bits: number, conj: "or" | "and" = "or"): string {
  const names = MONSTERS.filter((b) => bits & b).map(monsterName);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${conj} ${names[names.length - 1]}`;
}

export const say = {
  // Undead's opener is its own: it pencils monsters, not the candidate games'
  // values (`engine/hint-text.ts`'s `populateText`).
  populate:
    "Start by penciling every monster into each empty cell, so there is something to cross out.",

  /** A later cell of the same sightline firing. */
  sightlineNext: (bits: number): string =>
    `The same sightline rules the ${joinMonsters(bits, "and")} out of this cell too.`,

  // Which monster shows where is the game's rule, and the help teaches it
  // (help/games/undead.md); the step says only what this sightline's two
  // clues decide (docs/games/hints.md § "Rules belong in the help").
  /** The sightline's clues `a` and `b` leave no room for `bits` here. */
  sightline: (a: number, b: number, bits: number): string => {
    const kinds = MONSTERS.filter((m) => bits & m).length;
    const them =
      kinds === 1 ? `the ${joinMonsters(bits)}` : kinds === 2 ? "both" : "all three";
    return `This sightline's ${a} and ${b} leave no room for a ${joinMonsters(bits)} here, so we must cross out ${them}.`;
  },

  total: (monster: number): string => {
    const name = monsterName(monster);
    return `No ${name}s are left to place, so no undecided cell can be one; we must cross out the ${name} here.`;
  },

  onlyCells: (monster: number): string => {
    const name = monsterName(monster);
    return `Exactly as many cells can still hold a ${name} as there are ${name}s left to place, so this one can only be a ${name}.`;
  },

  single: (bits: number): string => {
    const list = joinMonsters(bits);
    return `Only the ${list} is left uncrossed in this cell, so it can only be a ${list}.`;
  },
};
