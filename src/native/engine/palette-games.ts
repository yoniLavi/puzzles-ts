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
import { divide, fraction, mix, scale, token } from "./colour-token.ts";
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
  // The eight authored tokens go in **as themselves**, not re-wrapped: a token is
  // recognised downstream by identity, so a copy here would leave
  // `SIGNPOST_REGION_3` referenced by nothing and unable to carry a scheme value.
  const all = [...base];
  for (let c = 0; c < 8; c++) all.push(token(mix(all[c], all[c + 1], 0.5)));
  return all;
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
export const signpostGrid = (background: Colour): Colour => divide(background, 1.3);

/** Signpost's keyboard cursor: half the board's brightness — dark enough to find
 * on any of the sixteen region backgrounds. */
export const signpostCursor = (background: Colour): Colour => divide(background, 2);

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

// --- abcd ---------------------------------------------------------------

/** ABCD's **border clue letters** — the letters ringing the grid, in a blue that
 * tracks the board so they stay subordinate to the grid they annotate. Upstream
 * derives all three channels from the background's *green*. */
export const abcdBorderLetter = (outerBackground: Colour): Colour => [
  0,
  0,
  0.6 * outerBackground[1],
];

// --- ascent -------------------------------------------------------------

/** **The path you have drawn** through the grid. */
export const ASCENT_LINE = token([0, 0.5, 0]);

/** **A given number** — a clue the puzzle placed, which you cannot move. */
export const ASCENT_IMMUTABLE = token([0, 0, 1]);

/** Ascent's keyboard cursor. The same green four of the x-sheep-derived games
 * chose independently (Bricks, Clusters, Unruly) — kept per game rather than
 * promoted, because the audit examined "cursor" as a collection-wide role and
 * found seventeen games with seventeen deliberately different cursors. */
export const ASCENT_CURSOR = token([0, 0.7, 0]);

/** **Which way this step goes** — the direction arrow drawn on a path segment,
 * a pale cream that reads on the green line without competing with it. */
export const ASCENT_ARROW = token([1, 1, 0.8]);

// --- blackbox -----------------------------------------------------------

/** Blackbox's **fire button** — the arrow you click to send a beam in. */
export const BLACKBOX_BUTTON = token([0, 1, 0]);

/** **You got them all** — the colour the result text flashes on a win. */
export const BLACKBOX_FLASH_TEXT = token([0, 1, 0]);

/** Blackbox's cursor. Red rather than the collection's usual, because the board
 * is grey throughout and red is the only hue not already spoken for. */
export const BLACKBOX_CURSOR = token([1, 0, 0]);

/** The grid inside the box: a tenth off the board, present but not drawn. */
export const blackboxGrid = (background: Colour): Colour => scale(background, 0.9);

/** **This square is locked** — a deduction you have committed to and asked the
 * game to hold, a third of the way down from the board. */
export const blackboxLock = (background: Colour): Colour => scale(background, 0.7);

/** **Hidden** — the shade covering a square whose contents you have not
 * established, half the board's brightness so the covered area reads as one
 * mass. */
export const blackboxCover = (background: Colour): Colour => scale(background, 0.5);

// --- boats --------------------------------------------------------------

/** **Open water** — a square you have established holds no ship. */
export const BOATS_WATER = token([0.5, 0.7, 1]);

/** **A given ship segment** — one the puzzle placed as a clue, near-black so it
 * reads as fixed against the ships you place in {@link INK}. */
export const BOATS_SHIP_CLUE = token([0.1, 0.1, 0.1]);

/** A ship segment the board has contradicted. Deeper than the `ERROR` role
 * because it is painted over a large filled shape rather than stroked on one. */
export const BOATS_SHIP_ERROR = token([0.8, 0, 0]);

/** **Still to place** — a ship in the fleet roster below the board. */
export const BOATS_FLEET = token([0, 0.5, 0]);

/** **Already placed** — a fleet roster entry you have accounted for, greyed. */
export const BOATS_FLEET_DONE = token([0.7, 0.7, 0.7]);

// --- bricks -------------------------------------------------------------

/** **A brick** — the filled square, near-black rather than black so the grid
 * lines stay visible across it. */
export const BRICKS_SHADE = token([0.1, 0.1, 0.1]);

