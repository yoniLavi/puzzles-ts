/**
 * Every sentence Singles' hint speaks, and the words inside them.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `narrate`, which reads each number off the board); this file decides only
 * how it reads. Every sentence names the numbers involved rather than "this
 * square / its other neighbor", because concrete values read far clearer, and
 * leads with the spotted pattern before the deduction.
 */

import { joinNums } from "../../engine/hint-text.ts";

export const say = {
  // Name the spotted pattern (two equal numbers one square apart) before the
  // deduction — and name the *values* (the square's locator), not "two
  // matching numbers".
  /** Two `n`s one square apart, with `b` between them. */
  sandwich: (n: number, b: number): string =>
    `Two ${n}s sit one square apart here; one of them must be shaded, so the ${b} between them must be white.`,

  pair: (n: number): string =>
    `These two ${n}s touch, so one of them stays white and uses it up: every other ${n} in the line must be shaded.`,

  // All four share a number, so a diagonal pair must be shaded (two shaded
  // cells, never adjacent). At a *grid* corner the corner cell's only
  // neighbors are the two sides, so shading the side diagonal would strand
  // the corner white — the same box-in argument as corner3.
  corner4: (n: number): string =>
    `This corner ${n} matches both its neighbors; keeping it white would shade both and box it in, so it and the ${n} diagonally inside must be shaded.`,

  // Name the referent explicitly ("the corner") so it never reads as the
  // matching number.
  /** The corner `t` itself matches both neighboring `m`s. */
  corner3Corner: (t: number, m: number): string =>
    `This corner ${t} matches both neighboring ${m}s; keeping it white would shade both and box it in, so the ${t} must be shaded.`,

  /** The inner `t` matches the two `m`s flanking the corner `corner`. */
  corner3Inner: (t: number, m: number, corner: number): string =>
    `This inner ${t} matches the two ${m}s flanking the corner ${corner}; keeping it white would shade both and box the corner in, so the ${t} must be shaded.`,

  // Indication-first: open on the spotted pattern — a touching pair of equal
  // numbers at a grid corner — then run the proof-by-contradiction arc with
  // concrete numbers: the move we rule out (shading the target) → its
  // consequence (the corner's neighbor shaded, the corner boxed in) → the
  // deduction. ("at the corner" is robust to either sub-case: the pair is
  // (corner, side) or (side, inner), so it always sits in the corner block;
  // "the ${p} beside the corner ${c}" names the side member either way, and c
  // may equal p when the corner is itself part of the pair.)
  /** A touching pair of `p`s at the corner `c`, and this square's `t`. */
  corner2: (p: number, c: number, t: number): string =>
    `A touching pair of ${p}s sits at the corner; one of them must be shaded. Shading this ${t} would then force the ${p} beside the corner ${c} shaded as well, leaving the corner boxed in on both sides, so the ${t} must stay white.`,

  // The A-pair (n) shares one line, the B-pair (m) the next. Lead with the
  // *indication* — the spotted pattern, a pair of n in one line and a pair of
  // m in the next — so the player learns to recognize it, then give the
  // consequence. The pairs can sit ANYWHERE along those lines, so never say
  // "overlap"/"between them"; "lined up so that" + the highlight carry the
  // exact arrangement. (Article-free — "one of the Ns" sidesteps "a 4" vs
  // "an 8".)
  /** A pair of `n`s in one `line` and a pair of `m`s in the next. */
  offset: (n: number, m: number, line: "row" | "column"): string => {
    const pairs =
      n === m
        ? `a pair of ${n}s in one ${line} and another pair in the next`
        : `a pair of ${n}s in one ${line} and a pair of ${m}s in the next`;
    const forced =
      n === m ? `two of the ${n}s` : `one of the ${n}s and one of the ${m}s`;
    return `There's ${pairs}, lined up so that shading either of these two squares would force ${forced} to be shaded next to each other, and shaded squares can't touch. So both must be white.`;
  },

  // The forced cells are a shaded square's neighbors — their values are
  // unrelated to the deduction (it's pure adjacency), but still name them so
  // the player knows which squares without hunting the highlight. The group
  // can hold mixed/repeated values, so list them all.
  /** The squares showing `values` touch a shaded square. */
  adjBlack: (values: number[]): string =>
    values.length > 1
      ? `These squares (${joinNums(values)}) touch a shaded square, and shaded squares can't be adjacent, so they must be white.`
      : `This ${values[0]} touches a shaded square, and shaded squares can't be adjacent, so it must be white.`,

  // The forced square(s) and the ringed white square all show the same number
  // — that duplicate is the whole reason — so name it.
  /** One or several (`plural`) copies of `t` share a line with the ringed
   * white `t`. */
  sameLine: (t: number, plural: boolean): string =>
    plural
      ? `These ${t}s share a line with the ringed white ${t}, which already uses that number, so they must be shaded.`
      : `This ${t} shares a line with the ringed white ${t}, which already uses that number, so this copy must be shaded.`,

  boxedIn: (v: number): string =>
    `This ${v} is the ringed white square's only unshaded neighbor left, so it must be white to avoid sealing that square off.`,

  split: (v: number): string =>
    `Shading this ${v} would split the white region in two, so it must be white to keep it connected.`,
};
