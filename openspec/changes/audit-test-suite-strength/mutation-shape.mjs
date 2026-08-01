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
console.log(
  `${pad("module", 24)}${pad("killed", 8)}${pad("surv", 6)}${pad("nocov", 7)}${pad("t/o", 5)}${pad("err", 5)}killed-by-own-tests`,
);
for (const r of rows.sort((a, b) => a.src.localeCompare(b.src))) {
  const k = r.counts.Killed ?? 0;
  const own =
    k === 0 ? "—" : `${r.localKill}/${k} (${Math.round((100 * r.localKill) / k)}%)`;
  console.log(
    pad(base(r.src), 24) +
      pad(k, 8) +
      pad(r.counts.Survived ?? 0, 6) +
      pad(r.counts.NoCoverage ?? 0, 7) +
      pad(r.counts.Timeout ?? 0, 5) +
      pad(r.counts.RuntimeError ?? r.counts.CompileError ?? 0, 5) +
      own,
  );
}

console.log(`\n## Survivors and uncovered mutants (${survivors.length})\n`);
for (const s of survivors.sort(
  (a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0),
)) {
  console.log(
    `- ${base(s.file)}:${s.line} [${s.status}, ${s.mutator}, covered by ${s.coveredBy} tests] -> ${s.replacement}`,
  );
}
