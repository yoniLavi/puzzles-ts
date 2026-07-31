/**
 * The **per-game half of the colour token table** — every colour that belongs to
 * one game rather than to the collection.
 *
 * The shared half is [`palette.ts`](./palette.ts); read its header first. A
 * colour lives *there* when two or more games use it to mean the same thing to
 * the player, and *here* otherwise: a game's own identity colours (Cube's blue
 * die face, Inertia's gem), and the enumerated sets whose members exist to be
 * told apart from **each other** rather than to carry a recurring meaning
 * (Guess's pegs, Flood's tiles, Map's regions, Mines' per-count digits).
 *
 * ## Two games may hold the same value here, and that is not duplication
 *
 * Pure blue is Cube's die face, Untangle's vertex, Pegs' peg and Sticks' line.
 * Collapsing those into one name would assert they are the same thing, and the
 * assertion would be wrong the first time a scheme wanted a warmer Untangle
 * without touching Cube. The shared half's "each value named once" invariant is
 * therefore deliberately **not** in force here. What is in force:
 *
 * - **every export is prefixed with its game's id** — `SIGNPOST_REGION_3`,
 *   `signpostGrid`. `palette.test.ts` derives each game's allowed colours from
 *   that prefix, so the prefix is load-bearing, not decoration;
 * - **a name says what the colour means to the player**, not what it looks like
 *   (`FLOOD_TILE_3`, not `FLOOD_ORANGE`) — an appearance name is a lie the moment
 *   a second scheme gives it a different appearance, which is the entire point of
 *   a token table. Where a colour genuinely has no meaning beyond "the fourth
 *   one", the numbered name is the honest one.
 *
 * ## Constants and derivations
 *
 * A token is a constant when its value is absolute, and a **function** when the
 * colour is defined *relative* to something — the board it sits on, or another
 * token. A derivation is named and lives here for the same reason a constant
 * does: so that restyling a scheme is an edit to this table and never to a game.
 */

import type { Colour } from "../../puzzle/types.ts";
import { mix, scale, token } from "./colour-token.ts";
import { INK } from "./palette.ts";

// --- signpost ----------------------------------------------------------

/**
 * Signpost's eight **region backgrounds** — the colour a square takes from the
 * chain it currently belongs to, so that one unbroken sequence of arrows reads as
 * one object. The set is the game's whole visual language, and its members mean
 * nothing individually beyond "a different chain from that one".
 *
 * Upstream spells them as hex and divides by **256, not 255**, so `0xffffff` is
 * `0.996` rather than pure white and every entry sits a hair below its nominal
 * value. Preserved deliberately: it is what a Signpost board has always looked
 * like, and the difference is invisible except in a diff.
 *
 * Sixty-four further palette entries are built from these eight — see
 * {@link signpostRamp} — which is why eight tokens cover seventy colours.
 */
const region = (hex: number): Colour =>
  token([((hex >> 16) & 0xff) / 256, ((hex >> 8) & 0xff) / 256, (hex & 0xff) / 256]);

export const SIGNPOST_REGION_0 = region(0xffffff);
export const SIGNPOST_REGION_1 = region(0xffa07a);
export const SIGNPOST_REGION_2 = region(0x98fb98);
export const SIGNPOST_REGION_3 = region(0x7fffd4);
export const SIGNPOST_REGION_4 = region(0xc3a6ff);
export const SIGNPOST_REGION_5 = region(0xffa500);
export const SIGNPOST_REGION_6 = region(0x87cefa);
export const SIGNPOST_REGION_7 = region(0xffff00);

/** **This square's number is fixed** — a clue you were given, or a number the
 * chain has forced, as opposed to one still floating. */
export const SIGNPOST_NUMBER_SET = token([0, 0, 0.9]);

/** **You are dragging from here** — the square an in-progress link starts at. */
export const SIGNPOST_DRAG_ORIGIN = token([0.2, 1, 0.2]);

/**
 * The sixteen region backgrounds a board actually uses: the eight authored ones
 * followed by eight midpoints of consecutive pairs, so a long game with many
 * chains keeps handing out distinguishable colours.
 *
 * The last midpoint pairs region 7 with the *first* midpoint rather than wrapping
 * to region 0 — upstream writes the second half into the same array it is reading
 * from, so entry 15 sees entry 8 already filled in. Reproduced deliberately: it
 * is a real colour on real boards, and "fixing" it would repaint every game with
 * more than seven chains.
 */
export const SIGNPOST_REGION_BACKGROUNDS: readonly Colour[] = (() => {
  const base = [
    SIGNPOST_REGION_0,
    SIGNPOST_REGION_1,
    SIGNPOST_REGION_2,
    SIGNPOST_REGION_3,
    SIGNPOST_REGION_4,
    SIGNPOST_REGION_5,
    SIGNPOST_REGION_6,
    SIGNPOST_REGION_7,
  ];
  const all = [...base];
  for (let c = 0; c < 8; c++) all.push(mix(all[c], all[c + 1], 0.5));
  return all.map((c) => token(c));
})();

/**
 * A number or arrow drawn **on** a region, at two strengths: `MID` for a mark
 * that should read clearly against its region, `FAINT` for one that should be
 * present without competing (a square's own arrow when it is not the focus).
 *
 * Both are interpolations toward {@link INK} rather than authored colours,
 * because what they mean is *"this much of the way from the region toward the
 * mark"* — change a region and its two derived strengths follow, which is what
 * keeps sixteen regions from becoming forty-eight independent decisions.
 */
export const SIGNPOST_ON_REGION_MID: readonly Colour[] =
  SIGNPOST_REGION_BACKGROUNDS.map((c) => token(mix(c, INK, 0.3)));

/** @see SIGNPOST_ON_REGION_MID */
export const SIGNPOST_ON_REGION_FAINT: readonly Colour[] =
  SIGNPOST_REGION_BACKGROUNDS.map((c) => token(mix(c, INK, 0.1)));

/** A **set** number at mid strength, on the plain (region 0) background — the
 * one place {@link SIGNPOST_ON_REGION_MID}'s "toward the ink" rule does not
 * apply, because the mark is blue rather than black. */
export const SIGNPOST_NUMBER_SET_MID = token(
  mix(SIGNPOST_REGION_BACKGROUNDS[0], SIGNPOST_NUMBER_SET, 0.3),
);

/** Signpost's grid lines: the board's own brightness, stepped down just enough
 * to separate squares without drawing a line the eye follows. */
export const signpostGrid = (background: Colour): Colour => scale(background, 1 / 1.3);

/** Signpost's keyboard cursor: half the board's brightness — dark enough to find
 * on any of the sixteen region backgrounds. */
export const signpostCursor = (background: Colour): Colour => scale(background, 0.5);

/** Signpost's dimmed arrow background: a tenth of the way from the board toward
 * the arrow, so a square with no chain still shows where its arrow would be. */
export const signpostArrowDim = (background: Colour): Colour =>
  mix(background, INK, 0.1);

/** A region **washed halfway into the board** — how a square shows the chain it
 * belongs to while something else holds the player's attention. Relative to the
 * board rather than authored, so it stays a wash under any host background. */
export const signpostWashedRegion = (background: Colour, region: Colour): Colour =>
  mix(background, region, 0.5);
