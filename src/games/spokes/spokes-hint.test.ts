/**
 * Spokes hint tests — the deduction narrated by each rung, the multi-leg
 * journey a saturated hub becomes, the contradiction look-ahead, the refusal
 * paths, and a tier-2.5 render frame (including a diagonal hint, the
 * corner-invalidation case).
 *
 * Cross-game guarantees (necessity voice, overlay-reaches-cache, solve-from-any
 * position, recompute-stability, no-op-free plans) come free from Spokes'
 * enrollment in `engine/testing/hint-games.ts`; what lives here is everything
 * game-specific — that each rung fires the move the unique solution agrees with,
 * and that its narration states the premise the move actually rests on.
 */

import { describe, expect, it } from "vitest";
import { randomNew } from "../../engine/random/index.ts";
import {
  DEFAULT_BACKGROUND,
  renderScenario,
} from "../../engine/testing/render-scenario.ts";
import { seedBudget } from "../../engine/testing/slow.ts";
import { newSpokesDesc } from "./generator.ts";
import { type SpokesHint, spokesGame } from "./index.ts";
import { COL_HINT, COL_HINT_CELL } from "./render.ts";
import {
  deduceSpokesPlan,
  type SpokesFiring,
  type SpokesFiringKind,
  spokesSolve,
} from "./solver.ts";
import {
  clearBoard,
  cloneBoard,
  cloneState,
  DIFF_EASY,
  DIFF_HARD,
  DIFF_TRICKY,
  DIFFCOUNT,
  getSpoke,
  newState,
  SPOKE_DIRS,
  SPOKE_LINE,
  type SpokesBoard,
  type SpokesParams,
  type SpokesState,
  spokesCount,
  spokesPlace,
  syncDiagonalBlock,
} from "./state.ts";

/** Lines drawn out of a hub — for the goal-oriented "no useless mark" test. */
function linesDrawn(b: SpokesBoard, i: number): number {
  return spokesCount(b.spokes[i], SPOKE_LINE);
}

/** Apply a firing's forced spokes to a board exactly as the game does — with
 * the crossing auto-block — so a test walk matches production progression. */
function applyForced(
  b: SpokesBoard,
  forced: readonly { index: number; dir: number; state: number }[],
): void {
  for (const { index, dir, state } of forced) {
    const old = getSpoke(b.spokes[index], dir);
    spokesPlace(b, index, dir, state);
    syncDiagonalBlock(b, index, dir, old, state);
  }
}

const EASY: SpokesParams = { w: 4, h: 4, diff: "easy" };
const TRICKY: SpokesParams = { w: 4, h: 4, diff: "tricky" };
/** The top tier, `Unreasonable` in the menu and `"hard"` in the params. Used
 * below as a *board* selector, never as
 * a rung selector: its own rung is unreachable from the hint by design, which
 * the last test in this file proves rather than assumes. */
const UNREASONABLE: SpokesParams = { w: 4, h: 4, diff: "hard" };

/** The unique solution as a board (the same one `hint`/`findMistakes` use). */
function solutionOf(state: SpokesState) {
  const b = cloneBoard(state);
  clearBoard(b);
  expect(spokesSolve(b, null, DIFFCOUNT)).toBe("valid");
  return b;
}

/**
 * Drive a generated board with the deductive plan until the first firing of
 * `kind` is what the hint would offer next, and return that mid-game state plus
 * the firing. Scans seeds until one is found (every board is fully deducible,
 * so a kind that a difficulty uses turns up quickly).
 */
function findFiring(
  preset: SpokesParams,
  kind: SpokesFiringKind,
  maxSeeds = 250,
): { state: SpokesState; firing: SpokesFiring } | null {
  for (let seed = 0; seed < maxSeeds; seed++) {
    const { desc } = newSpokesDesc(
      preset,
      randomNew(`hint-${preset.diff}-${kind}-${seed}`),
    );
    const base = newState(preset, desc);
    const board = cloneBoard(base);
    for (let guard = 0; guard < 600; guard++) {
      const plan = deduceSpokesPlan(board);
      if (plan.length === 0) break;
      const f = plan[0];
      if (f.kind === kind) {
        const state = cloneState(base);
        state.spokes.set(board.spokes);
        return { state, firing: f };
      }
      applyForced(board, f.forced);
    }
  }
  return null;
}

/** `hint()` steps for a state, asserting it did not refuse. */
function hintSteps(state: SpokesState) {
  const res = spokesGame.hint?.(state);
  if (!res?.ok)
    throw new Error(`hint refused: ${res && !res.ok ? res.error : "no hint"}`);
  return res.steps;
}

