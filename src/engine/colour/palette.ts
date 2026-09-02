/**
 * **What a colour means** — the collection's shared roles, defined over the named
 * colours in [`colours.ts`](./colours.ts).
 *
 * Two layers, because they answer different questions. *"Which twelve colours are
 * mutually distinguishable"* is a design about the set, and lives in `colours.ts`.
 * *"What should an error look like"* is a decision that should be made once and
 * followed everywhere, and lives here — as a **reference**, so that restyling red
 * restyles every meaning built on red, and so that a role can never quietly become
 * a colour of its own again.
 *
 * A game references a **meaning**. It reaches past this file to a named colour
 * only where the colour *is* the meaning: a member of a set whose job is to be
 * told apart from the other members, or a colour the game names to the player.
 *
 * [`colour-mkhighlight.ts`](./colour-mkhighlight.ts) owns *structural* colour (a
 * game's background and its bevel highlight/lowlight trio) and keeps owning it.
 * [`palette-games.ts`](./palette-games.ts) holds what is left: the colours a game
 * defines **relative to its own board**, which have no value to author because
 * they are functions.
 *
 * ## Why this exists
 *
 * Before `audit-game-colour-palette`, every colour in every game was a
 * hand-written RGB triple: 388 of them across 56 of the 57 ported games, in 108
 * distinct values, drifted in ways nothing could catch — `COL_ERROR` was
 * `[1, 0, 0]` in 27 games, `[1.0, 0.0, 0.0]` in one more, plus `[0.9, 0, 0]` and
 * `[1, 0.25, 0.25]`. The audit named them; `colour-tokens-per-scheme` gave each a
 * home; `consolidate-colour-palette` cut the ~190 names down to twelve colours and
 * the meanings on this page.
 *
 * ## Absolute vs background-derived
 *
 * A role is a named colour when its job is to be unmistakable regardless of the
 * board, and a **function of the frontend background** when it must stay legible
 * *against* the board. That second form is not a stylistic preference:
 * `puzzle-view.ts` hands the engine **pure white** as the default background in
 * dark mode (precisely because upstream games derive colours as `background × 0.9`),
 * `resolvePalette` shifts it to a light grey so every game's board sits at one
 * tone, and the returned palette is adapted afterwards — so a fixed pale colour
 * that reads correctly in light mode can land on top of the background in dark
 * mode. Spokes shipped exactly that bug with a pure-white `COL_DONE`.
 */

import type { Colour } from "../types.ts";
import { divide, scale, token } from "./colour-token.ts";
import {
  BLUE,
  BLUE_WASH,
  GREEN,
  GREY,
  GREY_BOLD,
  PURPLE,
  RED,
  RED_WASH,
  TEAL_BOLD,
  TEAL_WASH_QUIET,
  YELLOW,
} from "./colours.ts";

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
 * Not the {@link BLACK} colour, despite being the same value: this is *contrast
 * against the surface*, so it must invert in dark mode or text ends up darker
 * than the tile it is drawn on. A game object that **is** black imports `BLACK`.
 */
export const INK: Colour = [0, 0, 0];

/** Maximum-contrast background: a white tile, a white-marked cell, the flash
 * frame. The counterpart to {@link INK} (28 sites, in two spellings), and
 * likewise not {@link WHITE}. */
export const PAPER: Colour = [1, 1, 1];

/** A mid-grey grid line, for games that want the grid to recede rather than
 * carry the drawing (Blackbox, Guess, Tents). */
export const GRID_MID: Colour = GREY;

/** A grid line dark enough to survive a board made mostly of *dark cells* —
 * Pattern, Unruly, Pearl's white pearls, Spokes' hub outline, Crossing's walls.
 * {@link GRID_MID} would be swallowed by the cells it separates. */
export const GRID_DARK: Colour = GREY_BOLD;

/** **Undecided** — a cell the player has neither filled nor ruled out (Pattern,
 * Unruly). Sits between the two states it is not, which is why it is the mid
 * grey and not a colour. */
export const UNDECIDED: Colour = GREY;

// --- what the player is doing right now --------------------------------

/**
 * **The keyboard cursor.** Green by default, because on a board of greys,
 * blacks and whites — which is most of them — green is the hue least likely to
 * be spoken for.
 *
 * A game whose board *has* spent green reaches past this for a named colour and
 * says why at the assignment. The audit found seventeen games with seventeen
 * deliberately different cursors and read that as seventeen decisions; it is
 * really one decision plus a handful of collisions, and this is the one decision.
 *
 * Two corollaries, from the sweep that brought the seventeen down:
 *
 * - **This is a *mark*** — a ring, an outline, a line, a disc. A cursor that
 *   *fills a cell under the cell's own content* (Solo's family, Bridges,
 *   Mathrax, Magnets, Pearl) is {@link highlightWash}, the "you are here"
 *   wash, because a saturated green fill under a digit or a pearl shouts and
 *   hides what it is pointing at.
 * - **When green is spent, the second choice is `PURPLE`** — Spokes, Pegs,
 *   Filling, Sticks, Subsets all answer the same collision the same way, so a
 *   purple cursor reads as "the cursor, on a board that uses green" rather than
 *   as a sixth colour to learn.
 */
