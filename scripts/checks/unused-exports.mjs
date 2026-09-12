#!/usr/bin/env node
/**
 * The dead-export diagnostic: which exports under `src/` nothing imports
 * (`build-pipeline`, "Dead exports are measured, and the measurement is a
 * diagnostic until the backlog is cleared").
 *
 * **`npm run dead-exports`. It is NOT in the gate**, and the reason is the
 * measurement rather than caution: its first honest run reported **373**. A
 * check that names 373 sites is a wall, and the only way to land one in a gate
 * is a 373-entry ledger, which is the skip list this repository's guards exist
 * not to be. It stands where `npm run probe` and `npm run metrics` stand — a
 * diagnostic, never ratcheted — and `retire-the-dead-exports` is the change
 * that clears the backlog and moves this into the gate's fast prefix, which by
 * then is one line in `scripts/gate.sh`.
 *
 * The 373 are real, not noise: five spot-checks (Solo's own `SYMM_ROT4`
 * shadowing the engine's, Undead's `CELL_GHOST`, Tents' `DIFF_NAMES`,
 * `hint-mark.ts`'s `MARK_TOP`, `timing.ts`'s `debounce`) each had **zero**
 * references anywhere outside their declaring file.
 *
 * **Why it is written here rather than installed.** An unused export is
 * invisible to the typechecker, to biome and to every test, because nothing that
 * runs reads it — `tidy-the-code-after-the-port` removed dead accessors, dead
 * re-exports and dead constants across the games entirely by hand. `knip` was in
 * this repo's devDependencies for exactly this job and wired to no script, and
 * the obvious move was to wire it up. Measured 2026-09-12 at the pinned 6.31.0,
 * with a config naming this repo's real entry points, it reports **zero**
 * unused exports — and `--trace-export initSentry`, a symbol imported on the
 * first line of `src/main.ts`, answers "No export initSentry found".
 *
 * The cause is structural, not a misconfiguration: **this repo writes every
 * import with a `.ts` specifier** (`import { x } from "./game.ts"`, enabled by
 * `allowImportingTsExtensions`), and knip's resolver does not follow those, so
 * its module graph stops at each entry file. Its zero was a scan of nothing, in
 * the one change that exists to stop checks reporting health over an empty set.
 * The workaround would be rewriting every import in the tree to suit the tool;
 * `AGENTS.md` § "Method" says to check the dependency before building around it,
 * and this is what that looks like when the answer is "don't".
 *
 * **What counts as a use**, each one a real way this tree reaches a symbol:
 *
 * - a named or namespace import, or a re-export, from another file;
 * - being exported from an entry file — the page scripts, the worker, the
 *   service worker, the preflight gate, and every `*.test.ts`;
 * - matching an `import.meta.glob` pattern whose modules are actually imported.
 *   **A `?raw` glob reads the file as text and uses none of its exports**, and
 *   all three globs in this tree are that shape — the enrollment helpers reading
 *   game and engine source as strings. Counting them as module imports marked
 *   every file under `src/engine/` and `src/games/` wholly used, which switched
 *   the check off across most of the tree while it printed a clean pass.
 *
 * **Vacuity floors on everything counted**, because this check's whole failure
 * mode is the one knip demonstrated: a resolver that stops early reports a clean
 * tree. It asserts the files parsed, the exports found and — the one that would
 * actually have caught knip — the fraction of import specifiers that RESOLVED to
 * a file in the project.
 *
 * **Two blind spots cost more to find than the check cost to write**, and both
 * had the same shape — a relay counted as a consumer. The `?raw` globs above,
 * and `export * from`, which is a forwarding address rather than a use: treating
 * it as one marked every module behind `src/engine/index.ts` wholly used. With
 * both fixed the report went from 9 to 373, and a deliberately planted dead
 * export in `engine/draw.ts` — silent under both — was caught.
 *
 * Usage: `npm run dead-exports`. `DEBUG=<file>` explains one file's verdict.
 * Exit 1 while findings remain, so wiring it into the gate is one line once
 * they do not.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * Exports nothing imports and which stay anyway, each with the reason. Asserted
 * EXACTLY equal to the findings, so an entry that stops earning its place fails
 * as loudly as a new dead export.
 *
 * @type {Record<string, string>}
 */
const KEPT_UNUSED = {};

/** Files whose exports are reached from outside the TypeScript graph. */
const ENTRY = [
  "src/main.ts",
  "src/home-page.ts",
  "src/puzzle-page.ts",
  "src/preflight.ts",
  "src/color-scheme-init.ts",
  "src/sw.ts",
  "src/puzzle/worker.ts",
  "vite.config.ts",
  "vitest.config.ts",
];

/**
 * Below these the resolver is broken rather than the tree clean. Set well under
 * what was measured on 2026-09-12 — 808 files, 1837 exports, 4172 of 4183
 * internal specifiers resolving — so they separate "working" from "enumerating
 * nothing" without being a ratchet a legitimate change has to bump.
 *
 * The eleven that do not resolve are every non-TypeScript asset in the tree:
 * `?raw` licenses, `?inline` CSS and SVG, and two `.html` imports.
 */
