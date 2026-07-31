/**
 * The collection's **colour token table** — every colour any game shows, named
 * for what it means to the player and defined in exactly one place.
 *
 * A game contains no colour value. It references a token from here, or calls a
 * shared function from here whose inputs are tokens. The table has two halves,
 * and they exist for different reasons:
 *
 * - **this file** — the ~18 *shared roles*, the meanings two or more games have
 *   in common (an error, a hint, a pencil mark). Their invariant is that each
 *   value is named **once**: two roles with the same value would be two names for
 *   one colour, which is the duplication the whole exercise removes.
 * - [`palette-games.ts`](./palette-games.ts) — the *per-game vocabularies*, a
 *   game's own identity colours and its enumerated sets. Two games may hold the
 *   same value there and that is not duplication: Cube's die face and Untangle's
 *   vertex are both pure blue today and are free to diverge under a scheme,
 *   because they are not the same thing.
 *
 * The split is not filing: it is the two halves having **different invariants**,
 * and a game's import line saying which claim it is making.
 *
 * [`colour-mkhighlight.ts`](./colour-mkhighlight.ts) owns *structural* colour (a
 * game's background and its bevel highlight/lowlight trio) and keeps owning it.
 * Nothing here duplicates that.
 *
 * ## Why this exists
 *
 * Before `audit-game-colour-palette`, every colour in every game was a
 * hand-written RGB triple: 388 of them across 56 of the 57 ported games, in 108
 * distinct values. The duplication had already drifted in ways nothing could
 * catch — a render snapshot records whatever the game emits, and a targeted op
 * assertion names the game's own constant, so a second spelling of an existing
 * colour is invisible to the suite. Measured at the time:
 *
 * - `COL_MISTAKE` was `[0.85, 0.0, 0.0]` in one game and `[0.85, 0, 0]` in
 *   another — the same colour, written two ways.
 * - `COL_ERROR` was `[1, 0, 0]` in 27 games and `[1.0, 0.0, 0.0]` in one more,
 *   plus `[0.9, 0, 0]` and `[1, 0.25, 0.25]`.
 * - The hint wash was `[0.82, 0.9, 0.99]` in ten games and `[0.85, 0.92, 0.99]`
 *   in eight — a difference no one can see, that no one chose, and that a second
 *   colour theme would have had to reproduce twice.
 *
 * ## The rule for what belongs in *this* half
 *
 * A colour is a shared role **only where two or more games use it to mean the
 * same thing to the player**. A colour that is part of one game's visual
 * identity, or a member of its own enumerated set whose members exist to be told
 * apart from *each other* (Guess's pegs, Map's regions, Samegame's and Flood's
 * tiles, Mines' per-number digits), is a token in `palette-games.ts` under that
 * game's prefix. Both are tokens; only one is a claim that two games mean the
 * same thing, and that claim is what has to be earned.
 *
 * ## Absolute vs background-derived
 *
 * A role is a plain constant when its job is to be unmistakable regardless of
 * the board, and a **function of the frontend background** when it must stay
 * legible *against* the board. That second form is not a stylistic preference:
 * `puzzle-view.ts` hands a game **pure white** as its default background in dark
 * mode (precisely because upstream games derive colours as `background × 0.9`)
 * and adapts the returned palette afterwards — so a fixed pale colour that reads
 * correctly in light mode can land on top of the background in dark mode.
 * Spokes shipped exactly that bug with a pure-white `COL_DONE`.
 */

import type { Colour } from "../../puzzle/types.ts";
import { divide, scale, token } from "./colour-token.ts";

// Naming: these are colour *values* and deliberately do NOT carry the `COL_`
// prefix, which throughout this codebase means "a palette **index**" — every game
// declares its own `COL_ERROR`, `COL_HINT` and so on, mapped to its upstream C
// enum. A game imports `ERROR` and assigns it to its own `COL_ERROR` slot, so the
// two namespaces stay separate and a game's indices keep matching its C reference.

// --- ink and paper ----------------------------------------------------

/**
 * Maximum-contrast foreground: grid lines, outlines, glyphs, body text, and the
 * black half of a two-colour game. The single most repeated value in the
 * collection (85 sites before the audit).
 *
 * Absolute rather than derived because the app's OKLCH pass already lifts it for
 * dark mode across every game at once; deriving it per game would fight that.
 */
export const INK: Colour = [0, 0, 0];

/** Maximum-contrast background: a white tile, a white-marked cell, the flash
 * frame. The counterpart to {@link INK} (28 sites, in two spellings). */
export const PAPER: Colour = [1, 1, 1];

/**
 * **This game object is black** — a black peg, a black mine, the filled squares
 * of a two-colour game. Not {@link INK}, despite being the same colour.
 *
 * The distinction only shows up in dark mode, and it is the whole difference
 * between the two: `INK` is *maximum contrast against the surface*, so it must
 * invert or text ends up darker than the tile it is drawn on. This is *the piece's
 * own identity*, so inverting it would tell the player the piece is the other
 * colour — a white peg where the rules say black.
 *
 * Seven games had already discovered this and worked around it one at a time, by
 * pinning the index in `augmentation.ts` with comments reading "black and white
 * pegs", "black mine", "white and black squares", "preserve black, white". Those
 * fifteen per-game entries are this role, written out fifteen times; they are
 * deleted in favour of it.
 */