// --- each rung's forced move agrees with the unique solution ----------------

describe("each rung forces the move the solution agrees with", () => {
  const cases: [SpokesFiringKind, SpokesParams][] = [
    ["twoOnes", EASY],
    ["saturation", EASY],
    ["exhaustion", EASY],
    ["contradiction", UNREASONABLE],
  ];

  for (const [kind, preset] of cases) {
    it(`${kind}: every forced spoke matches the solution`, () => {
      const found = findFiring(preset, kind);
      expect(found, `no ${kind} firing found`).not.toBeNull();
      if (!found) return;
      const solution = solutionOf(found.state);
      for (const sp of found.firing.forced) {
        const inSolution = getSpoke(solution.spokes[sp.index], sp.dir);
        // A forced LINE must be a line in the solution; a forced MARK must not.
        if (sp.state === SPOKE_LINE) {
          expect(inSolution).toBe(SPOKE_LINE);
        } else {
          expect(inSolution).not.toBe(SPOKE_LINE);
        }
      }
    });
  }
});

// --- narration: the premise the move rests on -------------------------------

describe("narration states the premise, in the necessity voice", () => {
  it("two-ones names the isolation it prevents, tersely", () => {
    const found = findFiring(EASY, "twoOnes");
    expect(found).not.toBeNull();
    if (!found) return;
    const text = hintSteps(found.state)[0].explanation;
    expect(text).toMatch(/two 1-hubs/);
    expect(text).toMatch(/strand/);
    expect(text).toMatch(/rule out this spoke/);
    expect(text.length).toBeLessThan(120);
  });

  it("saturation cites the count that forces the free spokes to lines", () => {
    const found = findFiring(EASY, "saturation");
    expect(found).not.toBeNull();
    if (!found) return;
    const text = hintSteps(found.state)[0].explanation;
    expect(text).toMatch(/free spoke/);
    expect(text).toMatch(/must (?:be a line|all be lines)/);
    expect(text.length).toBeLessThan(120);
  });

  it("exhaustion says the hub is done and rules out the rest", () => {
    const found = findFiring(EASY, "exhaustion");
    expect(found).not.toBeNull();
    if (!found) return;
    const text = hintSteps(found.state)[0].explanation;
    expect(text).toMatch(/already has all its lines/);
    expect(text).toMatch(/[Rr]ule them out/);
    expect(text.length).toBeLessThan(120);
  });

  it("contradiction states the hypothesis and the break it reaches", () => {
    const found = findFiring(UNREASONABLE, "contradiction");
    expect(found).not.toBeNull();
    if (!found) return;
    const step = hintSteps(found.state)[0];
    expect(step.explanation).toMatch(/^(?:Drawing this line|Ruling this out)/);
    expect(step.explanation).toMatch(/(?:over-fill|force two diagonals|strand)/);
    expect(step.explanation).toMatch(/(?:rule it out|must be a line)/);
    // The break it names is ringed as evidence (words and picture agree).
    expect(found.firing.breakKind).toBeDefined();
    expect((step.highlights as SpokesHint).evidence.length).toBeGreaterThan(0);
    expect(step.explanation.length).toBeLessThan(120);
  });
});

// --- goal-oriented: no useless rule-outs ------------------------------------

describe("hints only rule out a spoke when it helps a hub still needing lines", () => {
  it("never marks a spoke whose both hubs are already satisfied", () => {
    // Across many boards, walk the whole plan and assert every rule-out touches
    // at least one hub that still needs lines.
    //
    // The seed count is a confidence dial, not a threshold: a rule that emitted
    // useless rule-outs would do so on nearly every board, so the gate's 8 seeds
    // (× 3 difficulties = 24 full plan walks) catch a systematic violation just
    // as surely as 60 did — at 238 s, this one test was **20% of the entire
    // suite**. `npm run test:slow` still scans all 60 for the rare case.
    for (let seed = 0; seed < seedBudget(8, 60); seed++) {
      for (const preset of [EASY, TRICKY, UNREASONABLE]) {
        const { desc } = newSpokesDesc(
          preset,
          randomNew(`useful-${preset.diff}-${seed}`),
        );
        const base = newState(preset, desc);
        const board = cloneBoard(base);
        for (let guard = 0; guard < 600; guard++) {
          const plan = deduceSpokesPlan(board);
          if (plan.length === 0) break;
          const f = plan[0];
          for (const sp of f.forced) {
            if (sp.state === SPOKE_LINE) continue; // a connection always helps
            const nx = (sp.index % board.w) + SPOKE_DIRS[sp.dir].dx;
            const ny = ((sp.index / board.w) | 0) + SPOKE_DIRS[sp.dir].dy;
            const j = ny * board.w + nx;
            const aNeeds = linesDrawn(board, sp.index) < board.numbers[sp.index];
            const bNeeds =
              nx >= 0 &&
              nx < board.w &&
              ny >= 0 &&
              ny < board.h &&
              board.numbers[j] > 0 &&
              linesDrawn(board, j) < board.numbers[j];
            expect(
              aNeeds || bNeeds,
              `${preset.diff}/${seed}: ${f.kind} rules out a spoke between two satisfied hubs`,
            ).toBe(true);
          }
          applyForced(board, f.forced);
        }
      }
    }
  });
});

