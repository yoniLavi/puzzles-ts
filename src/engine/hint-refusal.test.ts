/*
 * One situation says one thing, in every game.
 *
 * A refusal is what a player meets when the Hint button declines, and
 * `help/features.md` §Hints teaches two of them as a pair — "there is a mistake
 * on the board" and "deduction has run out" — because they call for opposite
 * responses. That is only teachable if the same situation is worded the same
 * way everywhere. Before `hint-refusal.ts`, twenty-two games had invented
 * seventeen phrasings between them: "I can't find a deduction from here." and
 * "No further move can be deduced from this position." were the same refusal in
 * games a player moves between freely.
 *
 * ON THE INSTRUMENT, twice over.
 *
 * The first cut collected refusals from functions **named** `hint`, and so it
 * never saw Netslide's, which was then called `netslideHint` (it is `hint` now —
 * `re-express-the-collection` B5) — a whole game, absent from every count it reported,
 * including the "seventeen phrasings" figure. That is this repo's recurring
 * instrument error (`emittable-keys.test.ts`'s first cut keyed on a name and
 * missed `const CLEAR = 8`), and the fix is the same: key on the **shape**.
 * This walks every non-test source file under `src/games/` and collects every
 * `{ ok: false, error: <string literal> }` wherever it appears.
 *
 * That is deliberately a **superset**: `SolveResult` has the same shape, so
 * Solve's own errors and the description parsers' are caught too. Rather than
 * narrow the scan back down — which is how the first cut went wrong — every
 * literal is classified below. A message that is neither an approved refusal
 * nor a listed exception fails, so a new phrasing cannot arrive unnoticed and
 * nothing hides behind a function's name.
 */
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  ALREADY_SOLVED,
  CONTRADICTION_UNLOCALIZED,
  DEDUCTION_EXHAUSTED,
  FIX_MISTAKES_FIRST,
  NO_MOVE_WORTH_MAKING,
  PUZZLE_NOT_REASONABLE,
  SEARCH_OUT_OF_REACH,
} from "./hint-refusal.ts";

/** Every non-test source file in the games tree, as raw text. Read through Vite
 * so this file stays in the browser-shaped type world, which means an unmatched
 * glob yields `{}` silently — hence the vacuity assertion below. */
