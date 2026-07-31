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
import { fraction, mix, scale, token } from "./colour-token.ts";
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

// --- flood --------------------------------------------------------------

/**
 * Flood's ten tile colours — and the one set in the collection whose **hue is a
 * player-visible contract**, not just an appearance.
 *
 * The hint narrates moves as *"Fill with red"* (`COLOUR_NAMES` in the game's
 * renderer), so a scheme may darken or desaturate a tile but must not turn the
 * red one purple: the sentence would stop being true. That is the exception that
 * proves this table's naming rule — the tokens are numbered rather than named for
 * their colour precisely so the *name* does not encode what the scheme is allowed
 * to change, while the doc records what it is not.
 *
 * Ten values shared, character for character, with {@link GUESS_PEG_1} and its
 * nine siblings: upstream wrote the same list twice. They stay two sets, because
 * a Flood tile and a Guess peg are not the same thing to a player and there is no
 * reason a scheme must move both. Same values today; free to diverge.
 */
export const FLOOD_TILE_1 = token([1, 0, 0]);
/** @see FLOOD_TILE_1 */
export const FLOOD_TILE_2 = token([1, 1, 0]);
/** @see FLOOD_TILE_1 */
export const FLOOD_TILE_3 = token([0, 1, 0]);
/** @see FLOOD_TILE_1 */
export const FLOOD_TILE_4 = token([0.2, 0.3, 1]);
/** @see FLOOD_TILE_1 */
export const FLOOD_TILE_5 = token([1, 0.5, 0]);
/** @see FLOOD_TILE_1 */
export const FLOOD_TILE_6 = token([0.5, 0, 0.7]);
/** @see FLOOD_TILE_1 */
export const FLOOD_TILE_7 = token([0.5, 0.3, 0.3]);
/** @see FLOOD_TILE_1 */
export const FLOOD_TILE_8 = token([0.4, 0.8, 1]);
/** @see FLOOD_TILE_1 */
export const FLOOD_TILE_9 = token([0.7, 1, 0.7]);
/** @see FLOOD_TILE_1 */
export const FLOOD_TILE_10 = token([1, 0.6, 1]);

/** The ten in the order the game numbers them; `COLOUR_NAMES` is parallel. */
export const FLOOD_TILES: readonly Colour[] = [
  FLOOD_TILE_1,
  FLOOD_TILE_2,
  FLOOD_TILE_3,
  FLOOD_TILE_4,
  FLOOD_TILE_5,
  FLOOD_TILE_6,
  FLOOD_TILE_7,
  FLOOD_TILE_8,
  FLOOD_TILE_9,
  FLOOD_TILE_10,
];

// --- guess --------------------------------------------------------------

/**
 * Guess's ten peg colours — the game itself, since a Guess board carries no other
 * information. Their only meaning is *"a different peg from that one"*, so the
 * property a scheme must preserve is **mutual separation**, not any individual
 * hue.
 *
 * Measured worst pair in `hand-author-dark-palette` F2: 0.134 in light against
 * 0.070 in dark, and no background-relative formula can improve that, because
 * "tell these ten apart" is a property of the set rather than of any member.
 * These are therefore among the first tokens that want authored dark values.
 *
 * The same ten values as {@link FLOOD_TILE_1}'s set; see the note there for why
 * they are not one set.
 */
export const GUESS_PEG_1 = token([1, 0, 0]);
/** @see GUESS_PEG_1 */
export const GUESS_PEG_2 = token([1, 1, 0]);
/** @see GUESS_PEG_1 */
export const GUESS_PEG_3 = token([0, 1, 0]);
/** @see GUESS_PEG_1 */
export const GUESS_PEG_4 = token([0.2, 0.3, 1]);
/** @see GUESS_PEG_1 */
export const GUESS_PEG_5 = token([1, 0.5, 0]);
/** @see GUESS_PEG_1 */
export const GUESS_PEG_6 = token([0.5, 0, 0.7]);
/** @see GUESS_PEG_1 */
export const GUESS_PEG_7 = token([0.5, 0.3, 0.3]);
/** @see GUESS_PEG_1 */
export const GUESS_PEG_8 = token([0.4, 0.8, 1]);
/** @see GUESS_PEG_1 */
export const GUESS_PEG_9 = token([0.7, 1, 0.7]);
/** @see GUESS_PEG_1 */
export const GUESS_PEG_10 = token([1, 0.6, 1]);

/** The ten in the order the game numbers them. */
export const GUESS_PEGS: readonly Colour[] = [
  GUESS_PEG_1,
  GUESS_PEG_2,
  GUESS_PEG_3,
  GUESS_PEG_4,
  GUESS_PEG_5,
  GUESS_PEG_6,
  GUESS_PEG_7,
  GUESS_PEG_8,
  GUESS_PEG_9,
  GUESS_PEG_10,
];

/** **You solved it** — the pale cyan Guess flashes the board with on a win. */
export const GUESS_FLASH = token([0.5, 1, 1]);

/** **This peg is held** — the colour under a peg you have picked up and are
 * dragging, so the slot you lifted it from still reads as occupied. */
export const GUESS_HOLD = token([1, 0.5, 0.5]);

/**
 * Guess's board background, darkened when the host's is too pale.
 *
 * A white peg (`PIECE_WHITE`) on a white board is invisible, so the board steps
 * back until the two separate — upstream borrows the rule from Fifteen. It is a
 * derivation rather than a value because what it means is *"far enough from the
 * board that a white peg shows"*, which depends on the board.
 */
export const guessBoard = (defaultBackground: Colour): Colour => {
  const max = Math.max(...defaultBackground);
  return max * 1.2 > 1
    ? scale(defaultBackground, 1 / (max * 1.2))
    : [...defaultBackground];
};

