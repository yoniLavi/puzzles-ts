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
 *     npx vitest run -c scripts/checks/diff.vitest.config.mts colour-inventory
 *
 * and diff the result against the committed copy.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "vitest";
import { mkhighlight } from "../../src/engine/colour/colour-mkhighlight.ts";
import * as colours from "../../src/engine/colour/colours.ts";
import * as roles from "../../src/engine/colour/palette.ts";
import * as gameTokens from "../../src/engine/colour/palette-games.ts";
import { getTsGame } from "../../src/engine/registry.ts";
import type { Colour } from "../../src/engine/types.ts";
import { puzzleIds } from "../../src/puzzle/catalog.ts";
import "../../src/games/index.ts";

/** The same light host background `palette.test.ts` uses. */
const BG: Colour = [0.827, 0.827, 0.827];

/** A second, deliberately non-grey background, so the report can say whether an
 * entry tracks the board. */
const BG2: Colour = [0.6, 0.7, 0.8];

/**
 * Where the report lands, and why it is not next to the change that asked for it.
 *
 * It used to be `openspec/changes/consolidate-colour-palette/inventory.md`.
 * `openspec archive` **renames the change directory** on the day the change
 * ships, so that path had an expiry date built into the workflow: from
 * 2026-08-01 this test failed `ENOENT` on every `npm run diff`, and because the
 * run is advisory rather than gating, nothing said so for a day. A tool must not
 * write into a change directory — `metrics/` is where durable generated
 * artefacts live (`metrics/mutation/report.json` is the precedent), and the
 * committed copy there is the baseline to diff a colour change against.
 */
const OUT = "metrics/colour-inventory.md";

const key = (c: Colour): string => c.map((v) => Math.round(v * 1000) / 1000).join(",");

/**
 * Colour **object** → what to call it, over all three layers.
 *
 * By identity rather than by value, because value is ambiguous exactly where it
 * matters: `INK` and `BLACK` are both pure black and behave oppositely under a
 * scheme flip. A palette entry that *is* the colour answers the question outright.
 *
 * Since `consolidate-colour-palette` the meanings are **references**, so several
 * of them resolve to one object (`CURSOR` and `HELD` are both `GREEN`) and
 * identity cannot say which one a game meant. The report therefore names the
 * colour — which is unambiguous and is what "what did this become" is asking —
 * and lists the meanings that resolve to it in brackets.
 */
function tokenNames(): Map<Colour, string> {
  const out = new Map<Colour, string>();
  const add = (name: string, v: unknown): void => {
    if (Array.isArray(v) && v.length === 3 && typeof v[0] === "number") {
      // First name wins: the sets (`TEN[0]`) come after the colours they are
      // built from, and `RED` is the better answer than `TEN[0]`.
      if (!out.has(v as Colour)) out.set(v as Colour, name);
    } else if (Array.isArray(v)) {
      v.forEach((e, i) => {
        add(`${name}[${i}]`, e);
      });
    }
  };
  for (const [name, value] of Object.entries({ ...colours, ...gameTokens }))
    add(name, value);

  const meanings = new Map<Colour, string[]>();
  for (const [name, value] of Object.entries(roles)) {
    if (typeof value === "function") continue;
    if (!Array.isArray(value) || value.length !== 3) continue;
    const c = value as Colour;
    meanings.set(c, [...(meanings.get(c) ?? []), name]);
    if (!out.has(c)) out.set(c, name); // INK and PAPER own no named colour
  }
  for (const [c, names] of meanings) {
    const base = out.get(c);
    if (base && !names.includes(base)) out.set(c, `${base} (${names.join(", ")})`);
  }
  return out;
}

/** value key → the shared name that produces it. */
function sharedByValue(): Map<string, string> {
  const out = new Map<string, string>();
  const { background, highlight, lowlight } = mkhighlight(BG);
  out.set(key(background), "mkhighlight.background");
  out.set(key(highlight), "mkhighlight.highlight");
  out.set(key(lowlight), "mkhighlight.lowlight");
  for (const [name, value] of Object.entries({ ...colours, ...roles })) {
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
  const dir = join("src/games", id);
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
  const ids = [...puzzleIds].sort();
  const lines: string[] = [];
  let total = 0;
  let sharedCount = 0;
  let localCount = 0;
  let derivedCount = 0;
  const perGame: string[] = [];

  for (const id of ids) {
    const game = getTsGame(id);
    if (!game) throw new Error(`${id} is in the catalog but not registered`);
    const palette = game.colours(BG);
    const alt = game.colours(BG2);
    const names = indexNames(id);
    perGame.push(`### ${id}\n`);
    perGame.push("| # | Local name | Value | Source |");
    perGame.push("| --- | --- | --- | --- |");
    palette.forEach((c, i) => {
      if (!c) return;
      total += 1;
      // An entry is either a token outright, or *computed* — the bevel trio, a
      // wash of the board, a point on a ramp. A computed value has nothing to
      // look up, which is why "does a game write a colour" is answered by
      // `palette-source.test.ts` reading the sources rather than here.
      const source = byToken.get(c) ?? shared.get(key(c));
      const tracksBoard = key(c) !== key(alt[i]);
      if (source) sharedCount += 1;
      else if (tracksBoard) derivedCount += 1;
      else localCount += 1;
      const local = tracksBoard ? "*computed (tracks the board)*" : "*computed*";
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
    "<!-- Generated by scripts/checks/colour-inventory.test.ts. Regenerate with:",
    "     npx vitest run -c scripts/checks/diff.vitest.config.mts colour-inventory -->\n",
  );
  lines.push(
    `**Totals:** ${total} palette entries across ${ids.length} games. ` +
      `${sharedCount} (${Math.round((100 * sharedCount) / total)}%) are a token ` +
      `from the table outright; the other ${localCount + derivedCount} are ` +
      `computed from tokens by a shared function — ${derivedCount} of them ` +
      `relative to the host background, ${localCount} not (a bevel trio built ` +
      "from a token's own value).\n",
  );
  lines.push("## Per game\n");
  lines.push(...perGame);
  writeFileSync(OUT, `${lines.join("\n")}\n`);
  console.log(`${OUT}: ${total} entries, ${sharedCount} tokens`);
});