const FLOORS = { files: 600, exports: 1200, resolvedFraction: 0.97 };

const fail = (msg) => {
  console.error(`unused-exports: ${msg}`);
  process.exit(1);
};

const files = execFileSync(
  "git",
  [
    "ls-files",
    "-z",
    "src/*.ts",
    "vite-plugins/*.ts",
    "vite.config.ts",
    "vitest.config.ts",
  ],
  { encoding: "utf8" },
)
  .split("\0")
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"));

if (files.length < FLOORS.files)
  fail(
    `listed only ${files.length} files (floor ${FLOORS.files}) — the listing is broken`,
  );

const isEntry = (f) =>
  ENTRY.includes(f) || f.endsWith(".test.ts") || f.includes("/test-setup/");

/** file -> Set of exported names ("*default*" for a default export). */
const exportsOf = new Map();
/** "file::name" -> true once something outside that file reads it. */
const used = new Set();
/** Files every export of which is reached by namespace (glob, `import * as`). */
const wholeModuleUsed = new Set();
/**
 * barrel -> the files it re-exports wholesale with `export * from`.
 *
 * **A star re-export is not a use, it is a forwarding address.** Treating it as
 * one marks every module behind a barrel wholly used, and `src/engine/index.ts`
 * is a barrel over most of the engine — so the check went quiet across the
 * engine while printing a clean pass. A use of `barrel::name` is resolved
 * through this map to whichever module actually exports `name`, transitively,
 * which is the same "a relay is not a consumer" distinction the capability
 * audit had to make.
 */
const starReexports = new Map();
const globPatterns = [];

let specifiers = 0;
let resolved = 0;

/** Is this specifier one this project owns, rather than a package? */
const isInternal = (spec) => spec.startsWith(".") || spec.startsWith("/src/");

/**
 * Resolve an internal specifier the way this tree writes them.
 *
 * **The counter is the floor's instrument, so it counts only what it can
 * resolve**: a bare `vitest` is not a failure to resolve, and counting one as
 * such made the first version of this floor read 86.5% when eleven specifiers of
 * 4826 actually failed — `AGENTS.md` § "Check the instrument before the finding",
 * inside the floor built to catch that very thing.
 */
function resolveSpec(fromFile, spec) {
  if (!isInternal(spec)) return null;
  specifiers++;
  const base = spec.startsWith("/src/")
    ? spec.slice(1)
    : path.posix.join(path.posix.dirname(fromFile), spec);
  for (const cand of [base, `${base}.ts`, `${base}/index.ts`]) {
    if (existsSync(cand)) {
      resolved++;
      return cand;
    }
  }
  return null;
}

// --- Pass 1: what each file exports, and what each file reads. ---

