/**
 * Regenerates the colour inventory — the reviewable artefact for
 * `colour-tokens-per-scheme` (its task 2.4), and the audit's before it.
 *
 * It resolves **every registered game's palette** and records, per index, the
 * resolved value and where that value came from. Two properties make it the
 * right artefact for a wide colour change:
 *
 * - it reports *resolved* values, so a pure relocation (a literal becoming a
 *   token of the same value) shows as **no diff at all** — which is exactly the
 *   claim a mechanical pass has to prove;
 * - it names the source, so the shrinking of `*local*` is visible commit by
 *   commit.
 *
 * Not part of the gate (it writes a file). Run it with:
 *
 *     npx vitest run -c scripts/diff.vitest.config.mts colour-inventory
 *
 * and diff the result against the committed copy.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "vitest";
import { mkhighlight } from "../src/native/engine/colour-mkhighlight.ts";
import * as roles from "../src/native/engine/palette.ts";
import * as gameTokens from "../src/native/engine/palette-games.ts";
import { getTsGame } from "../src/native/engine/registry.ts";
import { TS_PORTED_PUZZLE_IDS } from "../src/native/games/ts-ported-ids.ts";
import type { Colour } from "../src/puzzle/types.ts";
import "../src/native/games/index.ts";

/** The same light host background `palette.test.ts` uses. */
const BG: Colour = [0.827, 0.827, 0.827];

/** A second, deliberately non-grey background. A local colour that moves between
 * the two is *relative* to the board and becomes a shared derivation over tokens;
 * one that stays put is absolute and becomes an authored token. */
const BG2: Colour = [0.6, 0.7, 0.8];

const OUT = "openspec/changes/colour-tokens-per-scheme/inventory.md";

const key = (c: Colour): string => c.map((v) => Math.round(v * 1000) / 1000).join(",");

/**
 * Token **object** → its name, for both halves of the table.
 *
 * By identity rather than by value, because value is ambiguous exactly where it
 * matters: `INK` and `PIECE_BLACK` are both pure black and behave oppositely
 * under a scheme flip. A palette entry that *is* the token answers the question
 * outright.
 */
function tokenNames(): Map<Colour, string> {
  const out = new Map<Colour, string>();
  const add = (name: string, v: unknown): void => {
    if (Array.isArray(v) && v.length === 3 && typeof v[0] === "number") {
      out.set(v as Colour, name);
    } else if (Array.isArray(v)) {
      v.forEach((e, i) => {
        add(`${name}[${i}]`, e);
      });
    }
  };
  for (const [name, value] of Object.entries({ ...roles, ...gameTokens }))
    add(name, value);
  return out;
}

/** value key → the shared name that produces it. */
function sharedByValue(): Map<string, string> {
  const out = new Map<string, string>();
  const { background, highlight, lowlight } = mkhighlight(BG);
  out.set(key(background), "mkhighlight.background");
  out.set(key(highlight), "mkhighlight.highlight");
  out.set(key(lowlight), "mkhighlight.lowlight");
  for (const [name, value] of Object.entries(roles)) {
    if (typeof value === "function") {
      const derived =
        value.length === 2
          ? (value as (b: Colour, h: Colour) => Colour)(background, highlight)
          : (value as (b: Colour) => Colour)(background);
      if (!Array.isArray(derived) || derived.length !== 3) continue;
      if (!out.has(key(derived))) out.set(key(derived), `${name}()`);
    } else if (Array.isArray(value) && value.length === 3) {
      if (!out.has(key(value as Colour))) out.set(key(value as Colour), name);
    }
  }
  return out;
}

/**
 * Recover each game's `COL_*` index names from its source.
 *
 * Only plain integer declarations are resolved; a computed one (Signpost's
 * `COL_M0 = COL_B0 + NBACKGROUNDS`) is left unnamed rather than guessed, since a
 * wrong name in the inventory is worse than none.
 */
function indexNames(id: string): Map<number, string> {
  const dir = join("src/native/games", id);
  const names = new Map<number, string>();
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return names;
  }
  for (const f of files) {
    if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
    const src = readFileSync(join(dir, f), "utf8");
    for (const m of src.matchAll(/^(?:export )?const (COL_[A-Z0-9_]+) = (\d+);/gm)) {
      const i = Number(m[2]);
      if (!names.has(i)) names.set(i, m[1]);
    }
  }
  return names;
}

it("regenerates the colour inventory", () => {
  const shared = sharedByValue();
  const byToken = tokenNames();
  const ids = [...TS_PORTED_PUZZLE_IDS].sort();
  const lines: string[] = [];
  let total = 0;
  let sharedCount = 0;
  const localValues = new Set<string>();
  let localCount = 0;
  let derivedCount = 0;
  const perGame: string[] = [];

  for (const id of ids) {
    const game = getTsGame(id);
    if (!game) throw new Error(`${id} is in TS_PORTED_PUZZLE_IDS but not registered`);
    const palette = game.colours(BG);
    const alt = game.colours(BG2);
    const names = indexNames(id);
    perGame.push(`### ${id}\n`);
    perGame.push("| # | Local name | Value | Source |");
    perGame.push("| --- | --- | --- | --- |");
    palette.forEach((c, i) => {
      if (!c) return;
      total += 1;
      const source = byToken.get(c) ?? shared.get(key(c));
      const derived = key(c) !== key(alt[i]);
      if (source) sharedCount += 1;
      else if (derived) derivedCount += 1;
      else {
        localCount += 1;
        localValues.add(key(c));
      }
      const local = derived ? "*derived*" : "*local*";
      const name = names.get(i);
      perGame.push(
        `| ${i} | ${name ? `\`${name}\`` : "—"} | \`[${c.join(", ")}]\` |` +
          ` ${source ? `\`${source}\`` : local} |`,
      );
    });
    perGame.push("");
  }

  lines.push("# Colour inventory\n");
  lines.push(
    "<!-- Generated by scripts/colour-inventory.test.ts. Regenerate with:",
    "     npx vitest run -c scripts/diff.vitest.config.mts colour-inventory -->\n",
  );
  lines.push(
    `**Totals:** ${total} palette entries across ${ids.length} games. ` +
      `${sharedCount} (${Math.round((100 * sharedCount) / total)}%) are a token ` +
      `from the table. ${localCount} (${localValues.size} distinct values) are ` +
      `still written as literals in a game, and ${derivedCount} are still derived ` +
      "inside one.\n",
  );
  lines.push("## Per game\n");
  lines.push(...perGame);
  writeFileSync(OUT, `${lines.join("\n")}\n`);
  console.log(
    `${OUT}: ${total} entries, ${sharedCount} shared, ${localCount} local ` +
      `(${localValues.size} distinct)`,
  );
});