/** @see ASCENT_CURSOR */
export const BRICKS_CURSOR = token([0, 0.7, 0]);

// --- bridges ------------------------------------------------------------

/** **This island is selected** — the one a bridge is being drawn from. */
export const BRIDGES_SELECTED = token([0.25, 1, 0.25]);

/** **Too many bridges here** — the soft red an over-connected island takes, also
 * the mistake overlay. Softer than `ERROR` because it fills the island disc. */
export const BRIDGES_WARNING = token([1, 0.25, 0.25]);

/** Bridges' grid: halfway between the board and its own bevel lowlight, so it
 * separates cells without reading as a drawn line. */
export const bridgesGrid = (background: Colour, lowlight: Colour): Colour =>
  mix(lowlight, background, 0.5);

/** Bridges' cursor: the board with its red channel pushed up and the other two
 * pulled down — a warm tint of whatever the board is, rather than a fixed pink,
 * so it stays a *tint* on any host. */
export const bridgesCursor = (background: Colour): Colour => [
  Math.min(background[0] * 1.4, 1),
  background[1] * 0.8,
  background[2] * 0.8,
];

// --- clusters -----------------------------------------------------------

/** The two cluster colours — the game is telling these apart, so what matters is
 * that they stay far apart, not what either one is. */
export const CLUSTERS_0 = token([0.8, 0.5, 0.5]);
/** @see CLUSTERS_0 */
export const CLUSTERS_1 = token([0.1, 0.1, 0.8]);

/** The dot marking a {@link CLUSTERS_0} cell, near-black so it reads on the
 * paler of the two. */
export const CLUSTERS_0_DOT = token([0.1, 0.1, 0.1]);

/** @see ASCENT_CURSOR */
export const CLUSTERS_CURSOR = token([0, 0.7, 0]);

/** **This is the cell that would go wrong** — the hint's warning emphasis, an
 * amber distinct from both the blue hint action and the red error. */
export const CLUSTERS_HINT_DANGER = token([0.95, 0.6, 0.15]);

// --- crossing -----------------------------------------------------------

/** Crossing's **wall** — the base shade the game's bevel trio is built from. */
export const CROSSING_WALL = token([0.3, 0.3, 0.3]);

/** **The word you are holding** — one lifted from the bank and not yet placed. */
export const CROSSING_HELD = token([0, 0.35, 0.85]);

/**
 * The two **run** washes, across and down, and their *fitted* counterparts for a
 * run that is fully placed.
 *
 * Matched in **OKLCH**, not RGB: identical lightness and chroma, differing only
 * in hue (250 blue / 60 amber). The obvious RGB mirror does not work, because the
 * channels carry very different luminance — `rgb(152,194,211)` against
 * `rgb(211,194,152)` measures L 0.789 C 0.051 against L 0.818 C 0.059, so the
 * amber came out both lighter and more colourful and duly looked stronger.
 * Perceived colourfulness is what the eye compares, so it is what has to be
 * equal. **A scheme must keep them matched, or one direction will look like the
 * important one.**
 */
export const CROSSING_ACROSS = token([0.6358, 0.7854, 0.9429]);
/** @see CROSSING_ACROSS */
export const CROSSING_DOWN = token([0.9044, 0.7296, 0.5911]);
/** @see CROSSING_ACROSS */
export const CROSSING_ACROSS_FIT = token([0.1499, 0.4005, 0.6341]);
/** @see CROSSING_ACROSS */
export const CROSSING_DOWN_FIT = token([0.5706, 0.3156, 0.0216]);

/**
 * Crossing's hint pair — green, and a **deliberate departure** from the
 * collection's blue `HINT_ACTION`.
 *
 * Crossing has already spent blue: {@link CROSSING_ACROSS} is a pale blue wash
 * meaning "this is a horizontal run", and the collection's hint blue measures
 * within a whisker of it (L 0.82 C 0.07 h 250 against L 0.83 C 0.06 h 245). A
 * hint mark the player reads as "across" is worse than a hint in an unfamiliar
 * hue, so the hint takes the far corner of the wheel from both dimension hues.
 */
