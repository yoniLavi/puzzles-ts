#!/usr/bin/env node
/**
 * Shape and scope checks for a **bulk mechanical edit** — a file move, an import
 * repoint, a rename sweep.
 *
 * ## Why this exists, and why it is not a gate step
 *
 * `retire-native-directory` moved ~200 files and repointed their imports with a
 * rewriter that matched "any quoted string starting with a dot". It hit prose in
 * doc comments and ordinary code literals: `"."` became `"./"` in a dozen games'
 * `formatAsText` output and in `params.ts`'s `formatG`. **Nothing failed** —
 * `tsc`, biome, the full suite and `vite build` were all green, because the
 * corrupted values were data, not types.
 *
 * It cannot be a gate step, because only the author knows a diff was *meant* to
 * be a pure rename. A commit that deliberately changes behavior alongside a
 * move would fail it for being what it says it is. So it is run on demand, by
 * the session doing the sweep, before committing.
 *
 * ## The two questions, which are different
 *
 * Both were needed in `group-crowded-source-directories`, and each caught
 * something the other could not:
 *
 * 1. **Shape** — *is every changed line the kind of line I meant to change?*
 *    Caught a rewriter editing `import "../test-setup/icons.ts";` inside that
 *    file's own doc comment, where the line is written from a consumer's
 *    perspective and is prose, not code.
 * 2. **Scope** — *did any file change that has nothing to do with the move?*
 *    Shape cannot see this: a specifier that gained a `.ts` extension is a
 *    perfectly well-formed import line. Seven files were quietly normalized that
 *    way, and this is what found them.
 *
 * ## Usage
 *
 *   node scripts/check-rename-shape.mjs --moved engine/grid/ --moved engine/color/
 *   node scripts/check-rename-shape.mjs --moved src/games/ --kind any
 *
 * `--moved <fragment>` may be repeated; a changed file none of whose changed
 * lines mention any fragment is reported as out of scope. Omit it to run the
 * shape check alone.
 *
 * `--kind import` (default) expects every changed line to be an import/export
 * line. `--kind comment` expects comments — the shape of a doc-only sweep, as in
 * `retire-c-era-leftovers`. `--kind any` skips the shape check.
 *
 * `--staged` reads the staged diff instead of the working tree.
 *
 * Exit status is 1 if anything is reported. **A report is a prompt to look, not
 * a verdict**: every finding here has a legitimate explanation available, and
 * the point is that you supply it deliberately rather than never being asked.
 */
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const moved = args.flatMap((a, i) => (a === "--moved" ? [args[i + 1]] : []));
const kind = args.includes("--kind") ? args[args.indexOf("--kind") + 1] : "import";
const staged = args.includes("--staged");

if (!["import", "comment", "any"].includes(kind)) {
  console.error(`unknown --kind ${kind} (import | comment | any)`);
  process.exit(2);
}

const IS_IMPORT = /^\s*(import\b|export\b|\}|[A-Za-z_$][\w$]*,?\s*$|type\s)/;
const IS_COMMENT = /^\s*(\*|\/\*|\/\/|#)/;

/** Changed lines, per file, from a unified diff with no context. */
function changedLines() {
  const diff = execSync(`git diff -U0 ${staged ? "--staged" : ""}`, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const files = new Map();
  let file = null;
  for (const line of diff.split("\n")) {
    const header = /^\+\+\+ b\/(.*)$/.exec(line);
    if (header) {
      file = header[1];
      if (!files.has(file)) files.set(file, []);
      continue;
    }
    if (!file || line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+") || line.startsWith("-")) {
      files.get(file).push({ sign: line[0], text: line.slice(1) });
    }
  }
  return files;
}

const files = changedLines();
if (files.size === 0) {
  console.log("no changes in the working tree.");
  process.exit(0);
}

const offShape = [];
const offScope = [];
let inspected = 0;

for (const [file, lines] of files) {
  if (lines.length === 0) continue; // pure rename, no content change
  inspected += lines.length;

  if (kind !== "any") {
    const ok = kind === "import" ? IS_IMPORT : IS_COMMENT;
    for (const { sign, text } of lines) {
      if (!ok.test(text)) offShape.push(`${file}  ${sign}${text}`);
    }
  }

  if (moved.length && !lines.some(({ text }) => moved.some((m) => text.includes(m)))) {
    offScope.push(file);
  }
}

// THE GUARD ON THE INSTRUMENT. Both checks report *offenders*, so a diff parser
// that parsed nothing reports a clean bill of health — the same shape as
// `module-layering.test.ts`'s blinded resolver, which passed six of seven tests
// having inspected zero imports. Say what was looked at.
console.log(`${inspected} changed lines across ${files.size} files inspected.`);

if (offShape.length) {
  console.log(`\n## not a ${kind} line (${offShape.length})`);
  for (const l of offShape.slice(0, 60)) console.log(`  ${l}`);
  if (offShape.length > 60) console.log(`  … ${offShape.length - 60} more`);
}
if (offScope.length) {
  console.log(`\n## changed but mention no moved path (${offScope.length})`);
  for (const f of offScope) console.log(`  ${f}`);
  console.log(
    "\n  Each of these changed for a reason other than the move. That may be\n" +
      "  deliberate — or it may be a rewriter normalizing something it was not\n" +
      "  asked to touch, which is how seven extensionless specifiers silently\n" +
      "  gained `.ts` in `group-crowded-source-directories`.",
  );
}

if (!offShape.length && !offScope.length) console.log("clean.");
process.exit(offShape.length || offScope.length ? 1 : 0);
