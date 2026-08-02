// Turn a Stryker JSON report into the result this audit actually wants.
//
// The score is not the deliverable — "where do survivors cluster, and where do
// the guarantees live" is. Two questions:
//
//   1. Per mutated module: killed / survived / no-coverage / timeout.
//   2. For each KILLED mutant, was it killed by the module's OWN test file, or
//      only by a distant consumer? A module whose semantics are pinned solely
//      by a game three layers away is covered but has no local feedback — the
//      `deduction-fixpoint` grade finding in findings.md §3 is that shape, and
//      this counts how common it is.
//
// Usage: node mutation-shape.mjs <report.json>
import { readFileSync } from "node:fs";

const report = JSON.parse(readFileSync(process.argv[2], "utf8"));

/** testId -> the test file it lives in. */
const testFileOf = new Map();
for (const [file, entry] of Object.entries(report.testFiles ?? {})) {
  for (const t of entry.tests ?? []) testFileOf.set(t.id, file);
}

const base = (p) => p.replace(/^.*\//, "");
/** `src/native/engine/dsf.ts` -> `dsf` */
const stem = (p) => base(p).replace(/\.ts$/, "");
/** Does this test file belong to the module under mutation? */
const isOwnTest = (src, test) =>
  test !== undefined && base(test).replace(/\.test\.ts$/, "") === stem(src);

const rows = [];
const survivors = [];
for (const [src, entry] of Object.entries(report.files ?? {})) {
  const counts = {};
  let localKill = 0;
  let distantKill = 0;
  for (const m of entry.mutants ?? []) {
    counts[m.status] = (counts[m.status] ?? 0) + 1;
    if (m.status === "Killed") {
      const killers = (m.killedBy ?? []).map((id) => testFileOf.get(id));
      if (killers.some((k) => isOwnTest(src, k))) localKill++;
      else distantKill++;
    }
    if (m.status === "Survived" || m.status === "NoCoverage") {
      survivors.push({
        file: src,
        line: m.location?.start?.line,
        mutator: m.mutatorName,
        replacement: (m.replacement ?? "").replace(/\s+/g, " ").slice(0, 90),
        status: m.status,
        coveredBy: (m.coveredBy ?? []).length,
      });
    }
  }
  rows.push({ src, counts, localKill, distantKill });
}

const pad = (s, n) => String(s).padEnd(n);
console.log("## Per-module outcome\n");
// Every status the schema defines gets a column, and the columns are asserted to
// sum to the mutant count. `ignoreStatic: true` reports the 836 module-scope
// mutants as "Ignored" — a status my first cut had no column for, which would
// have made the audit's own deliberate gap vanish from the audit's own table.
const STATUSES = [
  "Killed",
  "Survived",
  "NoCoverage",
  "Timeout",
  "Ignored",
  "RuntimeError",
  "CompileError",
  "Pending",
];
console.log(
  pad("module", 24) +
    STATUSES.map((s) => pad(s.toLowerCase().slice(0, 9), 11)).join("") +
    pad("total", 7) +
    "killed-by-own-tests",
);
for (const r of rows.sort((a, b) => a.src.localeCompare(b.src))) {
  const k = r.counts.Killed ?? 0;
  const own =
    k === 0 ? "—" : `${r.localKill}/${k} (${Math.round((100 * r.localKill) / k)}%)`;
  const shown = STATUSES.reduce((n, st) => n + (r.counts[st] ?? 0), 0);
  const all = Object.values(r.counts).reduce((n, v) => n + v, 0);
  if (shown !== all) {
    const missing = Object.keys(r.counts).filter((st) => !STATUSES.includes(st));
    throw new Error(`unaccounted mutant status in ${r.src}: ${missing.join(", ")}`);
  }
  console.log(
    pad(base(r.src), 24) +
      STATUSES.map((st) => pad(r.counts[st] ?? 0, 11)).join("") +
      pad(all, 7) +
      own,
  );
}

// Triage is over *classes*, not instances: 293 survivors walked in file order is
// unmanageable, but "every StringLiteral mutant in this module's error messages"
// is one decision. Group by (module, mutator) first, then list.
console.log(
  `\n## Survivor clusters by (module, mutator) — triage these, not the list\n`,
);
const clusters = new Map();
for (const s of survivors) {
  const key = `${base(s.file)}\t${s.mutator}\t${s.status}`;
  const c = clusters.get(key) ?? { n: 0, lines: [] };
  c.n++;
  if (c.lines.length < 6) c.lines.push(s.line);
  clusters.set(key, c);
}
console.log(
  `${pad("module", 24)}${pad("mutator", 26)}${pad("status", 12)}${pad("n", 5)}example lines`,
);
for (const [key, c] of [...clusters].sort((a, b) => b[1].n - a[1].n)) {
  const [f, m, st] = key.split("\t");
  console.log(pad(f, 24) + pad(m, 26) + pad(st, 12) + pad(c.n, 5) + c.lines.join(", "));
}

console.log(`\n## Survivors and uncovered mutants (${survivors.length})\n`);
for (const s of survivors.sort(
  (a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0),
)) {
  console.log(
    `- ${base(s.file)}:${s.line} [${s.status}, ${s.mutator}, covered by ${s.coveredBy} tests] -> ${s.replacement}`,
  );
}
