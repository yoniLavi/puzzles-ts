#!/usr/bin/env node
/**
 * The change-citation guard: a change id written in `docs/` or `AGENTS.md`
 * resolves to something a reader can go and find (`repo-layout`, "A change id
 * cited outside the archive SHALL resolve").
 *
 * **Why this is guarded rather than left to care.** A prose citation cannot
 * survive the one mutation this workflow performs most often — a change being
 * renamed or withdrawn — and nothing else in the tree notices. The guard was
 * considered on 2026-09-04 and declined on the finding that no dead citation
 * existed; one was created **46 minutes later** by the rename of
 * `census-the-hintless-logic-games`, in the same commit that wrote the
 * replacement sentence, and it stood five days.
 *
 * Runs in the pre-commit gate's fast prefix, ahead of the documentation-only
 * shortcut, for the same reason the spelling guard does: the shortcut skips
 * vitest, and `src/gate-scope.test.ts` forbids a *test* from reading `docs/` or
 * `AGENTS.md` at all — a test that did would make the shortcut unsafe. So this
 * is a node script, not a vitest file.
 *
 * Four design decisions, each one a rule this repo has paid for:
 *
 * 1. **The key is a shape, and the superset is accepted.** Any backticked
 *    kebab-case token of three or more segments is a candidate; CSS features,
 *    git tags and DOM event names come with it, and they are *classified* in the
 *    ledger below rather than excluded by narrowing the pattern (`AGENTS.md`
 *    § "A scan that keys on a name"). Narrowing is the error, every time.
 *
 * 2. **A citation has three legitimate homes, not one.** An open change, an
 *    archive entry — cited with or without its date prefix, both forms are in
 *    the tree — and a postmortem, which is where a *withdrawn* change's record
 *    lives after its directory is deleted. A resolver that knew only dated
 *    archive entries reported eleven false positives out of twelve on its first
 *    run, and a guard whose first run is 92% noise gets switched off.
 *
 *    The postmortem home takes the superset too: any id a postmortem names
 *    resolves, rather than only one it names in some fixed phrase. Keying on
 *    "`<id>` is deleted" would read three of today's five postmortems and miss
 *    the next one that phrases its status differently. The cost is that an id
 *    a postmortem merely mentions also resolves — accepted, because that id is
 *    still something a reader can go and find, which is the property this guard
 *    is actually about.
 *
 * 3. **The unresolved tokens are a ledger asserted EXACTLY equal to the
 *    unresolved set, with a reason per entry** — the `NO_KEYBOARD` shape
 *    (`docs/games/testing.md` § "How a cross-game guard finds its population").
 *    A skip list rots silently; this one fails in both directions, so an entry
 *    that starts resolving must be removed and a new one must be added
 *    deliberately, by somebody writing down why.
 *
 * 4. **Vacuity floors on everything counted.** An unmatched file listing, a
 *    regex that stops matching after a docs restructure, an empty archive read
 *    — each would make every assertion below pass over nothing and report
 *    health. Count the inputs and floor them.
 *
 * `openspec/changes/archive/` is deliberately NOT scanned. An archived change is
 * history: its citations were true when written, and forcing them to track later
 * renames falsifies the record. Same asymmetry as `repo-layout` § "A change that
 * moves or deletes a path updates the unarchived changes that name it".
 *
 * **`openspec/specs/` is not scanned either, and that one was measured**
 * (2026-09-09) rather than assumed, because the same key does cover it. The
 * specs cite 31 kebab tokens across 71 files, of which **15 do not resolve and
 * not one is a change id**: they are preference keys (`no-of-balls`,
 * `show-lit-blobs`, `snap-to-grid`, `solved-with-help`…), DOM element and event
 * names (`puzzle-view-interactive`, `status-bar-change`) and a web component
 * (`wa-button-group`). Widening here would nearly triple the ledger, add
 * fifteen entries that are all product vocabulary, and catch nothing — which is
 * exactly the "allowlist that grows with the docs" the 2026-09-04 decline
 * warned about, arriving in the one place it is real.
 *
 * The ratio is the reason, and it is not an accident: a **spec** describes the
 * product's own kebab-cased vocabulary, while `docs/` and `AGENTS.md` narrate
 * the project's history and so name changes. 6 unresolved of 85 against 15 of
 * 31. Revisit if a spec ever cites a change id that dies.
 *
 * Usage: `node scripts/checks/change-citations.mjs`. Exit 1 on any report.
 */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";

/** The scan's key. Deliberately wider than "change id"; see decision 1. */
const CITATION = /`([a-z0-9]+(?:-[a-z0-9]+){2,})`/g;

/** Files this guard reads: the two roots that talk *about* changes. */
const SCANNED = /^(docs\/.*\.md|AGENTS\.md)$/;

