/**
 * **The guard under `scripts/checks/select-tests.mjs`.**
 *
 * The pre-commit hook may run a *subset* of the suite, chosen by that script
 * from two channels: the static import graph, and every test whose
 * `import.meta.glob` pattern reaches a changed path. A test that reaches its
 * subject through some **third** channel is invisible to both, and the failure
 * is silent — the commit passes, having never run the guard.
 *
 * So this asserts the two properties the selector's soundness rests on, and it
 * asserts them by reading the tree rather than by trusting a list:
 *
 *  1. every `import.meta.glob` call in a test file takes a **literal** pattern
 *     — a string, or an array of strings — so the selector can see where it
 *     points;
 *  2. no test file reads the filesystem directly (`node:fs`), which would be a
 *     coupling neither channel models.
 *
 * This is the same shape as `gate-scope.test.ts`, which keeps the
 * documentation-only shortcut honest by failing when a test acquires a read of
 * a path that shortcut assumes is inert. Both exist because the gate's
 * scopings are only safe while an assumption about the tree holds, and an
 * assumption nothing checks is one that has already started to drift.
 *
 * **CI is the backstop, not this file.** `.github/workflows/ci.yml` runs the
 * whole suite on every push to `main`, so a selector bug costs a slower
 * feedback loop rather than a broken `main`. That is the same argument that
 * lets the hook run `biome check --staged` while CI runs `biome ci .`.
 */
import { describe, expect, it } from "vitest";

/** Every test file's source, keyed by path. Read as text through the same
 * mechanism the selector parses — which is the point: if this glob stops
 * matching, the count guard below fails rather than the sweep quietly
 * shrinking. */
const testSources = import.meta.glob<string>("./**/*.test.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** Files that legitimately reach the filesystem, with the reason. Each is
 * outside the gate's `include` (`src/**`), so the selector never has to model
 * it — `scripts/checks/diff.vitest.config.mts` runs them on demand. */
const FS_READERS_OUTSIDE_THE_GATE = "scripts/checks/";

/**
 * Drop comment lines, **line by line and never with a block-comment regex**.
 *
 * `/\/\*[\s\S]*?\*\//` looks like the obvious way to do this and is a trap
 * here: a doc comment that mentions a glob pattern contains `**` followed by
 * `/`, so the comment terminates at the pattern and the stripper goes on to eat
 * live code. That is not hypothetical — it silently removed three help guards
 * from a real selection while this file was being written, and
 * `select-tests.mjs` now carries the same warning at the same shape.
 *
 * A line whose first non-space character is `*`, `//` or `/*` is prose. Every
 * `import.meta.glob` call in this tree begins a statement, so nothing real is
 * lost, and a self-terminating delimiter cannot reach past its own line.
 */
function stripProse(source: string): string {
  return source
    .split("\n")
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .join("\n");
}

describe("the pre-commit test selector can see every coupling", () => {
  it("looked at every test file in the suite", () => {
    // The vacuity guard this repo owes every derived sweep: an
    // `import.meta.glob` that matched nothing yields `{}`, and every assertion
    // below would then pass over an empty set and report health.
    expect(Object.keys(testSources).length).toBeGreaterThan(250);
  });

  it("every import.meta.glob pattern is statically resolvable", () => {
    // A computed pattern is one `select-tests.mjs` cannot resolve, so the test
    // holding it would drop out of the glob channel. Vite accepts two literal
    // forms and BOTH are fine — a single pattern, and an array of them:
    //
    //   import.meta.glob("../games/**\/*.ts", …)
    //   import.meta.glob(["../templates/*.hbs", "../help/*.hbs"], …)
    //
    // The array form spans several lines, which is exactly what a first,
    // line-oriented pass at this question could not see: it reported the tree
    // as uniformly single-pattern and missed both call sites. Scan for the
    // *call*, then classify what follows it — never grep for the shape you
    // expect (`AGENTS.md` § "A scan that keys on a name").
    const anyCall = /import\.meta\.glob\s*(?:<[^>]*>)?\s*\(/g;
    const offenders: string[] = [];
    let calls = 0;

    for (const [file, source] of Object.entries(testSources)) {
      // This file, and several guards, *discuss* `import.meta.glob` in prose;
      // a sweep that counts those reports offenders that do not exist.
      const code = stripProse(source);
      for (const match of code.matchAll(anyCall)) {
        calls++;
        const rest = code.slice(match.index + match[0].length).trimStart();
        const literal = rest.startsWith('"');
        const arrayOfLiterals =
          rest.startsWith("[") && /^\[\s*"/.test(rest.replace(/\s+/g, " "));
        if (!literal && !arrayOfLiterals) offenders.push(file);
      }
    }

    expect(
      calls,
      "no import.meta.glob call found — the scan is broken",
    ).toBeGreaterThan(20);
    expect(
      offenders,
      "a computed glob pattern is invisible to scripts/checks/select-tests.mjs, " +
        "so the pre-commit hook may skip this test on a commit that breaks it. " +
        "Use a string literal or an array of them, or teach the selector.",
    ).toEqual([]);
  });

  it("no test in the gate reads the filesystem directly", () => {
    // `node:fs` reaches a file through neither the import graph nor a glob, so
    // the selector cannot model it. The four files that legitimately do this
    // live in `scripts/checks/`, outside the gate's include, and run on demand
    // via `npm run diff`.
    const offenders = Object.entries(testSources)
      .filter(([file]) => !file.includes(FS_READERS_OUTSIDE_THE_GATE))
      .filter(([, source]) =>
        /from\s+"node:fs("\/promises")?"|require\(\s*"(node:)?fs"\s*\)/.test(
          stripProse(source),
        ),
      )
      .map(([file]) => file);

    expect(
      offenders,
      "a test reading the filesystem directly is invisible to the pre-commit " +
        "selector. Read the file through `import.meta.glob(..., '?raw')` " +
        "instead, which both the selector and Vite can see.",
    ).toEqual([]);
  });
});