export const CURSOR: Colour = GREEN;

/**
 * **You have picked this up** — the island a bridge is being drawn from, the hub
 * a spoke is being dragged from, the square a link starts at. Three games
 * converged on the same bright green independently, which is the audit's
 * convergence test passing.
 */
export const HELD: Colour = GREEN;

/** **You are dragging this on** / **off** — the two states of a drag that lays
 * or erases something continuously (Pearl's lines, Tracks' track, Rectangles'
 * rectangles). The pair is one meaning: laying is the colour, erasing is the
 * same colour as a wash, so the board underneath still reads through it.
 *
 * `DRAG_ADD` also dresses the *aim* drag's preview — the arrows Galaxies shows
 * on the pair a release would associate. The meaning is the same ("let go and
 * this is laid"); only the drag model differs. It must be an **authored**
 * colour and not a board-relative tint, because a transient affordance the
 * player is steering by has to be prominent in *both* schemes, and a tint of
 * the board is by construction prominent in neither — Galaxies' preview
 * inherited its keyboard cursor's warm board tint, and shipped as a 1 px
 * `#ffaaaa` line on a `#d5d5d5` board. */
export const DRAG_ADD: Colour = BLUE;

/** @see DRAG_ADD */
export const DRAG_REMOVE: Colour = BLUE_WASH;

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
export const ERROR: Colour = RED;

/** Text drawn *on* an error fill, where {@link INK} would be unreadable. */
export const ERROR_TEXT: Colour = PAPER;

/**
 * A **red fill behind content that must stay readable** — the fill counterpart to
 * {@link ERROR}'s stroke, in the same way {@link HINT_EVIDENCE_WASH} is the fill
 * counterpart to {@link HINT_EVIDENCE}. Filling's `COL_ERROR`, Mathrax's and Rome's
 * `COL_ERRORBG`, Mines' contradicted count, Light Up's two-lamps-see-each-other
 * square.
 *
 * Was a function of the background — red pinned at full strength while green and
 * blue tracked the board — which is what a wash had to be before the wash step
 * was authored per scheme. It is a named colour now: the derivation existed to
 * make the fill follow the board's brightness, and `RED_WASH` does that by being
 * authored light in light mode and dark in dark mode, which the derivation could
 * not (it was handed pure white in dark mode and came out a pale pink).
 */
export const ERROR_WASH: Colour = RED_WASH;

// --- hints ------------------------------------------------------------

/**
 * The thing the deduction acts on, drawn *on* the board: the **ring** around the
 * acted-on cell, a forced edge, a line, a mark.
 *
 * **There is deliberately no fill counterpart, and its absence is the rule**: a
 * hint mark goes *beside* content, never behind it. A fill for this role has no
 * working value at all — it scores 1.91:1 against a pencil mark in light and
 * 1.96:1 in dark, and a joint search over both hint roles, every hue and both
 * schemes returns no feasible arrangement, because the pale end of a
 * twelve-colour palette holds exactly one cool wash and the evidence has it. Do
 * not add one back: ringing the cell removes the constraint rather than trading
 * it, which is why this role has the *emphatic* blue and not a pale one.
 * `hint-mark.ts` is the mechanism; `docs/games/hints.md` § "Shade vs ring" is the
 * rule.
 */
export const HINT_ACTION: Colour = BLUE;

/**
 * The *evidence* a deduction rests on — the row, region or area the hint is
 * reasoning from, rather than the cell it is acting on — **drawn as a mark**: the
 * region's outline, and the small ordinal `drawHintOrdinal` puts in a chain
 * cell's corner to say where in the chain it falls.
 *
 * Those two are **one role, not two that agree**. The ordinal is not a fourth
 * hint colour, it is an *index into the evidence*; a hue of its own would claim
 * the ordered cells were a different kind of premise from the unordered ones,
 * which is exactly what they are not. Giving them separate names that happen to
 * hold the same value is the coincidence this module's two-layer split exists to
 * prevent, because restyling one would silently fail to restyle the other.
 *
 * A **different hue** from {@link HINT_ACTION}, rather than a third shade of the
 * same blue. Seven games mark an evidence region and a target cell at once, and
 * two blues eight hundredths of a lightness apart are all but the same colour;
 * the distinction the player actually needs — *this is what I am reasoning from,
 * that is what I am concluding* — survives a hue change and does not survive a
 * shade change.
 *
 * Teal's **bold** step, not its base. A line drawn *against* a board wants a step
 * whose lightness differs between schemes, and bold is the one defined that way
 * ("dark in light mode, light in dark mode"): it stands off the board by 0.48 /
 * 0.64, where the base sits at L 0.72 under both and comes out a soft line on a
 * pale board and a bright one on a dark board. `colour-dark-check` measures
 * precisely that and flags the base.
 */
export const HINT_EVIDENCE: Colour = TEAL_BOLD;

