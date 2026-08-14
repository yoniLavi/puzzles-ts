/**
 * The check a grep cannot do: **which hint steps point at a square with a bare
 * word while a second mark is on the board?** (`disambiguate-hint-deixis` task
 * 4.)
 *
 * The sweep that opened that change grepped the narrations for a deictic
 * co-occurring with a second-mark word (`ringed`/`shaded`/`highlighted`), which
 * finds only the sentences that *mention* the second mark. One that is bare
 * while a mark is **displayed and unmentioned** shows the player the same two
 * marks and says nothing about either — invisible to that grep, and the reason
 * for this file.
 *
 * It reads the *frame* instead: every hinting game, **every tier** (a rung is
 * tier-gated, and `audit-guessing-tier-names` §3.2 found a planted violation
 * staying green because a sweep looked only at `firstLeaf(presets())`), each
 * step's declared marks counted by role, and each explanation tested for a bare
 * deictic.
 *
 * It earned its keep once already: Light Up's *"This square is still dark, and
 * every square that could light it … is crossed out or already lit"* shades that
 * corridor on the board and never said so, and no grep for a second-mark word
 * could have found a sentence that contains none.
 *
 * **It is a report, not a gate, and its own numbers are why.** On the tree it
 * ships with — after the four games' sentences were fixed — it still flags **230
 * sentence shapes across 20 games**, and reading all of them found **nothing
 * further to change**. The false positives are not noise to be tuned away; they
 * are four legitimate ways to tie a deictic that no lexical rule recognises:
 *
 * - **by value** — Singles' *"This 3 shares a line with the ringed white 3"*;
 * - **by line or region context** — Group's *"In this row, c can go in only this
 *   cell — every other cell in the row has ruled it out"*;
 * - **by a continuation leg's antecedent** — Slant's *"The same clue forces this
 *   square too"*, Spokes' *"And rule this one out too"*;
 * - **by the marks being different kinds of thing.** This is the big one, and it
 *   is the rule a future port should carry: the ambiguity needs two marks of the
 *   **same kind**. Palisade marks an *edge* against *regions*, Spokes a *spoke*
 *   against *hubs*, Sticks a *square* against a *clue* — in each, the noun in
 *   "this edge" / "this line" / "this square" already picks the target out. All
 *   four genuine cases (Clusters, Bricks, Range, Light Up) marked a cell against
 *   another cell.
 *
 * Counting *rendered* hint-role colours instead of declared roles was the
 * originally-proposed instrument; it would not separate those cases either
 * (Spokes' spoke and hub are still two hint colours), and costs a full
 * `renderScenario` per step. What rendering would add is the one thing this
 * cannot see: a role declared but never drawn, or drawn but never declared.
 *
 * So the gate lives per game, next to the vocabulary that can judge it —
 * `clusters-hint.test.ts`, `bricks-hint.test.ts`, `range-hint.test.ts`,
 * `lightup-hint.test.ts` — and this file is the periodic sweep that says where
 * to look next. Run it with:
 *
 *     npx vitest run -c scripts/checks/diff.vitest.config.mts hint-deixis
 */
import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { randomNew } from "../../src/engine/random/index.ts";
import {
  firstLeaf,
  HINT_GAMES,
  markRoles,
} from "../../src/engine/testing/hint-games.ts";

const OUT = "metrics/hint-deixis.md";

/** A bare pointer at the acted-on element: a demonstrative plus a board noun,
 * or the vaguest of them all, "here". */
const DEICTIC =
  /\b(this|that) (cell|square|tile|dot|region|line|edge|clue|one|piece|domino|block|number|digit|colour|column|row|gap|space|island|shape|corner|end|move|tent|light|bulb|wall|arrow|node|circle|group|face|brick|slot|peg|junction|word|letter|monster|spoke|segment|run|hub|set)\b|\bhere\b/i;

/** The tie forms this project has actually used, as a *relation* rather than a
 * role name. Deliberately excludes `ringed`/`shaded`/`highlighted`: those name
 * the **other** mark, and a sentence containing one is exactly what the
 * co-occurrence grep already flagged. */
const RELATIONAL =
  /\bbeside\b|\bnext to\b|\bneighbour|\babove\b|\bbelow\b|\bbeneath\b|\bbetween\b|\bpast\b|\bbeyond\b|\baround it\b|\bfrom it\b|\bexcept this one\b|\breaches\b|\bsits\b|\btouch|\bas far as this\b|\bcould light it are marked\b/i;

const SEEDS = ["deixis-a", "deixis-b"];

it("reports every hint step that points bare while a second mark is displayed", () => {
  const rows: string[] = [];
  const perGame = new Map<string, number>();
  let examined = 0;
  let withSecondMark = 0;

  for (const [name, game] of HINT_GAMES) {
    const contract = game.difficulty;
    const base = firstLeaf(game.presets());
    const tiers = contract ? contract.tiers.length : 1;
    const shapes = new Set<string>();
    for (let tier = 0; tier < tiers; tier++) {
      const params = contract ? contract.withTier(base, tier) : base;
      if (game.validateParams(params, true)) continue; // tier refused at this size
      for (const seed of SEEDS) {
        let desc: string;
        let aux: string | undefined;
        try {
          ({ desc, aux } = game.newDesc(params, randomNew(`${name}-${tier}-${seed}`)));
        } catch {
          continue; // ungenerable at this size; difficulty-contract.test.ts owns that
        }
        const res = game.hint?.(game.newState(params, desc), aux);
        if (!res?.ok) continue;
        for (const step of res.steps) {
          examined++;
          if (markRoles(step.highlights) < 2) continue;
          withSecondMark++;
          if (!DEICTIC.test(step.explanation)) continue;
          if (RELATIONAL.test(step.explanation)) continue;
          // Collapse to a sentence *shape* — the formulaic games (Keen, Salad,
          // Subsets) otherwise report the same sentence once per value.
          const shape = step.explanation.replace(/\d+/g, "#");
          if (shapes.has(shape)) continue;
          shapes.add(shape);
          rows.push(`| ${name} | ${shape.replace(/\|/g, "\\|")} |`);
          perGame.set(name, (perGame.get(name) ?? 0) + 1);
        }
      }
    }
  }

  // The "how many did I look at?" guard. Without it a sweep whose every
  // generator threw would report a clean bill of health.
  expect(examined, "no hint step was examined at all").toBeGreaterThan(500);
  expect(withSecondMark, "no step displayed a second mark").toBeGreaterThan(200);

  const lines = [
    "# Hint deixis sweep",
    "",
    "Generated by `npx vitest run -c scripts/checks/diff.vitest.config.mts hint-deixis`.",
    "**Advisory.** Read the file's header before acting on a row: most rows are",
    "legitimate ties this lexical filter cannot recognise, and the question to ask",
    "of each is *are the two marks the same kind of thing?*",
    "",
    `${examined} steps examined, ${withSecondMark} of them displaying a second mark;`,
    `${rows.length} distinct sentence shapes flagged across ${perGame.size} games.`,
    "",
    "| game | sentence shape |",
    "| --- | --- |",
    ...rows,
    "",
    "## Flagged shapes per game",
    "",
    ...[...perGame].sort((a, b) => b[1] - a[1]).map(([g, n]) => `- ${g}: ${n}`),
  ];
  writeFileSync(OUT, `${lines.join("\n")}\n`);
  console.log(
    `wrote ${OUT}: ${rows.length} flagged shapes in ${perGame.size} games` +
      ` (${withSecondMark}/${examined} steps show a second mark)`,
  );
});
