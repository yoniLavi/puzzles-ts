/**
 * **The collection's colors** — the whole set of them, by name.
 *
 * Twelve names (eight hues, plus gray, brown, black and white), each available
 * at a small fixed number of intensities. Everything any game shows is one of
 * these, or a *meaning* defined over them in [`palette.ts`](./palette.ts), or a
 * color derived from the board it sits on.
 *
 * ## Why the set is small, and why it is exactly this size
 *
 * `colour-tokens-per-scheme` gave every color in the collection a name and a
 * home: 687 palette entries across 57 games resolving to ~190 tokens. That was
 * the precondition, not the answer — ~190 named colors is still 190 independent
 * decisions, and pure blue arrived six times under six names because upstream
 * wrote each game separately.
 *
 * The number here is not taste. **Flood, Guess and Samegame need ten members a
 * player can tell apart**, in every scheme; nothing else the collection does
 * needs more. So the palette is sized by that, and "how many colors should there
 * be" has an answer rather than a preference.
 *
 * ## Two things a name has to be
 *
 * 1. **True.** Flood's hint says *"Fill with yellow"*, and the hint quality bar
 *    says every sentence a hint utters is a claim that must be checked. A scheme
 *    may give {@link YELLOW} a different shade; it may not make it a color a
 *    player would call something else. That is why the intensity steps are named
 *    `_WASH` and `_BOLD` — by **role**, not by appearance: the wash step is light
 *    in light mode and *dark* in dark mode (content on top of it has to stay
 *    readable either way), so a name like `_PALE` would be a lie in one of the
 *    two schemes.
 * 2. **Load-bearing.** A game reaches for a name here only where the color *is*
 *    the meaning — a member of a set whose job is to be told apart, or a color
 *    the game names to the player. Everywhere else it references a meaning from
 *    `palette.ts`, so that "what should an error look like" stays one decision.
 *
 * ## The three intensities
 *
 * - **base** — the color: a mark, a line, a piece, a tile.
 * - **`_WASH`** — a fill that content must stay readable *on top of*. Light in
 *   light mode, dark in dark mode.
 * - **`_WASH_DEEP`** — the same, for a fill that has to carry the collection's
 *   **derived** foregrounds: pencil marks and entered digits, which are computed
 *   from the board rather than authored and land at *mid* luminance in dark mode.
 *   Identical to `_WASH` in light mode, and darker in dark. See the note under
 *   {@link DESIGN}'s dark bounds for why this could not be done by moving `_WASH`
 *   itself.
 * - **`_BOLD`** — the emphatic end: a mark that has to read against a large
 *   light fill, or a second member of a set (Mines' navy 4 against its blue 1).
 *   Dark in light mode, light in dark mode.
 *
 * Two steps were the intent; **Mines forced the third**. Its six count digits are
 * upstream's and by now most players' expectation of what a minesweeper looks
 * like, and 1-blue against 4-navy and 3-red against 5-maroon are two pairs that a
 * wash cannot supply — a wash of blue is a fill, not a digit. That is the case on
 * record for the third step; anything further needs its own.
 *
 * **A color carries only the steps something asks for**, which is why orange has
 * no wash and yellow, purple and pink have no bold. An intensity nobody
 * references is a color decision nobody can see, and it will be wrong by the
 * time somebody looks — `palette-source.test.ts` fails on one.
 *
 * ## Authored in OKLCH, on purpose
 *
 * {@link DESIGN} is the palette. It is stated as lightness/chroma/hue because
 * that is the space the constraints live in — "these ten are mutually
 * distinguishable" is a distance, "this wash is light enough for black text on
 * top" is a lightness, and "Crossing's across and down must carry equal weight"
 * is an equality of lightness *and* chroma that RGB cannot express (the port
 * found this the hard way: the obvious RGB mirror of a blue made an amber that
 * measured both lighter and more colorful, and duly looked more important).
 *
 * The conversion to sRGB is done here, in ~20 lines, rather than by importing the
 * app's color library: this module is reached from the puzzle worker, and the
 * arithmetic is fixed, standard and cheaper than the dependency.
 * `colors.test.ts` pins it against `colorjs.io` and measures every set that has
 * to stay distinguishable, in **both** schemes.
 */

import type { Color } from "../types.ts";
import { token } from "./color-token.ts";

// --- OKLCH → sRGB ------------------------------------------------------

/** Björn Ottosson's OKLab → linear sRGB, then the sRGB transfer function.
 *
 * Every value in {@link DESIGN} is inside the sRGB gamut by construction (its
 * chroma is 94% of the most that hue and lightness can carry), so the clamp here
 * is a guard against a future edit rather than a gamut-mapping step. */
