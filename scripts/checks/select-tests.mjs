#!/usr/bin/env node
/**
 * Which test files can this commit possibly have broken?
 *
 * Prints either the literal word `ALL` or a newline-separated list of test
 * files. **`ALL` is the default and every unknown answer**; a list is the
 * exception, and it is produced only when every staged path is one this script
 * can reason about.
 *
 * ## Why this is not just `vitest --changed`
 *
 * `vitest --changed` walks the **static import graph**, and this repo's
 * cross-game guards do not reach their subjects through imports. They read game
 * source as *text* through `import.meta.glob(..., "?raw")`, because `AGENTS.md`
 * requires a guard to find its population by reading what a game **is** rather
 * than from a manifest. A file read as text forms no import edge, so the graph
 * cannot see the coupling.
 *
 * Measured 2026-09-09 (`measure-test-impact-selection`): on a change to one
 * game, `vitest related` omitted five glob-only guards — both palette guards,
 * `palette-override-claims`, `hint-refusal`, `note-vocabulary` — and on a
 * change to a `help/` page it selected **nothing at all**, against three guards
 * that exist to check those files.
 *
 * So the selection is a **union of two channels**, and it is deliberately a
 * superset of each:
 *
 *   1. the import graph, via `vitest list --changed --filesOnly`;
 *   2. every test whose `import.meta.glob` pattern reaches the changed path.
 *
 * ## The glob channel is matched by BASE DIRECTORY, not by pattern
 *
 * A hand-rolled matcher for Vite's glob syntax (`**`, braces, `?raw`) is a
 * thing that can be subtly wrong, and being subtly wrong here means silently
 * not running a guard. So this does not match patterns at all: it takes the
 * literal prefix before the first wildcard and asks whether the changed path is
 * under it. `../games/​**​/*.ts` from `src/engine/` becomes "anything under
 * `src/games/`".
 *
 * That is coarser than the real pattern and **always in the safe direction** —
 * it can only select more tests, never fewer. `AGENTS.md` § "A scan that keys
 * on a name": key on the shape, accept the superset it gives you, and do not
 * narrow the scan to make the number prettier.
 *
 * ## Fail closed
 *
 * `ALL` is printed when: any staged path lies outside the directories below
 * (a config file, `package.json`, a template, a script — anything whose blast
 * radius this script does not model); the union comes out empty; or anything
 * at all goes wrong. A wrong `ALL` costs minutes. A wrong list costs a guard.
 *
 * **The hook uses this; CI never does.** `.github/workflows/ci.yml` runs the
 * whole suite on every push to `main`, which is the backstop that makes a
 * narrower per-commit run safe — the same argument that already scopes biome to
 * staged files in the hook and to the whole tree in CI.
 *
 * `src/test-selection.test.ts` is what keeps this honest: it fails if a test
 * acquires a read channel this script cannot see.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");

/** Directories whose blast radius this script models. Anything else → ALL. */
export const SELECTABLE = ["src/", "vite-plugins/", "help/"];

/** Where the suite's test files live (mirrors `vitest.config.ts`'s `include`). */
const TEST_ROOTS = ["src", "vite-plugins"];

/** The head of an `import.meta.glob` call, up to and including its `(`.
 *
 * Vite accepts **two** literal forms, and this script needs both: a single
 * pattern, `glob("../games/**​/*.ts")`, and an array of them,
 * `glob(["../templates/*.hbs", "../help/*.hbs"])`. The array form is used
 * across several lines, which is how a first pass at this — a line-oriented
 * `grep` for the character after the paren — reported the tree as uniformly
 * single-pattern and missed both call sites. `test-selection.test.ts` asserts
 * that every call in the tree is one of these two shapes. */
