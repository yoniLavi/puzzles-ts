/*
 * Module-layering and import-cycle invariants.
 *
 * The layering these tests assert already held when they were written — 0
 * game-to-game imports, 0 engine-to-games imports outside the one named test
 * helper, 0 engine-or-games imports of the app shell. That is exactly why they
 * exist: the boundaries held only by convention, and the first violation will
 * look like sensible reuse (a game importing a helper from another game, an
 * engine module reaching for a Lit component). Nothing objected before this.
 *
 * Implemented as an in-repo test rather than a `dependency-cruiser` config
 * (`enforce-module-layering` D-choice): four rules over a fixed directory layout
 * express fine here, they run inside the vitest step the gate already pays for,
 * and this repo already asserts cross-cutting invariants this way — see
 * `asset-integrity.test.ts` and `catalog-registry.test.ts`.
 *
 * ON CYCLES. The cycle check counts **runtime** cycles only. With
 * `verbatimModuleSyntax`, `import type` is erased and forms no runtime edge —
 * and moving a shared type behind a type-only import *is* the standard fix for
 * a module cycle. A checker that counted those would report the fix as the
 * problem: measured 2026-08-01, madge reported 20 where 1 was real (all sixteen
 * per-game `index ↔ render` pairs are `render.ts` importing nothing from
 * `index.ts` but the game's hint type). Dynamic `import()` is likewise not a
 * cycle edge: it is evaluated at call time, so it cannot close an
 * initialisation loop, which is the hazard being guarded.
 */
import { describe, expect, it } from "vitest";