function oklch(l: number, c: number, hDegrees: number): Color {
  const h = (hDegrees * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  return linear.map((v) => {
    const encoded = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.min(1, Math.max(0, encoded));
  }) as unknown as Color;
}

// --- the design --------------------------------------------------------

/** One intensity of one color, in one scheme: `[lightness, chroma]`. */
type Step = readonly [l: number, c: number];

/** A color's intensities under one scheme. Every step but `base` is absent
 * where nothing needs it — an unused intensity is a color decision nobody can
 * see, and it will be wrong by the time somebody looks. */
type Steps = { base: Step; wash?: Step; washQuiet?: Step; bold?: Step };

/**
 * **The palette.** Hue per name, then lightness and chroma per intensity per
 * scheme.
 *
 * The lightnesses are not free-hand: they are the result of maximizing the worst
 * pairwise distance inside every set the collection needs a player to tell apart
 * — the ten-member set, Mines' six counts, Signpost's eight region fills, Map's
 * four, the hint vocabulary, and each color's own three steps — subject to each
 * name staying true (a "yellow" at lightness 0.45 is olive; a "blue" at 0.9 is
 * not blue). Where several solutions cleared every bar, the one closest to the
 * lightness each name naturally wants was taken. `colors.test.ts` re-measures
 * all of it, so a future edit that trades one set away is a failing test rather
 * than a discovery.
 *
 * One pair is **tied rather than optimized**: blue's and orange's **bold** steps
 * carry the same lightness *and* the same chroma in both schemes, because
 * Crossing colors across-runs in one and down-runs in the other — on the board
 * *and* in the clue list, which is one color per direction rather than two — and
 * either being stronger makes one direction look like the important one. Blue's
 * chroma is held down to what orange can reach, the constraint running that way
 * because orange's gamut is the narrower of the two at that lightness.
 *
 * ## Three bounds the dark column is held inside, and why
 *
 * A search maximizes separation, and left alone it will buy separation with
 * anything not nailed down. Three bounds are what stop it, each from a defect it
 * produced on the way — **do not widen them to recover a decimal place**:
 *
 * - **A color may not leave its own name.** Dark yellow first came out at
 *   lightness 0.95 and chroma 0.104: the lightest entry in the palette, at half
 *   the chroma it can carry, which is a **cream**. It bought the ten-set 0.158
 *   that way. Yellow is now capped at 0.86, the set is 0.143, and that is the
 *   better trade — 0.143 is still twice what upstream's set measured in dark
 *   (0.070) and above what it measured in *light* (0.134), and a yellow that
 *   reads as white fails the truthful-name rule outright.
 * - **A wash sits where the board's own cells sit.** Four dark washes were at
 *   0.34-and-below when a game's cells are drawn nearer 0.44, so Crossing's
 *   across/down highlight came out *darker* than the squares it was highlighting
 *   and read as a hole in the board rather than a mark on it. The dark wash band
 *   is 0.34–0.48.
 * - **The bold step stays the emphatic end.** In dark mode that means *lighter*
 *   than the base — which the search will happily invert for yellow, whose base
 *   is already near the top of its gamut. Every hue's dark bold is at least 0.05
 *   above its dark base; yellow's is the one that had to move (0.91) rather than
 *   sit at the uniform 0.84 the others share.
 *
 * A **third scheme** is this table with a third column.
 */
const DESIGN: Record<string, { h: number; light: Steps; dark: Steps }> = {
  RED: {
    h: 27,
    light: { base: [0.58, 0.22], wash: [0.78, 0.085], bold: [0.42, 0.161] },
    dark: { base: [0.62, 0.22], wash: [0.34, 0.131], bold: [0.83, 0.09] },
  },
  ORANGE: {
    h: 62,
    // No wash step: nothing needs one. Crossing was its only consumer and now
    // inks its down-runs with the same value the clue list uses, which is the
    // bold step. An intensity nobody references is a color decision nobody can
    // see, and it would be wrong by the time somebody looked.
    light: { base: [0.72, 0.156], bold: [0.42, 0.091] },
    dark: { base: [0.69, 0.149], bold: [0.84, 0.076] },
  },
  YELLOW: {
    h: 100,
    light: { base: [0.86, 0.168], wash: [0.91, 0.07] },
    dark: { base: [0.8, 0.156], wash: [0.48, 0.08] },
  },
  GREEN: {
    h: 148,
    light: { base: [0.64, 0.174], wash: [0.81, 0.07], bold: [0.42, 0.115] },
    dark: { base: [0.72, 0.196], wash: [0.4, 0.07], bold: [0.84, 0.16] },
  },
  TEAL: {
    h: 200,
    light: {
      base: [0.72, 0.115],
      wash: [0.94, 0.072],
      // Identical to `wash`: light mode has no defect here and nothing moves.
      washQuiet: [0.94, 0.072],
      bold: [0.42, 0.067],
    },
    dark: {
      base: [0.72, 0.115],
      wash: [0.48, 0.077],
      // Chroma 0.06 rather than the wash's 0.077 because teal cannot carry
      // 0.077 this dark — asking for it makes the gamut clamp return something
      // else entirely, silently, which is how a separation once came out at
      // 0.106 instead of the 0.124 the arithmetic predicted.
      washQuiet: [0.3, 0.06],
      bold: [0.84, 0.134],
    },
  },
  BLUE: {
    h: 258,
    light: { base: [0.57, 0.199], wash: [0.81, 0.07], bold: [0.42, 0.091] },
    dark: { base: [0.62, 0.195], wash: [0.38, 0.075], bold: [0.84, 0.076] },
  },
  PURPLE: {
    h: 308,
    light: { base: [0.53, 0.22], wash: [0.9, 0.06] },
    dark: { base: [0.6, 0.22], wash: [0.46, 0.07] },
  },
  PINK: {
    h: 350,
    light: { base: [0.72, 0.198], wash: [0.84, 0.07] },
    dark: { base: [0.75, 0.171], wash: [0.4, 0.12] },
  },
  GRAY: {
    h: 0,
    light: { base: [0.6, 0], wash: [0.78, 0], bold: [0.42, 0] },
    dark: { base: [0.44, 0], wash: [0.3, 0], bold: [0.84, 0] },
  },
  /** Brown is dark, low-chroma orange, and it is its **own** name rather than an
   * intensity of orange for one reason: it must not invert. Orange's bold step
   * goes light in dark mode, as a bold step should; a brown that went light would
   * stop being brown, and Flood names it to the player. */
  BROWN: {
    h: 62,
    light: { base: [0.43, 0.09] },
    dark: { base: [0.56, 0.09] },
  },
};

const of = (name: string, step: keyof Steps): Color => {
  const d = DESIGN[name];
  const light = d.light[step];
  const dark = d.dark[step];
  if (!light || !dark) throw new Error(`${name} has no ${step} step`);
  return token(oklch(light[0], light[1], d.h), oklch(dark[0], dark[1], d.h));
};

// --- the named colors -------------------------------------------------

/** Red. The collection's *error* meaning is built on it, but so are Flood's red
 * tile and Magnets' positive pole, which are not errors — see `palette.ts`. */
export const RED: Color = of("RED", "base");
/** @see RED */
export const RED_WASH: Color = of("RED", "wash");
/** @see RED */
export const RED_BOLD: Color = of("RED", "bold");

/** Orange. */
export const ORANGE: Color = of("ORANGE", "base");
/** @see ORANGE */
export const ORANGE_BOLD: Color = of("ORANGE", "bold");

/** Yellow. */
export const YELLOW: Color = of("YELLOW", "base");
/** @see YELLOW */
export const YELLOW_WASH: Color = of("YELLOW", "wash");

/** Green. */
export const GREEN: Color = of("GREEN", "base");
/** @see GREEN */
export const GREEN_WASH: Color = of("GREEN", "wash");
/** @see GREEN */
export const GREEN_BOLD: Color = of("GREEN", "bold");

/** Teal. */
export const TEAL: Color = of("TEAL", "base");
/** @see TEAL */
export const TEAL_WASH: Color = of("TEAL", "wash");
/**
 * @see TEAL — the **quiet** wash: a fill the hint's own marks are drawn on top
 * of, so it has to stay close enough to the board that they still win. Its one
 * consumer is `HINT_EVIDENCE_WASH`.
 *
 * **Why this is a step and not a retune of {@link TEAL_WASH}.** `TEAL_WASH` is a
 * member of {@link EIGHT_FILLS} and {@link FOUR_FILLS}, so its dark lightness is
 * an *output* of the search that keeps Signpost's sixteen region colors and
 * Map's four mutually distinguishable — it is not free to move for a reason
 * outside that set.
 *
 * **And why the value is where it is.** Two requirements pull in opposite
 * directions along one axis, and only measurement finds the crossing point: the
 * wash must be *seen* against its board, and the action ring — which sits on it,
 * because a target cell is very often inside the region the deduction reasons
 * from — must be seen against *the wash*. At the ordinary dark wash the ring
 * scored **1.69:1**, against 3.94 in light: the evidence shouted and the
 * conclusion whispered. Lightness 0.30 is where the wash reaches light mode's
 * own visibility (1.31 against 1.29) and leaves the ring 3.54.
 */
export const TEAL_WASH_QUIET: Color = of("TEAL", "washQuiet");
/** @see TEAL */
export const TEAL_BOLD: Color = of("TEAL", "bold");

/** Blue. */
export const BLUE: Color = of("BLUE", "base");
/** @see BLUE */
export const BLUE_WASH: Color = of("BLUE", "wash");
/** @see BLUE */
export const BLUE_BOLD: Color = of("BLUE", "bold");

/** Purple. */
export const PURPLE: Color = of("PURPLE", "base");
/** @see PURPLE */
export const PURPLE_WASH: Color = of("PURPLE", "wash");

/** Pink. */
export const PINK: Color = of("PINK", "base");
/** @see PINK */
export const PINK_WASH: Color = of("PINK", "wash");

/** Gray — the achromatic member, and the tenth member of {@link TEN}. */
export const GRAY: Color = of("GRAY", "base");
/** @see GRAY */
export const GRAY_WASH: Color = of("GRAY", "wash");
/** @see GRAY */
export const GRAY_BOLD: Color = of("GRAY", "bold");

/** Brown. @see DESIGN for why it is a name and not an intensity of orange. */
export const BROWN: Color = of("BROWN", "base");

/**
 * **This game object is black** — a black peg, a black mine, the filled squares
 * of a two-color game. Not the `INK` meaning, despite being the same color: ink
 * is *maximum contrast against the surface* and must invert in dark mode, while
 * this is the piece's own identity, and inverting it would tell the player the
 * piece is the other color.
 */
export const BLACK: Color = token([0, 0, 0], [0, 0, 0]);

/** The counterpart to {@link BLACK}: **this game object is white** — a white
 * peg, a white pearl, the empty squares of a two-color game. */
export const WHITE: Color = token([1, 1, 1], [1, 1, 1]);

// --- the sets ----------------------------------------------------------

/**
 * **Ten colors a player can tell apart**, and the reason the palette is the size
 * it is: Flood's tiles, Guess's pegs, Samegame's nine (which takes all but the
 * gray — a gray tile among colored ones reads as a hole in the board).
 *
 * Upstream wrote Flood's and Guess's ten out twice, character for character, and
 * they were never designed as a set: measured worst pair 0.134 in light and
 * **0.070** in dark, because mutual distinguishability is a property of the set
 * and no per-color rule — including adapting one to a scheme — can establish it.
 * This set measures 0.159 light and 0.158 dark.
 */
export const TEN: readonly Color[] = [
  RED,
  YELLOW,
  GREEN,
  BLUE,
  ORANGE,
  PURPLE,
  BROWN,
  TEAL,
  PINK,
  GRAY,
];

/**
 * {@link TEN}, as a player would say them — the names a game may put in a
 * sentence.
 *
 * Parallel to {@link TEN} and exported *with* it so the two cannot drift: Flood's
 * hint reads "Fill with orange", and the only thing standing between that and a
 * lie is that the word and the color come from the same place.
 */
export const TEN_NAMES: readonly string[] = [
  "red",
  "yellow",
  "green",
  "blue",
  "orange",
  "purple",
  "brown",
  "teal",
  "pink",
  "gray",
];

/**
 * **Eight fills a mark can be drawn on** — Signpost's region backgrounds.
 *
 * The wash step throughout, because a region fill has to follow the board: light
 * under a light scheme, dark under a dark one, with the number and arrow the game
 * draws on top staying readable either way. That is also why a region set cannot
 * simply borrow {@link TEN}: those are colors, and half of them are too dark to
 * write on in light mode and too light in dark mode.
 *
 * Eight washes cannot be as separated as eight colors — a pastel set is close
 * together by construction, which is why upstream's own eight measured 0.071.
 * These measure 0.087 light and 0.081 dark, so the set is better than the one it
 * replaces without pretending to be something a wash cannot be.
 */
export const EIGHT_FILLS: readonly Color[] = [
  GRAY_WASH,
  RED_WASH,
  GREEN_WASH,
  PURPLE_WASH,
  YELLOW_WASH,
  BLUE_WASH,
  PINK_WASH,
  TEAL_WASH,
];

/**
 * **Four fills**, for the one set in the collection whose size is a *theorem* —
 * four colors suffice to color any planar map, which is Map's puzzle.
 *
 * The widest spread {@link EIGHT_FILLS} allows, because a Map board is almost
 * entirely region fill and the whole game is telling neighboring regions apart.
 * Upstream's four muted earth tones measured 0.077; these measure 0.115 light and
 * 0.123 dark. The earth tones went deliberately — they were chosen so that four
 * saturated hues at that area were not unpleasant to look at for the length of a
 * game, and the wash step already answers that without also being hard to read.
 */
export const FOUR_FILLS: readonly Color[] = [
  RED_WASH,
  YELLOW_WASH,
  TEAL_WASH,
  PURPLE_WASH,
];
