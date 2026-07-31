/**
 * The **value** half of the colour guard. The source half — "a game contains no
 * colour value" — is [`palette-source.test.ts`](./palette-source.test.ts), which
 * reads the game sources, because that requirement is about where a colour is
 * written rather than what it is.
 *
 * What is left here is everything value *is* the right instrument for:
 *
 * - the shared roles hold no duplicate — two roles with one value would be two
 *   names for one colour, which is the duplication the table exists to remove;
 * - a derived role stays visible against **both** host backgrounds, because the
 *   app hands games pure white in dark mode and a role that only separates from a
 *   light board is the Spokes `COL_DONE` bug waiting to happen;
 * A hand-maintained list of each game's permitted colours used to live here, and
 * it did a real job while games held literals — it was the only thing that would
 * notice a *new* colour appearing. The token table makes it derivable instead: a
 * colour that is not in the table cannot reach a palette, and a token names its
 * owner, so **ownership is checked in the source guard**, where a token consumed
 * by a derivation (`mkhighlightSpecific(UNRULY_BLACK)` never puts its own value in
 * the palette) is still visible.
 */
import { describe, expect, it } from "vitest";
import type { Colour } from "../../puzzle/types.ts";
import { getTsGame } from "./registry.ts";
import "../games/index.ts";
import { mkhighlight } from "./colour-mkhighlight.ts";
import { darkValue } from "./colour-token.ts";
import * as roles from "./palette.ts";

/** A light host background, standing in for the frontend's theme colour. */
const BG: Colour = [0.827, 0.827, 0.827];

const key = (c: Colour): string => c.map((v) => Math.round(v * 1000) / 1000).join(",");

/**
 * Call a derived role, whatever it takes.
 *
 * Most roles are a function of the background alone; `wallColour` also needs the
 * highlight, because "a quarter of the way from the floor toward its bevel" is
 * what the colour *means*. Dispatching on arity keeps that one exception from
 * needing a hand-maintained list here — a new role is picked up automatically.
 */
// biome-ignore lint/complexity/noBannedTypes: the role table is heterogeneous by design.
function resolve(fn: Function, background: Colour, highlight: Colour): Colour {
  return fn.length === 2
    ? (fn as (b: Colour, h: Colour) => Colour)(background, highlight)
    : (fn as (b: Colour) => Colour)(background);
}

describe("the shared colour vocabulary", () => {
  it("names a role exactly once", () => {
    // Two roles with the same value would be two names for one colour — the very
    // duplication this module exists to remove.
    //
    // Unless they differ in what they do when the SCHEME changes, which is a real
    // difference even though it is invisible in light mode: `PIECE_BLACK` is the
    // same black as `INK` on paper, and stays black in dark mode where `INK`
    // inverts. So the identity of a role is (value, scheme behaviour), not value
    // alone.
    const byValue = new Map<string, string[]>();
    for (const [name, value] of Object.entries(roles)) {
      if (typeof value === "function") continue;
      const colour = value as Colour;
      const dark = darkValue(colour);
      const k = `${key(colour)}|${dark ? key(dark) : "adapts"}`;
      byValue.set(k, [...(byValue.get(k) ?? []), name]);
    }
    for (const [value, names] of byValue) {
      // ERROR_TEXT is deliberately an alias of PAPER: it records *why* a game is
      // painting white there, which is what a theme needs to know.
      const meaningful = names.filter((n) => n !== "ERROR_TEXT");
      expect(
        meaningful.length,
        `${value} is shared by ${names.join(", ")}`,
      ).toBeLessThan(2);
    }
  });

  it("keeps a piece's black and white across the scheme flip", () => {
    // The distinction only exists in dark mode, so this is where it is pinned:
    // ink is maximum contrast against the surface and must invert, while a
    // piece's black is the piece's identity — inverting it would tell the player
    // the piece is the other colour.
    expect(darkValue(roles.PIECE_BLACK)).toEqual([0, 0, 0]);
    expect(darkValue(roles.PIECE_WHITE)).toEqual([1, 1, 1]);
    expect(darkValue(roles.INK)).toBeUndefined();
    expect(darkValue(roles.PAPER)).toBeUndefined();
    // ...and they are still ordinary colours everywhere else, so a game can
    // assign one without any special handling in its renderer.
    expect([...roles.PIECE_BLACK]).toEqual([0, 0, 0]);
    expect([...roles.PIECE_WHITE]).toEqual([1, 1, 1]);
  });

  it("reports a game's scheme decisions by palette index", () => {
    // The engine hands these to the frontend as plain per-index data, because
    // the tag rides on the colour and would not survive structured clone.
    const pearl = getTsGame("pearl");
    if (!pearl) throw new Error("pearl not registered");
    const decisions = pearl
      .colours(BG)
      .map((c, i) => (c && darkValue(c) ? i : -1))
      .filter((i) => i >= 0);
    // COL_BLACK = 3 and COL_WHITE = 4: the two pearls.
    expect(decisions).toEqual([3, 4]);
  });

  it("keeps the three hint emphases distinct", () => {
    // The audit found HINT_ACTION and HINT_FILL are two roles by *function* — a
    // stroke versus a fill behind text — so collapsing them is a real regression
    // (blue-on-blue digits). Pin that they stay apart.
    expect(key(roles.HINT_ACTION)).not.toBe(key(roles.HINT_FILL));
    expect(key(roles.HINT_FILL)).not.toBe(key(roles.HINT_EVIDENCE));
    // ...and that they are ordered light-to-dark, which is what makes the
    // evidence wash readable *behind* the other two.
    const lum = (c: Colour): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    expect(lum(roles.HINT_EVIDENCE)).toBeGreaterThan(lum(roles.HINT_FILL));
    expect(lum(roles.HINT_FILL)).toBeGreaterThan(lum(roles.HINT_ACTION));
  });

  it("keeps every derived role visible against both host backgrounds", () => {
    // The app hands games pure white in dark mode, so a derived role that only
    // separates from a light background is the Spokes COL_DONE bug waiting to
    // happen.
    const distance = (a: Colour, b: Colour) =>
      Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    for (const bg of [BG, [1, 1, 1] as Colour]) {
      const { background, highlight } = mkhighlight(bg);
      for (const [name, value] of Object.entries(roles)) {
        if (typeof value !== "function") continue;
        const derived = resolve(value, background, highlight);
        // Helper exports (`schemeDecision`) are not derived roles — see
        // `sharedColours`.
        if (!Array.isArray(derived) || derived.length !== 3) continue;
        expect(
          distance(derived, background),
          `${name} against ${bg.join(",")}`,
        ).toBeGreaterThan(0.05);
      }
    }
  });
});
