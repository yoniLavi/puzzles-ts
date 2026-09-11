/**
 * The record shape a recording solver emits, and the callback it emits through.
 *
 * This is the seam between a game's *recording deduction pass* and the shared
 * hint-plan mechanics in [`candidate-hint.ts`](./candidate-hint.ts): every game
 * produces these from its own techniques, and the shared readers (`nextStrike`,
 * `nextPlace`, `firstUnreflectedPlaceIndex`) consume them uniformly.
 *
 * Nothing here is Latin — the reason is `unknown` precisely so each game
 * attaches its own — so it lives apart from `latin.ts`, and a non-Latin
 * candidate game (Crossing) speaks it without importing the Latin solver.
 * `latin.ts` re-exports both names for the Latin games.
 */

/** One recorded deduction operation. Emitted in solver order on the hint path;
 * `group` ties together every record of a single deduction *firing* (one
 * top-level deduction attempt), so a firing forcing several strikes becomes one
 * grouped hint step. `reason` is the game's own reason object (a `LatinReason`
 * for the generic Latin deductions). */
export interface DeductionRecord {
  kind: "place" | "elim";
  x: number;
  y: number;
  n: number;
  reason: unknown;
  group: number;
}

export type DeductionRecorder = (rec: DeductionRecord) => void;
