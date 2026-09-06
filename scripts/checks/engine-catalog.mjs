#!/usr/bin/env node
/**
 * The engine catalog names every shared helper there is.
 *
 * `docs/games/engine-catalog.md` is the menu a game author reads before
 * re-rolling something the engine already has, and AGENTS.md makes keeping it
 * current part of "done". A menu nobody holds complete is a menu that omits the
 * newest entry, which is the one an author is least likely to know about — and
 * that is not hypothetical: `params-codec.ts`, the whole point of
 * `declare-params-and-specs`' successor `declare-params-and-presets`, shipped
 * and sat uncataloged, along with the three hint-rendering modules and
 * `assert-never.ts` (`audit-declared-versus-derived-capabilities` found five).
 *
 * This is the discoverability half of that audit's answer. A per-game
 * capability manifest would not have helped — you cannot look up a key you do
 * not know to write — but a menu that cannot silently shrink does.
 *
 * **Why a node script and not a vitest file.** `src/gate-scope.test.ts` forbids
 * any test from reading `docs/`, because a test that did would make the gate's
 * documentation-only shortcut unsafe. So this runs in the fast prefix of
 * `scripts/gate.sh` ahead of that shortcut, exactly like the spelling guard, and
 * for exactly the same reason: a commit that deletes a catalog entry is a
 * documentation-only commit.
 *
 * Usage: `node scripts/checks/engine-catalog.mjs`. Exit 1 on any report.
 */
import { readdirSync, readFileSync } from "node:fs";

const CATALOG = "docs/games/engine-catalog.md";
const ENGINE = "src/engine";

/** Fewer modules than this means the listing broke, not that the engine shrank. */
const FLOOR = 30;

/**
 * Modules the catalog deliberately does not give an entry of their own, each
 * with the reason — a **ledger**, not a skip list, so an entry that stops being
 * true fails below rather than quietly covering a new omission.
 *
 * Only two shapes qualify: a module the catalog covers in prose under another
 * heading, and one whose whole audience is a single named consumer.
 */
const NOT_CATALOGED = {
  // Empty, and meant to stay so: every module under `src/engine/` is something
  // a game author could reach for, and the catalog's own promise is that it
  // makes sure you know a module exists before you re-roll it. An entry here
  // is a finding under management, with the change that owns it named.
};

const catalog = readFileSync(CATALOG, "utf8");

const modules = readdirSync(ENGINE, { withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith(".ts") && !e.name.includes(".test."))
  .map((e) => e.name)
  .sort();

if (modules.length < FLOOR) {
  console.error(
    `engine-catalog: found only ${modules.length} modules under ${ENGINE}/ ` +
      `(floor ${FLOOR}) — the listing is broken, not the engine`,
  );
  process.exit(1);
}

const missing = modules.filter(
  (m) => !(m in NOT_CATALOGED) && !catalog.includes(`\`${m}\``),
);
const stale = Object.keys(NOT_CATALOGED).filter((m) => !modules.includes(m));

if (missing.length || stale.length) {
  if (missing.length) {
    console.error(
      `engine-catalog: ${missing.length} engine module(s) the catalog never names:`,
    );
    for (const m of missing) console.error(`  ${ENGINE}/${m}`);
    console.error(
      `add an entry to ${CATALOG} (one short paragraph — the module's own ` +
        "header is the authoritative documentation), or ledger it in NOT_CATALOGED with the reason",
    );
  }
  if (stale.length) {
    console.error(
      "engine-catalog: NOT_CATALOGED names module(s) that no longer exist — " +
        `delete the entr${stale.length === 1 ? "y" : "ies"}: ${stale.join(", ")}`,
    );
  }
  process.exit(1);
}

console.log(
  `✓ engine-catalog: all ${modules.length} engine modules named in the catalog.`,
);
