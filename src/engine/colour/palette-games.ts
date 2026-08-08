/**
 * **Colours a game defines relative to its own board** — the third layer, and by
 * design almost the only thing left in it.
 *
 * The palette is [`colours.ts`](./colours.ts) and the meanings are
 * [`palette.ts`](./palette.ts); read those first. What lands *here* is the
 * remainder: a colour that has **no value to author** because it is a function —
 * of the host background, of the game's own bevel, or of another colour.
 * Signpost's grid is `background / 1.3` and means "the board, stepped down just
 * enough to separate squares"; there is no scheme in which that is a constant.
 *
 * This is not filing. `puzzle-view.ts` hands a game **pure white** as its
 * background in dark mode, precisely because games derive colours by scaling the
 * board down, and adapts the returned palette afterwards. A derivation therefore
 * tracks the scheme for free, and freezing one into a value is how a subtle tint
 * of the board becomes a bright patch on it.
 *
 * ## What this file used to be, and why it shrank
 *
 * It held 170-odd *absolute* per-game colours — Cube's blue die face, Untangle's
 * blue vertex, Pegs' blue peg, Sticks' blue line, four independent arrivals at
 * pure blue under four names. `consolidate-colour-palette` replaced every one of
 * them with a meaning or a named colour, on the argument that four names for one
 * colour is not four decisions worth keeping: it is one colour that nobody chose
 * four times, and it made restyling a scheme 170 judgement calls.
 *
 * Two rules still hold for what remains:
 *
 * - **every export is prefixed with its game's id** — `signpostGrid`,
 *   `UNRULY_BLACK`. `palette-source.test.ts` derives each game's allowed colours
 *   from that prefix, so the prefix is load-bearing, not decoration;
 * - **an absolute value here is an exception and says why.** There are two, both
 *   Unruly's, and the reason is written where they are declared. A third wants
 *   the same treatment: say what it means to the player, and why no meaning and
 *   no named colour serves. Thirty of them is how the collection got here before.
 */

import type { Colour } from "../types.ts";
import { divide, fraction, mix, scale, token } from "./colour-token.ts";
import { BLUE_BOLD, EIGHT_FILLS, ORANGE } from "./colours.ts";
import { INK } from "./palette.ts";

// --- signpost ----------------------------------------------------------

/**
 * Signpost's sixteen **region backgrounds** — the colour a square takes from the
 * chain it currently belongs to, so that one unbroken sequence of arrows reads as
 * one object. Their members mean nothing individually beyond "a different chain
 * from that one", so what they owe the player is mutual separation, which is a
 * property of the set and therefore of the palette: {@link EIGHT_FILLS}.
 *
 * The eight authored fills, followed by eight midpoints of consecutive pairs, so
 * a long game with many chains keeps handing out distinguishable colours. The
 * last midpoint pairs fill 7 with the *first* midpoint rather than wrapping to
 * fill 0 — upstream writes the second half into the same array it is reading
 * from, so entry 15 sees entry 8 already filled in. Reproduced deliberately: it
 * is a real colour on real boards, and "fixing" it would repaint every game with
 * more than seven chains.
 *
 * Sixty-four further palette entries are built from these sixteen — see
 * {@link SIGNPOST_ON_REGION_MID} — which is why one shared set covers seventy
 * colours.
 */