// --- one firing is one journey ----------------------------------------------

describe("a saturated hub is one multi-leg journey, one color", () => {
  it("emits every forced spoke as continuation legs sharing one highlight", () => {
    // A saturation firing forcing more than one spoke.
    let found: { state: SpokesState; firing: SpokesFiring } | null = null;
    for (let seed = 0; seed < 250 && !found; seed++) {
      const { desc } = newSpokesDesc(EASY, randomNew(`multileg-${seed}`));
      const base = newState(EASY, desc);
      const board = cloneBoard(base);
      for (let guard = 0; guard < 600; guard++) {
        const plan = deduceSpokesPlan(board);
        if (plan.length === 0) break;
        const f = plan[0];
        if (f.kind === "saturation" && f.forced.length > 1) {
          const state = cloneState(base);
          state.spokes.set(board.spokes);
          found = { state, firing: f };
          break;
        }
        applyForced(board, f.forced);
      }
    }
    expect(found, "no multi-spoke saturation firing found").not.toBeNull();
    if (!found) return;

    const k = found.firing.forced.length;
    const steps = hintSteps(found.state);
    const legs = steps.slice(0, k);

    // Leg 0 opens the journey; the rest continue it.
    expect(legs[0].continuesPrevious).toBeFalsy();
    for (let i = 1; i < k; i++) expect(legs[i].continuesPrevious).toBe(true);

    // All legs render the same set of spokes (shared fate, shared color) —
    // one highlight object across the firing.
    const first = legs[0].highlights as SpokesHint;
    for (const leg of legs) expect(leg.highlights).toBe(first);
    expect(first.spokes.length).toBe(k);

    // Each leg draws a distinct spoke.
    const drawn = new Set(
      legs.map(
        (l) =>
          `${(l.move as { index: number }).index}:${(l.move as { dir: number }).dir}`,
      ),
    );
    expect(drawn.size).toBe(k);
  });
});

// --- refusals ---------------------------------------------------------------

describe("refusals", () => {
  it("refuses a solved board", () => {
    const found = findFiring(EASY, "saturation");
    expect(found).not.toBeNull();
    if (!found) return;
    // Solve fully by following the plan.
    const board = cloneBoard(found.state);
    for (let guard = 0; guard < 600; guard++) {
      const plan = deduceSpokesPlan(board);
      if (plan.length === 0) break;
      for (const f of plan) applyForced(board, f.forced);
    }
    let state = cloneState(found.state);
    state.spokes.set(board.spokes);
    state = cloneState(state);
    state.completed = true;
    const res = spokesGame.hint?.(state);
    expect(res?.ok).toBe(false);
    if (res && !res.ok) expect(res.error).toMatch(/already solved/);
  });

  it("refuses a board carrying a solution-forbidden line, with the mistake banner", () => {
    const { desc } = newSpokesDesc(EASY, randomNew("refuse-wrong"));
    const base = newState(EASY, desc);
    const solution = solutionOf(base);
    // Find a spoke the solution marks (not a line) and draw a line there.
    let placed = false;
    for (let i = 0; i < base.w * base.h && !placed; i++) {
      for (let d = 0; d < 4; d++) {
        if (
          getSpoke(base.spokes[i], d) === 1 /* EMPTY */ &&
          getSpoke(solution.spokes[i], d) !== SPOKE_LINE
        ) {
          spokesPlace(base, i, d, SPOKE_LINE);
          placed = true;
          break;
        }
      }
    }
    expect(placed).toBe(true);
    const res = spokesGame.hint?.(base);
    expect(res?.ok).toBe(false);
    if (res && !res.ok) expect(res.error).toMatch(/highlighted mistakes/);
    // And the offenders are actually flagged.
    expect(spokesGame.findMistakes?.(base)?.length ?? 0).toBeGreaterThan(0);
  });
});

