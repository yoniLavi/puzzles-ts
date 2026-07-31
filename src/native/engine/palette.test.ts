/**
 * The **meanings** half of the colour guard.
 *
 * The palette itself is measured in [`colours.test.ts`](./colours.test.ts) — how
 * far apart the colours are, in both schemes. What is left for this file is the
 * relationship between the two layers, and it is the one thing that keeps the
 * collapse from unwinding: **a meaning holds no value of its own**. The moment
 * `ERROR` is a red rather than *the* red, restyling red stops restyling errors,
 * and the ~190-token sprawl starts growing back one role at a time.
 *
 * The source half of the guard — "a game contains no colour value" — is
 * [`palette-source.test.ts`](./palette-source.test.ts), which reads the game
 * sources, because that requirement is about where a colour is written rather
 * than what it is.
 */
import { describe, expect, it } from "vitest";
import type { Colour } from "../../puzzle/types.ts";
import { colourToOKLCH, isGrayChroma, type OKLCH } from "../../utils/color.ts";
import { getTsGame } from "./registry.ts";
import "../games/index.ts";
import { mkhighlight } from "./colour-mkhighlight.ts";
import { darkValue } from "./colour-token.ts";
import * as colours from "./colours.ts";
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
  it("defines every meaning in terms of a named colour", () => {
    // The whole point of the two layers. A meaning that held its own value would
    // be a colour decision wearing a role's name — which is what ~170 of the ~190
    // tokens this change deleted actually were.
    //
    // Checked by **identity**, not by value: a copy of `RED` is the right colour
    // with its scheme decision silently removed, and by value the two are
    // indistinguishable.
    const palette = new Set<Colour>(
      Object.values(colours).flatMap((v: unknown): Colour[] => {
        if (!Array.isArray(v)) return [];
        // Either a colour, or one of the sets built out of them.
        return typeof v[0] === "number" ? [v as Colour] : (v as Colour[]);
      }),
    );
    // INK and PAPER are the two exceptions, and they earn it: they are *maximum
    // contrast against the surface*, so they must be adapted by the scheme rather
    // than authored — which is exactly what a named colour may not be.
    const exempt = new Set<Colour>([roles.INK, roles.PAPER]);
    for (const [name, value] of Object.entries(roles)) {
      if (typeof value === "function") continue;
      const colour = value as Colour;
      if (exempt.has(colour)) continue;
      expect(
        palette.has(colour),
        `${name} holds a colour value instead of referencing one from colours.ts`,
      ).toBe(true);
    }
  });

  it("keeps ink and paper adapting", () => {
    // The distinction from BLACK and WHITE only exists in dark mode, so this is
    // where it is pinned: ink is maximum contrast against the surface and must
    // invert, while a piece's black is the piece's identity — inverting it would
    // tell the player the piece is the other colour.
    expect(darkValue(roles.INK)).toBeUndefined();
    expect(darkValue(roles.PAPER)).toBeUndefined();
    expect(darkValue(colours.BLACK)).toEqual([0, 0, 0]);
    expect(darkValue(colours.WHITE)).toEqual([1, 1, 1]);
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
    // COL_BLACK = 3 and COL_WHITE = 4: the two pearls, which must not invert.
    expect(decisions).toContain(3);
    expect(decisions).toContain(4);
  });

  it("keeps the three hint emphases distinct", () => {
    // These are one meaning at three jobs — the move, the fill behind the digit
    // the move is about, and the evidence the deduction rests on — and seven games
    // put two or three of them on screen at once. Two of the three used to be
    // shades of one blue eight hundredths of a lightness apart; they are a shade
    // and a hue apart now, and this is what says so.
    const d = (a: Colour, b: Colour): number => {
      const plane = (c: OKLCH): [number, number] =>
        isGrayChroma(c[1])
          ? [0, 0]
          : [
              c[1] * Math.cos((c[2] * Math.PI) / 180),
              c[1] * Math.sin((c[2] * Math.PI) / 180),
            ];
      const [al, ...arest] = colourToOKLCH(a);
      const [bl, ...brest] = colourToOKLCH(b);
      const [ax, ay] = plane([al, ...arest] as OKLCH);
      const [bx, by] = plane([bl, ...brest] as OKLCH);
      return Math.hypot(al - bl, ax - bx, ay - by);
    };
    for (const [x, y] of [
      [roles.HINT_ACTION, roles.HINT_FILL],
      [roles.HINT_FILL, roles.HINT_EVIDENCE],
      [roles.HINT_ACTION, roles.HINT_EVIDENCE],
      [roles.HINT_BLACKREF, roles.HINT_WHITEREF],
      [roles.HINT_ACTION, roles.HINT_BLACKREF],
      [roles.HINT_ACTION, roles.HINT_WHITEREF],
    ] as [Colour, Colour][]) {
      expect(d(x, y), `${key(x)} vs ${key(y)}`).toBeGreaterThan(0.12);
    }
    // ...and the two that are fills stay fills: a digit and its pencil marks are
    // drawn on top of them.
    expect(colourToOKLCH(roles.HINT_FILL)[0]).toBeGreaterThan(0.75);
    expect(colourToOKLCH(roles.HINT_EVIDENCE)[0]).toBeGreaterThan(0.75);
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
        if (!Array.isArray(derived) || derived.length !== 3) continue;
        expect(
          distance(derived, background),
          `${name} against ${bg.join(",")}`,
        ).toBeGreaterThan(0.05);
      }
    }
  });
});