export const CROSSING_HINT = token([0.3811, 0.7399, 0.4024]);
/** @see CROSSING_HINT */
export const CROSSING_HINT_CELL = token([0.8523, 0.9559, 0.8515]);

/** **Not placed yet** — a ghosted word, light enough to read as provisional and
 * dark enough to read at all. */
export const crossingGhost = (background: Colour): Colour => scale(background, 0.55);

// --- cube ---------------------------------------------------------------

/** The **painted face** of Cube's die — the one thing on the board that is not
 * board. */
export const CUBE_FACE = token([0, 0, 1]);

// --- dominosa -----------------------------------------------------------

/** **These two dominoes are the same** — the duplicate-pair clash, a dark red
 * that reads against the black domino it is drawn over. */
export const DOMINOSA_CLASH = token([0.5, 0, 0]);

/** The two **reference emphases** the hint uses to point at a pair of dominoes
 * it is comparing. Two hues, because the point is that these are *two* things. */
export const DOMINOSA_HIGHLIGHT_1 = token([0.85, 0.2, 0.2]);
/** @see DOMINOSA_HIGHLIGHT_1 */
export const DOMINOSA_HIGHLIGHT_2 = token([0.3, 0.85, 0.2]);

/** The reference aid's spotlight — the domino the side panel is pointing at. */
export const DOMINOSA_REFERENCE = token([0.6, 0.2, 0.8]);

/** The line between two halves of a laid domino: two-thirds of the board, so a
 * domino reads as one piece with a seam rather than as two cells. */
export const dominosaEdge = (background: Colour): Colour => fraction(background, 2, 3);

// --- fifteen ------------------------------------------------------------

/** **Move this tile** — Fifteen's hinted tile. The same blue as Sixteen's; the
 * two are the same kind of game and the audit found their hint marks already
 * agreed. */
export const FIFTEEN_HINT = token([0.3, 0.5, 0.9]);

// --- filling ------------------------------------------------------------

/** **This region is the right size** — Filling's local completion feedback. A
 * tenth off the board: enough to see a finished region at a glance, little
 * enough that most of the board being finished is not a wall of grey. */
export const fillingCorrect = (background: Colour): Colour => scale(background, 0.9);

/** Filling's keyboard cursor: half the board. */
export const fillingCursor = (background: Colour): Colour => scale(background, 0.5);

// --- flip ---------------------------------------------------------------

/** **Flip this tile** — Flip's hinted square. Red rather than the collection's
 * hint blue: a Flip board is grey and white only, and the hint has to survive
 * being drawn on either. */
export const FLIP_HINT = token([1, 0, 0]);

/** Flip's cursor, a darker red than {@link FLIP_HINT} so the two are still
 * separable when the hint lands under the cursor. */
export const FLIP_CURSOR = token([0.8, 0, 0]);

/** **This tile is wrong side up** — the dark face of a Flip tile, a third of the
 * board's brightness. */
export const flipWrongFace = (background: Colour): Colour => divide(background, 3);

/** Flip's grid, and the diagonal marks drawn in the same shade. */
export const flipGrid = (background: Colour): Colour => divide(background, 1.5);

// --- galaxies -----------------------------------------------------------

/** **This region is black** — one of Galaxies' two region fills, at three tenths
 * of the board so a black region reads as filled without becoming ink. */
export const galaxiesBlackRegion = (background: Colour): Colour =>
  scale(background, 0.3);

/** Galaxies' grid: a fifth off the board. */
export const galaxiesGrid = (background: Colour): Colour => scale(background, 0.8);

/** Galaxies' cursor — the same warm tint of the board Bridges uses, arrived at
 * independently in both ports from the same upstream idiom. */
export const galaxiesCursor = (background: Colour): Colour => bridgesCursor(background);

// --- group --------------------------------------------------------------

/** Group's **leading diagonal** — the cells where an element meets itself,
 * shaded a twentieth off the board because the hint is structural, not a state
 * the player set. */
export const groupDiagonal = (background: Colour): Colour => scale(background, 0.95);

// --- inertia ------------------------------------------------------------

/** **You** — the ball you are steering. */
export const INERTIA_PLAYER = token([0, 1, 0]);

/** **You hit a mine** — the ball, dead. Not the `ERROR` role: nothing about the
 * board is wrong, the run is simply over. */
