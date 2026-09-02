#!/usr/bin/env node
/**
 * The spelling guard: every word this project writes is spelled the American
 * way (`repo-layout`, "Source, documentation and specs use American English
 * spelling"). Runs in the pre-commit gate's fast prefix (`scripts/gate.sh`),
 * before the documentation-only shortcut, so a `docs/` or `openspec/` commit
 * is checked too — which is why this is a node script and not a vitest file:
 * `src/gate-scope.test.ts` forbids any *test* from reading those roots,
 * because a test that did would make the shortcut unsafe.
 *
 * What it does, in order:
 *
 * 1. Lists every tracked file (`git ls-files`) and drops the exclusions
 *    below — the record, other people's words, generated output.
 * 2. Scans each for any stem in `spelling-table.mjs`, as a substring and
 *    case-insensitively (the widest key: `ncolours` and `colourToOKLCH` are
 *    hits, not only the whole word).
 * 3. Allows a hit that is a quotation of an upstream C symbol in a file the
 *    table lists for it, or part of an archived change's id (the archive is
 *    the record, and a live document may cite it by name).
 * 4. Reports every other hit with file and line, and fails.
 * 5. Fails on the count of files scanned before anything else, so an
 *    unmatched listing cannot report health over nothing.
 *
 * Usage: `node scripts/checks/spelling.mjs`. Exit 1 on any report.
 */
import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { QUOTATIONS, SCAN } from "./spelling-table.mjs";

/** Fewer scanned files than this is a broken listing, not a clean tree. */
const FLOOR = 900;

/**
 * Paths the guard does not read. Each is one of: the record (archived
 * changes and postmortems keep the words they were written in); someone
 * else's words (the two MIT notices; the upstream C kept as reading
 * references under a change's `reference/`; the lockfile); generated output
 * that its generator, not this guard, keeps honest (`metrics/`,
 * `__snapshots__`); the spelling tooling itself, whose table must name every
 * British stem to fold it and whose comments explain them by example; and
 * this change's own pending directory, whose proposal quotes the
 * stems it removes — that last entry is dead once `adopt-american-spelling`
 * is archived, and may be deleted then.
 */
const EXCLUDED = [
  /^openspec\/changes\/archive\//,
  /^openspec\/postmortems\//,
  /^openspec\/changes\/adopt-american-spelling\//,
  /^licenses\/(sgt-puzzles|puzzles-unreleased)-LICENSE$/,
  /^metrics\//,
  /^package-lock\.json$/,
  /\.snap$/,
  /\.[ch]$/,
  /^scripts\/checks\/spelling(-[a-z]+)?\.mjs$/,
  /\.(png|ico|jpg|jpeg|webp|woff2?)$/,
];

// A symlink (`CLAUDE.md` → `AGENTS.md`) is its target, already listed once.
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter((f) => f && !EXCLUDED.some((re) => re.test(f)))
  .filter((f) => !lstatSync(f).isSymbolicLink());

const ARCHIVE_IDS = readdirSync("openspec/changes/archive").map((d) =>
  d.replace(/^\d{4}-\d{2}-\d{2}-/, ""),
);

/** The hyphen-or-underscore-joined token around `offset` in `text`. */
function tokenAt(text, offset) {
  let a = offset;
  let b = offset;
  while (a > 0 && /[A-Za-z0-9_-]/.test(text[a - 1])) a--;
  while (b < text.length && /[A-Za-z0-9_-]/.test(text[b])) b++;
  return text.slice(a, b);
}

function allowed(file, text, offset) {
  const token = tokenAt(text, offset);
  if (ARCHIVE_IDS.some((id) => token.includes(id))) return true;
  return QUOTATIONS[token]?.includes(file) ?? false;
}

const hits = [];
let scanned = 0;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  scanned++;
  for (const m of text.matchAll(SCAN)) {
    if (allowed(file, text, m.index)) continue;
    const line = text.slice(0, m.index).split("\n").length;
    hits.push(`${file}:${line}: ${tokenAt(text, m.index)}`);
  }
}

if (scanned < FLOOR) {
  console.error(
    `spelling: scanned only ${scanned} files (floor ${FLOOR}) — the listing is broken`,
  );
  process.exit(1);
}
if (hits.length) {
  console.error(
    `spelling: ${hits.length} British spelling(s) in ${scanned} files scanned:`,
  );
  for (const h of hits) console.error(`  ${h}`);
  console.error(
    "fold them with scripts/checks/spelling-fold.mjs, or add a quotation allowance to spelling-table.mjs",
  );
  process.exit(1);
}
console.log(`✓ spelling: ${scanned} files, no British stem outside an allowance.`);
