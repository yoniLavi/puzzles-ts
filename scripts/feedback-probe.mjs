#!/usr/bin/env node
/**
 * Local-feedback probe — *"would this module's own tests notice?"*
 *
 * ## The question, and why the mutation report could not answer it
 *
 * `audit-test-suite-strength` reported a **"killed by its own test file"**
 * column and `strengthen-engine-test-feedback` set out to move it. Checking the
 * instrument before trusting it — this repository's own standing rule, earned
 * four times over in that audit — showed the column measures something else.
 *
 * Stryker **bails the test run on the first failure**: all 1,437 killed mutants
 * in that report have exactly *one* entry in `killedBy`. So the column records
 * *which covering test happened to run first*, not *which test files can catch
 * the defect*. Vitest orders files roughly alphabetically, so `grid.ts` scored
 * 1/40 because `grid-aperiodic-differential.test.ts`, `grid-desc.test.ts` and
 * `grid-incentre.test.ts` all sort ahead of `grid.test.ts`. Deleting the
 * `case "cairo":` arm and running `grid.test.ts` **alone** fails nine tests in
 * 1.5 seconds. The module was never locally silent.
 *
 * That is a measurement, not an argument, and this harness is how it is made.
 *
 * ## What it does
 *
 * Each case is a **hand-chosen real defect** — a line whose meaning a reader of
 * the module can state — applied to the source, with only the module's *own*
 * test file(s) run against it. A case that survives is a sentence the module's
 * doc comment claims and its tests do not check.
 *
 * Hand-chosen rather than replayed from the report for two reasons: the
 * committed report is slimmed (no columns, no end offsets) so its mutants
 * cannot be spliced back precisely, and — more importantly — a curated case
 * carries *why it matters*, which a `ConditionalExpression → false` cannot.
 * The corpus is the artefact; see `scripts/feedback-probe-cases.mjs`.
 *
 * ## The safeguard that is not optional
 *
 * **A case whose anchor is missing or non-unique aborts the run.** An edit that
 * silently fails to apply reports `SURVIVED`, which reads exactly like a
 * finding and is not one — the audit produced two false results that way before
 * catching it. `--verify` runs that check alone, in well under a second, and is
 * what a reader should run first after touching any of these modules.
 *
 * **And a walk that finds too few engine test files aborts the run**, for the
 * same reason pointed the other way: the anchors check that the *code* is still
 * where a case says it is, and say nothing about whether the right *tests* were
 * found. Both checks live in `--verify`, so both are in the commit gate.
 *
 * ## Usage
 *
 *   node scripts/feedback-probe.mjs --verify        # anchors only, ~0.2 s
 *   node scripts/feedback-probe.mjs                 # everything, ~15 min
 *   node scripts/feedback-probe.mjs latin grid      # substring-filtered
 *
 * Exit status is 0 unless a case fails to apply. **A survivor is a finding, not
 * a failure** — this is a diagnostic, never a gate and never a ratchet, the
 * same standing as `npm run metrics` and `npm run mutation`, and for the same
 * reason: a number that invites maximising invites tests written against the
 * number rather than against the behaviour.
 *
 * ## Importing this file does not run it
 *
 * It used to. A run **edits files under `src/`** — that is how it works — so a
 * bare `import()` of this module, to reach `ownTests` or `engineFiles` from a
 * one-liner, started a fifteen-minute run that rewrote the engine underneath the
 * importer. The entry-point guard at the foot of the file is what stops that;
 * importing is now inert, and the helpers are exported so reaching for one is
 * the obvious thing rather than the dangerous one.
 *
 * If a run is killed anyway (`SIGTERM`, or a `SIGINT` mid-`spawnSync`, which the
 * handler cannot service because `main` is synchronous throughout), it leaves
 * **exactly one** module holding **exactly one** planted defect. The commit gate
 * catches that rather than shipping it, though it says so obliquely: the
 * mutation consumed that case's anchor, so `--verify` reports the anchor as
 * missing and asks you to re-anchor it. If you see that after killing a run,
 * `git diff src/engine` names the file and `git checkout` is the whole fix.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MODULES } from "./feedback-probe-cases.mjs";

/** A mutated solver can loop for ever; a timeout counts as caught, as Stryker
 * scores it — the test run did not come back clean. */