export const INERTIA_DEAD_PLAYER = token([1, 0, 0]);

/** **A gem** — what you are collecting. */
export const INERTIA_GEM = token([0.6, 1, 1]);

/** **Go this way** — the hint's suggested direction. Yellow rather than the
 * collection's hint blue: an Inertia board already carries a green player, cyan
 * gems and black mines, and the hint has to be visible over the floor. */
export const INERTIA_HINT = token([1, 1, 0]);

/** **This is what the hint is going for** — the gem the plan is heading toward,
 * marked because Inertia's hint holds a subgoal the game has no name for. */
export const INERTIA_HINT_GOAL = token([0.7, 0.15, 1]);

// --- lightup ------------------------------------------------------------

/** **Lit** — a square a lamp is shining on. */
export const LIGHTUP_LIT = token([1, 1, 0]);

/** **Two lamps see each other** — a pale red *fill* behind a lit square, so its
 * paleness is load-bearing the way `HINT_FILL`'s is: the yellow lit-square
 * colour has to remain readable underneath. */
export const LIGHTUP_ERROR_FILL = token([1, 0.25, 0.25]);

/** The hint's **dark reference** — a black square the deduction is reasoning
 * from. Amber, because Light Up's `HINT_BLACKREF` slot is already spent on the
 * lit reference. */
export const LIGHTUP_HINT_DARKREF = token([0.98, 0.78, 0.42]);

/** Light Up's grid: two-thirds of the board. */
export const lightupGrid = (background: Colour): Colour => divide(background, 1.5);

/** Light Up's keyboard cursor: half the board. */
export const lightupCursor = (background: Colour): Colour => divide(background, 2);

// --- magnets ------------------------------------------------------------

/** Magnets' cursor — a near-white, because the board's own greys are already
 * carrying the poles. */
export const MAGNETS_CURSOR = token([0.9, 0.9, 0.9]);

/** **Neutral** — a domino placed with no poles. */
export const MAGNETS_NEUTRAL = token([0.1, 0.6, 0.1]);

/** **Positive pole.** Its opposite is {@link INK}, which is why this is a strong
 * red rather than the `ERROR` red: the pair has to read as two poles, not as one
 * pole and a warning. */
export const MAGNETS_POSITIVE = token([0.8, 0, 0]);

/** **Definitely not a magnet** — the cross you mark an empty domino with. */
export const MAGNETS_NOT = token([0.2, 0.2, 1]);

// --- mathrax ------------------------------------------------------------

/** **You entered this** — Mathrax's placed digit. A fixed green rather than the
 * background-derived `playerEntryColour` role, which is a difference of 0.004
 * that nobody chose; see the note in this change's design. */
export const MATHRAX_GUESS = token([0, 0.5, 0]);

/** Mathrax's pencil marks — teal, distinct from the green of a placed digit. */
export const MATHRAX_PENCIL = token([0, 0.5, 0.5]);

// --- mosaic -------------------------------------------------------------

/**
 * Mosaic's board vocabulary — the one game in the collection with a colour scheme
 * of its own rather than a grey board with marks on it: a teal-tinted unmarked
 * cell, a teal grid, near-black for a filled cell, near-white for one ruled out.
 *
 * Authored as 8-bit values over 255, which is how they were designed; kept in
 * that spelling so the intended bytes stay legible.
 */
export const MOSAIC_UNMARKED = token([148 / 255, 196 / 255, 190 / 255]);
/** @see MOSAIC_UNMARKED */
export const MOSAIC_GRID = token([0, 102 / 255, 99 / 255]);
/** @see MOSAIC_UNMARKED */
export const MOSAIC_MARKED = token([20 / 255, 20 / 255, 20 / 255]);
/** @see MOSAIC_UNMARKED */
export const MOSAIC_BLANK = token([236 / 255, 236 / 255, 236 / 255]);
/** **Solved** — the grey the clue numbers fade to once the board is done. */
export const MOSAIC_TEXT_SOLVED = token([100 / 255, 100 / 255, 100 / 255]);
/** Mosaic's cursor. */
export const MOSAIC_CURSOR = token([1, 200 / 255, 200 / 255]);

// --- net / netslide -----------------------------------------------------

