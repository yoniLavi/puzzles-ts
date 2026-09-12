#!/usr/bin/env node
/**
 * The vacuity guard: a test whose every assertion sits under an `if` must also
 * say how many cases it examined (`build-pipeline`, "The gate rejects an
 * assertion that cannot fail").
 *
 * **Why this exists.** `tidy-the-code-after-the-port` gave every agent one
 * instruction that mattered more than the tidying — plant a defect and check a
 * test goes red — and it found a test that could not fail in thirteen games.
 * Each had been green for months while asserting nothing, because a green test
 * and a vacuous one are the same observation from outside.
 *
 * **What this guard does NOT do, and the measurement that decided it.** The
 * proposal named three shapes. Measured 2026-09-12 against the thirteen tests
 * the pass strengthened, by running each shape over every test file as it stood
 * at the tidy commit's parent and again at the commit:
 *
 * | shape                                   | caught of 13 | hits at HEAD  |
 * | --------------------------------------- | ------------ | ------------- |
 * | both sides of an assertion are one expr | 0            | 5, all sound  |
 * | a bound the type guarantees             | 0            | 11, reviewed  |
 * | every assertion conditional (this one)  | **5**        | 53            |
 *
 * The proposal estimated "perhaps half of the thirteen". It is five, and the
 * ordering of confidence its design gave the three shapes is exactly inverted:
 * the one called "lowest confidence as a defect" is the only one that catches
 * anything.
 *
 * The first two are not built, and the numbers are the reason rather than
 * taste. `expect(roots("same")).toBe(roots("same"))` is not a tautology, it is
 * the assertion that a seed determines a result, and `divvy.test.ts` writes
 * `.not.toBe(roots("different"))` on the very next line; all five hits are that.
 * The single-character `toContain` was already measured and settled by
 * `close-bulk-edit-blind-spots`'s follow-up, which found four of its eighteen
 * sites were not the trap at all — vitest's `toContain` is SUBSTRING on a
 * string but EXACT ELEMENT on an array, so `toContain("1")` against a list of
 * drawn strings is the right assertion — fixed the two real ones and recorded
 * the rest. A guard there would re-litigate a decision already taken, and would
 * need a sixteen-entry ledger on its first run, which is how a guard gets
 * switched off.
 *
 * **The key is "conditional", and both spellings of it count.** `if (…) { … }`
 * and `if (…) continue; / if (…) return;` are the same guard written two ways,
 * and reading only the first is the wrong-key failure `AGENTS.md` § "A scan that
 * keys on a name" describes: it sees four of Sticks' five reason scans and
 * misses the fifth, which is written with `continue`. Widening from one spelling
 * to both took the catch rate from 4 of 13 to 5 and the population from 24 to
 * 53 — recall up, and the list still readable.
 *
 * **It stops before the loop**, and that too is measured rather than chosen. A
 * loop body is the same risk in principle — `import.meta.glob` returning `{}` is
 * exactly this failure — but "every assertion inside a loop" reports **301**
 * sites, nearly all table-driven cases over a literal array that cannot be
 * empty. 301 is a wall, and a wall is a guard nobody keeps. Revisit if a defect
 * is ever traced to an empty collection in a test.
 *
 * **Two exemptions, both derived from the syntax rather than ledgered**
 * (`AGENTS.md` § "Derive the exception from a declaration the game already
 * makes"). An `if`/`else` whose BOTH branches assert is not a vacuity risk,
 * because one of them always runs — that alone separates 24 from the 28 a first
 * pass reported. And a test whose last top-level statement is a `throw` has
 * already written its own vacuity guard in the other available form: the scan
 * `return`s when it finds its case, so reaching the end means it found none, and
 * the test fails. Group's populate-step test was written that way before this
 * guard existed, which is the argument for reading the shape rather than
 * demanding one spelling of it.
 *
 * **What counts as saying how many cases you examined**: one `expect(...)`
 * outside every `if` in the same test. That is deliberately the weakest
 * possible statement of the rule — it does not police *what* is counted — and
 * it is enough, because a test that reaches zero cases then fails on the count
 * instead of passing on nothing.
 *
 * **The ledger is two entries out of 53**, and both are in one file: 51 of the
 * sites this guard found on its first run were fixed rather than excused. It is
 * keyed on the test's TITLE, not its line, because a line-keyed ledger goes
 * stale the first time anything above it moves, and a ledger that rots is the
 * skip list this one exists not to be.
 *
 * Usage: `node scripts/checks/vacuous-assertions.mjs`. Exit 1 on any report.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

/**
 * Tests whose assertions are all conditional and which legitimately cannot
 * count what they examined, each with the reason. Asserted EXACTLY equal to the
 * guard's findings, so an entry that stops being needed fails the gate as
 * loudly as a new offender.
 *
 * @type {Record<string, string>}
 */