/**
 * The same "this is the evidence" meaning as a **fill**, for a game whose
 * evidence cells carry nothing the player has to read — Range's undecided cells,
 * Pattern's unfilled squares.
 *
 * A game reaching for this is making a claim, and the claim is *nothing is drawn
 * here*. Where content does sit on the evidence, the wash loses whichever way it
 * is tuned: pale enough to read a derived foreground through, and it stops
 * reading as a mark (it measured **1.15:1 against its own board in dark mode** at
 * the lightness that legibility needed). Those are two requirements moving in
 * opposite directions along one axis, and an outline is not on that axis at all.
 *
 * **"Nothing is drawn here" excludes the game's content, not the hint's own
 * marks.** A target cell is very often inside the region the deduction reasons
 * from, so the action ring lands on this fill and has to win against it — which
 * is why the role takes teal's *quiet* wash rather than its ordinary one. On the
 * ordinary one the ring measured 1.69:1 in dark against 3.94 in light: the
 * evidence shouted and the conclusion whispered. See {@link TEAL_WASH_QUIET}.
 */
export const HINT_EVIDENCE_WASH: Colour = TEAL_WASH_QUIET;

/** A hint premise that refers to a **black/filled** reference cell, where the
 * hint needs to point at two kinds of evidence at once (Range, Light Up). */
export const HINT_BLACKREF: Colour = GREEN;

/** The counterpart premise colour, referring to a **white/empty** reference
 * cell. Distinct in hue from {@link HINT_BLACKREF} so the two premises are
 * never confused with each other. */
export const HINT_WHITEREF: Colour = PURPLE;

// --- pencil marks -----------------------------------------------------

/**
 * The body of the pencil-mode indicator glyph — a #2-pencil yellow. Already
 * perfectly consistent across its ten games before the audit, which is what a
 * role looks like when it is introduced once and copied carefully.
 */
export const PENCIL_BODY: Colour = YELLOW;

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
 * Eleven games draw these, and all eleven want the same thing: something clearly
 * *subordinate* to a placed digit, but still legible at the quarter-size a pencil
 * mark is drawn at.
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
 * **The player put this here** — the digit, letter or arrow you entered, as
 * opposed to the clue the puzzle gave you (which is {@link INK}). The single most
 * important distinction in every entry game, and eleven of them make it with this
 * same green.
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
 * games once carried the identical `paletteOverrides: { n: 0.6 }` dark-mode
 * patch, which was the strongest available evidence that they are one role:
 * three independent ports converged on both the colour and its correction.
 *
 * **The dark value is authored here, not derived.** Derivation inverts the
 * olive's lightness and lands near the dark background, and the inherited
 * `0.6` multiplier then darkened *that* — the owner's playtest found the
 * undecided edges "almost invisible" on a dark board. A muted amber, clearly
 * above a near-black background and clearly below ink, is what the role wants
 * there; the three games' multipliers are gone.
 */
export function lineMaybeColour(background: Colour): Colour {
  return token([0.9 * background[0], 0.9 * background[1], 0], [0.62, 0.54, 0.18]);
}

/**
 * **Ruled out**: an edge the player has marked as definitely *not* a line — the
 * sibling of {@link lineMaybeColour}, and used by the same three games (Loopy's
 * `COL_FAINT`, Palisade's and Separate's `COL_LINE_NO`).
 *
 * A mid grey in both schemes: clearly a step off the board, clearly not ink.
 * Three independent ports wrote `background × 0.9` — a tenth off the board, so
 * that a ruled-out edge would read as *board* — and the owner's playtest found
 * exactly that: on a dark board the edge could not be told from no edge, which
 * matters most to a keyboard player, whose cursor walks the edges and needs to
 * see where they are. Disabled still has to be *discernible*.
 *
 * Both values are authored rather than taken from the grey scale's named steps,
 * because neither step fits: `GREY`'s dark base (L 0.44) sits a tenth above the
 * board and is the faintness being fixed, and `GREY_BOLD` (L 0.84) is nearly
 * ink. The light value stays a function of the board so it tracks a lighter or
 * darker host; the dark value is a fixed mid grey. Both clear the
 * `correctRegionColour` fill Palisade and Separate paint under a finished
 * region, so a ruled-out edge across a completed region still shows.
 */
export function lineNoColour(background: Colour): Colour {
  return token(scale(background, 0.6), [0.5, 0.5, 0.5]);
}

// --- the solved flash ---------------------------------------------------

/**
 * **Solved** — the fill or line colour a board flashes to when the player
 * completes it. One role for the thirteen games that flash to white: the six
 * that wrote `PAPER` and the seven that wrote `mkhighlight`'s highlight were one
 * convention seen through the raw-versus-shifted background split, since the
 * highlight of a shifted white *is* pure white. Singles, Mathrax and Range,
 * which flashed to the lowlight, join it: a solved board lights up rather than
 * dims.
 *
 * {@link PAPER} rather than {@link WHITE}: the flash is *maximum contrast
 * against the surface*, so it inverts with the scheme and stays a visible step
 * off the board. A game whose flash is an animation rather than a colour — a
 * bevel wave, a state swap, a colour cycle — does not use this; a game whose
 * flash is a wash under text (Solo's family) uses {@link highlightWash}.
 */
export const FLASH: Colour = PAPER;

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