const RUN_TIMEOUT_MS = 120_000;

const ENGINE = "src/engine";

/**
 * The floor on discovered engine test files — see `engineFiles()`.
 *
 * Deliberately below the true count (55 when written) so that deleting a test
 * file is not a chore; far enough above what a **non-recursive** walk would find
 * (34 once `grid/` and `colour/` are subdirectories) that the failure this
 * guards cannot slip under it.
 */
const TEST_FILE_FLOOR = 50;

/**
 * Every `.ts` file under `src/engine/`, **recursively**.
 *
 * Recursive because the engine is no longer flat: `group-crowded-source-
 * directories` moved the grid and colour families into subdirectories, and
 * `random/`, `combi/`, `tilings/` and `testing/` were already nested. A
 * one-level walk would still run — it would simply stop finding the tests that
 * live down there, and both things derived from this list (barrels, own tests)
 * would quietly shrink. See `checkTestFileFloor` for why that is the dangerous
 * direction.
 */
export function engineFiles(dir = ENGINE, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) engineFiles(path, out);
    else if (entry.name.endsWith(".ts")) out.push(path);
  }
  return out;
}

/** Engine test files, minus the differentials — the pool `ownTests` filters. */
const testFilePool = (files) =>
  files.filter((f) => f.endsWith(".test.ts") && !f.endsWith("-differential.test.ts"));

/**
 * Fail if the walk found fewer engine test files than the committed floor.
 *
 * This is the one check that notices the instrument going blind. Every other
 * safeguard here fails *loudly* on a real problem; a walk that stops too
 * shallow fails **quietly and in the wrong direction** — fewer tests run
 * against each planted defect, so more cases report SURVIVED and the rate
 * drops, which reads as "the tests got worse". That is a plausible-looking
 * wrong conclusion, which is exactly what `check-the-instrument` is about.
 *
 * The anchor check cannot cover it: anchors quote source *lines*, and a pure
 * file move leaves every one of them valid. So this runs alongside the anchors,
 * in `--verify`, and therefore in the commit gate — a refactor that nests
 * engine modules out of the walk's reach fails at commit time rather than
 * fifteen minutes into a run whose number nobody would have doubted.
 */
function checkTestFileFloor(files) {
  const found = testFilePool(files).length;
  if (found < TEST_FILE_FLOOR) {
    throw new Error(
      `discovered only ${found} engine test files, floor is ${TEST_FILE_FLOOR}.\n` +
        `  The walk in engineFiles() is not reaching them all — most likely a\n` +
        "  refactor nested engine modules deeper than it recurses. Fix the walk;\n" +
        "  do NOT lower the floor to match. A smaller derived set makes cases\n" +
        "  SURVIVED and the rate drop, which looks like a real regression.",
    );
  }
  return found;
}

/**
 * A module's **own tests**: every test file in `src/engine/` that
 * imports it — derived, never hand-listed.
 *
 * The unit matters, and getting it wrong is this project's most-repeated
 * measurement bug. `audit-test-suite-strength` §5a found that "has no file
 * named `<module>.test.ts`" is not "has no local test" — `grid-core.ts` is
 * tested by `grid-trim.test.ts`, `grid-geometry.ts` by `grid-incentre.test.ts`.
 * The mirror of that mistake is just as wrong: `midend.test.ts` **alone** is not
 * the midend's own tests either, because save/load lives in `save.test.ts`,
 * prefs in `midend-prefs.test.ts` and desc supersession in
 * `desc-supersede.test.ts` — eight files, all of them engine-local, all of them
 * named after the *behaviour* rather than the file. Naming one of them "the
 * module's test file" would report a feedback hole that is really a filing
 * convention.
 *
 * Two exclusions, both because the requirement is about *feedback*, not about
 * coverage: a **game's** test file (that distant guarantee is the thing being
 * separated out) and any `*-differential.test.ts`, even an engine-local one. A
 * differential's guarantee is a frozen fixture noticing that the boards moved,
 * which is a real and deliberate division of labour — counting it here would
 * let `grid.ts` score full marks on assertions it does not make. A case that
 * survives the local tests but is caught by a differential is exactly the split
 * the requirement says must be *stated in the test file and verified*.
 */