/**
 * Tokens that match the key and are not a live change id, each with the reason
 * it is here. **This list is asserted to be exactly the unresolved set**, so it
 * fails if an entry starts resolving as well as if a new dead citation appears.
 *
 * Two kinds live here and the reason says which, because they retire
 * differently: a token that is *not a change id* leaves when the docs stop
 * citing it, while a *deliberately dead* id leaves when the passage making the
 * point about it is rewritten.
 *
 * **The guard's real running cost, found by it catching this change's own
 * prose**: in `docs/`, a backtick around a kebab token *is* a citation, so a
 * passage that quotes product vocabulary as an example pays four ledger entries
 * for four illustrations. The fix is not a ledger entry — it is to stop
 * backticking a word being used as an example rather than named as a thing.
 * That is the correct trade to make, but it is a tax on prose, and it is what
 * the 2026-09-04 decline meant by "an allowlist that grows with the docs"
 * arriving from an unexpected direction.
 */
const NOT_A_LIVE_CHANGE = {
  "auto-mark-complete": "a `Ui` preference key (Bridges); named in rendering.md",
  "color-dark-check": "a test file, `scripts/checks/color-dark-check.test.ts`",
  "prefers-color-scheme": "a CSS media feature",
  "pre-ts-pivot": "a git tag bracketing the C in history",
  "puzzle-key-unhandled": "a DOM event `view-interactive.ts` raises",
};

/** Below these, the input is broken rather than the tree clean. */
const FLOORS = { files: 10, tokens: 40, archive: 200, postmortems: 1 };

const fail = (msg) => {
  console.error(`change-citations: ${msg}`);
  process.exit(1);
};

// --- The three homes a citation may resolve to. ---

const openIds = readdirSync("openspec/changes", { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== "archive")
  .map((e) => e.name);

const archiveDirs = readdirSync("openspec/changes/archive", { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

const postmortemFiles = readdirSync("openspec/postmortems").filter((f) =>
  f.endsWith(".md"),
);

if (archiveDirs.length < FLOORS.archive)
  fail(`read only ${archiveDirs.length} archive entries — the archive read is broken`);
if (postmortemFiles.length < FLOORS.postmortems)
  fail("read no postmortems — the postmortem read is broken");

/** Ids a postmortem names, keyed the same way the scan keys the docs. */
const postmortemIds = new Set();
for (const f of postmortemFiles) {
  const text = readFileSync(`openspec/postmortems/${f}`, "utf8");
  for (const [, id] of text.matchAll(CITATION)) postmortemIds.add(id);
}

const resolvable = new Set([
  ...openIds,
  ...archiveDirs, // cited with its date prefix
  ...archiveDirs.map((d) => d.replace(/^\d{4}-\d{2}-\d{2}-/, "")), // and without
  ...postmortemIds,
]);

// --- The scan. ---

// A symlink (`CLAUDE.md` → `AGENTS.md`) is its target, already listed once.
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter((f) => f && SCANNED.test(f))
  .filter((f) => existsSync(f) && !lstatSync(f).isSymbolicLink());

/** token -> "file:line" of its first citation, for the report. */
const cited = new Map();
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(CITATION)) {
    if (cited.has(m[1])) continue;
    cited.set(m[1], `${file}:${text.slice(0, m.index).split("\n").length}`);
  }
}

if (files.length < FLOORS.files)
  fail(
    `scanned only ${files.length} files (floor ${FLOORS.files}) — the listing is broken`,
  );
if (cited.size < FLOORS.tokens)
  fail(
    `found only ${cited.size} citations (floor ${FLOORS.tokens}) — the key stopped matching`,
  );

// --- The verdict, in both directions. ---

const unresolved = [...cited.keys()].filter((t) => !resolvable.has(t)).sort();
const ledgered = Object.keys(NOT_A_LIVE_CHANGE).sort();

const dead = unresolved.filter((t) => !(t in NOT_A_LIVE_CHANGE));
const stale = ledgered.filter((t) => !unresolved.includes(t));

if (dead.length) {
  console.error(
    `change-citations: ${dead.length} citation(s) resolve to no change, archive entry or postmortem:`,
  );
  for (const t of dead) console.error(`  ${cited.get(t)}: \`${t}\``);
  console.error(
    "  Repoint it at the id the change actually has, or — if it is not a change id —",
  );
  console.error("  add it to NOT_A_LIVE_CHANGE in this file, with the reason.");
  process.exit(1);
}

if (stale.length) {
  console.error(
    `change-citations: ${stale.length} ledger entr(ies) no longer earn a place:`,
  );
  for (const t of stale) {
    const why = cited.has(t) ? "now resolves" : "no longer cited anywhere scanned";
    console.error(`  \`${t}\` — ${why}`);
  }
  console.error(
    "  Delete it from NOT_A_LIVE_CHANGE; the ledger is exact, not a skip list.",
  );
  process.exit(1);
}

console.log(
  `✓ change-citations: ${cited.size} ids across ${files.length} files, ` +
    `${cited.size - unresolved.length} resolving, ${unresolved.length} ledgered.`,
);
