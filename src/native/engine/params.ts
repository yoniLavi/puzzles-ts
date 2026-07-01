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
 *
 * Replaces the three hand-rolled idioms ports grew (a `parseLeadingInt`
 * pair, a digit-scan loop, `indexOf("x")` + slice). The latter silently
 * mis-sliced a bare square form (no `"x"`); routing through here restores
 * the square fallback.
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

/**
 * The two `width`/`height` `ParamConfigItem`s that virtually every grid
 * game's "Custom type…" dialog needs — the params analogue of the shared
 * dimension *parser* above. A plain w/h game declares its whole custom
 * form as `paramConfig: dimensionParamConfig()`; a variant game spreads
 * these first and appends its own fields.
 *
 * The `kw`s (`"width"`/`"height"`) and labels (`"Width"`/`"Height"`)
 * match the C/WASM path, where upstream's config labels slugify to the
 * same keys — so a TS and a C build present the identical form. Each
 * field renders as a text box (upstream's `C_STRING`) whose `set` parses
 * the leading integer exactly as upstream's `atoi` does (empty or
 * non-numeric → 0, which the game's `validateParams` then rejects with
 * its own message).
 */
export function dimensionParamConfig<
  P extends { w: number; h: number },
>(): ParamConfigItem<P>[] {
  return [
    {
      kw: "width",
      name: "Width",
      type: "string",
      get: (p) => String(p.w),
      set: (p, v) => {
        p.w = parseConfigInt(v);
      },
    },
    {
      kw: "height",
      name: "Height",
      type: "string",
      get: (p) => String(p.h),
      set: (p, v) => {
        p.h = parseConfigInt(v);
      },
    },
  ];
}
