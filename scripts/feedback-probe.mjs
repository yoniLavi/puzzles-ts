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
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { MODULES } from "./feedback-probe-cases.mjs";

/** A mutated solver can loop for ever; a timeout counts as caught, as Stryker
 * scores it — the test run did not come back clean. */
const RUN_TIMEOUT_MS = 120_000;

const ENGINE = "src/native/engine";

/**
 * A module's **own tests**: every test file in `src/native/engine/` that
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
function ownTests(modulePath) {
  const wanted = resolve(modulePath);
  return readdirSync(ENGINE)
    .filter((f) => f.endsWith(".test.ts") && !f.endsWith("-differential.test.ts"))
    .map((f) => `${ENGINE}/${f}`)
    .filter((testFile) => {
      const src = readFileSync(testFile, "utf8");
      for (const m of src.matchAll(/from\s+"(\.[^"]+)"/g)) {
        if (resolve(dirname(testFile), m[1]) === wanted) return true;
      }
      return false;
    });
}

function testsFor(mod) {
  const tests = mod.tests ?? ownTests(mod.module);
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
  const total = modules.reduce((n, m) => n + m.cases.length, 0);
  console.log(`${total} cases across ${modules.length} modules: every anchor applies.`);
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
      const tests = testsFor(mod);
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
      scores.push({ name: basename(mod.module), caught, total: scored, pct });
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
      console.log(`  ${basename(mod)}: ${probe.why}`);
  }

  // Repeated at the end so the table survives a `| tail`, which is how this
  // gets read after a long run.
  console.log("\n## local-catch rate by module\n");
  for (const s of [...scores].sort((a, b) => a.pct - b.pct)) {
    console.log(
      `  ${s.name.padEnd(24)} ${String(s.caught).padStart(3)}/${String(s.total).padEnd(3)} ${String(`${s.pct}%`).padStart(5)}`,
    );
  }
  const scored = scores.reduce((n, s) => n + s.total, 0);
  const equivalent = total - scored;
  console.log(
    `\n${scored - findings.length}/${scored} caught locally` +
      (equivalent ? `, ${equivalent} cases excluded as equivalent.` : "."),
  );
  if (findings.length) {
    console.log(`\n## survived the module's own tests (${findings.length})`);
    for (const { mod, probe } of findings)
      console.log(`  ${basename(mod)}: ${probe.why}`);
    console.log(
      "\nEach is either a test worth writing or a guarantee that genuinely belongs\n" +
        "to a differential — and if it is the second, say so in the test file and\n" +
        "verify the differential does fail on it (repo-layout requires both).",
    );
  }
}

main();
