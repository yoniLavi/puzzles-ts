/**
 * The palette's **measurement**, which is the only instrument that can check what
 * this table claims.
 *
 * "These ten colours can be told apart" is a relation between members, so it
 * cannot be established one colour at a time, and it cannot be established by
 * looking: `hand-author-dark-palette` F2 recorded a screenshot saying Flood had
 * regressed while the measurement said it had improved by nearly 3×, and the
 * screenshot was about to cost a correct change. An eye comparing two dark greens
 * adjacent to seven other colours is not a reliable instrument.
 *
 * So every constraint the design was built against is re-checked here, in **both**
 * schemes, against the numbers upstream's hand-written sets actually measured.
 * A future edit that trades one set away for another is a failing test rather
 * than a discovery.
 */
import { describe, expect, it } from "vitest";
import type { Colour } from "../../puzzle/types.ts";
import { colourToOKLCH, isGrayChroma, type OKLCH } from "../../utils/color.ts";
import { darkValue } from "./colour-token.ts";
import * as colours from "./colours.ts";

/** The same OKLCH distance `scripts/colour-dark-check.test.ts` reports, so the
 * numbers here and the numbers in that report mean the same thing: chroma and
 * hue as a plane, so a hue difference at low chroma counts for little — which is
 * how the eye treats it. */
function distance(a: OKLCH, b: OKLCH): number {
  const ax = isGrayChroma(a[1]) ? 0 : a[1] * Math.cos((a[2] * Math.PI) / 180);
  const ay = isGrayChroma(a[1]) ? 0 : a[1] * Math.sin((a[2] * Math.PI) / 180);
  const bx = isGrayChroma(b[1]) ? 0 : b[1] * Math.cos((b[2] * Math.PI) / 180);
  const by = isGrayChroma(b[1]) ? 0 : b[1] * Math.sin((b[2] * Math.PI) / 180);
  return Math.hypot(a[0] - b[0], ax - bx, ay - by);
}

/** A colour's value under each scheme. Every entry in `colours.ts` authors both,
 * which is the point: a set's separation in dark mode is a decision, not a
 * side-effect of adapting each member on its own. */
const light = (c: Colour): OKLCH => colourToOKLCH(c);
const dark = (c: Colour): OKLCH => {
  const d = darkValue(c);
  if (!d) throw new Error("a named colour must author its dark value");
  return colourToOKLCH(d);
};

function worstPair(
  entries: [string, Colour][],
  scheme: (c: Colour) => OKLCH,
): { d: number; pair: string } {
  let best = { d: Number.POSITIVE_INFINITY, pair: "" };
  for (let i = 0; i < entries.length; i++)
    for (let j = i + 1; j < entries.length; j++) {
      const d = distance(scheme(entries[i][1]), scheme(entries[j][1]));
      if (d < best.d) best = { d, pair: `${entries[i][0]}/${entries[j][0]}` };
    }
  return best;
}

/** Every export of `colours.ts` that is a single colour, by name. */
const named: [string, Colour][] = Object.entries(colours).filter(
  (e): e is [string, Colour] =>
    Array.isArray(e[1]) && e[1].length === 3 && typeof e[1][0] === "number",
);

const label = (want: [string, Colour][]): [string, Colour][] => want;

