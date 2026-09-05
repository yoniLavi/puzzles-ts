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
 * ## Renaming an identifier, where the shape check is not the strong check
 *
 *   node scripts/check-rename-shape.mjs --fold hpencil=pencilMode --fold cpencil=pencilMode
 *
 * A vocabulary rename changes lines of *every* kind — declarations, reads,
 * assertions, prose in comments — so "is this the kind of line I meant" says
 * almost nothing. `--fold old=new` answers a stronger question instead: map each
 * new name back to its old one in the changed file and demand the result is the
 * committed version, **byte for byte**. Anything else in the diff survives the
 * fold and is reported.
 *
 * Repeat `--fold` per pair; two old names may fold to one new one (two
 * vocabularies merging), and a file is checked against whichever old name it
 * actually used at HEAD — folding both would rewrite the other camp's name too.
 * A file using both is reported rather than guessed at, because the map is not
 * invertible there.
 *
 * **Expect this to report the reflow.** Longer names push lines past the column
 * limit, so the formatter rewraps; that is real and is exactly what you want to
 * see listed, because a rewrap is where an unintended edit hides. Pass
 * `--fold-format` to run the formatter over the folded text before comparing,
 * which absorbs the rewrap and leaves only content differences. Even then a
 * reflow is not perfectly invertible — an object literal the rename expanded
 * stays expanded, and gains a trailing comma — so a residue of pure
 * whitespace-and-comma differences is reported separately from a real edit.
 *
 * `--staged` reads the staged diff instead of the working tree.
 *
 * Exit status is 1 if anything is reported. **A report is a prompt to look, not
 * a verdict**: every finding here has a legitimate explanation available, and
 * the point is that you supply it deliberately rather than never being asked.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

const args = process.argv.slice(2);
const moved = args.flatMap((a, i) => (a === "--moved" ? [args[i + 1]] : []));
const kind = args.includes("--kind") ? args[args.indexOf("--kind") + 1] : "import";
const staged = args.includes("--staged");
const foldFormat = args.includes("--fold-format");
const folds = args.flatMap((a, i) => {
  if (a !== "--fold") return [];
  const [from, to] = (args[i + 1] ?? "").split("=");
  if (!from || !to) {
    console.error(`--fold wants old=new, got ${args[i + 1]}`);
    process.exit(2);
  }
  return [{ from, to }];
});

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

// --- the fold check: is this diff nothing but the rename (and its reflow)? ---
//
// Stronger than shape for a vocabulary rename, because a rename touches lines of
// every kind and "is this the kind of line I meant" then says nothing.
const offFold = [];
const reflowOnly = [];
let folded = 0;

if (folds.length) {
  const w = (id) => new RegExp(`\\b${id}\\b`, "g");
  for (const file of files.keys()) {
    let head;
    try {
      head = execSync(`git show HEAD:${JSON.stringify(file)}`, {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      continue; // added file: nothing at HEAD to fold back to
    }
    let now;
    try {
      now = readFileSync(file, "utf8");
    } catch {
      continue; // deleted
    }
    folded++;

    // Two old names may fold to one new one. Pick the one this file used at
    // HEAD; folding both would rewrite the other camp's name into this file.
    const byNew = new Map();
    for (const { from, to } of folds) {
      if (!w(from).test(head)) continue;
      if (byNew.has(to)) {
        offFold.push(
          `${file}  uses both ${byNew.get(to)} and ${from} — not invertible`,
        );
        byNew.set(to, null);
        continue;
      }
      byNew.set(to, from);
    }
    let back = now;
    for (const [to, from] of byNew) if (from) back = back.replace(w(to), from);

    if (foldFormat) {
      const tmp = join(mkdtempSync(join(tmpdir(), "fold-")), `x${extname(file)}`);
      writeFileSync(tmp, back);
      try {
        execSync(`npx biome format --write ${JSON.stringify(tmp)}`, {
          stdio: "ignore",
        });
        back = readFileSync(tmp, "utf8");
      } catch {
        // Formatter unavailable or unhappy; compare the unformatted fold.
      }
    }

    if (back === head) continue;
    // A reflow may only change line breaks and the trailing comma an expanded
    // literal gains. Anything else survives this normalization.
    const squash = (s) => s.replace(/\s+/g, "").replace(/,(?=[)\]}])/g, "");
    if (squash(back) === squash(head)) reflowOnly.push(file);
    else offFold.push(`${file}  does not fold back to its committed version`);
  }
}

// THE GUARD ON THE INSTRUMENT. Both checks report *offenders*, so a diff parser
// that parsed nothing reports a clean bill of health — the same shape as
// `module-layering.test.ts`'s blinded resolver, which passed six of seven tests
// having inspected zero imports. Say what was looked at.
console.log(`${inspected} changed lines across ${files.size} files inspected.`);
if (folds.length) console.log(`${folded} of those files folded back and compared.`);

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

if (reflowOnly.length) {
  console.log(`\n## folds back to line breaks and commas only (${reflowOnly.length})`);
  for (const f of reflowOnly) console.log(`  ${f}`);
  console.log(
    "\n  The rename pushed a line past the column limit and the formatter\n" +
      "  rewrapped it. A rewrap is not invertible — an expanded object literal\n" +
      "  stays expanded and gains a trailing comma — so these are reported\n" +
      "  apart from a real edit rather than passed silently.",
  );
}
if (offFold.length) {
  console.log(`\n## not explained by the rename (${offFold.length})`);
  for (const l of offFold) console.log(`  ${l}`);
  console.log(
    "\n  Something in these files changed that folding the new names back does\n" +
      "  not undo. Read each one: it is either a deliberate edit riding along\n" +
      "  with the sweep, or the thing this check exists to find.",
  );
}

const bad = offShape.length + offScope.length + offFold.length;
if (!bad && !reflowOnly.length) console.log("clean.");
process.exit(bad ? 1 : 0);