/** Every source module, eagerly, as raw text — Vite resolves these at build. */
const sources = import.meta.glob("./**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Files that are not part of the shipped module graph. */
const isTest = (p: string) => /\.test\.ts$/.test(p) || p.includes("/test-setup/");

const modules = Object.entries(sources)
  .map(([p, text]) => [p.replace(/^\.\//, "src/"), text] as const)
  .filter(([p]) => !isTest(p));

/**
 * Every import specifier in `text`, tagged with whether it forms a runtime edge.
 *
 * `type` — `import type …`, or a named import whose every binding is
 * `type`-prefixed. Erased; no runtime edge.
 * `dynamic` — `import("…")`. Real, but deferred to call time.
 * `value` — everything else, including side-effect-only `import "…"`.
 */
function imports(text: string): { spec: string; kind: "value" | "type" | "dynamic" }[] {
  const out: { spec: string; kind: "value" | "type" | "dynamic" }[] = [];

  for (const m of text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    out.push({ spec: m[1], kind: "dynamic" });
  }
  for (const m of text.matchAll(/^\s*import\s+["']([^"']+)["']\s*;?\s*$/gm)) {
    out.push({ spec: m[1], kind: "value" });
  }
  for (const m of text.matchAll(
    /import\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g,
  )) {
    const [, typeKw, clause, spec] = m;
    if (typeKw) {
      out.push({ spec, kind: "type" });
      continue;
    }
    const braced = /\{([\s\S]*)\}/.exec(clause);
    if (!braced) {
      out.push({ spec, kind: "value" }); // default or namespace import
      continue;
    }
    const bindings = braced[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const allTypes = bindings.length > 0 && bindings.every((b) => /^type\s/.test(b));
    out.push({ spec, kind: allTypes ? "type" : "value" });
  }
  return out;
}

/** Resolve a relative specifier against the importing file to a `src/…` path. */
function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const parts = from.split("/").slice(0, -1);
  for (const seg of spec.split("/")) {
    if (seg === ".") continue;
    else if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  const path = parts.join("/");
  for (const c of [path, `${path}.ts`, `${path}/index.ts`]) {
    if (sources[c.replace(/^src\//, "./")] !== undefined) return c;
  }
  return null;
}

const gameOf = (p: string) => /^src\/games\/([^/]+)\//.exec(p)?.[1] ?? null;

describe("module layering", () => {
  it("resolves the imports the rules below are counting", () => {
    // THE GUARD ON THE INSTRUMENT. Every rule in this file reports *offenders*,
    // and `resolve()` returns null when it cannot find a target — so a resolver
    // that resolves nothing finds no offenders anywhere, and the whole file goes
    // green while checking precisely nothing. That is not hypothetical:
    // `retire-native-directory`'s bulk import-rewrite corrupted this very file,
    // turning `resolve()`'s `startsWith(".")` guard into `startsWith("./")` so
    // that no `../…` specifier resolved at all — and every test below passed.
    //
    // So count what was actually inspected. Every relative `.ts` specifier in
    // the tree must resolve: `sources` globs every `.ts` under `src/`, so an
    // unresolved one means the resolver is broken or the target is missing.
    // Relative imports of other kinds (`.json` fixtures, `.css`) fall outside
    // that glob and are not this rule's business.
    //
    // The floor is deliberately far below the true count (3228 when written) —
    // it exists to separate "working" from "resolving nothing", not to ratchet
    // a number that legitimate deletions would wobble.
    //
    // This is the third instance of the shape in recent memory: `grid.test.ts`'s
    // `expect(d.edges.length).toBe(d.order)` could not fail because `d.edges`
    // was allocated `new Array(d.order)`, and `touch-input.test.ts` guarded its
    // sweep by counting the catalog while the sweep itself skipped on the
    // registry. An instrument that answers "how many violations?" must also
    // answer "how many things did I look at?".
    let resolved = 0;
    const unresolved: string[] = [];
    for (const [path, text] of Object.entries(sources).map(
      ([p, t]) => [p.replace(/^\.\//, "src/"), t] as const,
    )) {
      for (const { spec } of imports(text)) {
        if (!spec.startsWith(".") || !spec.endsWith(".ts")) continue;
        if (resolve(path, spec)) resolved++;
        else unresolved.push(`${path} → ${spec}`);
      }
    }
    expect(unresolved).toEqual([]);
    expect(resolved).toBeGreaterThan(2000);
  });

  it("no game imports another game", () => {
    const offenders: string[] = [];
    for (const [path, text] of modules) {
      const from = gameOf(path);
      if (!from) continue;
      for (const { spec } of imports(text)) {
        const target = resolve(path, spec);
        const to = target && gameOf(target);
        if (to && to !== from) offenders.push(`${path} → ${target}`);
      }
    }
    // Shared behaviour belongs in src/engine/, never in a sibling game.
    expect(offenders).toEqual([]);
  });

  it("the engine does not import games, except the one named test helper", () => {
    // engine/testing/hint-games.ts is the enrollment file every hinting port
    // adds itself to once. Named explicitly rather than exempting the whole
    // engine/testing/ directory, so a second violation cannot hide behind it.
    const ALLOWED = "src/engine/testing/hint-games.ts";
    const offenders: string[] = [];
    for (const [path, text] of modules) {
      if (!path.startsWith("src/engine/") || path === ALLOWED) continue;
      for (const { spec } of imports(text)) {
        const target = resolve(path, spec);
        if (target?.startsWith("src/games/")) offenders.push(`${path} → ${target}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the engine and games import nothing above them", () => {
    // The puzzle engine runs in a worker; a Lit component or dialog reached
    // from a solver would break that and bloat the worker bundle.
    //
    // Stated as an invariant rather than a blocklist. It used to name three
    // directories — screens/, dialogs/, components/ — and it was green for
    // months while 182 files imported `src/puzzle/types.ts`, because
    // `src/puzzle/` was not on the list. A blocklist can only catch the
    // violations its author thought of, and a directory added next year is
    // permitted by default, silently. This one has the opposite default:
    // everything outside the engine's own two directories is a violation, so
    // there is nothing to keep up to date. (`retire-native-directory` D4.)
    //
    // Unlike the rules above this one covers **test files too**. It can afford
    // to: after the same change moved the engine's type vocabulary down and the
    // Comlink adapter up, the violation count including tests is zero, so it
    // lands as a ratchet rather than a wish. The rules above cannot — an engine
    // test legitimately imports the games barrel to populate the registry.
    const OWN = ["src/engine/", "src/games/"];
    const offenders: string[] = [];
    for (const [path, text] of Object.entries(sources).map(
      ([p, t]) => [p.replace(/^\.\//, "src/"), t] as const,
    )) {
      if (!OWN.some((o) => path.startsWith(o))) continue;
      for (const { spec } of imports(text)) {
        const target = resolve(path, spec);
        if (target && !OWN.some((o) => target.startsWith(o))) {
          offenders.push(`${path} → ${target}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("preflight stays inside its Baseline 2023 gate", () => {
    // preflight runs on older browsers to gate the rest of the app, so it may
    // not use top-level await or dynamic import(), and may not import a module
    // that could drag those in.
    //
    // Comments are stripped first. preflight.ts's own header documents the
    // restriction — "no top-level await, dynamic import(), import.meta" — so
    // checking the raw text fails on the prose that states the rule. (knip has
    // the same bug against src/test-setup/icons.ts: a tool reading a comment as
    // code is a recurring shape, not a one-off.)
    const raw = sources["./preflight.ts"];
    expect(raw).toBeTypeOf("string");
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    expect(code).not.toMatch(/\bimport\s*\(/);
    expect(code).not.toMatch(/^\s*await\s/m);
    // `import.meta.env.…` is allowed — vite statically replaces it at build
    // time, so it never reaches the browser. Any *other* import.meta use does.
    expect(code.replace(/\bimport\.meta\.env\b/g, "")).not.toMatch(/\bimport\.meta\b/);
    expect(imports(code).filter((i) => i.spec.startsWith("."))).toEqual([]);
  });
});

describe("import cycles", () => {
  it("has no runtime import cycles", () => {
    const graph = new Map<string, string[]>();
    for (const [path, text] of modules) {
      graph.set(
        path,
        imports(text)
          .filter((i) => i.kind === "value") // type + dynamic edges cannot close a cycle
          .map((i) => resolve(path, i.spec))
          .filter((t): t is string => t !== null),
      );
    }

    const cycles: string[] = [];
    const state = new Map<string, "open" | "done">();
    const stack: string[] = [];
    const walk = (node: string) => {
      const seen = state.get(node);
      if (seen === "done") return;
      if (seen === "open") {
        cycles.push([...stack.slice(stack.indexOf(node)), node].join(" → "));
        return;
      }
      state.set(node, "open");
      stack.push(node);
      for (const next of graph.get(node) ?? []) walk(next);
      stack.pop();
      state.set(node, "done");
    };
    for (const node of graph.keys()) walk(node);

    expect(cycles).toEqual([]);
  });

  it("detects a cycle when one exists", () => {
    // A ratchet at zero is worthless if the detector is broken, and "no cycles
    // found" is indistinguishable from "nothing was checked". This asserts the
    // walk above actually finds a loop, and that a type-only edge breaks one.
    const value = (to: string) => `import { x } from "${to}";`;
    expect(imports(value("./b.ts"))[0]?.kind).toBe("value");
    expect(imports(`import type { X } from "./b.ts";`)[0]?.kind).toBe("type");
    expect(imports(`import { type X, y } from "./b.ts";`)[0]?.kind).toBe("value");
    expect(imports(`import { type X } from "./b.ts";`)[0]?.kind).toBe("type");
    expect(imports(`const m = await import("./b.ts");`)[0]?.kind).toBe("dynamic");
    expect(imports(`import "./b.ts";`)[0]?.kind).toBe("value");
  });
});