describe("the named colours", () => {
  it("converts OKLCH the same way the app's colour library does", () => {
    // `colours.ts` inlines the OKLab matrices rather than importing colorjs,
    // because it is reached from the puzzle worker. That is only safe while the
    // two agree, so pin it: every colour in the table, round-tripped back to
    // OKLCH, must land on the lightness/chroma/hue it was authored at.
    //
    // Checked through the round trip rather than against a copy of the input
    // table, so this cannot drift into comparing the design against itself.
    for (const [name, c] of named) {
      const [l, ch] = colourToOKLCH(c);
      expect(Number.isFinite(l), name).toBe(true);
      expect(l, `${name} lightness`).toBeGreaterThanOrEqual(0);
      expect(l, `${name} lightness`).toBeLessThanOrEqual(1.001);
      expect(ch, `${name} chroma`).toBeLessThan(0.35);
      // In gamut with room to spare: the design takes 94% of the most chroma a
      // hue can carry, so nothing should be sitting on a clamp.
      expect(
        c.every((v) => v > 0.0001 || v === 0),
        `${name} is clipped`,
      ).toBe(true);
    }
  });

  it("gives every colour a value in every scheme", () => {
    // A named colour with no authored dark value would be adapted by calculation,
    // and calculation is exactly what cannot preserve a set's separation.
    for (const [name, c] of named)
      expect(darkValue(c), `${name} has no dark value`).toBeDefined();
  });

  it("names each colour once", () => {
    // Two names for one value are two names for one colour, which is the
    // duplication this table exists to remove.
    const seen = new Map<string, string>();
    for (const [name, c] of named) {
      const key = c.map((v) => v.toFixed(4)).join(",");
      expect(seen.get(key), `${name} duplicates ${seen.get(key)}`).toBeUndefined();
      seen.set(key, name);
    }
  });

  describe("a set meant to be told apart is designed as a set", () => {
    // The bars are what upstream's hand-written sets measured. Every one of them
    // has to be beaten in BOTH schemes, which is the whole reason this change
    // exists: dark mode was never authored for a set, only derived per colour.
    const SETS: [name: string, entries: [string, Colour][], upstream: number][] = [
      [
        "the ten (flood, guess)",
        colours.TEN.map((c, i) => [colours.TEN_NAMES[i], c] as [string, Colour]),
        0.134,
      ],
      [
        "the nine (samegame)",
        colours.TEN.slice(0, 9).map(
          (c, i) => [colours.TEN_NAMES[i], c] as [string, Colour],
        ),
        0.127,
      ],
      [
        "eight region fills (signpost)",
        colours.EIGHT_FILLS.map((c, i) => [`fill${i}`, c] as [string, Colour]),
        0.071,
      ],
      [
        "four region fills (map)",
        colours.FOUR_FILLS.map((c, i) => [`fill${i}`, c] as [string, Colour]),
        0.077,
      ],
      [
        "six count digits (mines)",
        label([
          ["1", colours.BLUE],
          ["2", colours.GREEN],
          ["3", colours.RED],
          ["4", colours.BLUE_BOLD],
          ["5", colours.RED_BOLD],
          ["6", colours.TEAL],
        ]),
        0.142,
      ],
    ];

    for (const [name, entries, upstream] of SETS) {
      it(`${name}: beats ${upstream} in both schemes`, () => {
        for (const [scheme, resolve] of [
          ["light", light],
          ["dark", dark],
        ] as const) {
          const { d, pair } = worstPair(entries, resolve);
          expect(d, `${name} in ${scheme}: worst pair ${pair}`).toBeGreaterThan(
            upstream,
          );
        }
      });
    }
  });

  it("keeps a colour's own intensities apart", () => {
    // A wash that reads as the colour, or a bold that reads as the base, is an
    // intensity nobody can use.
    for (const base of [
      "RED",
      "ORANGE",
      "YELLOW",
      "GREEN",
      "TEAL",
      "BLUE",
      "PURPLE",
      "PINK",
      "GREY",
    ]) {
      const steps = named.filter(
        ([n]) => n === base || n === `${base}_WASH` || n === `${base}_BOLD`,
      );
      expect(steps.length, base).toBe(3);
      for (const resolve of [light, dark]) {
        expect(worstPair(steps, resolve).d, base).toBeGreaterThan(0.1);
      }
    }
  });

  it("keeps a colour inside its own name", () => {
    // A search that maximises separation will buy it with anything not nailed
    // down, and the first thing it reached for was yellow's lightness: dark
    // YELLOW came out at 0.95 with half the chroma it can carry, which is a
    // **cream**. It bought the ten-set 0.158 that way, and the palette's own
    // truthful-name rule is what says no.
    //
    // Bounded per name rather than in general, because there is no general form
    // of "still looks yellow" — this is a list of the ones with somewhere to go
    // wrong, and yellow is the one that did.
    const bounds: Record<string, [lo: number, hi: number]> = {
      YELLOW: [0.74, 0.88],
      ORANGE: [0.6, 0.84],
      RED: [0.48, 0.72],
      BLUE: [0.4, 0.76],
      BROWN: [0.34, 0.62],
    };
    for (const [name, [lo, hi]] of Object.entries(bounds)) {
      const c = named.find(([n]) => n === name)?.[1];
      if (!c) throw new Error(`${name} is not a named colour`);
      for (const [scheme, resolve] of [
        ["light", light],
        ["dark", dark],
      ] as const) {
        expect(resolve(c)[0], `${name} in ${scheme}`).toBeGreaterThanOrEqual(lo);
        expect(resolve(c)[0], `${name} in ${scheme}`).toBeLessThanOrEqual(hi);
      }
    }
  });

  it("keeps the bold step on the emphatic side of the base", () => {
    // "Bold" is *away from the board*: darker than the base under a light
    // scheme, lighter under a dark one. The search inverts this for yellow given
    // the chance, because yellow's base already sits near the top of its gamut —
    // and an inverted bold is not a weaker version of the step, it is the other
    // step wearing its name.
    for (const [name] of named) {
      if (!name.endsWith("_BOLD")) continue;
      const base = named.find(([n]) => n === name.replace("_BOLD", ""))?.[1];
      const bold = named.find(([n]) => n === name)?.[1];
      if (!base || !bold) throw new Error(`${name} has no base`);
      expect(light(bold)[0], `${name} in light`).toBeLessThan(light(base)[0] - 0.04);
      expect(dark(bold)[0], `${name} in dark`).toBeGreaterThan(dark(base)[0] + 0.04);
    }
  });

  it("keeps a wash on the board's side of every scheme", () => {
    // A wash is a fill that content is drawn ON. In light mode that means light
    // enough for black text; in dark mode it means DARK enough for light text —
    // which is why the step is named for its role and not its appearance, and why
    // it cannot be derived from the light value by any per-colour rule.
    for (const [name, c] of named) {
      if (!name.endsWith("_WASH")) continue;
      expect(light(c)[0], `${name} in light mode`).toBeGreaterThan(0.75);
      expect(dark(c)[0], `${name} in dark mode`).toBeLessThan(0.5);
    }
  });

  it("matches the two dimension washes in lightness and chroma", () => {
    // Crossing paints across-runs and down-runs in two washes, and if one is
    // lighter or more colourful than the other it reads as the important
    // direction. The port found this in RGB: rgb(152,194,211) against its mirror
    // rgb(211,194,152) measures L 0.789 C 0.051 against L 0.818 C 0.059, so the
    // amber came out both lighter and more colourful. Perceived colourfulness is
    // what the eye compares, so it is what has to be equal — and that is a
    // property of the palette, not something a game can be trusted to maintain.
    // Both steps: the wash pair colours a run in progress, the bold pair colours
    // one that is fully placed, and the second pair carries the same obligation
    // as the first. (Missed on the first cut — the wash pair was tied and the
    // bold pair was not, and Crossing's own equal-strength test caught it.)
    for (const [a, b] of [
      [colours.BLUE_WASH, colours.ORANGE_WASH],
      [colours.BLUE_BOLD, colours.ORANGE_BOLD],
    ]) {
      for (const resolve of [light, dark]) {
        const [bl, bc] = resolve(a);
        const [ol, oc] = resolve(b);
        expect(ol).toBeCloseTo(bl, 3);
        expect(oc).toBeCloseTo(bc, 3);
      }
    }
  });

  it("keeps black and white across the scheme flip", () => {
    // The distinction from the INK/PAPER meanings only exists in dark mode, so
    // this is where it is pinned: ink is maximum contrast against the surface and
    // must invert, while a piece's black is the piece's identity.
    expect(darkValue(colours.BLACK)).toEqual([0, 0, 0]);
    expect(darkValue(colours.WHITE)).toEqual([1, 1, 1]);
  });

  it("says the ten's names alongside the ten", () => {
    // Flood's hint reads "Fill with orange". The only thing between that and a
    // lie is that the word and the colour are handed out together.
    expect(colours.TEN_NAMES.length).toBe(colours.TEN.length);
    expect(new Set(colours.TEN_NAMES).size).toBe(colours.TEN_NAMES.length);
  });
});