/**
 * Net's wire vocabulary. Netslide holds the same three values under its own
 * names: the two games are the same idea with a different move, so they agree
 * today — but they are two games, and nothing should force a scheme to move both
 * at once. (Considered promoting these to shared roles; declined because "wire"
 * is a two-game family concept rather than a collection-wide meaning, and the
 * prefix rule is what makes the guard mechanical.)
 */
export const NET_POWERED = token([0, 1, 1]);
/** **An endpoint, not yet lit.** @see NET_POWERED */
export const NET_ENDPOINT = token([0, 0, 1]);
/** **A wall** — an edge no wire can cross. Red because it is impassable, not
 * because anything is wrong. */
export const NET_BARRIER = token([1, 0, 0]);

/** Net's tile borders: half the board. */
export const netBorder = (background: Colour): Colour => scale(background, 0.5);

/** **This tile is locked** — you have decided its orientation and asked the game
 * to hold it. Between the board and its border, so a locked tile reads as
 * settled rather than as marked. */
export const netLocked = (background: Colour): Colour => scale(background, 0.75);

/** @see NET_POWERED */
export const NETSLIDE_POWERED = token([0, 1, 1]);
/** @see NET_POWERED */
export const NETSLIDE_ENDPOINT = token([0, 0, 1]);
/** @see NET_BARRIER */
export const NETSLIDE_BARRIER = token([1, 0, 0]);

/** The shade Netslide flashes the board with on a win. */
export const netslideFlashing = (background: Colour): Colour => scale(background, 0.75);
/** @see netBorder */
export const netslideBorder = (background: Colour): Colour => scale(background, 0.5);
/** Netslide's bevel lowlight — it takes the host background as-is rather than
 * through `mkhighlight`, so it derives its own. */
export const netslideLowlight = (background: Colour): Colour => scale(background, 0.8);

// --- pattern ------------------------------------------------------------

/** Pattern's grid, dark enough to hold a board made mostly of black cells. */
export const PATTERN_GRID = token([0.3, 0.3, 0.3]);

/** **Undecided** — a cell you have neither filled nor ruled out. */
export const PATTERN_UNKNOWN = token([0.5, 0.5, 0.5]);

/** The cross-hairs running out from the cursor along its row and column, so you
 * can see which clue you are working against. */
export const PATTERN_CURSOR_GUIDE = token([0.5, 0.5, 0.5]);

/** Pattern's cursor. */
export const PATTERN_CURSOR = token([1, 0.25, 0.25]);

// --- pearl --------------------------------------------------------------

/** Pearl's grid — a fixed mid-dark grey rather than a wash of the board, because
 * the board carries white pearls that must not swallow it. */
export const PEARL_GRID = token([0.4, 0.4, 0.4]);

/** **You are dragging a line on here** / **off here** — the two drag states, a
 * saturated blue for laying line and a pale one for erasing it. */
export const PEARL_DRAG_ON = token([0, 0, 1]);
/** @see PEARL_DRAG_ON */
export const PEARL_DRAG_OFF = token([0.8, 0.8, 1]);

// --- pegs ---------------------------------------------------------------

/** **A peg.** */
export const PEGS_PEG = token([0, 0, 1]);
/** Pegs' cursor — a pale tint of {@link PEGS_PEG}, so the cursor reads as
 * "a peg could go here". */
export const PEGS_CURSOR = token([0.5, 0.5, 1]);

// --- rect ---------------------------------------------------------------

/** **You are dragging out a rectangle** / **erasing one** — the two drag states. */
export const RECT_DRAG = token([1, 0, 0]);
/** @see RECT_DRAG */
export const RECT_DRAG_ERASE = token([0.2, 0.2, 1]);

/** Rectangles' cursor. */
export const RECT_CURSOR = token([1, 0.5, 0.5]);

/** Rectangles' grid: half the board. */
export const rectGrid = (background: Colour): Colour => scale(background, 0.5);

// --- rome ---------------------------------------------------------------

/** **You placed this arrow** — Rome's entered direction. @see MATHRAX_GUESS */
export const ROME_ARROW_GUESS = token([0, 0.5, 0]);
/** Rome's pencilled arrows. @see MATHRAX_PENCIL */
export const ROME_ARROW_PENCIL = token([0, 0.5, 0.5]);
/** **The arrow you are entering right now**, mid-keystroke. */
export const ROME_ARROW_ENTRY = token([0, 0, 1]);
/** **The goal** — the square every path has to reach. */
export const ROME_GOAL = token([0, 0, 0.5]);