/** **No peg here** — an empty slot, sunk two-thirds of the way down from the
 * board so a hint can point at it. */
export const guessEmptySlot = (defaultBackground: Colour): Colour =>
  fraction(guessBoard(defaultBackground), 2, 3);

// --- samegame -----------------------------------------------------------

/**
 * Samegame's nine tile colours. Like Guess's pegs they exist only to be told
 * apart, but the game is played by *clicking groups of the same colour*, so the
 * separation has to survive at small tile sizes and across a crowded board —
 * measured worst pair 0.127 light / 0.102 dark.
 */
export const SAMEGAME_TILE_1 = token([0, 0, 1]);
/** @see SAMEGAME_TILE_1 */
export const SAMEGAME_TILE_2 = token([0, 0.5, 0]);
/** @see SAMEGAME_TILE_1 */
export const SAMEGAME_TILE_3 = token([1, 0, 0]);
/** @see SAMEGAME_TILE_1 */
export const SAMEGAME_TILE_4 = token([0.7, 0.7, 0]);
/** @see SAMEGAME_TILE_1 */
export const SAMEGAME_TILE_5 = token([1, 0, 1]);
/** @see SAMEGAME_TILE_1 */
export const SAMEGAME_TILE_6 = token([0, 0.8, 0.8]);
/** @see SAMEGAME_TILE_1 */
export const SAMEGAME_TILE_7 = token([0.5, 0.5, 1]);
/** @see SAMEGAME_TILE_1 */
export const SAMEGAME_TILE_8 = token([0.2, 0.8, 0.2]);
/** @see SAMEGAME_TILE_1 */
export const SAMEGAME_TILE_9 = token([1, 0.5, 0.5]);

/** The nine in the order the game numbers them. */
export const SAMEGAME_TILES: readonly Colour[] = [
  SAMEGAME_TILE_1,
  SAMEGAME_TILE_2,
  SAMEGAME_TILE_3,
  SAMEGAME_TILE_4,
  SAMEGAME_TILE_5,
  SAMEGAME_TILE_6,
  SAMEGAME_TILE_7,
  SAMEGAME_TILE_8,
  SAMEGAME_TILE_9,
];

// --- map ----------------------------------------------------------------

/**
 * Map's four region colours — the smallest enumerated set in the collection, and
 * the only one whose size is a *theorem*: four colours suffice to colour any
 * planar map, which is the puzzle.
 *
 * Upstream calls these the non-vivid set. They are deliberately muted earth
 * tones rather than saturated hues, because a Map board is almost entirely
 * region fill and four saturated colours at that area are unpleasant to look at
 * for the length of a game.
 */
export const MAP_REGION_0 = token([0.7, 0.5, 0.4]);
/** @see MAP_REGION_0 */
export const MAP_REGION_1 = token([0.8, 0.7, 0.4]);
/** @see MAP_REGION_0 */
export const MAP_REGION_2 = token([0.5, 0.6, 0.4]);
/** @see MAP_REGION_0 */
export const MAP_REGION_3 = token([0.55, 0.45, 0.35]);

/** The four in region order. */
export const MAP_REGIONS: readonly Colour[] = [
  MAP_REGION_0,
  MAP_REGION_1,
  MAP_REGION_2,
  MAP_REGION_3,
];

// --- mines --------------------------------------------------------------

/**
 * Mines' per-count digit colours — upstream's, and by now most players'
 * expectation of what a minesweeper looks like: 1 blue, 2 green, 3 red, 4 navy,
 * 5 maroon, 6 teal.
 *
 * Counts 7 and 8 are left as {@link INK} and {@link GRID_MID} in the game rather
 * than pulled in here. They are the two upstream ran out of hues for and fell
 * back to plain text for, and text is what they should stay: a scheme lifting ink
 * for dark mode should lift them with it.
 *
 * Note that count 3 is pure red and is **not** the `ERROR` role despite sharing
 * its value today — a scheme is free to move one without the other, which is
 * exactly the distinction a token table exists to make possible.
 */
export const MINES_COUNT_1 = token([0, 0, 1]);
/** @see MINES_COUNT_1 */
export const MINES_COUNT_2 = token([0, 0.5, 0]);
/** @see MINES_COUNT_1 */
export const MINES_COUNT_3 = token([1, 0, 0]);
/** @see MINES_COUNT_1 */
export const MINES_COUNT_4 = token([0, 0, 0.5]);
/** @see MINES_COUNT_1 */
export const MINES_COUNT_5 = token([0.5, 0, 0]);
/** @see MINES_COUNT_1 */
export const MINES_COUNT_6 = token([0, 0.5, 0.5]);

/** **A flag you planted** — red because it is yours and deliberate, not because
 * anything is wrong; the mistake reds are the `ERROR` role. */
export const MINES_FLAG = token([1, 0, 0]);

/** **This count is impossible** — the pale red wash behind a number the board
 * has already contradicted. */
export const MINES_WRONG_COUNT = token([1, 0.6, 0.6]);

/** Mines' keyboard cursor: a pink tint of the highlight, so it reads on both a
 * cleared square and an uncleared one. */
export const MINES_CURSOR = token([1, 0.5, 0.5]);

/** **Not cleared yet** — the uncleared square's face, a twentieth darker than the
 * board so the grid of unknowns reads as slightly raised without a bevel. */
export const minesUnclearedFace = (background: Colour): Colour =>
  fraction(background, 19, 20);

/** Mines' bevel lowlight — two-thirds of the board, deeper than the
 * `mkhighlight` trio's because an uncleared square is drawn tall. */
export const minesLowlight = (background: Colour): Colour => fraction(background, 2, 3);