const GLOB_HEAD = /import\.meta\.glob\s*(?:<[^>]*>)?\s*\(/g;

/** The string literals in the first argument at `index` (just past the `(`).
 * Returns `null` for anything that is not a literal or an array of literals —
 * the caller must then fall back to `ALL`, since the pattern is unresolvable. */
function firstArgPatterns(source, index) {
  let i = index;
  while (i < source.length && /\s/.test(source[i])) i++;
  if (source[i] === '"') {
    const end = source.indexOf('"', i + 1);
    return end === -1 ? null : [source.slice(i + 1, end)];
  }
  if (source[i] !== "[") return null;
  const end = source.indexOf("]", i);
  if (end === -1) return null;
  const patterns = [...source.slice(i, end).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  return patterns.length > 0 ? patterns : null;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/** The literal prefix of a glob, as a repo-relative directory. */
function globBase(pattern, fromDir) {
  const firstWildcard = pattern.search(/[*?{[]/);
  const literal = firstWildcard === -1 ? pattern : pattern.slice(0, firstWildcard);
  // Keep only whole path segments: "../games/**" -> "../games/", and
  // "./flash.ts" -> "./" is wrong, so keep the file itself when there is no
  // wildcard at all.
  const dir =
    firstWildcard === -1 ? literal : literal.slice(0, literal.lastIndexOf("/") + 1);
  const abs = path.resolve(fromDir, dir);
  return `${path.relative(ROOT, abs)}${firstWildcard === -1 ? "" : "/"}`;
}

/** test file (repo-relative) → the repo-relative bases its globs reach. */
export function globBases() {
  const bases = new Map();
  for (const root of TEST_ROOTS) {
    for (const file of walk(path.join(ROOT, root))) {
      // **Comments are deliberately NOT stripped here**, and the reason is a
      // trap this repo has hit before. A block-comment stripper is
      // `/\/\*[\s\S]*?\*\//`, and a doc comment that *mentions* a glob pattern
      // contains `**​/*.md` — whose first two characters are `*` and `/`. The
      // comment therefore terminates early, the stripper eats live code after
      // it, and the tests holding those patterns drop out of the selection
      // silently. Adding this "tidy-up" removed three help guards from a
      // help-page selection before it was caught.
      //
      // Parsing prose instead costs an occasional base for a pattern nobody
      // evaluates, which can only ever *over*-select. That is the direction
      // this script is required to err in.
      const text = readFileSync(file, "utf8");
      const rel = path.relative(ROOT, file);
      for (const match of text.matchAll(GLOB_HEAD)) {
        const patterns = firstArgPatterns(text, match.index + match[0].length);
        // Unresolvable pattern: this test's couplings cannot be derived, so it
        // is entered under the repo root and therefore selected by any change.
        // `test-selection.test.ts` fails on this shape rather than letting it
        // pass quietly, but the fallback here still errs toward running it.
        for (const base of patterns
          ? patterns.map((p) => globBase(p, path.dirname(file)))
          : [""]) {
          if (!bases.has(rel)) bases.set(rel, new Set());
          bases.get(rel).add(base);
        }
      }
    }
  }
  return bases;
}

/** Test files whose globs reach any of `changed`. */
export function globSelected(changed, bases = globBases()) {
  const hit = new Set();
  for (const [test, dirs] of bases) {
    for (const base of dirs) {
      const reaches = base.endsWith("/")
        ? changed.some((c) => c.startsWith(base))
        : changed.includes(base);
      if (reaches) {
        hit.add(test);
        break;
      }
    }
  }
  return hit;
}

/** The import-graph channel. Vitest reads git itself, so this sees staged and
 * unstaged alike — a superset of the commit, which is the safe direction. */
function graphSelected() {
  const out = execFileSync(
    "npx",
    ["vitest", "list", "--changed", "--filesOnly", "--passWithNoTests"],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  return new Set(
    out
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.endsWith(".test.ts"))
      .map((l) => path.relative(ROOT, path.resolve(ROOT, l))),
  );
}

function main() {
  const staged = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMRD"],
    { cwd: ROOT, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);

  if (staged.length === 0) return "ALL";
  // A path this script does not model — a config file, a template, a script,
  // a license. Its blast radius is unknown, so the answer is everything.
  if (!staged.every((p) => SELECTABLE.some((s) => p.startsWith(s)))) return "ALL";

  const selected = new Set([...graphSelected(), ...globSelected(staged)]);
  // Empty means the two channels agree that nothing depends on the change.
  // That is possible, but it is also what a broken selector looks like.
  if (selected.size === 0) return "ALL";
  return [...selected].sort().join("\n");
}

if (process.argv[1] === import.meta.filename) {
  try {
    process.stdout.write(`${main()}\n`);
  } catch {
    // Any failure at all — vitest missing, git unavailable, a parse error —
    // resolves to the safe answer rather than to a smaller test run.
    process.stdout.write("ALL\n");
  }
}
