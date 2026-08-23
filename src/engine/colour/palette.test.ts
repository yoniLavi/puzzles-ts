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

  it("keeps the hint emphases distinct, in both schemes", () => {
    // These are one meaning at several jobs — the move, the evidence the
    // deduction rests on, and the two reference premises — and seven games put
    // two or three of them on screen at once. The first two used to be shades of
    // one blue eight hundredths of a lightness apart; they are a hue apart now,
    // and this is what says so.
    //
    // **Both schemes, because one is not evidence for the other** — the lesson
    // `hand-author-dark-palette` paid for, and this guard was measuring the
    // light column only. It matters here rather than academically: the pairs are
    // *not* equally separated in the two schemes, so the next person to retune
    // one of these learns about it from a red test rather than from a hint frame
    // where the target and its evidence read as one mark.
    //
    // It did exactly that job on 2026-08-21: an attempt at the contrast fix
    // asked for chroma 0.077 at lightness 0.28, the sRGB gamut clamp silently
    // returned 0.050 at 0.293, and this failed at **0.106**. A bound the
    // arithmetic cannot be trusted to predict is one worth asserting.
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
      [roles.HINT_ACTION, roles.HINT_EVIDENCE],
      [roles.HINT_ACTION, roles.HINT_EVIDENCE_WASH],
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
    // reader who cannot compare hues is left with, and what lets a narration say
    // "this cell" *at all* once it has tied it to the evidence in words.
    // Measured against the *wash*, which is the only hint role that is a fill;
    // the evidence **mark** is a line read against the board and is emphatic by
    // design, so a chroma comparison against it would say nothing.
    for (const resolveScheme of [(c: Colour) => c, inDark]) {
      const action = colourToOKLCH(resolveScheme(roles.HINT_ACTION));
      const wash = roles.HINT_EVIDENCE_WASH;
      expect(action[1], `${key(wash)} vs the action colour`).toBeGreaterThan(
        colourToOKLCH(resolveScheme(wash))[1] * 2,
      );
    }
    // ...and the one that is a fill stays a fill.
    expect(colourToOKLCH(roles.HINT_EVIDENCE_WASH)[0]).toBeGreaterThan(0.75);

    const relLum = (c: Colour): number => {
      const lin = (v: number) =>
        v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    };
    const contrast = (a: Colour, b: Colour): number => {
      const [hi, lo] = [relLum(a), relLum(b)].sort((p, q) => q - p);
      return (hi + 0.05) / (lo + 0.05);
    };
    const LIGHT_BOARD: Colour = [0.827, 0.827, 0.827];
    const DARK_BOARD: Colour = [0.106, 0.106, 0.106];

    // **A mark has to be visible against the board it is drawn on, in both
    // schemes**, and this is the bound that replaces the one the fill regime
    // needed. That one asked whether a *derived* foreground stayed legible on
    // the evidence wash — a real obligation while games drew their digits on it,
    // and the reason `TEAL_WASH_DEEP` existed. Nothing is drawn on the evidence
    // any more: it is an outline, and the wash is kept only where the cells
    // under it are empty. So the obligation moves rather than lapsing, and it
    // moves to the side that was *also* failing — at the lightness that
    // legibility demanded, the wash scored 1.15:1 against a dark board, a mark
    // nobody could see.
    //
    // Both directions in both schemes, deliberately: a bound in one direction
    // only is exactly how the previous value drifted to the top of its band.
    for (const [name, mark, bar] of [
      // The outline is read *against* the board, so it wants a real margin.
      ["HINT_EVIDENCE", roles.HINT_EVIDENCE, 3],
      ["HINT_ACTION", roles.HINT_ACTION, 3],
      // A fill covers a whole cell, so it reads at far less — the bar is what
      // the light scheme's own tint scores against its own board (1.288), so
      // the dark value is chosen to reach parity rather than to hit a threshold
      // somebody invented.
      ["HINT_EVIDENCE_WASH", roles.HINT_EVIDENCE_WASH, 1.28],
    ] as [string, Colour, number][]) {
      expect(contrast(mark, LIGHT_BOARD), `${name} on a light board`).toBeGreaterThan(
        bar,
      );
      expect(
        contrast(inDark(mark), DARK_BOARD),
        `${name} on a dark board`,
      ).toBeGreaterThan(bar);
    }

    // **And the bound in the other direction, which is the one that was
    // missing.** The three assertions above are all floors: they say each mark
    // is visible enough. Nothing said the *wash* must stay quiet enough for the
    // marks that land on it — and a target cell is very often inside the region
    // the deduction reasons from, so the action ring is drawn straight onto this
    // fill. Left unbounded, the dark wash went to the visible end of its band
    // and the ring measured **1.69:1** on it: the evidence shouting, the
    // conclusion whispering.
    //
    // The two requirements move in opposite directions along one axis, so light
    // mode's own 3.94 is not reachable in dark at a wash anyone can see; 3 is a
    // floor with real slack rather than a tuned target (dark scores 3.54).
    for (const [name, fg] of [
      ["the action ring", roles.HINT_ACTION],
      ["the evidence outline", roles.HINT_EVIDENCE],
    ] as [string, Colour][]) {
      expect(
        contrast(fg, roles.HINT_EVIDENCE_WASH),
        `${name} on the evidence wash in light`,
      ).toBeGreaterThan(3);
      expect(
        contrast(inDark(fg), inDark(roles.HINT_EVIDENCE_WASH)),
        `${name} on the evidence wash in dark`,
      ).toBeGreaterThan(3);
    }
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
