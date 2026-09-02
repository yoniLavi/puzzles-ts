/**
 * Calibrate madge's circular-dependency report down to RUNTIME cycles.
 *
 * madge reports import edges. It does not know that `verbatimModuleSyntax`
 * erases `import type`, so it counts a cycle that exists only in the type graph
 * — and moving a shared type behind `import type` is the *standard resolution*
 * for a module cycle. An uncalibrated count therefore reports the fix as the
 * problem: measured 2026-08-01, raw 20 against 1 genuine runtime cycle, with all
 * sixteen per-game `index ↔ render` pairs being `render.ts` importing nothing
 * from `index.ts` but the game's hint type.
 *
 * A cycle survives calibration only if EVERY edge around it carries at least one
 * value binding. One type-only edge is enough to break the runtime cycle.
 *
 * Usage: node scripts/metrics-cycles.mjs <madge-circular-output.txt>
 * Exits 1 if any runtime cycle is found, so it can serve as a ratchet.
 */
import fs from "node:fs";
import path from "node:path";

const SRC = "src";

/** Resolve a madge-reported module path (relative to `src/`) to a real file. */
function resolveModule(rel) {
  const base = path.join(SRC, rel);
  for (const candidate of [base, `${base}.ts`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Does `fromFile` import any *value* from the module `toFile` denotes?
 *
 * Returns "value" | "type-only" | "none". An import is type-only when it is
 * `import type ...` or when every named binding is `type`-prefixed; a default or
 * namespace import is always a value edge.
 *
 * Specifiers are resolved to real paths and compared as paths — NOT by matching
 * basenames. Basename matching silently returns "none" whenever its heuristic
 * misses (e.g. `./index.ts`, whose basename is the useless "index"), and a
 * "none" on an edge madge reports is indistinguishable from a type-only edge.
 * That would make the calibration under-report runtime cycles, which is the one
 * direction it must never fail in. `none` is now an instrument failure and is
 * reported as such by the caller.
 */
export function edgeKind(fromFile, toFile) {
  const src = fs.readFileSync(fromFile, "utf8");
  const fromDir = path.dirname(fromFile);
  const target = path.resolve(toFile);

  /** Does this specifier denote `toFile`? */
  const hits = (spec) => {
    if (!spec.startsWith(".")) return false; // bare specifier: never one of our files
    const resolved = resolveModule(path.relative(SRC, path.resolve(fromDir, spec)));
    return resolved !== null && path.resolve(resolved) === target;
  };

  let verdict = "none";

  // Dynamic `import("…")` — a real dependency, but evaluated at call time rather
  // than module-init time, so it CANNOT close an initialization cycle. That is
  // the hazard this metric exists to find, so a dynamic edge breaks the loop.
  // (Recorded explicitly rather than ignored: the dependency is real, and a
  // reader comparing against madge's raw count needs to see where it went.)
  for (const m of src.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    if (hits(m[1])) verdict = "dynamic";
  }

  // Side-effect-only `import "…";` — no bindings, but the module is evaluated
  // for its effects (here, custom-element registration). A value edge.
  for (const m of src.matchAll(/^\s*import\s+["']([^"']+)["']\s*;?/gm)) {
    if (hits(m[1])) return "value";
  }

  const re = /import\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  for (const m of src.matchAll(re)) {
    if (!hits(m[3])) continue;

    if (m[1]) {
      // `import type { … } from` — wholly erased.
      if (verdict === "none") verdict = "type-only";
      continue;
    }
    const clause = m[2].trim();
    const braced = clause.match(/\{([\s\S]*)\}/);
    if (!braced) {
      // default or namespace import: always a value edge.
      verdict = "value";
      continue;
    }
    const bindings = braced[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const hasValue = bindings.some((b) => !/^type\s/.test(b));
    if (hasValue) verdict = "value";
    else if (verdict === "none") verdict = "type-only";
  }
  return verdict;
}

const raw = fs.readFileSync(process.argv[2], "utf8");
const cycles = [];
for (const line of raw.split("\n")) {
  const m = /^\s*\d+\)\s*(.+)$/.exec(line);
  if (!m) continue;
  cycles.push(m[1].split(">").map((s) => s.trim()));
}

const runtime = [];
const erased = [];
for (const nodes of cycles) {
  const files = nodes.map(resolveModule);
  if (files.some((f) => f === null)) {
    // Cannot classify — report it rather than silently dropping it. A metric
    // that quietly discards what it fails to parse reads as a clean bill.
    runtime.push({ nodes, note: "unresolvable module path — not classified" });
    continue;
  }
  const edges = files.map((f, i) => edgeKind(f, files[(i + 1) % files.length]));
  if (edges.includes("none")) {
    // madge saw an edge this classifier cannot find. Treating that as "erased"
    // would under-report runtime cycles — the one direction this must not fail
    // in — so surface it as unclassified and fail the ratchet.
    runtime.push({
      nodes,
      edges,
      note: "UNCLASSIFIED edge — classifier missed an import madge found",
    });
    continue;
  }
  (edges.every((e) => e === "value") ? runtime : erased).push({ nodes, edges });
}

console.log(`raw cycles reported by madge: ${cycles.length}`);
console.log(`erased at build time (>=1 type-only edge): ${erased.length}`);
console.log(`RUNTIME cycles: ${runtime.length}`);
console.log("");
for (const c of runtime) {
  console.log(`RUNTIME  ${c.nodes.join(" > ")}${c.note ? `  [${c.note}]` : ""}`);
}
if (erased.length) {
  console.log("");
  console.log("--- erased (type-only somewhere in the loop) ---");
  for (const c of erased)
    console.log(`  ${c.nodes.join(" > ")}  [${c.edges.join(", ")}]`);
}

process.exitCode = runtime.length === 0 ? 0 : 1;
