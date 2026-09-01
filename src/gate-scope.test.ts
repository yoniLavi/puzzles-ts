/*
 * The documentation-only fast path in `scripts/gate.sh` rests on one claim:
 * **nothing under `docs/`, `openspec/` or the root agent files is read by a
 * test or by the production build.** If that stops being true, a commit
 * touching those paths would skip `vitest run` and `vite build` while genuinely
 * affecting them — a dropped check that reports success, which is the failure
 * this repo punishes hardest.
 *
 * So the claim is asserted rather than trusted, and it is asserted where it can
 * fail: here, on every commit that touches source.
 *
 * ON THE INSTRUMENT. This scans for the **shape of a read** — an
 * `import.meta.glob`, `readFileSync`, `readdirSync` or `fs.read*` whose path
 * argument names one of the skipped roots — not for the roots' names anywhere
 * in the file. A plain mention is what most of these files do: dozens cite
 * `docs/games/*.md` and `AGENTS.md` in prose, and a name-keyed scan would
 * convict all of them. (Keying on a name is this repo's most repeated
 * instrument failure; see AGENTS.md, "A scan that keys on a name".)
 *
 * The scan covers the test tree *and* the build side, because `vite build`
 * reads through `vite.config.ts` and `vite-plugins/` — `extra-pages.ts` globs
 * `help/**`, which is exactly why `help/` is NOT on the skip list.
 */
import { describe, expect, it } from "vitest";

/** Every source and test module, plus the build side, as raw text. */
const sources = {
  ...import.meta.glob<string>("./**/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
  ...import.meta.glob<string>("../vite-plugins/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
  ...import.meta.glob<string>("../vite.config.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
};

/**
 * The roots `scripts/gate.sh` skips the heavy branches for. Kept in step with
 * the pattern there by hand — which is safe *because* this test fails the
 * moment one of them acquires a reader, rather than because the two lists are
 * derived from each other.
 */
const SKIPPED_ROOTS = ["docs/", "openspec/", "AGENTS.md", "CLAUDE.md"];

/** A read whose path argument names one of the skipped roots. */
const READ_CALL =
  /(?:import\.meta\.glob|readFileSync|readdirSync|readFile|fs\.read\w*)\s*(?:<[^>]*>)?\s*\(\s*(["'`])([^"'`]+)\1/g;

interface Offender {
  file: string;
  path: string;
}

const offenders: Offender[] = [];
let filesScanned = 0;
for (const [file, text] of Object.entries(sources)) {
  filesScanned++;
  for (const m of text.matchAll(READ_CALL)) {
    const path = m[2];
    if (SKIPPED_ROOTS.some((root) => path.includes(root))) {
      offenders.push({ file, path });
    }
  }
}

describe("the gate's documentation-only fast path stays safe", () => {
  it("is not vacuous — the tree was read and reads were found", () => {
    // An unmatched glob yields `{}`, and the assertion below would then pass
    // over nothing. The second check proves the *pattern* still matches: this
    // repo has several tests that read source through `import.meta.glob`.
    expect(filesScanned).toBeGreaterThan(200);
    const anyRead = Object.values(sources).filter((t) => {
      READ_CALL.lastIndex = 0;
      return READ_CALL.test(t);
    });
    expect(anyRead.length).toBeGreaterThan(5);
  });

  it("no test or build input reads a path the gate may skip", () => {
    expect(
      offenders.map((o) => `${o.file} reads ${o.path}`).sort(),
      "this path is now a real input, so a documentation-only commit can no " +
        "longer skip vitest/vite build — remove it from the pattern in " +
        "scripts/gate.sh and from SKIPPED_ROOTS here",
    ).toEqual([]);
  });

  it("does not skip help/, which is a build input and a test subject", () => {
    // The counterpart guarantee: `help/` must NEVER join SKIPPED_ROOTS. It is
    // globbed by `help-coverage.test.ts` and rendered by `extra-pages.ts`, and
    // this change's own `::icon::` check fails the *build* on a bad help page.
    expect(SKIPPED_ROOTS).not.toContain("help/");
    const helpReaders = Object.entries(sources).filter(([, text]) => {
      READ_CALL.lastIndex = 0;
      return [...text.matchAll(READ_CALL)].some((m) => m[2].includes("help/"));
    });
    // Proves the previous assertion is meaningful: help/ *is* read, so if it
    // were on the skip list the first test would have caught it.
    expect(helpReaders.length).toBeGreaterThan(0);
  });
});
