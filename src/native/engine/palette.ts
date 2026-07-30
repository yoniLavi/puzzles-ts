/**
 * The collection's shared **semantic colour roles** — the colours that mean
 * something to the *player*, each defined in exactly one place.
 *
 * This is the counterpart to [`colour-mkhighlight.ts`](./colour-mkhighlight.ts),
 * which owns *structural* colour (a game's background and its bevel
 * highlight/lowlight trio) and keeps owning it. Nothing here duplicates that.
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
 * ## The rule for what belongs here
 *
 * A colour is a role **only where two or more games use it to mean the same
 * thing to the player**. A colour that is part of one game's visual identity, or
 * a member of its own enumerated set whose members exist to be told apart from
 * *each other* (Guess's pegs, Map's regions, Samegame's and Flood's tiles,
 * Mines' per-number digits), stays defined by that game — but is *declared* as
 * game-local in `palette.test.ts`, so the distinction is a recorded decision and
 * a new undeclared colour still fails.
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

/** Scale a background by a factor, per channel. The shape almost every
 * background-derived colour in the collection takes. */
function scale(background: Colour, factor: number): Colour {
  return [background[0] * factor, background[1] * factor, background[2] * factor];
}

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

/** A pencil mark: the background at half strength, so notes read as clearly
 * subordinate to placed values whatever the host background is. */
export function pencilColour(background: Colour): Colour {
  return scale(background, 0.5);
}

/** A gently emphasised cell — the "you are here" / "this line is selected" wash
 * that must stay a *background*, not become a foreground. */
export function highlightWash(background: Colour): Colour {
  return scale(background, 0.78);
}

/**
 * A cue that must be **seen** against the board without becoming a foreground
 * colour: a satisfied clue, a completed hub, a locked tile.
 *
 * A clear step away from the background is the requirement here. Upstream
 * frequently draws these pure white, which reads as nothing in light mode and as
 * *literally the background* in dark mode, where the app supplies pure white —
 * so a fixed colour is the wrong tool and this is derived.
 */
export function satisfiedColour(background: Colour): Colour {
  return scale(background, 0.85);
}