/** The goal square's fill: the board with its blue channel taken to full, so the
 * goal reads as *the board, but the destination* rather than as a placed object. */
export const romeGoalBackground = (background: Colour): Colour => [
  0.95 * background[0],
  0.95 * background[1],
  1,
];

// --- salad --------------------------------------------------------------

/** Salad's **entered** symbol set, in green against the black of a given clue:
 * the number, the ball glyph, the ball's own background, and the "hole" glyph
 * meaning this cell holds nothing. Four shades of one hue, because they are four
 * parts of one statement — *you* put this here. */
export const SALAD_GUESS_NUM = token([0, 0.5, 0]);
/** @see SALAD_GUESS_NUM */
export const SALAD_GUESS_BALL = token([0, 0.1, 0]);
/** @see SALAD_GUESS_NUM */
export const SALAD_GUESS_BALL_BG = token([0.95, 1, 0.95]);
/** @see SALAD_GUESS_NUM */
export const SALAD_GUESS_HOLE = token([0, 0.25, 0]);

// --- seismic ------------------------------------------------------------

/** **You entered this** — Seismic's placed digit. @see MATHRAX_GUESS */
export const SEISMIC_GUESS = token([0, 0.5, 0]);
/** Seismic's pencil marks. @see MATHRAX_PENCIL */
export const SEISMIC_PENCIL = token([0, 0.5, 0.5]);

// --- singles ------------------------------------------------------------

/** **A number on a blacked-out cell** — dimmed, because the cell is out of play
 * but the number is still worth reading. */
export const SINGLES_BLACK_NUM = token([0.4, 0.4, 0.4]);

/** Singles' cursor. */
export const SINGLES_CURSOR = token([0.2, 0.8, 0]);

/** **The strand the deduction runs along** — the chain of cells a Singles hint
 * is reasoning down, distinct from the cell it acts on. */
export const SINGLES_HINT_STRAND = token([0.98, 0.78, 0.42]);

// --- sixteen ------------------------------------------------------------

/** **Slide this tile** — Sixteen's hinted tile. @see FIFTEEN_HINT */
export const SIXTEEN_HINT = token([0.3, 0.5, 0.9]);

// --- slant --------------------------------------------------------------

/** Slant's grid: three-tenths off the board. */
export const slantGrid = (background: Colour): Colour => scale(background, 0.7);

/** **This end of the line is anchored** — a segment already connected to a
 * clue, shaded a fifth off the board. */
export const slantGrounded = (background: Colour): Colour => scale(background, 0.8);

// --- slide --------------------------------------------------------------

/**
 * Slide's two tinted block families, each given as the *base* its bevel trio is
 * built from.
 *
 * Both are the board with **one channel taken to the board's own highlight** —
 * blue for the block you have to get out, green for the floor square it has to
 * reach. Deriving them from the board rather than authoring two colours is what
 * makes them read as *tinted floor* instead of as objects sitting on it, and
 * `hand-author-dark-palette` F1 turned on exactly this property: under the old
 * dark-mode formula the target zone stopped being a tint and became a bright
 * patch.
 */
export const slideMainBlockBase = (background: Colour, highlight: Colour): Colour => [
  background[0],
  background[1],
  highlight[2],
];

/** @see slideMainBlockBase */
export const slideTargetBase = (background: Colour, highlight: Colour): Colour => [
  background[0],
  highlight[1],
  background[2],
];

// --- sokoban ------------------------------------------------------------

/** **You** — the figure you push barrels with. */
export const SOKOBAN_PLAYER = token([0, 1, 0]);

/** **A barrel** — what you are pushing. */
export const SOKOBAN_BARREL = token([0.6, 0.3, 0]);

/** **A pit** — half the floor's own lowlight, so it reads as a hole in the floor
 * rather than as something placed on it. */
export const sokobanPit = (lowlight: Colour): Colour => divide(lowlight, 2);

// --- solo ---------------------------------------------------------------

