/**
 * The dark-mode measuring instrument for `colour-tokens-per-scheme` — the thing
 * task 3.1 means by "verify with the same pairwise metric, not by eye".
 *
 * `hand-author-dark-palette` F2 is the reason it exists: a screenshot said Flood
 * had regressed, the measurement said it had improved by nearly 3×, and the
 * screenshot was about to cost a correct change. An eye comparing two dark greens
 * adjacent to seven other colors is not a reliable instrument.
 *
 * It reproduces `puzzle-view.ts`'s dark-mode pipeline exactly — including that
 * games are handed **pure white** as their background in dark mode — and reports
 * two things:
 *
 * - **set separation**: the worst pairwise OKLCH distance inside each enumerated
 *   set, in light and in dark. A set's members exist to be told apart from *each
 *   other*, which is a property no background-relative rule can protect.
 * - **the background relationship**: `ΔL(color, background)` in each scheme. A
 *   color that is a subtle tint of the board in light mode should be one in dark
 *   mode too; `hand-author-dark-palette` drove violations of this from 150 to 2.
 *
 * Not part of the gate. Run it with:
 *
 *     npx vitest run -c scripts/checks/diff.vitest.config.mts color-dark-check
 */
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { darkValue } from "../../src/engine/color/color-token.ts";
import { getTsGame } from "../../src/engine/registry.ts";
import type { Color, PuzzleId } from "../../src/engine/types.ts";
import { puzzleAugmentations } from "../../src/puzzle/augmentation.ts";
import { puzzleIds } from "../../src/puzzle/catalog.ts";
import { darkModePalette } from "../../src/puzzle/dark-palette.ts";
import {
  colorToOKLCH,
  isGrayChroma,
  type OKLCH,
  oklchToColor,
} from "../../src/utils/color.ts";
import "../../src/games/index.ts";

const OUT = "/tmp/color-dark-check.md";

/** A light host: the app's own surface lightness, as a neutral gray. */
const LIGHT_BG_L = 0.9;
/** A dark host. `utils/color.ts` names ~0.18 as the realistic off-black. */
const DARK_BG_L = 0.2;

/** What `puzzle-view.ts` passes a game in each scheme. In **dark** mode it passes
 * pure white, precisely because games derive colors by scaling the background
 * down; the whole palette is inverted afterwards. */
const lightInput = oklchToColor([LIGHT_BG_L, 0, 0]);
const darkInput = oklchToColor([1, 0, 0]);

/** `puzzle-view.ts`'s dark-mode pass — the real one, called rather than copied:
 * a second copy kept in step by instruction is a rule with no owner. */
function darkPalette(id: string, palette: Color[]): OKLCH[] {
  const authored: Record<number, Color> = {};
  palette.forEach((c, i) => {
    const d = c && darkValue(c);
    if (d) authored[i] = [...d];
  });
  return darkModePalette(
    palette.map((c) => colorToOKLCH(c)),
    puzzleAugmentations[id as PuzzleId]?.darkMode,
    authored,
    DARK_BG_L,
  );
}

/** The indices a game exchanges between schemes. An entry here does **not**
 * denote the same role in both, so a light-vs-dark comparison of one such index
 * is comparing a highlight with a lowlight — see the note in the report. */
const swapped = (id: string): Set<number> =>
  new Set((puzzleAugmentations[id as PuzzleId]?.darkMode?.paletteSwaps ?? []).flat());

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
      .colors(lightInput)
      .slice(lo, hi + 1)
      .map(colorToOKLCH);
    const dark = darkPalette(id, game.colors(darkInput)).slice(lo, hi + 1);
    const wl = worstPair(light);
    const wd = worstPair(dark);
    lines.push(
      `| ${id} | ${light.length} | ${wl.d.toFixed(3)} | **${wd.d.toFixed(3)}** |` +
        ` ${lo + wd.i} vs ${lo + wd.j} |`,
    );
  }

  lines.push("\n## Colors that change their relationship to the board\n");
  lines.push(
    "A color within 0.15 lightness of the board in light mode should stay close",
    "to it in dark mode, and one far from it should stay far. Listed: every entry",
    "whose distance-from-background moves by more than 0.25.\n",
    "A row marked **swap** is one of a `paletteSwaps` pair, and for those this",
    "measurement does not mean what it means elsewhere: the two indices exchange",
    "**roles** between schemes, so the light and dark values compared here belong",
    "to a bevel's highlight and its lowlight. What such a pair owes the player is",
    "that the highlight stays lighter than the surface it sits on and the lowlight",
    "darker — which is a relationship to that surface, not to the board, and is",
    "asserted directly in `src/puzzle/dark-palette.test.ts`.\n",
  );
  lines.push("| game | # | ΔL light | ΔL dark | authored? | swap? |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  let violations = 0;
  let swapRows = 0;
  for (const id of [...puzzleIds].sort()) {
    const game = getTsGame(id);
    if (!game) continue;
    const lightPal = game.colors(lightInput);
    const light = lightPal.map((c) => (c ? colorToOKLCH(c) : null));
    const dark = darkPalette(id, game.colors(darkInput));
    const swaps = swapped(id);
    const bgIndex = puzzleAugmentations[id as PuzzleId]?.paletteBgIndex ?? 0;
    const lbg = light[bgIndex]?.[0] ?? LIGHT_BG_L;
    const dbg = dark[bgIndex]?.[0] ?? DARK_BG_L;
    light.forEach((lch, i) => {
      if (!lch || i === bgIndex) return;
      const dl = Math.abs(lch[0] - lbg);
      const dd = Math.abs(dark[i][0] - dbg);
      if (Math.abs(dl - dd) > 0.25) {
        violations += 1;
        if (swaps.has(i)) swapRows += 1;
        lines.push(
          `| ${id} | ${i} | ${dl.toFixed(3)} | ${dd.toFixed(3)} |` +
            ` ${darkValue(lightPal[i]) ? "yes" : "no"} |` +
            ` ${swaps.has(i) ? "**swap**" : ""} |`,
        );
      }
    });
  }
  lines.push(
    `\n**${violations} colors** move their relationship to the board` +
      ` (${swapRows} of them across a role swap, which this measurement cannot read).\n`,
  );
  writeFileSync(OUT, `${lines.join("\n")}\n`);
  console.log(
    `wrote ${OUT}: ${violations} background-relationship violations` +
      ` (${swapRows} across a role swap)`,
  );
});