// --- tier-2.5 render frame --------------------------------------------------

describe("the hint frame paints the overlay", () => {
  /** A descriptive id whose deductive plan reaches a forced *diagonal* line —
   * the corner-invalidation case — found by scanning seeds. */
  function diagonalHintId(): string | null {
    for (let seed = 0; seed < 250; seed++) {
      const { desc } = newSpokesDesc(TRICKY, randomNew(`diag-frame-${seed}`));
      const base = newState(TRICKY, desc);
      const board = cloneBoard(base);
      for (let guard = 0; guard < 600; guard++) {
        const plan = deduceSpokesPlan(board);
        if (plan.length === 0) break;
        const f = plan[0];
        // A forced LINE on a diagonal (dir 1 = BOTRIGHT, 3 = BOTLEFT).
        if (
          f.forced.some((s) => s.state === SPOKE_LINE && (s.dir === 1 || s.dir === 3))
        ) {
          return `${spokesGame.encodeParams(TRICKY, true)}:${desc}`;
        }
        applyForced(board, f.forced);
      }
    }
    return null;
  }

  it("draws a COL_HINT spoke and a COL_HINT_CELL evidence ring, incl. a diagonal", () => {
    const id = diagonalHintId();
    expect(id, "no diagonal hint board found").not.toBeNull();
    if (!id) return;

    const isDiagLine = (h: SpokesHint | undefined): boolean =>
      h?.spokes?.some((s) => s.state === SPOKE_LINE && (s.dir === 1 || s.dir === 3)) ??
      false;

    const result = renderScenario({
      game: spokesGame,
      id,
      showHint: true,
      hintUntil: (step) => isDiagLine(step.highlights as SpokesHint | undefined),
      defaultBackground: DEFAULT_BACKGROUND,
    });

    const ops = result.recording.ops;
    // The forced diagonal line at hint color — completed across the grid
    // corner, so both a plus-shape half and a corner-box half
    // come out COL_HINT.
    expect(ops.some((o) => o.op === "line" && o.color === COL_HINT)).toBe(true);
    // The evidence ring behind a hub.
    expect(ops.some((o) => o.op === "circle" && o.fill === COL_HINT_CELL)).toBe(true);
    // The displayed step really carries a diagonal line spoke.
    expect(isDiagLine(result.hint?.highlights as SpokesHint | undefined)).toBe(true);

    expect(ops).toMatchSnapshot();
  });
});

// --- the Unreasonable rung is unreachable from the hint ---------------------

describe("the top tier's look-ahead never reaches a hint", () => {
  /**
   * `spokesSolve` runs the contradiction look-ahead twice: at `DIFF_TRICKY` with
   * a `DIFF_LIMITED` sub-solve (capped at `ACTION_LIMIT`, a bounded chain — a
   * *Tactic*), and again at the top tier with a `DIFF_EASY` sub-solve that has
   * no bound at all and was measured settling **35 of 36 hubs** on a 6x6 board.
   * Only the second is a search, and no hint narrates a search on any tier.
   *
   * The two rungs are the *same function* and their narration is word-for-word
   * identical, so `hint-quality.test.ts`'s vocabulary check cannot tell them
   * apart — the guarantee has to be structural. This is it, stated as the
   * consequence a player would feel: **asking for the top tier's reasoning buys
   * the plan nothing.** The control below is what stops it passing vacuously.
   */
  it("planning at the top tier gives the same plan as planning at Tricky", () => {
    let sawTricky = false;
    for (let seed = 0; seed < 12; seed++) {
      const { desc } = newSpokesDesc(UNREASONABLE, randomNew(`no-search-rung-${seed}`));
      const base = newState(UNREASONABLE, desc);
      const kinds = (diff: number) =>
        deduceSpokesPlan(cloneBoard(base), diff).map((f) => f.kind);

      expect(kinds(DIFF_HARD), `seed ${seed}`).toEqual(kinds(DIFF_TRICKY));
      if (kinds(DIFF_TRICKY).length > kinds(DIFF_EASY).length) sawTricky = true;
    }
    // The control: the Tricky rung really does add firings an Easy plan lacks,
    // so the equality above is a live fact about the top tier rather than an
    // artifact of every tier producing the same plan.
    expect(sawTricky, "no board where the Tricky rung adds a firing").toBe(true);
  });
});
