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
import { getTsGame } from "../registry.ts";
import { colourToOKLCH, isGrayChroma, type OKLCH } from "../testing/oklch.ts";
import type { Colour } from "../types.ts";
import "../../games/index.ts";
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

  it("keeps the three hint emphases distinct, in both schemes", () => {
    // These are one meaning at three jobs — the move, the fill behind the digit
    // the move is about, and the evidence the deduction rests on — and seven games
    // put two or three of them on screen at once. Two of the three used to be
    // shades of one blue eight hundredths of a lightness apart; they are a shade
    // and a hue apart now, and this is what says so.
    //
    // **Both schemes, because one is not evidence for the other** — the lesson
    // `hand-author-dark-palette` paid for, and this guard was measuring the
    // light column only. It matters here rather than academically: the pairs
    // are *not* equally separated in the two schemes, and the tightest of the
    // six is `FILL/EVIDENCE` in **dark**, at **0.129** against this bound
    // (0.147 in light). So the next person to retune `BLUE_WASH` or
    // `TEAL_WASH_DEEP`'s dark step learns about it from a red test rather than
    // from a hint frame where the target and its evidence read as one wash.
    //
    // It did exactly that job on 2026-08-21: the first attempt at the contrast
    // fix below asked for chroma 0.077 at lightness 0.28, the sRGB gamut clamp
    // silently returned 0.050 at 0.293, and this failed at **0.106**. A bound
    // the arithmetic cannot be trusted to predict is one worth asserting.
    //
    // `disambiguate-hint-deixis` is what makes it load-bearing rather than
    // tidy: that change ties the acted-on element to the evidence *in prose*
    // wherever both are shown, and the rule it wrote down says a pair which
    // differs **only** by hue needs the marks fixed, not the sentence. These
    // pairs earn their exemption by differing in weight as well — `HINT_ACTION`
    // carries ~2.5× the chroma of `HINT_EVIDENCE` in either scheme — and an
    // exemption resting on a number is worth exactly as much as the assertion
    // that keeps the number true.
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
    /** The same pair as the scheme actually paints it. */
    const inDark = (c: Colour): Colour => darkValue(c) ?? c;
    for (const [x, y] of [
      [roles.HINT_ACTION, roles.HINT_FILL],
      [roles.HINT_FILL, roles.HINT_EVIDENCE],
      [roles.HINT_ACTION, roles.HINT_EVIDENCE],
      [roles.HINT_BLACKREF, roles.HINT_WHITEREF],
      [roles.HINT_ACTION, roles.HINT_BLACKREF],
      [roles.HINT_ACTION, roles.HINT_WHITEREF],
    ] as [Colour, Colour][]) {
      expect(d(x, y), `${key(x)} vs ${key(y)} in light`).toBeGreaterThan(0.12);
      expect(d(inDark(x), inDark(y)), `${key(x)} vs ${key(y)} in dark`).toBeGreaterThan(
        0.12,
      );
    }
    // The acted-on colour is the emphatic one in both schemes — the property a
    // reader who cannot compare hues is left with, and what lets a narration
    // say "this cell" *at all* once it has tied it to the evidence in words.
    for (const resolveScheme of [(c: Colour) => c, inDark]) {
      const action = colourToOKLCH(resolveScheme(roles.HINT_ACTION));
      for (const wash of [roles.HINT_FILL, roles.HINT_EVIDENCE]) {
        expect(action[1], `${key(wash)} vs the action colour`).toBeGreaterThan(
          colourToOKLCH(resolveScheme(wash))[1] * 2,
        );
      }
    }
    // ...and the two that are fills stay fills: a digit and its pencil marks are
    // drawn on top of them.
    expect(colourToOKLCH(roles.HINT_FILL)[0]).toBeGreaterThan(0.75);
    expect(colourToOKLCH(roles.HINT_EVIDENCE)[0]).toBeGreaterThan(0.75);

    // **And the same obligation in dark, which is what was missing.** The two
    // assertions above are a bound in *one direction only* — they say a fill is
    // pale enough for dark content, and there was no counterpart saying the dark
    // fill is dark enough for light content. `HINT_EVIDENCE` duly drifted to the
    // top of the dark wash band and Keen's pencil marks measured **1.23:1** on
    // it (owner-reported, 2026-08-21). The exact shape the palette's own note
    // records from `consolidate-colour-palette`: *a search buys separation with
    // anything not bounded*.
    //
    // Stated as contrast against the **derived** foregrounds rather than as a
    // lightness, because that is the actual obligation, and because these are
    // the colours a lightness bound cannot predict: they are computed from the
    // board and land at mid *luminance* in dark mode even at a mid OKLCH
    // lightness (a saturated blue-purple contributes almost nothing to
    // luminance). Bar is the **light scheme's own worst pair**, so this asserts
    // scheme parity rather than an invented threshold.
    const DARK_BOARD: Colour = [0.106, 0.106, 0.106];
    const relLum = (c: Colour): number => {
      const lin = (v: number) =>
        v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    };
    const contrast = (a: Colour, b: Colour): number => {
      const [hi, lo] = [relLum(a), relLum(b)].sort((p, q) => q - p);
      return (hi + 0.05) / (lo + 0.05);
    };
    // The two foregrounds every candidate game draws on an evidence cell, as the
    // dark pipeline actually produces them (games are handed pure white in dark
    // mode, then `dark-palette.ts` adapts).
    const darkPencil: Colour = [0.384, 0.376, 0.812];
    const darkEntry: Colour = [0.231, 0.592, 0.216];
    for (const [name, fg] of [
      ["pencil marks", darkPencil],
      ["entered digits", darkEntry],
    ] as [string, Colour][]) {
      expect(
        contrast(fg, inDark(roles.HINT_EVIDENCE)),
        `${name} on HINT_EVIDENCE in dark`,
      ).toBeGreaterThan(2.9);
    }
    // …and the evidence tint stays *visible* as a mark, or the fix for the above
    // is a fill nobody can see. Bar is what the light scheme's own tint scores
    // against its own board (1.11:1) — the same parity argument.
    expect(
      contrast(inDark(roles.HINT_EVIDENCE), DARK_BOARD),
      "the dark evidence tint against a dark board",
    ).toBeGreaterThan(1.11);
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
