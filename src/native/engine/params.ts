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
