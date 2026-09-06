/**
 * One note-taking vocabulary: **a game's candidate marks live in `pencil`**.
 *
 * Thirteen games keep the player's provisional per-cell candidates in a typed
 * array, and they spelled it three ways — `pencil` (7), `marks` (5), `pencils`
 * (1). The engine had already committed to the word everywhere else it speaks:
 * `Ui.pencilMode`, `pencilSticky`, `pencilKeepHighlight`, `pencil-prefs.ts`,
 * `pencil-indicator.ts`, the `pencilAll`/`pencilStrike` move vocabulary. Only
 * the field the marks actually live in disagreed.
 *
 * **What it cost while it disagreed**, which is the argument for the guard
 * rather than for the rename: `mark-all.test.ts` carried ten hand-written rows,
 * one per game, whose entire job was to say *where this game's notes are* — the
 * last per-game roster in the cross-game guards. It is derived now
 * (`unify-the-note-taking-vocabulary`).
 *
 * ON THE INSTRUMENT. This forbids the **retired spellings as a typed-array field
 * declaration**, rather than trying to enumerate the games that have notes.
 * There is no runtime signal for "this array holds candidates" — the population
 * is not derivable, only the violation is, so the scan keys on the shape of a
 * declaration and the exception is ledgered. That is also why the scan is not a
 * bare name match: `marks` is a live and correct word elsewhere (`HintMarks`,
 * the `pencilStrike` move's `marks`, a `Mark[]`), and a name-keyed sweep would
 * convict all of it.
 */
import { describe, expect, it } from "vitest";

/** Spellings a game may no longer give a candidate-notes array. */
const RETIRED = ["marks", "pencils"];

/**
 * Typed-array fields that carry one of the retired words legitimately, because
 * they are **not candidate notes**, with the reason.
 *
 * Pearl is the one. Its `marks` are the player's *no-line* marks on a cell's
 * four edges (`R|U|L|D` bits) — the "this edge is definitely empty" annotation,
 * which is Loopy's `LINE_NO` rather than a candidate set. Applying this
 * convention's own test: we can say exactly what Pearl would want to do
 * differently, so it keeps its word.
 */
const NOT_CANDIDATE_NOTES: Record<string, string> = {
  "../games/pearl/state.ts":
    "no-line marks on a cell's four edges (R|U|L|D bits), not a candidate set",
};

/**
 * A **solver's** own candidate scratch is out of scope, as a rule rather than as
 * three ledger entries.
 *
 * The convention is about where *the player's* notes live — the array a pencil
 * press writes, Mark-all fills and the renderer draws. A solver's working
 * candidate set is a different object with a different lifetime, and in a game
 * with no note-taking at all (Ascent) it is the only one there is; naming it
 * `pencil` would claim a player-facing affordance the game does not offer.
 *
 * Stated as a path rule so it cannot rot the way an enumerated roster would: a
 * new game's solver is covered the day it lands, without anyone adding it.
 */
const isSolver = (path: string): boolean => /\/[a-z-]*solver\.ts$/.test(path);

const sources = import.meta.glob<string>("../games/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** A field declaration binding one of the retired words to a typed array. */
const DECLARATION = new RegExp(
  `^\\s*(?:readonly\\s+)?(${RETIRED.join("|")})\\??\\s*:\\s*(?:Int8|Uint8|Int16|Uint16|Int32|Uint32)Array\\b`,
);

describe("one note-taking vocabulary", () => {
  it("read the games tree, so the scan below is not vacuous", () => {
    // An unmatched glob yields `{}` and every assertion here passes over nothing.
    expect(Object.keys(sources).length).toBeGreaterThan(300);
    // And the pattern matches the shape it claims to: prove it on a line that
    // must fail, so a regex broken by an edit cannot report a clean tree.
    expect(DECLARATION.test("  readonly marks: Int32Array;")).toBe(true);
    expect(DECLARATION.test("  pencil: Int32Array;")).toBe(false);
    expect(DECLARATION.test("  marks: Mark[];")).toBe(false);
    // And the solver rule matches solvers and nothing else.
    expect(isSolver("../games/mathrax/solver.ts")).toBe(true);
    expect(isSolver("../games/crossing/hint-solver.ts")).toBe(true);
    expect(isSolver("../games/seismic/state.ts")).toBe(false);
  });

  it("holds every game's candidate notes under one field name", () => {
    const offenders: string[] = [];
    for (const [path, src] of Object.entries(sources)) {
      if (path.includes(".test.") || isSolver(path)) continue;
      if (path in NOT_CANDIDATE_NOTES) continue;
      for (const [i, line] of src.split("\n").entries())
        if (DECLARATION.test(line)) offenders.push(`${path}:${i + 1}  ${line.trim()}`);
    }
    expect(
      offenders,
      "a game declares its candidate notes under a retired spelling — call it " +
        "`pencil`, or ledger it in NOT_CANDIDATE_NOTES if it is not a candidate set",
    ).toEqual([]);
  });

  it("keeps the ledger honest — no stale or vacuous entry", () => {
    for (const [path, why] of Object.entries(NOT_CANDIDATE_NOTES)) {
      const src = sources[path];
      expect(src, `${path} is ledgered here but no longer exists`).toBeDefined();
      expect(
        src?.split("\n").some((l) => DECLARATION.test(l)),
        `${path} no longer declares a retired spelling — delete its entry`,
      ).toBe(true);
      expect(why.length, `${path}'s exemption states no reason`).toBeGreaterThan(30);
    }
  });
});