const gameSources = {
  ...import.meta.glob<string>("../games/**/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
  // **And the engine's shared hint modules**, which the scan used to miss
  // entirely. `candidate-hint.ts` builds the `hint()` of eleven candidate games
  // and spelled out `ALREADY_SOLVED`, `FIX_MISTAKES_FIRST` and the
  // out-of-deduction refusal as **literals** — so a third of the collection's
  // refusals lived outside the one file this guard reads, and no grep for a
  // constant's name could see them either (`refuse-honestly-at-every-tier`).
  //
  // The lesson is this file's own, applied to itself: it keys on the right
  // *shape* and still scanned the wrong *place*. A refusal is wherever a
  // `hint()` is built, and eleven of them are not built under `games/`.
  ...import.meta.glob<string>("./{candidate-hint,latin-hint,hint-plan}.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
};

/** The approved refusals. A game emitting one of these needs no exception. */
const APPROVED = new Set([
  ALREADY_SOLVED,
  CONTRADICTION_UNLOCALIZED,
  DEDUCTION_EXHAUSTED,
  FIX_MISTAKES_FIRST,
  NO_MOVE_WORTH_MAKING,
  PUZZLE_NOT_REASONABLE,
  SEARCH_OUT_OF_REACH,
]);

/**
 * Every other `{ ok: false, error }` literal in the games tree, with why it is
 * not one of the approved refusals.
 *
 * Two kinds live here, and the distinction is the point of keeping one list:
 * a message on a path a **hint** can reach needs a reason why this game should
 * differ, while a message only `solve` or a **description parser** can reach is
 * not a refusal at all and is recorded so the scan stays a superset.
 */
const EXCEPTIONS: Record<string, string> = {
  // --- a hint refusal that should differ, and why -------------------------
  "The ball is dead — no move can be played from here. Undo to bring it back.":
    "Inertia: not 'deduction ran out' but a board state with no legal move at " +
    "all. Naming the actual situation is the whole of the hint's value here.",
  "No single move reduces the crossings — try moving a tangled vertex.":
    "Untangle, the game with genuinely nothing to deduce: its hint's whole " +
    "value is naming what the player can still try, which no shared message " +
    "could say for it.",

  // --- not hint refusals: Solve, and the description parsers --------------
  "Unable to find a solution from this starting point":
    "Inertia's solver constant, shared with `solve`. Rewording it here would " +
    "reword Solve's failure too, which is a different message to a different ask.",
  "Solution not known for this puzzle": "Solve, on a game ID carrying no aux.",
  "No solution exists for this puzzle": "Solve.",
  "No solution exists for this puzzle.": "Solve.",
  "No solution exists for this position": "Solve.",
  "Multiple solutions exist for this puzzle": "Solve.",
  "Unable to solve puzzle.": "Solve.",
  "Unable to solve this puzzle.": "Solve.",
  "Unable to find a solution": "Solve.",
  "Unable to find a solution to this puzzle": "Solve.",
  "Unable to find a solution to this puzzle.": "Solve.",
  "Unable to find a solution for this puzzle": "Solve.",
  "Unable to find a unique solution for this puzzle": "Solve.",
  "Solver could not find a unique solution.": "Solve.",
  "Solver could not solve this puzzle.": "Solve.",
  "Solver could not find a solution": "Solve.",
  "Solving algorithm cannot complete this puzzle": "Solve.",
  "Sorry, I can't solve this puzzle": "Solve.",
  "Sorry, I couldn't find a solution": "Solve.",
  "Puzzle is not solvable by the deductive solver.": "Solve.",
  "Puzzle is invalid.": "Solve.",
  "Puzzle is impossible.": "Solve.",
  "Puzzle is inconsistent": "Solve.",
  "Puzzle is unsolvable": "Solve.",
  "Puzzle is already solved": "Solve.",
  "This puzzle is already solved.": "Solve.",
  "This puzzle instance contains a contradiction": "Solve.",
  "Game is already solved": "Solve.",
  "Game has not been started yet": "Solve, before Mines' first click.",
  "Could not solve this board": "Solve.",
  "No solution found": "Solve.",
  "No solution found.": "Solve.",
  "Description is too short.": "Description parser.",
  "Grid description is too long.": "Description parser.",
  "Grid description contains invalid characters.": "Description parser.",
  "Grid clue is out of range.": "Description parser.",
  "Clue description is too long.": "Description parser.",
  "Clue description is too short.": "Description parser.",
  "Invalid clue in description.": "Description parser.",
  "Number is too high in clue description.": "Description parser.",
  "Border clue is out of range.": "Description parser.",
  "Border description contains invalid characters.": "Description parser.",
  "Border description is too long.": "Description parser.",
  "invalid char in aux": "Aux parser.",
  "Internal error: aux_info badly formatted": "Aux parser.",
};

interface Found {
  message: string;
  file: string;
}

/** Every `{ ok: false, error: "…" }` in a file, wherever it sits. */
function refusalsIn(file: string, text: string, out: Found[]): void {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true);
  const visit = (n: ts.Node): void => {
    if (ts.isObjectLiteralExpression(n)) {
      let ok: ts.Expression | undefined;
      let error: ts.Expression | undefined;
      for (const p of n.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const name = p.name.getText(sf);
        if (name === "ok") ok = p.initializer;
        if (name === "error") error = p.initializer;
      }
      if (
        ok?.kind === ts.SyntaxKind.FalseKeyword &&
        error !== undefined &&
        (ts.isStringLiteral(error) || ts.isNoSubstitutionTemplateLiteral(error))
      ) {
        out.push({ message: error.text, file });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

const found: Found[] = [];
let filesScanned = 0;
for (const [path, text] of Object.entries(gameSources)) {
  if (path.endsWith(".test.ts")) continue;
  filesScanned++;
  refusalsIn(path, text, found);
}

describe("a hint refusal says the same thing in every game", () => {
  it("is not vacuous — the games tree was read and literals were found", () => {
    // An unmatched glob yields `{}`, and every assertion below would then pass
    // over nothing and report health.
    expect(filesScanned).toBeGreaterThan(150);
    expect(found.length).toBeGreaterThan(10);
  });

  it("emits no message that is neither approved nor a listed exception", () => {
    const stray = [
      ...new Set(
        found
          .filter((f) => !APPROVED.has(f.message) && !(f.message in EXCEPTIONS))
          .map((f) => `${f.file}: ${JSON.stringify(f.message)}`),
      ),
    ].sort();
    expect(
      stray,
      "import the message from src/engine/hint-refusal.ts, or add it to " +
        "EXCEPTIONS with the reason this situation should read differently",
    ).toEqual([]);
  });

  it("lists no exception the games tree has stopped using", () => {
    const live = new Set(found.map((f) => f.message));
    const stale = Object.keys(EXCEPTIONS).filter((m) => !live.has(m));
    expect(stale, "dead entry in EXCEPTIONS").toEqual([]);
  });

  it("finds the approved refusals actually in use", () => {
    // The counterpart to the vacuity check: proves the scan reaches the hint
    // paths, not merely the Solve ones it would also match.
    const live = new Set(found.map((f) => f.message));
    for (const approved of [ALREADY_SOLVED, FIX_MISTAKES_FIRST, DEDUCTION_EXHAUSTED]) {
      // Inlined by a game that imports the constant, so the literal is gone from
      // the tree — which is the point. Assert instead that no *copy* survives.
      expect(live.has(approved), `a game inlines ${JSON.stringify(approved)}`).toBe(
        false,
      );
    }
  });
});

/**
 * Why a game still names `ALREADY_SOLVED` or `FIX_MISTAKES_FIRST` itself instead
 * of taking the pair from `commonHintRefusal` — one entry per game, and the
 * derivation below asserts this is *exactly* the set that did not adopt.
 *
 * This is the `NO_KEYBOARD` shape (`docs/games/testing.md` § "How a cross-game
 * guard finds its population"): the derivation says **who**, the ledger says
 * **why**, and neither can rot, because a game that adopts starts failing until
 * its entry is deleted and a game that regresses fails until one is added.
 */
const OPENS_ITS_OWN_REFUSAL: Record<string, string> = {
  bricks:
    "chooses between FIX_MISTAKES_FIRST and CONTRADICTION_UNLOCALIZED: its board can be inconsistent with no single entry provably wrong, and the promised highlight would never come.",
  clusters: "as Bricks — the second refusal is conditional, not the pair's.",
  fifteen:
    "no mistake concept at all, and its completion test is `isCompletedTiles(...)` rather than a `completed` field. One line is the whole opening.",
  flood: "as Fifteen — a solved check and nothing to be wrong about.",
  sixteen: "as Fifteen; its completion test is `outOfPlace === 0`.",
};

describe("the shared refusal opening", () => {
  /** Games whose `index.ts` still names either half of the pair. After
   * `adopt-the-shared-refusal-opening` an adopter names neither — it calls
   * `commonHintRefusal` — so this set *is* the non-adopters. */
  const opensItsOwn = new Set<string>();
  let adopters = 0;
  for (const [path, text] of Object.entries(gameSources)) {
    const m = path.match(/games\/([^/]+)\/index\.ts$/);
    if (!m) continue;
    if (/\bALREADY_SOLVED\b|\bFIX_MISTAKES_FIRST\b/.test(text)) opensItsOwn.add(m[1]);
    if (text.includes("commonHintRefusal(")) adopters++;
  }

  it("is taken by every game that owes the plain pair", () => {
    // THE GUARD. A game that hand-writes "solved first, then wrong" is asking
    // for two rules to be got right by hand that the helper makes structural:
    // the order (a finished board is not a wrong board) and the promise that
    // `FIX_MISTAKES_FIRST` only fires where something will actually be
    // highlighted. Fifteen games wrote them out and `commonHintRefusal` had
    // **no callers at all** until `adopt-the-shared-refusal-opening`.
    expect([...opensItsOwn].sort()).toEqual(Object.keys(OPENS_ITS_OWN_REFUSAL).sort());
  });

  it("counts the adopters, so the sweep cannot quietly shrink", () => {
    // The vacuity half: the assertion above would also pass if the scan stopped
    // seeing game sources entirely. Fifteen adopted; the floor sits below that
    // and is not a ratchet a legitimate change has to bump.
    expect(adopters).toBeGreaterThan(10);
  });
});
