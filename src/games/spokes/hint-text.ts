/**
 * Every sentence Spokes' hint speaks, and the words inside them.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `narrate`, every claim of which `deduceSpokesPlan` has checked); this file
 * decides only how it reads: one crisp line for a player who knows the rules,
 * premise then conclusion, in the necessity voice.
 */

import type { SpokesFiring } from "./solver.ts";

export const say = {
  twoOnes:
    "Connecting two 1-hubs would strand them from the rest, so rule out this spoke.",

  /** The hub's count leaves exactly its free spokes, `count` of them. */
  saturation: (count: number): string =>
    count === 1
      ? "Only one free spoke left for this hub's count, so it must be a line."
      : "Just enough free spokes left for this hub's count, so they must all be lines.",

  exhaustion: "This hub already has its lines, so the rest can't. Rule them out.",

  /** The trial (a line when `asLine`, else a mark) breaks the board in the
   * way `breakKind` names. */
  contradiction: (asLine: boolean, breakKind: SpokesFiring["breakKind"]): string => {
    const consequence =
      breakKind === "overfilled"
        ? "over-fill the ringed hub"
        : breakKind === "crossing"
          ? "force two diagonals to cross"
          : "strand the ringed hubs";
    return asLine
      ? `Drawing this line would ${consequence}, so rule it out.`
      : `Ruling this out would ${consequence}, so it must be a line.`;
  },

  // Legs 2+ of a multi-spoke firing: still necessity-voiced, and reading as
  // "same deduction".
  /** A later leg; `line` when the firing draws lines rather than marks. */
  continuation: (line: boolean): string =>
    line ? "And this one must be a line too." : "And rule this one out too.",
};
