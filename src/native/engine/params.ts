/**
 * Shared helpers for decoding upstream-format param strings
 * (`"10x7"`, `"7x7dn"`, ...). Upstream's `decode_params` walks the
 * string with `atoi` + manual pointer advances; the TS ports walk it
 * with `parseLeadingInt`, which returns both the parsed value and the
 * index to continue from.
 */

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
