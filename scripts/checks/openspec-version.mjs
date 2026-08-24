#!/usr/bin/env node
/**
 * The openspec CLI that `npm run gate` will run must be at or above the version
 * where `openspec archive` refuses to drop a scenario a live requirement still
 * has.
 *
 * **Why there is a floor at all.** A `MODIFIED` delta is a copy of a requirement
 * taken when a change is scaffolded and applied when it is archived, and
 * `openspec archive` replaces the live requirement with it. Below **1.6.0** the
 * archiver applies that copy unconditionally, so a delta written before another
 * change touched the same requirement deletes the other change's work — silently,
 * as a side effect of following the documented process correctly. It happened
 * here on 2026-08-15: archiving `disambiguate-hint-deixis` removed 134 lines of
 * the `ts-engine` hint requirement.
 *
 * **Why the check is on the CLI rather than on the deltas.** This repo answered
 * that incident by retiring the `MODIFIED` verb and hand-writing a
 * scenario-survival test. The real cause was that the installed CLI was
 * `0.15.0` — `npm i -g` in November and never updated — while upstream had fixed
 * it in 1.6.0 and moved the report to authoring time in 1.8.0. The tool was
 * never named by any file in the repository, so its version was a property of
 * one laptop and "has this been fixed?" was unanswerable from inside the repo.
 * Pinning it is the fix; this file is what makes the pin mean something.
 *
 * The floor is set to the pinned version rather than to the bare 1.6.0 minimum:
 * `validate` only reports the loss from 1.8.0, and 1.7.0/1.10.0 added cases the
 * naive check misses (a requirement keeping one of two same-named scenarios,
 * `#### Scenario:` lines inside fenced code blocks, and level-4 children that
 * are scenarios without carrying the label).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/** `[major, minor, patch]`, or null if the string is not a plain semver core. */
function parse(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  return match ? match.slice(1, 4).map(Number) : null;
}

function compare(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function fail(message) {
  console.error(`openspec version check: ${message}`);
  process.exit(1);
}

// The floor is read from package.json, so the pin and the floor cannot drift
// apart — there is one number, in the place a reader already looks for it.
const pkg = JSON.parse(
  readFileSync(new URL("package.json", `file://${repoRoot}`), "utf8"),
);
const declared = pkg.devDependencies?.["@fission-ai/openspec"];
if (!declared) {
  fail(
    "@fission-ai/openspec is not a devDependency. The CLI decides what the specs" +
      " say, so the repo states its version rather than inheriting whatever is" +
      " installed (openspec/specs/repo-layout, 'The openspec CLI is pinned').",
  );
}
const floor = parse(declared.replace(/^[^\d]*/, ""));
if (!floor) fail(`cannot read a version out of the pin "${declared}"`);
if (compare(floor, [1, 6, 0]) < 0) {
  fail(
    `the pin "${declared}" is below 1.6.0, where 'openspec archive' began` +
      " refusing to drop a scenario the live requirement still has. Below that" +
      " the archiver deletes committed work silently.",
  );
}

let reported;
try {
  reported = execFileSync("npx", ["--no-install", "openspec", "--version"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (error) {
  fail(
    `could not run the openspec CLI — is 'npm install' up to date? (${error.message})`,
  );
}

const actual = parse(reported);
if (!actual)
  fail(`could not parse a version from CLI output: ${JSON.stringify(reported)}`);
if (compare(actual, floor) < 0) {
  fail(
    `the CLI on PATH for this repo reports ${actual.join(".")}, below the pinned` +
      ` ${floor.join(".")}. Run 'npm install'. A stale CLI archives a stale` +
      " MODIFIED delta without complaint, which is how 134 lines of the ts-engine" +
      " hint requirement were deleted on 2026-08-15.",
  );
}