/** Solo's **X diagonals** — the two extra constrained lines in an X variant, a
 * tenth off the board because they are a rule, not a state. */
export const soloXDiagonals = (background: Colour): Colour => scale(background, 0.9);

/** Solo's **killer cages** — the dotted regions of a Killer grid. Half the board
 * in red and green with the blue pulled much further down, which is what makes
 * it a khaki that stays distinct from both the grid and the pencil marks. */
export const soloKiller = (background: Colour): Colour => [
  0.5 * background[0],
  0.5 * background[1],
  0.1 * background[2],
];

// --- spokes -------------------------------------------------------------

/** The outline of a hub. */
export const SPOKES_BORDER = token([0.3, 0.3, 0.3]);

/** **You are dragging a spoke from here.** */
export const SPOKES_HOLDING = token([0, 1, 0]);

/** **Definitely no spoke here** — the mark ruling out a direction. */
export const SPOKES_MARK = token([0.3, 0.3, 1]);

/** Spokes' cursor. */
export const SPOKES_CURSOR = token([0, 0, 1]);

/** **This hub has all its spokes** — a small step off the board, because a
 * satisfied hub should stop asking for attention without disappearing. */
export const spokesSatisfied = (background: Colour): Colour => scale(background, 0.85);

// --- sticks -------------------------------------------------------------

/** **A stick you have placed.** */
export const STICKS_LINE = token([0, 0.7, 0]);
/** Sticks' cursor. */
export const STICKS_CURSOR = token([0, 0, 1]);

// --- subsets ------------------------------------------------------------

/** **You entered this** — Subsets' placed symbol. @see MATHRAX_GUESS */
export const SUBSETS_GUESS = token([0, 0.5, 0]);
/** Subsets' cursor. */
export const SUBSETS_CURSOR = token([0, 0, 1]);

/**
 * Subsets' own three-level hint vocabulary — the area the deduction covers, the
 * spot it identifies within that area, and the symbol it can therefore place.
 * Three colours rather than the collection's two because the deduction genuinely
 * has three parts, and the middle one is the interesting one.
 */
export const SUBSETS_HINT_CELL = token([0.55, 0.75, 0.95]);
/** @see SUBSETS_HINT_CELL */
export const SUBSETS_HINT_SPOT = token([0.1, 0.62, 0.4]);
/** @see SUBSETS_HINT_CELL */
export const SUBSETS_HINT_PLACED = token([0.82, 0.5, 0.1]);

// --- tents --------------------------------------------------------------

/** **Grass** — a square you have established holds no tent. */
export const TENTS_GRASS = token([0.7, 1, 0.5]);
/** A tree's trunk and its leaves. */
export const TENTS_TREE_TRUNK = token([0.6, 0.4, 0]);
/** @see TENTS_TREE_TRUNK */
export const TENTS_TREE_LEAF = token([0, 0.7, 0]);
/** **A tent.** */
export const TENTS_TENT = token([0.8, 0.7, 0]);
/** A tree the board has contradicted — the trunk goes dark red while the leaves
 * stay green, so the tree is still recognisably a tree. */
export const TENTS_ERROR_TRUNK = token([0.6, 0, 0]);

// --- tracks -------------------------------------------------------------

/** Tracks' cursor. */
export const TRACKS_CURSOR = token([0.3, 0.3, 0.3]);

/** **Sleepers** — the cross-ties drawn along a laid track. */
export const TRACKS_SLEEPER = token([0.5, 0.4, 0.1]);

/** **You are dragging track on here** / **off here**. @see PEARL_DRAG_ON */
export const TRACKS_DRAG_ON = token([0, 0, 1]);
/** @see TRACKS_DRAG_ON */
export const TRACKS_DRAG_OFF = token([0.8, 0.8, 1]);

/** Tracks' grid: halfway between the board and its highlight, because the track
 * bed is drawn in the highlight and the grid has to sit between the two. */
export const tracksGrid = (background: Colour, highlight: Colour): Colour =>
  mix(background, highlight, 0.5);

// --- twiddle ------------------------------------------------------------

/** Twiddle's **gentle** bevel pair — a second, shallower highlight/lowlight used
 * for the block outline the cursor is not on, so two levels of emphasis are
 * available on a board made entirely of bevelled tiles. */