const sources = new Map();
for (const file of files) {
  const text = readFileSync(file, "utf8");
  sources.set(file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
}

for (const [file, sf] of sources) {
  const names = new Set();
  const visit = (node) => {
    // export declarations of every shape
    const mods = ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : [];
    const exported = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const isDefault = mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    if (exported) {
      if (isDefault) {
        names.add("*default*");
      } else if (ts.isVariableStatement(node)) {
        for (const d of node.declarationList.declarations) {
          if (ts.isIdentifier(d.name)) names.add(d.name.text);
        }
      } else if (node.name != null && ts.isIdentifier(node.name)) {
        names.add(node.name.text);
      }
    }
    // `export { a, b }` and `export { a } from "./x.ts"`
    if (ts.isExportDeclaration(node)) {
      const from = node.moduleSpecifier;
      if (from && ts.isStringLiteral(from)) {
        const target = resolveSpec(file, from.text);
        if (target) {
          if (!node.exportClause) {
            // `export * from` — a forwarding address, resolved after pass 1.
            if (!starReexports.has(file)) starReexports.set(file, new Set());
            starReexports.get(file).add(target);
          } else if (ts.isNamedExports(node.exportClause))
            for (const e of node.exportClause.elements)
              used.add(`${target}::${(e.propertyName ?? e.name).text}`);
          else wholeModuleUsed.add(target); // `export * as ns from`
        }
      }
      if (node.exportClause && ts.isNamedExports(node.exportClause) && !from)
        for (const e of node.exportClause.elements) names.add(e.name.text);
    }
    if (ts.isExportAssignment(node)) names.add("*default*");

    // imports
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const target = resolveSpec(file, node.moduleSpecifier.text);
      if (target) {
        const clause = node.importClause;
        if (!clause)
          wholeModuleUsed.add(target); // side-effect import
        else {
          if (clause.name) used.add(`${target}::*default*`);
          const b = clause.namedBindings;
          if (b && ts.isNamespaceImport(b)) wholeModuleUsed.add(target);
          else if (b && ts.isNamedImports(b))
            for (const e of b.elements)
              used.add(`${target}::${(e.propertyName ?? e.name).text}`);
        }
      }
    }
    // dynamic import() and import.meta.glob()
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const a = node.arguments[0];
        if (a && ts.isStringLiteral(a)) {
          const target = resolveSpec(file, a.text);
          if (target) wholeModuleUsed.add(target);
        }
      }
      const callee = node.expression.getText(sf);
      if (callee.endsWith("import.meta.glob")) {
        const a = node.arguments[0];
        // **A `?raw` glob reads the file as TEXT and uses none of its exports.**
        // All three globs in this tree are that shape — the enrollment helpers
        // reading game and engine source as strings — and treating them as
        // module imports marked every file under `src/engine/` and
        // `src/games/` as wholly used, which turned the check off across most
        // of the tree while it printed a clean ✓. Caught by planting a dead
        // export in `engine/draw.ts` and watching this stay silent.
        const opts = node.arguments[1];
        const asText =
          opts != null &&
          ts.isObjectLiteralExpression(opts) &&
          opts.properties.some(
            (p) =>
              ts.isPropertyAssignment(p) &&
              (p.name.getText(sf) === "query" || p.name.getText(sf) === "as"),
          );
        if (a && ts.isStringLiteral(a) && !asText)
          globPatterns.push({ from: file, pattern: a.text });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  exportsOf.set(file, names);
}

if (specifiers === 0 || resolved / specifiers < FLOORS.resolvedFraction)
  fail(
    `only ${resolved} of ${specifiers} relative import specifiers resolved to a file ` +
      `(floor ${FLOORS.resolvedFraction}) — the resolver is not following this tree's ` +
      "`.ts` specifiers, which is exactly how knip reported a clean tree over nothing.",
  );

const totalExports = [...exportsOf.values()].reduce((n, s) => n + s.size, 0);
if (totalExports < FLOORS.exports)
  fail(
    `found only ${totalExports} exports (floor ${FLOORS.exports}) — the parse is broken`,
  );

// --- Pass 2a: follow every use through the barrels that forward it. ---

for (let pass = 0; pass < 8; pass++) {
  let grew = false;
  for (const key of [...used]) {
    const sep = key.lastIndexOf("::");
    const [file, name] = [key.slice(0, sep), key.slice(sep + 2)];
    for (const target of starReexports.get(file) ?? []) {
      const forwarded = `${target}::${name}`;
      if (!used.has(forwarded)) {
        used.add(forwarded);
        grew = true;
      }
    }
  }
  // A barrel that is itself wholly used forwards that too.
  for (const file of [...wholeModuleUsed])
    for (const target of starReexports.get(file) ?? [])
      if (!wholeModuleUsed.has(target)) {
        wholeModuleUsed.add(target);
        grew = true;
      }
  if (!grew) break;
}

// --- Pass 2: glob patterns reach whole modules. ---

for (const { from, pattern } of globPatterns) {
  const abs = pattern.startsWith("/")
    ? pattern.slice(1)
    : path.posix.join(path.posix.dirname(from), pattern);
  const rx = new RegExp(
    `^${abs
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*\//g, "(?:.*/)?")
      .replace(/\*/g, "[^/]*")}$`,
  );
  for (const f of files) if (rx.test(f)) wholeModuleUsed.add(f);
}

// --- The verdict, in both directions. ---

/**
 * `DEBUG=<file>` prints why one file's exports were or were not reported. Kept
 * because working out that the first version of the collector was silently
 * dropping most declarations took far longer than the check did to write, and
 * the next person to widen this will want it.
 */
if (process.env.DEBUG) {
  const f = process.env.DEBUG;
  console.error(`${f}:`);
  console.error(
    `  entry: ${isEntry(f)}, reached by namespace: ${wholeModuleUsed.has(f)}`,
  );
  console.error(`  exports: ${[...(exportsOf.get(f) ?? [])].join(", ") || "(none)"}`);
  console.error(
    `  imported by name: ${[...used]
      .filter((k) => k.startsWith(`${f}::`))
      .map((k) => k.slice(f.length + 2))
      .join(", ")}`,
  );
}

const dead = [];
for (const [file, names] of exportsOf) {
  if (isEntry(file) || wholeModuleUsed.has(file)) continue;
  for (const name of names)
    if (!used.has(`${file}::${name}`)) dead.push(`${file}::${name}`);
}
dead.sort();

const unledgered = dead.filter((k) => !(k in KEPT_UNUSED));
const stale = Object.keys(KEPT_UNUSED)
  .filter((k) => !dead.includes(k))
  .sort();

if (unledgered.length) {
  console.error(`unused-exports: ${unledgered.length} export(s) nothing imports:`);
  for (const k of unledgered) console.error(`  ${k.replace("::", " — ")}`);
  console.error(
    "  Delete it, or — if it must stay — add it to KEPT_UNUSED with the reason.",
  );
  process.exit(1);
}

if (stale.length) {
  console.error(
    `unused-exports: ${stale.length} ledger entr(ies) no longer earn a place:`,
  );
  for (const k of stale) console.error(`  ${k.replace("::", " — ")}`);
  console.error("  Delete it; the ledger is exact, not a skip list.");
  process.exit(1);
}

console.log(
  `✓ unused-exports: ${totalExports} exports across ${files.length} files, ` +
    `${resolved}/${specifiers} specifiers resolved, ${dead.length} ledgered.`,
);
