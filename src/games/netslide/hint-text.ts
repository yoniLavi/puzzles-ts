/**
 * Every sentence Netslide's hint speaks, and the words inside them.
 *
 * Which tile a step is about, where it is going and whether it arrives are
 * `hint.ts`'s `narrateStep` to decide; this file decides only how it reads.
 *
 * Every clause is a claim, and every clause has to earn the width it takes on
 * the hint bar. Two things are worth saying about the tile being placed:
 *
 * - it sits on a line that **cannot be slid**, so only the perpendicular line can
 *   shift it — a single degree of freedom, and the game's whole technique;
 * - or its destination is a cell the finished board wants its wires in, which is
 *   just stated, plainly.
 *
 * What is *not* said: that the source can never move. That is a **rule of the
 * game**, not a deduction about this move — the board already shows it (no arrows
 * are drawn beside the source's row or column) and it belongs in the help text.
 * Saying it every step made the commonest sentence 1.8× the length of the rest and
 * taught nothing the second time.
 *
 * Lines are named by **number** ("row 3 never slides"), never as "the center":
 * `cx` is `⌊w/2⌋`, so on an even-sized board the source is visibly off-center and
 * the player can see the claim is false.
 *
 * The move itself is *not* forced by logic — Netslide is a movement game — so
 * the conclusion is an imperative, never a modal of necessity.
 */

import { HINT_SETTING_UP } from "../../engine/hint-text.ts";
import { D, L, R, U, wireCount } from "./state.ts";

/** A row or column as the player counts it, 1-based. */
export interface Line {
  axis: "row" | "column";
  n: number;
}

const place = (l: Line): string => `${l.axis} ${l.n}`;

/** A tile's name is its shape, which is the one thing about it the player can
 * see. There is no "tile 8" in Netslide, so the shape names the *kind* and the
 * board's highlight says *which one*. */
function tileName(mask: number): string {
  const wires = wireCount(mask);
  if (wires === 1) return "loose end";
  if (wires === 3) return "T-piece";
  if (wires === 4) return "cross";
  return mask === (L | R) || mask === (U | D) ? "straight" : "corner";
}

/** How a first leg closes: on the arrival, or on the shared staging marker. */
const tail = (home: boolean): string =>
  home ? ", where it belongs" : ` ${HINT_SETTING_UP}`;

export const say = {
  /** A later leg of the journey: it neither re-introduces the tile nor
   * re-explains the why, since leg one carried both and is still on screen. */
  next: (to: Line, home: boolean): string =>
    `Now on to ${place(to)}${home ? ", where it belongs" : ""}.`,

  /** The tile (wired as `mask`) sits in the source's row, numbered `row`. */
  rowFixed: (row: number, mask: number, to: Line, home: boolean): string =>
    `Row ${row} never slides, so only a column move can shift this ${tileName(mask)}: take it to ${place(to)}${tail(home)}.`,

  /** The tile sits in the source's column, numbered `col`. */
  colFixed: (col: number, mask: number, to: Line, home: boolean): string =>
    `Column ${col} never slides, so only a row move can shift this ${tileName(mask)}: take it to ${place(to)}${tail(home)}.`,

  // Stated, not argued: *why* the source is fixed is a rule, and rules live in
  // the help text. "Belongs beside the source" is itself the arrival marker, so
  // the arriving leg closes on it rather than on `tail`'s ", where it belongs"
  // (which would say "belongs" twice); a leg still on its way keeps the shared
  // "(setting up)" marker.
  besideSource: (mask: number, to: Line, home: boolean): string =>
    home
      ? `Take this ${tileName(mask)} to ${place(to)}; it belongs beside the source.`
      : `This ${tileName(mask)} belongs beside the source: take it to ${place(to)} ${HINT_SETTING_UP}.`,

  working: (mask: number, to: Line, home: boolean): string =>
    `Working on the highlighted ${tileName(mask)}: take it to ${place(to)}${tail(home)}.`,
};