export const twiddleGentleHighlight = (background: Colour): Colour =>
  scale(background, 1.1);
/** @see twiddleGentleHighlight */
export const twiddleGentleLowlight = (background: Colour): Colour =>
  scale(background, 0.9);

/** Twiddle's cursor bevel pair — the board tinted red, and the same tint at 60%
 * for the shaded side, so the cursor is a *bevelled* block like everything else
 * rather than a flat overlay. */
export const twiddleCursorHigh = (background: Colour): Colour => [
  background[0],
  background[1] * 0.5,
  background[2] * 0.5,
];
/** @see twiddleCursorHigh */
export const twiddleCursorLow = (background: Colour): Colour =>
  scale(twiddleCursorHigh(background), 0.6);

// --- undead -------------------------------------------------------------

/**
 * Undead's three monsters. Upstream derives all three from the background's
 * **red channel alone**, which is why they are a matched family rather than three
 * independent colours: ghost cyan, zombie green, vampire pink, all at the same
 * brightness so no monster looks more important than another.
 */
export const undeadGhost = (background: Colour): Colour => [
  background[0] * 0.5,
  background[0],
  background[0],
];
/** @see undeadGhost */
export const undeadZombie = (background: Colour): Colour => [
  background[0] * 0.5,
  background[0],
  background[0] * 0.5,
];
/** @see undeadGhost */
export const undeadVampire = (background: Colour): Colour => [
  background[0],
  background[0] * 0.9,
  background[0] * 0.9,
];

// --- unruly -------------------------------------------------------------

/** Unruly's grid, dark enough to survive a board that is half black tiles. */
export const UNRULY_GRID = token([0.3, 0.3, 0.3]);

/** **Undecided** — a cell you have set to neither colour. */
export const UNRULY_EMPTY = token([0.5, 0.5, 0.5]);

/** Unruly's two tile colours, given as the *base* each bevel trio is built from.
 * Near-black and near-white rather than black and white, so both tiles can carry
 * a visible bevel. */
export const UNRULY_BLACK = token([0.2, 0.2, 0.2]);
/** @see UNRULY_BLACK */
export const UNRULY_WHITE = token([0.95, 0.95, 0.95]);

/** @see ASCENT_CURSOR */
export const UNRULY_CURSOR = token([0, 0.7, 0]);

/**
 * **The cells this deduction is citing.** A single ring colour rather than the
 * cross-game black-ref/white-ref pair, because Unruly's ring set is mixed —
 * filled black cells, a balanced reference row holding both colours, and empty
 * reserved windows — so a colour derived from the cells' state is ill-defined.
 * Orange keeps it clear of the blue move and of the teal/violet "decided
 * black/white" meaning those hues carry in Singles and Range.
 */
export const UNRULY_HINT_REF = token([0.95, 0.6, 0.15]);

// --- untangle -----------------------------------------------------------

/** **A vertex.** */
export const UNTANGLE_POINT = token([0, 0, 1]);

/** **Crossed** — an edge that intersects another, which is the whole problem. */
export const UNTANGLE_CROSSED_LINE = token([1, 0, 0]);

/** The vertex you have picked up, and the mid-grey one the keyboard cursor sits
 * on. */
export const UNTANGLE_DRAG_POINT = token([1, 1, 1]);
/** @see UNTANGLE_DRAG_POINT */
export const UNTANGLE_CURSOR_POINT = token([0.5, 0.5, 0.5]);

/** **Connected to the vertex you are dragging** — light blue rather than
 * upstream's red, so it does not read as danger; red is spent on crossed
 * edges here. */
export const UNTANGLE_NEIGHBOUR = token([0.45, 0.7, 1]);

/** The two frames of Untangle's win flash. */
export const UNTANGLE_FLASH_1 = token([0.5, 0.5, 0.5]);
/** @see UNTANGLE_FLASH_1 */
export const UNTANGLE_FLASH_2 = token([1, 1, 1]);

/** **Move this vertex here** — the hint's line and destination marker. Orange:
 * distinct from the blue points, the light-blue neighbours and the red crossed
 * edges, all of which may be on screen at once. */
export const UNTANGLE_HINT = token([1, 0.55, 0]);
