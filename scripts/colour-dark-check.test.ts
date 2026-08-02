/**
 * The dark-mode measuring instrument for `colour-tokens-per-scheme` — the thing
 * task 3.1 means by "verify with the same pairwise metric, not by eye".
 *
 * `hand-author-dark-palette` F2 is the reason it exists: a screenshot said Flood
 * had regressed, the measurement said it had improved by nearly 3×, and the
 * screenshot was about to cost a correct change. An eye comparing two dark greens
 * adjacent to seven other colours is not a reliable instrument.
 *
 * It reproduces `puzzle-view.ts`'s dark-mode pipeline exactly — including that
 * games are handed **pure white** as their background in dark mode — and reports
 * two things:
 *
 * - **set separation**: the worst pairwise OKLCH distance inside each enumerated
 *   set, in light and in dark. A set's members exist to be told apart from *each
 *   other*, which is a property no background-relative rule can protect.
 * - **the background relationship**: `ΔL(colour, background)` in each scheme. A
 *   colour that is a subtle tint of the board in light mode should be one in dark
 *   mode too; `hand-author-dark-palette` drove violations of this from 150 to 2.
 *
 * Not part of the gate. Run it with:
 *
 *     npx vitest run -c scripts/diff.vitest.config.mts colour-dark-check
 */
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { darkValue } from "../src/engine/colour/colour-token.ts";
import { getTsGame } from "../src/engine/registry.ts";
import type { Colour, PuzzleId } from "../src/engine/types.ts";
import { puzzleAugmentations } from "../src/puzzle/augmentation.ts";
import { puzzleIds } from "../src/puzzle/catalog.ts";
import {
  colourToOKLCH,
  darkModeColor,
  isGrayChroma,
  type OKLCH,
  oklchToColour,
} from "../src/utils/color.ts";
import { clamp } from "../src/utils/math.ts";
import "../src/games/index.ts";

const OUT = "/tmp/colour-dark-check.md";

/** A light host: the app's own surface lightness, as a neutral grey. */
const LIGHT_BG_L = 0.9;
/** A dark host. `utils/color.ts` names ~0.18 as the realistic off-black. */
const DARK_BG_L = 0.2;

/** What `puzzle-view.ts` passes a game in each scheme. In **dark** mode it passes
 * pure white, precisely because games derive colours by scaling the background
 * down; the whole palette is inverted afterwards. */
const lightInput = oklchToColour([LIGHT_BG_L, 0, 0]);
const darkInput = oklchToColour([1, 0, 0]);

/** `puzzle-view.ts`'s dark-mode pass, reproduced. Keep in step with it. */
function darkPalette(id: string, palette: Colour[]): OKLCH[] {
  const aug = puzzleAugmentations[id as PuzzleId] ?? {};
  const perPuzzle = aug.darkMode?.paletteOverrides;
  const out = palette.map((c, i) => {
    let [l, ch, h] = colourToOKLCH(c);
    const override = perPuzzle?.[i];
    if (Array.isArray(override)) {
      [l, ch, h] = override;
    } else if (override !== false) {
      const authored = darkValue(c);
      [l, ch, h] = authored
        ? colourToOKLCH(authored)
        : darkModeColor([l, ch, h], DARK_BG_L);
      if (typeof override === "number") {
        l *= override;
        if (l < 0) l = DARK_BG_L - l;
        l = clamp(0, l, 1);
      }
    }
    return [l, ch, h] as OKLCH;
  });
  for (const [a, b] of aug.darkMode?.paletteSwaps ?? []) {
    [out[a], out[b]] = [out[b], out[a]];
  }
  return out;
}

/** OKLCH distance, chroma/hue as a plane so a hue difference at low chroma counts
 * for little — which is how the eye treats it. */
function distance(a: OKLCH, b: OKLCH): number {
  const ax = isGrayChroma(a[1]) ? 0 : a[1] * Math.cos((a[2] * Math.PI) / 180);
  const ay = isGrayChroma(a[1]) ? 0 : a[1] * Math.sin((a[2] * Math.PI) / 180);
  const bx = isGrayChroma(b[1]) ? 0 : b[1] * Math.cos((b[2] * Math.PI) / 180);
  const by = isGrayChroma(b[1]) ? 0 : b[1] * Math.sin((b[2] * Math.PI) / 180);
  return Math.hypot(a[0] - b[0], ax - bx, ay - by);
}

/** The enumerated sets, as palette index ranges, from each game's own enum. */
const SETS: Record<string, [number, number]> = {
  flood: [2, 11],
  guess: [6, 15],
  samegame: [1, 9],
  map: [2, 5],
  mines: [2, 9],
};

function worstPair(entries: OKLCH[]): { d: number; i: number; j: number } {
  let best = { d: Number.POSITIVE_INFINITY, i: -1, j: -1 };
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const d = distance(entries[i], entries[j]);
      if (d < best.d) best = { d, i, j };
    }
  }
  return best;
}

it("measures dark mode", () => {
  const lines: string[] = ["# Dark-mode measurement\n"];

  lines.push("## Enumerated-set separation (worst pair, OKLCH)\n");
  lines.push("| game | n | light | dark | worst dark pair |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const [id, [lo, hi]] of Object.entries(SETS)) {
    const game = getTsGame(id);
    if (!game) continue;
    const light = game
      .colours(lightInput)
      .slice(lo, hi + 1)
      .map(colourToOKLCH);
    const dark = darkPalette(id, game.colours(darkInput)).slice(lo, hi + 1);
    const wl = worstPair(light);
    const wd = worstPair(dark);
    lines.push(
      `| ${id} | ${light.length} | ${wl.d.toFixed(3)} | **${wd.d.toFixed(3)}** |` +
        ` ${lo + wd.i} vs ${lo + wd.j} |`,
    );
  }

  lines.push("\n## Colours that change their relationship to the board\n");
  lines.push(
    "A colour within 0.15 lightness of the board in light mode should stay close",
    "to it in dark mode, and one far from it should stay far. Listed: every entry",
    "whose distance-from-background moves by more than 0.25.\n",
  );
  lines.push("| game | # | ΔL light | ΔL dark | authored? |");
  lines.push("| --- | --- | --- | --- | --- |");
  let violations = 0;
  for (const id of [...puzzleIds].sort()) {
    const game = getTsGame(id);
    if (!game) continue;
    const lightPal = game.colours(lightInput);
    const light = lightPal.map((c) => (c ? colourToOKLCH(c) : null));
    const dark = darkPalette(id, game.colours(darkInput));
    const bgIndex = puzzleAugmentations[id as PuzzleId]?.paletteBgIndex ?? 0;
    const lbg = light[bgIndex]?.[0] ?? LIGHT_BG_L;
    const dbg = dark[bgIndex]?.[0] ?? DARK_BG_L;
    light.forEach((lch, i) => {
      if (!lch || i === bgIndex) return;
      const dl = Math.abs(lch[0] - lbg);
      const dd = Math.abs(dark[i][0] - dbg);
      if (Math.abs(dl - dd) > 0.25) {
        violations += 1;
        lines.push(
          `| ${id} | ${i} | ${dl.toFixed(3)} | ${dd.toFixed(3)} |` +
            ` ${darkValue(lightPal[i]) ? "yes" : "no"} |`,
        );
      }
    });
  }
  lines.push(`\n**${violations} colours** move their relationship to the board.\n`);
  writeFileSync(OUT, `${lines.join("\n")}\n`);
  console.log(`wrote ${OUT}: ${violations} background-relationship violations`);
});
