/*
 * Static asset-integrity tests.
 *
 * Two failure modes these guard against:
 *
 * 1. `new URL(<path>, import.meta.url)` references whose path no longer
 *    resolves to a real file/directory after the source file moves. Vite
 *    and the browser fail this silently (the only signal is a runtime 404
 *    on the eventual fetch), and components like catalog-card used to
 *    mask it behind a fallback icon. Caught here at test time instead.
 *
 * 2. A puzzle present in the catalog without its corresponding generated
 *    icon PNGs in src/assets/icons/. Same masking risk, same fix: assert
 *    statically.
 *
 * Implementation note: uses Vite's `import.meta.glob` (typed via
 * src/vite-env.d.ts) so the test stays inside the browser-shaped type
 * world and the project's `tsconfig.json` `"types": []` posture is
 * preserved (no Node typings imported into source).
 */

import { describe, expect, it } from "vitest";
import { puzzleIds } from "./puzzle/catalog.ts";

// Raw text of every .ts file under src/, eagerly loaded for regex scanning.
const sourceModules = import.meta.glob<string>("./**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

// Every file under src/, used as a static existence oracle. The value
// (URL string) is unused; only the keys matter.
const allFiles = import.meta.glob("./**/*", {
  query: "?url",
  import: "default",
  eager: true,
});

const knownPaths = new Set(Object.keys(allFiles));
const knownDirs = new Set<string>(["./"]);
for (const path of knownPaths) {
  const segments = path.replace(/^\.\//, "").split("/");
  for (let i = 1; i < segments.length; i++) {
    knownDirs.add(`./${segments.slice(0, i).join("/")}/`);
  }
}

function resolveAgainst(sourceFile: string, relPath: string): string {
  const fakeBase = `https://x/${sourceFile.replace(/^\.\//, "")}`;
  const resolved = new URL(relPath, fakeBase).pathname;
  return `.${resolved}`;
}

const URL_REF_RE =
  /new\s+URL\s*\(\s*(['"`])([\s\S]*?)\1\s*,\s*import\.meta\.url\s*\)/g;

interface UrlRef {
  source: string;
  line: number;
  rawPath: string;
  resolvedPath: string;
  isDynamic: boolean;
}

function findUrlRefs(file: string, contents: string): UrlRef[] {
  const refs: UrlRef[] = [];
  for (const match of contents.matchAll(URL_REF_RE)) {
    const rawPath = match[2];
    const noQuery = rawPath.replace(/\?[\s\S]*$/, "");
    const interpIdx = noQuery.indexOf("${");
    const isDynamic = interpIdx !== -1;
    const staticPrefix = isDynamic ? noQuery.slice(0, interpIdx) : noQuery;
    const resolvedPath = resolveAgainst(file, staticPrefix);
    const idx = match.index ?? 0;
    const line = contents.slice(0, idx).split("\n").length;
    refs.push({ source: file, line, rawPath, resolvedPath, isDynamic });
  }
  return refs;
}

describe("new URL(..., import.meta.url) references resolve", () => {
  const refs = Object.entries(sourceModules)
    .filter(
      ([path]) =>
        !path.endsWith(".test.ts") &&
        !path.includes("/__fixtures__/") &&
        !path.startsWith("./assets/"),
    )
    .flatMap(([path, contents]) => findUrlRefs(path, contents));

  it("finds references to scan (sanity)", () => {
    // Bare minimum: catalog-card.ts and worker.ts both use this pattern.
    expect(refs.length).toBeGreaterThanOrEqual(2);
  });

  it.each(refs)(
    "$source:$line — $rawPath",
    ({ isDynamic, resolvedPath, source, line, rawPath }) => {
      if (isDynamic) {
        expect(
          knownDirs.has(resolvedPath),
          `${source}:${line}: directory does not exist for ${rawPath} → ${resolvedPath}`,
        ).toBe(true);
      } else {
        expect(
          knownPaths.has(resolvedPath),
          `${source}:${line}: file does not exist for ${rawPath} → ${resolvedPath}`,
        ).toBe(true);
      }
    },
  );
});

describe("every cataloged puzzle has its generated icons", () => {
  it.each(puzzleIds)("%s", (puzzleId) => {
    for (const suffix of ["64d8", "128d8"] as const) {
      const path = `./assets/icons/${puzzleId}-${suffix}.png`;
      expect(knownPaths.has(path), `missing icon: src/${path.slice(2)}`).toBe(
        true,
      );
    }
  });
});