const SCANS_FOR_A_CASE = {
  "src/engine/difficulty-contract.test.ts :: either generates every declared tier, or refuses it with a reason":
    "it speaks only about a tier that FAILS to generate, and every tier " +
    "generating is the healthy state — a count floor here would demand a " +
    "broken game.",
  "src/engine/difficulty-contract.test.ts :: deals boards that need the tier the preset claims":
    "it already asserts its count, under the `nonMonotone` exemption a " +
    "non-monotone game has no lowest cap to compare against; and the " +
    "sweep-wide floor `boardsThatBound > 50` in the next describe block is the " +
    "half this guard cannot see, because it spans tests.",
};

/** Below these the input is broken rather than the tree clean. */
const FLOORS = { files: 200, tests: 3000 };

const fail = (msg) => {
  console.error(`vacuous-assertions: ${msg}`);
  process.exit(1);
};

/** Does any `expect(...)` call appear anywhere under this node? */
function asserts(node) {
  let seen = false;
  const walk = (n) => {
    if (
      !seen &&
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "expect"
    )
      seen = true;
    if (!seen) ts.forEachChild(n, walk);
  };
  if (node) walk(node);
  return seen;
}

/**
 * `if (…) continue;` / `if (…) return;` — a guard that skips the rest of its
 * block. A `throw` is deliberately NOT one: it fails the test rather than
 * quietly passing it, which is the whole difference.
 */
function isEarlyOutGuard(st) {
  if (!ts.isIfStatement(st) || st.elseStatement) return false;
  const t = st.thenStatement;
  const only = ts.isBlock(t) ? (t.statements.length === 1 ? t.statements[0] : null) : t;
  return (
    only != null &&
    (ts.isContinueStatement(only) ||
      (ts.isReturnStatement(only) && only.expression === undefined))
  );
}

/**
 * Exported so the catch-rate measurement can run the SHIPPED rule over historical
 * file contents rather than a paraphrase of it; a measurement of a copy of the
 * guard measures the copy (`AGENTS.md` § "check the instrument before the
 * finding").
 *
 * @returns {{line: number, title: string, count: number}[]} one entry per test
 * whose every assertion sits under a non-exhaustive `if`.
 */
export function offendersIn(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found = [];
  let tests = 0;

  const eachTest = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === "it" || node.expression.text === "test") &&
      node.arguments.length >= 2 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      (ts.isArrowFunction(node.arguments[1]) ||
        ts.isFunctionExpression(node.arguments[1]))
    ) {
      tests++;
      const title = node.arguments[0].text;
      let total = 0;
      let guarded = 0;
      const walk = (n, underIf) => {
        if (
          ts.isCallExpression(n) &&
          ts.isIdentifier(n.expression) &&
          n.expression.text === "expect"
        ) {
          total++;
          if (underIf) guarded++;
        }
        if (ts.isIfStatement(n)) {
          // One branch of an if/else that asserts on both sides always runs.
          const exhaustive =
            n.elseStatement != null &&
            asserts(n.thenStatement) &&
            asserts(n.elseStatement);
          walk(n.expression, underIf);
          const inner = underIf || !exhaustive;
          ts.forEachChild(n.thenStatement, (c) => walk(c, inner));
          if (n.elseStatement) ts.forEachChild(n.elseStatement, (c) => walk(c, inner));
          return;
        }
        // `if (…) continue;` and `if (…) return;` are the same guard written
        // the other way round: everything after one in the same block runs only
        // when the condition did not hold. Reading only the `if` spelling would
        // see four of Sticks' five scans and miss the fifth.
        if (ts.isBlock(n) || ts.isSourceFile(n)) {
          let skipped = underIf;
          for (const st of n.statements) {
            walk(st, skipped);
            if (isEarlyOutGuard(st)) skipped = true;
          }
          return;
        }
        ts.forEachChild(n, (c) => walk(c, underIf));
      };
      walk(node.arguments[1], false);
      const body = node.arguments[1].body;
      const last =
        body && ts.isBlock(body)
          ? body.statements[body.statements.length - 1]
          : undefined;
      const endsInThrow = last != null && ts.isThrowStatement(last);
      if (total > 0 && guarded === total && !endsInThrow)
        found.push({
          line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          title,
          count: total,
        });
    }
    ts.forEachChild(node, eachTest);
  };
  eachTest(sf);
  return { found, tests };
}