export function ownTests(modulePath, files = engineFiles()) {
  const wanted = resolve(modulePath);
  // A barrel counts as the module. `grid/index.ts` re-exports `grid-core.ts`
  // and says in its own doc comment "import from this module, not from the
  // parts", so `grid.test.ts` *is* `grid-core.ts`'s local test — following
  // direct imports only reported a feedback hole that was really an import
  // convention. One level is enough for this tree; deepen it if a barrel ever
  // re-exports a barrel.
  const viaBarrel = new Set([wanted]);
  for (const barrel of files) {
    if (barrel.endsWith(".test.ts")) continue;
    const src = readFileSync(barrel, "utf8");
    for (const m of src.matchAll(/export\s+(?:\*|\{[^}]*\})\s*from\s+"(\.[^"]+)"/g)) {
      if (resolve(dirname(barrel), m[1]) === wanted) viaBarrel.add(resolve(barrel));
    }
  }

  return testFilePool(files).filter((testFile) => {
    const src = readFileSync(testFile, "utf8");
    for (const m of src.matchAll(/from\s+"(\.[^"]+)"/g)) {
      if (viaBarrel.has(resolve(dirname(testFile), m[1]))) return true;
    }
    return false;
  });
}

/**
 * How a module is labelled in the report.
 *
 * The path relative to `src/engine/`, not `basename()`. The engine has
 * subdirectories now, and `basename("src/engine/grid/index.ts")` is `index.ts` —
 * a name that says nothing and that a second barrel would collide with outright.
 */
const label = (modulePath) => modulePath.replace(`${ENGINE}/`, "");

function testsFor(mod, files) {
  const tests = mod.tests ?? ownTests(mod.module, files);
  if (!tests.length) {
    throw new Error(
      `${mod.module}: no engine test file imports it — that is itself the finding,\n` +
        "  but this harness cannot measure a module with no local tests at all.",
    );
  }
  return tests;
}

/** Apply one case, or throw. Throwing is the point: see the header. */
function applyCase(source, probe, where) {
  const hits = source.split(probe.find).length - 1;
  if (hits !== 1) {
    throw new Error(
      `${where}: anchor ${hits === 0 ? "not found" : `found ${hits}× (must be unique)`}\n` +
        `  ${JSON.stringify(probe.find)}\n` +
        `  Re-anchor it on surrounding text. An edit that does not apply reports SURVIVED.`,
    );
  }
  if (probe.find === probe.replace) throw new Error(`${where}: no-op case`);
  return source.replace(probe.find, probe.replace);
}

function runTests(tests) {
  const r = spawnSync(
    "npx",
    ["vitest", "run", "--passWithNoTests", "--reporter=dot", ...tests],
    {
      encoding: "utf8",
      timeout: RUN_TIMEOUT_MS,
      env: { ...process.env, CI: "1" },
    },
  );
  if (r.error?.code === "ETIMEDOUT" || r.signal) return "timeout";
  return r.status === 0 ? "survived" : "caught";
}

