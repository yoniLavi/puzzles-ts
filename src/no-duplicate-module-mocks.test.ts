/*
 * No module is `vi.mock`ed by more than one test file.
 *
 * The suite runs with `isolate: false` (see `vitest.config.ts` for why — it
 * halved a full run and removed a class of load-induced flake). That config
 * documents the one shared mutable singleton it believed existed, the game
 * registry, and argues the suite is order-independent otherwise. **There is a
 * second, and it is not a singleton the repo wrote: vitest's per-worker module
 * registry, which `vi.mock` writes into.**
 *
 * Two files mocking the same module with *different* factories therefore race.
 * Whichever loads first in a worker wins, and the loser silently receives
 * someone else's spies — not an error, just assertions that quietly stop
 * observing anything. `puzzle-screen.test.ts` and `puzzle-screen-load.test.ts`
 * both mocked `store/saved-games.ts` and `dialogs/alert-dialog.ts`, and when the
 * pair landed in one worker all four Check-&-Save assertions failed with
 * "expected to be called once, got 0 times". It rejected a green commit whose
 * tree had gated clean minutes earlier, and only for where its files happened to
 * be scheduled — the same self-compounding shape `vitest.config.ts`'s timeout
 * history is about. Two full shuffled runs failed to reproduce it; forcing the
 * pair into one worker reproduced it every time.
 *
 * The rule is stricter than the hazard — two files with *identical* factories
 * would be fine — because "identical" is not a thing a check can hold true over
 * time, and one test file per mocked module is a cheap and honest way to keep
 * the guarantee. When two files want the same mock, that is a sign they are
 * testing the same seam: merge them, as the two above were.
 */
import { describe, expect, it } from "vitest";

/** Every test module, eagerly, as raw text — Vite resolves these at build. */
const sources = Object.entries(
  import.meta.glob("./**/*.test.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
).map(([p, text]) => [p.replace(/^\.\//, "src/"), text] as const);

/** `vi.mock("<specifier>"` — the call is hoisted, so it is always a literal. */
const MOCK_CALL = /\bvi\.mock\(\s*["']([^"']+)["']/g;

/** Resolve a relative specifier against its importer, so two files reaching the
 * same module by different paths still collide. */
function resolveFrom(importer: string, spec: string): string {
  if (!spec.startsWith(".")) return spec;
  const parts = importer.split("/").slice(0, -1);
  for (const seg of spec.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

describe("no module is vi.mock-ed by more than one test file", () => {
  const byModule = new Map<string, string[]>();
  let mockingFiles = 0;
  for (const [path, text] of sources) {
    const specs = new Set<string>();
    for (const m of text.matchAll(MOCK_CALL)) specs.add(resolveFrom(path, m[1]));
    if (specs.size > 0) mockingFiles++;
    for (const spec of specs) {
      if (!byModule.has(spec)) byModule.set(spec, []);
      byModule.get(spec)?.push(path);
    }
  }

  it("scanned the test tree and found the mocks in it", () => {
    // Two vacuity guards, because this check's whole failure mode is looking at
    // nothing: a mis-rooted glob, or a regex that stopped matching the call
    // shape, would both report a clean suite. Floors are well under the values
    // when this was written (~265 test files, 1 file using `vi.mock`).
    expect(sources.length, "scanned implausibly few test files").toBeGreaterThan(200);
    expect(byModule.size, "found no vi.mock calls at all").toBeGreaterThan(0);
    expect(mockingFiles).toBeGreaterThan(0);
  });

  it("has no module mocked from two places", () => {
    const shared = [...byModule.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([spec, files]) => `${spec} <- ${files.join(", ")}`);
    expect(
      shared,
      "modules mocked by more than one test file: under `isolate: false` the " +
        "first to load wins and the other file's spies are silently never used",
    ).toEqual([]);
  });
});
