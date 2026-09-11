/**
 * Shared helpers for decoding upstream-format param strings
 * (`"10x7"`, `"7x7dn"`, ...). Upstream's `decode_params` walks the
 * string with `atoi` + manual pointer advances; the TS ports walk it
 * with `parseLeadingInt`, which returns both the parsed value and the
 * index to continue from.
 */

import type { ParamConfigItem } from "./game.ts";

/**
 * Parse the maximal digit run starting at `start`. Returns the
 * integer value (0 when the run is empty, matching `atoi` on a
 * non-digit) and the index of the first non-digit character.
 */
export function parseLeadingInt(
  s: string,
  start: number,
): { value: number; next: number } {
  let i = start;
  while (i < s.length && s[i] >= "0" && s[i] <= "9") i++;
  return {
    value: Number.parseInt(s.slice(start, i) || "0", 10),
    next: i,
  };
}

/**
 * Parse an upstream `WxH`-or-square dimension prefix starting at
 * `start`: a width, then an optional `"x"` followed by a height, with a
 * **square** fallback (`h = w`) when no `"x"` is present. `next` is the
 * index of the first character after the consumed dimensions, so a
 * caller can continue parsing a trailing suffix (a difficulty letter,
 * `m<movetarget>`, ...).
 */
export function parseDimensions(
  s: string,
  start = 0,
): { w: number; h: number; next: number } {
  const wParse = parseLeadingInt(s, start);
  const w = wParse.value;
  if (s[wParse.next] === "x") {
    const hParse = parseLeadingInt(s, wParse.next + 1);
    return { w, h: hParse.value, next: hParse.next };
  }
  return { w, h: w, next: wParse.next };
}

/**
 * Parse a custom-params **text field** to an integer with `atoi`
 * semantics: the leading digit run, with an empty or non-numeric field
 * becoming 0. This is the right coercion for a `paramConfig` `set` on a
 * numeric field — 0 (or any out-of-range value) is then rejected by the
 * game's own `validateParams` with its message, whereas `Number.parseInt`
 * would yield `NaN`, which slips past every `<`/`>` bound check.
 */
export function parseConfigInt(v: string): number {
  return parseLeadingInt(v, 0).value;
}

/** C `atof`: parse a leading float, yielding 0 for garbage — never `NaN`,
 * which would slip past every `<`/`>` bound check in `validateParams`. Used
 * by any game with a `float` param (Netslide/Net's barrier probability,
 * Rectangles' expansion factor). */
export function atof(s: string): number {
  const value = Number.parseFloat(s);
  return Number.isNaN(value) ? 0 : value;
}

/**
 * Render a number the way C's `%g` does (`encode_params` writes floats with
 * it): six significant digits, trailing zeros stripped, switching to
 * exponential notation below 1e-4 or at/above 1e6. This is emphatically *not*
 * `String(x)` — that renders 1/3 as `0.3333333333333333`, which C would read
 * back (via {@link atof}) as a slightly different number than it wrote, so a
 * float param that round-trips through `String` can silently generate a
 * different board. Any game encoding a `float` param uses this. */
export function formatG(value: number): string {
  if (value === 0) return "0";
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  if (exponent < -4 || exponent >= 6) {
    const [mantissa, exp] = value.toExponential(5).split("e");
    return `${stripTrailingZeros(mantissa)}e${exp[0]}${exp.slice(1).padStart(2, "0")}`;
  }
  return stripTrailingZeros(value.toFixed(Math.max(0, 5 - exponent)));
}

function stripTrailingZeros(s: string): string {
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/**
 * Keys of `P` holding a **plain** `number`. Deliberately narrower than
 * "numeric key": a field typed as a literal union (a difficulty index
 * `0 | 1 | 2`) is excluded, because a free-text integer box must not be
 * allowed to write an out-of-union value into it.
 */
type PlainNumberKey<P> = {
  [K in keyof P]-?: number extends P[K] ? (P[K] extends number ? K : never) : never;
}[keyof P];

/** Which fields of `P` hold the width and the height. */
export interface DimensionFields<P> {
  w: PlainNumberKey<P>;
  h: PlainNumberKey<P>;
}

const DEFAULT_DIMENSION_FIELDS = { w: "w", h: "h" };

/**
 * The two `width`/`height` `ParamConfigItem`s that virtually every grid
 * game's "Custom type…" dialog needs — the params analog of the shared
 * dimension *parser* above. A plain w/h game declares its whole custom
 * form as `paramConfig: dimensionParamConfig()`; a variant game spreads
 * these first and appends its own fields.
 *
 * A game whose params spell their dimensions differently (Mosaic's
 * `width`/`height`, Unruly's `w2`/`h2` — upstream names for the *full*
 * grid extent, not halves) passes the field pair rather than being
 * renamed to fit: `dimensionParamConfig<UnrulyParams>({ w: "w2", h: "h2" })`.
 *
 * The labels (`"Width"`/`"Height"`) are upstream's, and the `kw`s are their
 * slugs. Each field renders as a text box (upstream's `C_STRING`) whose `set`
 * parses the leading integer exactly as upstream's `atoi` does (empty or
 * non-numeric → 0, which the game's `validateParams` then rejects with its
 * own message).
 */
export function dimensionParamConfig<
  P extends { w: number; h: number },
>(): ParamConfigItem<P>[];
export function dimensionParamConfig<P>(
  fields: DimensionFields<P>,
): ParamConfigItem<P>[];
export function dimensionParamConfig<P>(
  fields: DimensionFields<P> = DEFAULT_DIMENSION_FIELDS as DimensionFields<P>,
): ParamConfigItem<P>[] {
  return [
    dimensionItem("width", "Width", fields.w),
    dimensionItem("height", "Height", fields.h),
  ];
}

function dimensionItem<P>(
  kw: string,
  name: string,
  field: PlainNumberKey<P>,
): ParamConfigItem<P> {
  return {
    kw,
    name,
    type: "string",
    get: (p) => String(p[field]),
    set: (p, v) => {
      // `PlainNumberKey` guarantees this field holds a plain `number`, but TS
      // cannot narrow a write through a generic key, so the target is asserted.
      (p as Record<PlainNumberKey<P>, number>)[field] = parseConfigInt(v);
    },
  };
}