function main() {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify");
  const filters = args.filter((a) => !a.startsWith("--"));
  const modules = filters.length
    ? MODULES.filter((m) => filters.some((f) => m.module.includes(f)))
    : MODULES;

  if (!modules.length) {
    console.error(`no module matched ${filters.join(", ")}`);
    process.exit(2);
  }

  // Verify every anchor across every module *before* running anything, so a
  // typo in the last case does not surface twenty minutes into a run.
  const sources = new Map();
  for (const mod of modules) {
    const source = readFileSync(mod.module, "utf8");
    sources.set(mod.module, source);
    for (const probe of mod.cases) {
      applyCase(source, probe, `${mod.module} — ${probe.why}`);
    }
  }
  // …and check the instrument can still see, which the anchors cannot tell us.
  const files = engineFiles();
  const found = checkTestFileFloor(files);
  const total = modules.reduce((n, m) => n + m.cases.length, 0);
  console.log(
    `${total} cases across ${modules.length} modules: every anchor applies, ` +
      `${found} engine test files discovered (floor ${TEST_FILE_FLOOR}).`,
  );
  if (verifyOnly) return;

  const restore = () => {
    for (const [file, source] of sources) writeFileSync(file, source);
  };
  process.on("SIGINT", () => {
    restore();
    process.exit(130);
  });

  const findings = [];
  const regressions = [];
  const scores = [];
  try {
    for (const mod of modules) {
      const source = sources.get(mod.module);
      const tests = testsFor(mod, files);
      process.stdout.write(`\n${mod.module}\n  vs ${tests.join(" ")}\n  `);
      let caught = 0;
      let scored = 0;
      for (const probe of mod.cases) {
        writeFileSync(mod.module, applyCase(source, probe, mod.module));
        const verdict = runTests(tests);
        writeFileSync(mod.module, source);
        if (probe.equivalent) {
          // Expected to survive: the case was argued behaviour-preserving. If
          // it is now *caught*, the argument has expired — the code changed
          // under it — and the note needs re-reading, not the test deleting.
          if (verdict !== "survived") regressions.push({ mod: mod.module, probe });
          process.stdout.write(verdict === "survived" ? "=" : "!");
          continue;
        }
        scored++;
        if (verdict === "survived") findings.push({ mod: mod.module, probe });
        else caught++;
        process.stdout.write(
          verdict === "survived" ? "S" : verdict === "timeout" ? "T" : ".",
        );
      }
      const pct = Math.round((100 * caught) / scored);
      scores.push({ name: label(mod.module), caught, total: scored, pct });
      process.stdout.write(`  ${caught}/${scored} (${pct}%)\n`);
    }
  } finally {
    restore();
  }

  if (regressions.length) {
    console.log(
      `\n## marked equivalent but CAUGHT (${regressions.length}) — re-read the note`,
    );
    for (const { mod, probe } of regressions)
      console.log(`  ${label(mod)}: ${probe.why}`);
  }

  // Repeated at the end so the table survives a `| tail`, which is how this
  // gets read after a long run.
  console.log("\n## local-catch rate by module\n");
  for (const s of [...scores].sort((a, b) => a.pct - b.pct)) {
    console.log(
      `  ${s.name.padEnd(26)} ${String(s.caught).padStart(3)}/${String(s.total).padEnd(3)} ${String(`${s.pct}%`).padStart(5)}`,
    );
  }
  const scored = scores.reduce((n, s) => n + s.total, 0);
  const equivalent = total - scored;
  console.log(
    `\n${scored - findings.length}/${scored} caught locally` +
      (equivalent
        ? `, ${equivalent} case${equivalent === 1 ? "" : "s"} excluded as equivalent.`
        : "."),
  );
  if (findings.length) {
    console.log(`\n## survived the module's own tests (${findings.length})`);
    for (const { mod, probe } of findings) console.log(`  ${label(mod)}: ${probe.why}`);
    console.log(
      "\nEach is either a test worth writing or a guarantee that genuinely belongs\n" +
        "to a differential — and if it is the second, say so in the test file and\n" +
        "verify the differential does fail on it (repo-layout requires both).",
    );
  }
}

// Run only when invoked as a command, never on import — a run rewrites files
// under `src/`, so importing this module for one of its helpers used to start
// one. `import.meta.main` needs Node 24.2; `.nvmrc` pins 24, and the fallback
// keeps an older runtime from silently taking the *other* branch, which would
// restore the footgun rather than report it.
const isEntryPoint =
  import.meta.main ??
  (process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(process.argv[1]).href);

if (isEntryPoint) {
  // A failing anchor is an ordinary, expected outcome — a refactor moved a
  // probed line — and this check runs in the commit gate, so it reports like a
  // gate failure rather than like a crash. A node stack trace here would bury
  // the one line the developer needs (which case, and what to do about it).
  try {
    main();
  } catch (e) {
    console.error(`\n✗ feedback-probe: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}