export const SIGNPOST_REGION_BACKGROUNDS: readonly Colour[] = (() => {
  // The eight fills go in **as themselves**, not re-wrapped: a token is
  // recognised downstream by identity, so a copy here would leave each fill
  // referenced by nothing and unable to carry its scheme value.
  const all = [...EIGHT_FILLS];
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
  mix(SIGNPOST_REGION_BACKGROUNDS[0], BLUE_BOLD, 0.3),
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

// --- guess --------------------------------------------------------------

/**
 * Guess's board background, darkened when the host's is too pale.
 *
 * A white peg ({@link WHITE}) on a white board is invisible, so the board steps
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

// --- mines --------------------------------------------------------------

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

// --- blackbox -----------------------------------------------------------

/** The grid inside the box: a tenth off the board, present but not drawn. */
export const blackboxGrid = (background: Colour): Colour => scale(background, 0.9);

/** **This square is locked** — a deduction you have committed to and asked the
 * game to hold, a third of the way down from the board. */
export const blackboxLock = (background: Colour): Colour => scale(background, 0.7);

/** **Hidden** — the shade covering a square whose contents you have not
 * established, half the board's brightness so the covered area reads as one
 * mass. */
export const blackboxCover = (background: Colour): Colour => scale(background, 0.5);

// --- bridges ------------------------------------------------------------

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

// --- crossing -----------------------------------------------------------

/** **Not placed yet** — a ghosted word, light enough to read as provisional and
 * dark enough to read at all. */
export const crossingGhost = (background: Colour): Colour => scale(background, 0.55);

// --- dominosa -----------------------------------------------------------

/** The line between two halves of a laid domino: two-thirds of the board, so a
 * domino reads as one piece with a seam rather than as two cells. */
export const dominosaEdge = (background: Colour): Colour => fraction(background, 2, 3);

// --- filling ------------------------------------------------------------

/** **This region is the right size** — Filling's local completion feedback. A
 * tenth off the board: enough to see a finished region at a glance, little
 * enough that most of the board being finished is not a wall of grey. */
export const fillingCorrect = (background: Colour): Colour => scale(background, 0.9);

/** Filling's keyboard cursor: half the board. */
export const fillingCursor = (background: Colour): Colour => scale(background, 0.5);

// --- flip ---------------------------------------------------------------

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

// Galaxies' cursor was `bridgesCursor(background)` — the same warm tint of the
// board, arrived at independently in both ports from the same upstream idiom.
// It is now the collection's default `CURSOR`: a tint of the board is a colour
// that cannot be prominent, and Galaxies painted its *drag preview* in it too.
// See the assignment in `games/galaxies/index.ts` and `DRAG_ADD`'s doc comment.

// --- group --------------------------------------------------------------

/** Group's **leading diagonal** — the cells where an element meets itself,
 * shaded a twentieth off the board because the hint is structural, not a state
 * the player set. */
export const groupDiagonal = (background: Colour): Colour => scale(background, 0.95);

// --- lightup ------------------------------------------------------------

/** Light Up's grid: two-thirds of the board. */
export const lightupGrid = (background: Colour): Colour => divide(background, 1.5);

/** Light Up's keyboard cursor: half the board. */
export const lightupCursor = (background: Colour): Colour => divide(background, 2);

// --- net / netslide -----------------------------------------------------

/** Net's tile borders: half the board. */
export const netBorder = (background: Colour): Colour => scale(background, 0.5);

/** **This tile is locked** — you have decided its orientation and asked the game
 * to hold it. Between the board and its border, so a locked tile reads as
 * settled rather than as marked. */
export const netLocked = (background: Colour): Colour => scale(background, 0.75);

/** The shade Netslide flashes the board with on a win. */
export const netslideFlashing = (background: Colour): Colour => scale(background, 0.75);
/** @see netBorder */
export const netslideBorder = (background: Colour): Colour => scale(background, 0.5);
/** Netslide's bevel lowlight — it takes the host background as-is rather than
 * through `mkhighlight`, so it derives its own. */
export const netslideLowlight = (background: Colour): Colour => scale(background, 0.8);

// --- rect ---------------------------------------------------------------

/** Rectangles' grid: half the board. */
export const rectGrid = (background: Colour): Colour => scale(background, 0.5);

// --- rome ---------------------------------------------------------------

/** The goal square's fill: the board with its blue channel taken to full, so the
 * goal reads as *the board, but the destination* rather than as a placed object. */
export const romeGoalBackground = (background: Colour): Colour => [
  0.95 * background[0],
  0.95 * background[1],
  1,
];

// --- slant --------------------------------------------------------------

/** Slant's grid: three-tenths off the board. */
export const slantGrid = (background: Colour): Colour => scale(background, 0.7);

/** **This end of the line is anchored** — a segment already connected to a
 * clue, shaded a fifth off the board. */
export const slantGrounded = (background: Colour): Colour => scale(background, 0.8);

// --- slide --------------------------------------------------------------

/**
 * **Slide's four board materials**, each given as the *base* its bevel trio is
 * built from, and each a function of the host background.
 *
 * Deriving them from the board rather than authoring four colours is what makes
 * them read as *the same board, in different materials* rather than as four
 * objects placed on it, and `hand-author-dark-palette` F1 turned on exactly this
 * property: under the old dark-mode formula the target zone stopped being a tint
 * and became a bright patch. It also means the ladder below survives the scheme
 * flip without a single authored dark value — one inversion rule maps all four,
 * so their *ordering* is preserved by construction.
 *
 * ## The ladder, and why it exists at all
 *
 * Upstream derives the floor, the walls **and** the ordinary blocks from one
 * `game_mkhighlight` trio, so all three are literally the same fill and are told
 * apart only by their bevels. Its own author recorded the result: *"All the
 * colours are a bit wishy-washy. Some dark colours would surely not be
 * excessive? Probably darken the tiles, the walls and the main block, and leave
 * the target marker pale."* Measured on the light scheme before this change, the
 * whole board — floor, wall, block, key block and exit — sat inside a **0.10
 * OKLCH lightness band**, and three of those five were the identical value.
 *
 * Note the instruction is a *pair*. Raising the contrast of everything else is
 * what lets the exit's green stop carrying the board on its own, which is why
 * the target below is unchanged: the owner's decision to keep it (2026-07-30)
 * stands, and it becomes *more* prominent here by everything around it stepping
 * back rather than by it stepping forward.
 *
 * Ordered by what each material **is**:
 *
 * - the **exit** is the palest thing on the board, because it names the goal;
 * - the **floor** is the board itself — a surface earns no contrast, and empty
 *   floor is the thing a player is hunting for, so it reads as space;
 * - an **ordinary block** is an object resting on that floor;
 * - the **key block** is the object that matters, and carries hue as well as
 *   weight;
 * - the **wall** is the heaviest, because it is the one thing that never moves.
 *
 * Only the two the help page **names to the player** carry a hue — *"move the
 * blue key block to the green exit area"* — and the other two stay neutral so
 * they cannot compete with them.
 */
export const slideWallBase = (background: Colour): Colour => scale(background, 0.58);

/** @see slideWallBase — an ordinary block: clearly an object on the floor, and
 * clearly lighter than the wall it may be pushed against. */
export const slideBlockBase = (background: Colour): Colour => scale(background, 0.79);

/**
 * @see slideWallBase — the key block: the board with its red and green taken
 * **down**, which is the exact dual of the exit below.
 *
 * It used to be the board with blue taken *up* to the board's own highlight, a
 * tint 0.012 of a lightness from the floor it sat on. Reading the two
 * derivations against each other is the point: the block you have to move is a
 * *weight* on the board, and the square it has to reach is a *light* on it.
 *
 * The arithmetic lands on exactly `palette.ts`'s `pencilColour`, arrived at
 * independently — which is some evidence it is the natural way to get a blue that
 * tracks the board, and is why `metrics/colour-inventory.md` attributes this entry
 * to that function (it matches by value). It is deliberately **not** that role:
 * a pencil mark is a note *subordinate* to a placed digit, and a key block is the
 * one thing on the board that is not subordinate to anything.
 */
export const slideMainBlockBase = (background: Colour): Colour => [
  background[0] * 0.5,
  background[1] * 0.5,
  background[2],
];

/** @see slideWallBase — the exit area: the board with its green channel taken to
 * the board's own highlight. Deliberately unchanged. */
export const slideTargetBase = (background: Colour, highlight: Colour): Colour => [
  background[0],
  highlight[1],
  background[2],
];

/**
 * **The Solve route's next piece**, and the ghost of where it should end up.
 *
 * A solve route is a two-part statement — *move this, to there* — which is the
 * shape the shared hint vocabulary exists for; Slide cannot use it. `HINT_ACTION`
 * is blue and `HINT_BLACKREF` is green, and this board has already spent both on
 * things the help page names to the player. So the route takes the collection's
 * remaining strong accent, and spends it once: the piece and its destination are
 * the same hue at two weights, so they read as one instruction rather than two
 * marks.
 *
 * The destination is a *mix with the board* rather than a third named colour,
 * because a ghost has to sit on whatever it is drawn over — floor or exit green
 * — and still read as a hole in the arrangement rather than as another piece.
 */
export const slideRouteShadow = (background: Colour): Colour =>
  mix(background, ORANGE, 0.65);

// --- sokoban ------------------------------------------------------------

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

/** **This hub has all its spokes** — a small step off the board, because a
 * satisfied hub should stop asking for attention without disappearing. */
export const spokesSatisfied = (background: Colour): Colour => scale(background, 0.85);

// --- tracks -------------------------------------------------------------

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

/**
 * Unruly's two tile colours — **the one absolute exception left in the
 * collection**, and the argument for it.
 *
 * *What they mean to the player:* the two states of a tile, on a board that is
 * half of each. *Why no named colour serves:* these are not the colours drawn,
 * they are the **bases a bevel trio is built from** — `mkhighlightSpecific`
 * brightens and darkens them to make each tile look raised, and a base at either
 * extreme has nowhere to go in one of the two directions. {@link BLACK} would
 * give a black tile no highlight and {@link WHITE} a white tile no lowlight, so
 * every tile on the board would read flat on one side. Near-black and near-white
 * are the whole point, and "near" is a headroom, not a shade.
 *
 * The palette has no place for them because the requirement is structural rather
 * than chromatic: it belongs with the bevel, which is
 * [`colour-mkhighlight.ts`](./colour-mkhighlight.ts)'s business, not with a
 * colour anybody names.
 */
export const UNRULY_BLACK = token([0.2, 0.2, 0.2]);
/** @see UNRULY_BLACK */
export const UNRULY_WHITE = token([0.95, 0.95, 0.95]);