export const PIECE_BLACK: Colour = token([0, 0, 0], [0, 0, 0]);

/** The counterpart to {@link PIECE_BLACK}: **this game object is white** — a
 * white peg, a white pearl, the empty squares of a two-colour game. */
export const PIECE_WHITE: Colour = token([1, 1, 1], [1, 1, 1]);

/** A mid-grey grid line, for games that want the grid to recede rather than
 * carry the drawing (Blackbox, Guess, Tents). */
export const GRID_MID: Colour = [0.5, 0.5, 0.5];

// --- errors and mistakes ----------------------------------------------

/**
 * Something is **wrong**: a rule the board breaks as you play, or a cell that
 * `findMistakes` has proved contradicts the unique solution.
 *
 * One role, not two. Before the audit this arrived under five names —
 * `COL_ERROR` (28), `COL_MISTAKE` (10), `COL_WRONG`, `COL_NUM_ERROR`,
 * `COL_ERRORDIST` — because upstream names it per game, and the *value* had
 * drifted to five variants around the same red. The names stay (they are
 * index-mapped into each game's palette and match its C enum); the value comes
 * from here.
 */
export const ERROR: Colour = [1, 0, 0];

/** Text drawn *on* an error fill, where {@link INK} would be unreadable. */
export const ERROR_TEXT: Colour = PAPER;

// --- hints ------------------------------------------------------------

/**
 * The three hint emphases, and the reason there are three rather than two.
 *
 * The audit found the hint colour split cleanly down two families of ports — the
 * grid/shading games on `[0.13, 0.5, 0.85]` and the Latin/digit family (Solo,
 * Keen, Towers, Unequal, Undead, Filling, Group) on `[0.62, 0.81, 0.96]` — which
 * looked like ordinary drift. It is not. In the digit games the hint colour is a
 * **solid fill painted behind a digit and its pencil marks**, and Towers' own
 * renderer comments on the hazard: *"painting the cell COL_HINT as well would
 * hide the very digit the hint is crossing out (blue-on-blue)."* In the grid
 * games it is a stroke, or a fill on a cell that carries no text, so it wants to
 * be saturated.
 *
 * So the two values are one *role* by name and two by **function**, and
 * collapsing them would have made every digit game paint dark blue behind black
 * text. That is the concrete disambiguation the owner asked implementation to
 * look for; it exists, and this is it.
 */

/** The thing the deduction acts on, drawn *on* the board: a forced edge, a line,
 * a mark, or a fill on a cell that carries no text. Saturated. */
export const HINT_ACTION: Colour = [0.13, 0.5, 0.85];

/** The same "this is the target" meaning, as a **fill behind text**. Pale enough
 * that a black digit and its pencil marks stay readable on top — see the note
 * above; this is load-bearing, not decorative. */
export const HINT_FILL: Colour = [0.62, 0.81, 0.96];

/** The *evidence* a deduction rests on — the row, region or area the hint is
 * reasoning from, rather than the cell it is acting on. The palest of the three,
 * so it reads as context behind both of the others. */
export const HINT_EVIDENCE: Colour = [0.82, 0.9, 0.99];

/** A hint premise that refers to a **black/filled** reference cell, where the
 * hint needs to point at two kinds of evidence at once (Range, Light Up). */
export const HINT_BLACKREF: Colour = [0, 0.78, 0.55];

/** The counterpart premise colour, referring to a **white/empty** reference
 * cell. Distinct in hue from {@link HINT_BLACKREF} so the two premises are
 * never confused with each other. */
export const HINT_WHITEREF: Colour = [0.62, 0.3, 0.82];

// --- pencil marks -----------------------------------------------------

/**
 * The body of the pencil-mode indicator glyph — a #2-pencil yellow. Already
 * perfectly consistent across its ten games before the audit, which is what a
 * role looks like when it is introduced once and copied carefully.
 */
export const PENCIL_BODY: Colour = [1, 0.78, 0.17];

// --- background-derived roles -----------------------------------------

/**
 * The shared "this region/area is correctly completed" shade — the
 * local-completion feedback Galaxies and Rectangles give, *not* a global
 * solved check. A neutral darkening of the background to 75%, matching upstream
 * Rectangles' `COL_CORRECT`.
 *
 * Deliberately a settled grey rather than a per-game hue: a green invented for
 * Separate/Palisade was the inconsistency that first motivated sharing a colour
 * at all. Re-exported from `colour-mkhighlight.ts`, where it has lived since
 * before this module existed, so all the roles are reachable from one import.
 */
export { correctRegionColour } from "./colour-mkhighlight.ts";