/**
 * The guard proves itself on every run, rather than having been proved once by
 * somebody who then deleted the evidence. `AGENTS.md` § "Method" requires a new
 * guard be seen failing before it is trusted, and a guard *about* tests that
 * cannot fail has no business being one. Seven fixtures, one parse each, ~1 ms.
 *
 * It also pins the two derived exemptions, which is the part most likely to be
 * loosened by accident: a wrong `exhaustive` or `endsInThrow` would silently
 * turn the whole guard off and the scan below would still print a cheerful ✓.
 */
const SELF_TEST = [
  [
    "every assertion under an `if`",
    'it("t", () => { for (const x of xs) { if (x.k === "a") expect(x.v).toBe(1); } });',
    true,
  ],
  [
    "`if (…) continue;` guard",
    'it("t", () => { for (const x of xs) { if (x.k !== "a") continue; expect(x.v).toBe(1); } });',
    true,
  ],
  [
    "`if (…) return;` guard",
    'it("t", () => { const s = solve(); if (!s) return; expect(s.ok).toBe(true); });',
    true,
  ],
  [
    "a counted scan",
    'it("t", () => { let n = 0; for (const x of xs) { if (x.k === "a") { expect(x.v).toBe(1); n++; } } expect(n).toBeGreaterThan(0); });',
    false,
  ],
  [
    "a scan ending in `throw`",
    'it("t", () => { for (const x of xs) { if (x.k === "a") { expect(x.v).toBe(1); return; } } throw new Error("none"); });',
    false,
  ],
  [
    "an exhaustive if/else",
    'it("t", () => { if (a) expect(x).toBe(1); else expect(x).toBe(2); });',
    false,
  ],
  ["an unconditional assertion", 'it("t", () => { expect(f()).toBe(1); });', false],
];

for (const [name, src, shouldReport] of SELF_TEST) {
  const reported = offendersIn("self-test.test.ts", src).found.length > 0;
  if (reported !== shouldReport)
    fail(
      `self-test: "${name}" — the rule ${reported ? "reported" : "stayed silent"}, ` +
        `and it should have ${shouldReport ? "reported" : "stayed silent"}. ` +
        "The guard is not measuring what it claims; fix it before trusting this run.",
    );
}

// --- The scan. Skipped on import, so the measurement can reuse the rule. ---

if (!process.argv[1]?.endsWith("vacuous-assertions.mjs")) {
  // imported for `offendersIn` only
} else {
  const files = execFileSync("git", ["ls-files", "-z", "*.test.ts"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);

  if (files.length < FLOORS.files)
    fail(
      `listed only ${files.length} test files (floor ${FLOORS.files}) — the listing is broken`,
    );

  /**
   * `file :: test title` -> where to find it. **Keyed on the title, not the
   * line**, because a ledger keyed on a line number goes stale the first time
   * anything above it is edited, and a ledger that rots is the skip list this
   * one exists not to be.
   */
  const offenders = new Map();
  let tests = 0;
  for (const file of files) {
    const r = offendersIn(file, readFileSync(file, "utf8"));
    tests += r.tests;
    for (const o of r.found)
      offenders.set(
        `${file} :: ${o.title}`,
        `line ${o.line}, all ${o.count} assertion(s)`,
      );
  }

  if (tests < FLOORS.tests)
    fail(
      `parsed only ${tests} tests (floor ${FLOORS.tests}) — the parse stopped matching`,
    );

  // --- The verdict, in both directions. ---

  const keys = [...offenders.keys()].sort();
  const unledgered = keys.filter((k) => !(k in SCANS_FOR_A_CASE));
  const stale = Object.keys(SCANS_FOR_A_CASE)
    .filter((k) => !offenders.has(k))
    .sort();

  if (unledgered.length) {
    console.error(
      `vacuous-assertions: ${unledgered.length} test(s) assert only inside an \`if\` and never say how many cases they examined:`,
    );
    for (const k of unledgered) console.error(`  ${k}: ${offenders.get(k)}`);
    console.error(
      "  Count what the `if` matched and assert the count outside it, so a fixture that",
    );
    console.error(
      "  stops producing the case fails instead of passing over nothing. If the test",
    );
    console.error(
      "  genuinely cannot count, add it to SCANS_FOR_A_CASE in this file with the reason.",
    );
    process.exit(1);
  }

  if (stale.length) {
    console.error(
      `vacuous-assertions: ${stale.length} ledger entr(ies) no longer earn a place:`,
    );
    for (const k of stale) console.error(`  ${k} — no longer reported`);
    console.error("  Delete it; the ledger is exact, not a skip list.");
    process.exit(1);
  }

  console.log(
    `✓ vacuous-assertions: ${tests} tests across ${files.length} files, ` +
      `${keys.length} conditional-only and ledgered.`,
  );
}