/**
 * A pencil mark — the candidate values a player has noted but not committed.
 * Eight games draw these (`COL_PENCIL` in Solo, Keen, Towers, Unequal, Group,
 * ABCD, Salad and Crossing), and all eight want the same thing: something
 * clearly *subordinate* to a placed digit, but still legible at the quarter-size
 * a pencil mark is drawn at.
 *
 * Darkening two channels and leaving blue at full strength is upstream's answer
 * and a good one — it reads as "a note" by hue rather than by contrast alone, so
 * it survives being small. Note it is deliberately **not** a neutral grey: a grey
 * at this lightness competes with the grid lines it sits between.
 */
export function pencilColour(background: Colour): Colour {
  return [0.5 * background[0], 0.5 * background[1], background[2]];
}

/**
 * **The player put this here** — the digit or letter you entered, as opposed to
 * the clue the puzzle gave you (which is {@link INK}). The single most important
 * distinction in every digit-entry game, and seven of them make it with this
 * same green: Solo, Keen, Towers, Group and Filling's `COL_USER`, Unequal's and
 * ABCD's `COL_GUESS`.
 *
 * Derived because it is a *foreground on the board*: the green tracks the
 * background's own brightness so it stays a readable glyph colour rather than a
 * fixed green that the dark-mode pass has to rescue.
 */
export function playerEntryColour(background: Colour): Colour {
  return [0, 0.6 * background[1], 0];
}

/** A gently emphasised cell — the "you are here" / "this line is selected" wash
 * that must stay a *background*, not become a foreground. Six games'
 * `COL_HIGHLIGHT` (Solo, Keen, Towers, Group, Undead, Filling). */
export function highlightWash(background: Colour): Colour {
  return scale(background, 0.78);
}

/**
 * **Undecided**: an edge or line the player has explicitly marked as "I don't
 * know yet", distinct both from a drawn line and from an empty one. Loopy's
 * `COL_LINEUNKNOWN` and Palisade's and Separate's `COL_LINE_MAYBE`.
 *
 * A background-toned olive — the background's own brightness with blue removed,
 * so it reads as a *marked* edge without competing with a real line. All three
 * games also carry the identical `paletteOverrides: { n: 0.6 }` dark-mode patch,
 * which is the strongest available evidence that they are one role: three
 * independent ports converged on both the colour and its correction.
 */
export function lineMaybeColour(background: Colour): Colour {
  return [0.9 * background[0], 0.9 * background[1], 0];
}

/**
 * **Ruled out**: an edge the player has marked as definitely *not* a line — the
 * sibling of {@link lineMaybeColour}, and used by the same three games (Loopy's
 * `COL_FAINT`, Palisade's and Separate's `COL_LINE_NO`).
 *
 * A tenth off the background rather than a colour of its own, because a ruled-out
 * edge should read as *board* — the player has decided nothing is there, and the
 * mark exists only to record that they decided it. Three independent ports wrote
 * the identical `background × 0.9`, which is the audit's convergence test passing
 * about as cleanly as it can.
 */
export function lineNoColour(background: Colour): Colour {
  return scale(background, 0.9);
}

/**
 * **This clue is used up** — a row count, column count or clue number the board
 * has already satisfied, greyed back so the player's eye skips it and lands on
 * the clues that still have work in them.
 *
 * Magnets, Towers and Undead all wrote `background / 1.5`, under the same local
 * name `COL_DONE`, for the same meaning. Note this is *not*
 * {@link correctRegionColour}: that one shades an area of the board as correct,
 * this one retires a clue in the margin.
 */
export function clueDoneColour(background: Colour): Colour {
  return divide(background, 1.5);
}

/**
 * A **pale red fill behind content that must stay readable** — the fill
 * counterpart to {@link ERROR}'s stroke, in the same way {@link HINT_FILL} is
 * the fill counterpart to {@link HINT_ACTION}. Filling's `COL_ERROR`, Mathrax's
 * and Rome's `COL_ERRORBG`.
 *
 * Red is pinned at full strength and only green and blue track the background:
 * that is what keeps it unmistakably *red* while staying pale enough for a black
 * digit on top. Light Up's `[1, 0.25, 0.25]` is the same idea at a fixed value
 * and stays game-local — it is a lit-cell fill tuned against Light Up's own
 * yellow, not a general wash.
 */
export function errorWash(background: Colour): Colour {
  return [1, 0.85 * background[1], 0.85 * background[2]];
}

/**
 * An impassable **wall** in a movement game — Inertia's and Sokoban's
 * `COL_WALL`: the background nudged a quarter of the way toward its highlight,
 * so a wall reads as solid board rather than as a drawn object.
 *
 * Takes the highlight as well as the background because that is what the colour
 * means: "not quite the floor, in the direction the bevel already goes". Deriving
 * it from a fixed grey instead would break the moment either game's background
 * changes.
 */
export function wallColour(background: Colour, highlight: Colour): Colour {
  const mix = (i: number): number => (3 * background[i] + highlight[i]) / 4;
  return [mix(0), mix(1), mix(2)];
}
