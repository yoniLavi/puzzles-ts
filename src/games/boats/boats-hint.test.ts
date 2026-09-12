/**
 * Boats — the explained hint.
 *
 * The load-bearing test is `every square a plan forces matches the unique
 * solution`: the recording pass re-derives each technique's *condition* beside
 * `solveBoats` rather than calling into it, so a mis-transcribed condition would
 * be a hint that confidently tells the player to place a wrong square. Checking
 * every planned square against a re-solve is what makes that impossible to ship
 * unnoticed, and it is cheap enough to run over every preset.
 *
 * Convergence (`a plan built one fresh hint at a time solves the board`) is the
 * other half: the cross-game `hint-resume.test.ts` guard only walks each game's
 * *first* preset, so the per-tier sweep lives here.
 */

import { describe, expect, it } from "vitest";
import { DEDUCTION_EXHAUSTED } from "../../engine/hint-refusal.ts";
import { randomNew } from "../../engine/random/index.ts";
import type { DrawOp } from "../../engine/testing/recording-drawing.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { newBoatsDesc } from "./generator.ts";
import { applyBoatsFiring, type BoatsFiring, deduceBoatsPlan } from "./hint-solver.ts";
import { type BoatsHint, boatsGame } from "./index.ts";
import { COL_HINT, COL_HINT_CELL } from "./render.ts";
import { solveToGrid } from "./solver.ts";
import {
  type BoatsMove,
  type BoatsState,
  boardOf,
  EMPTY,
  encodeParams,
  fillOf,
  isShip,
  newState,
  presetParams,
  STATUS_COMPLETE,
  STATUS_INVALID,
} from "./state.ts";
import { validateFullState } from "./validate.ts";

// The presets, by index: 0 = 6×6 Easy, 4 = 8×8 Normal, 8 = 10×10 Tricky,
// 9 = 10×10 Hard.
const TIERS = [
  [0, "Easy"],
  [4, "Normal"],
  [8, "Tricky"],
  [9, "Hard"],
] as const;

function board(preset: number, seed: string, strip = false): BoatsState {
  const p = { ...presetParams(preset), strip };
  return newState(p, newBoatsDesc(p, randomNew(seed)).desc);
}

function play(state: BoatsState, move: BoatsMove): BoatsState {
  return boatsGame.executeMove(state, move);
}

function isSolved(state: BoatsState): boolean {
  return validateFullState(boardOf(state)) === STATUS_COMPLETE;
}

function hintOf(state: BoatsState) {
  const r = boatsGame.hint?.(state);
  if (!r) throw new Error("boats declares no hint()");
  return r;
}

/**
 * Where the scan below *first* finds each technique, recorded so the search can
 * start there instead of grinding through every earlier preset.
 *
 * This is a pure speed-up, not a weakening: the scan is ordered and
 * deterministic, so its first hit for a kind IS this pair — starting here
 * returns the identical firing and board. It mattered: reaching `refuted` and
 * `sharedDiagonal` (both at preset 8) meant generating and fully plan-walking
 * every board of presets 0, 1, 4 and 7 first, at ~10-14 s per narration test.
 *
 * If the generator ever moves, the pinned pair simply stops matching and the
 * full scan runs as before — correctness does not depend on this table being
 * right, only speed does. Re-record it by deleting an entry and re-running.
 */
const FIRST_FOUND_AT: Partial<
  Record<BoatsFiring["technique"]["kind"], readonly [preset: number, seed: number]>
> = {
  allWaterPlaced: [0, 0],
  centerCount: [9, 3],
  centerForced: [0, 1],
  givenClue: [0, 0],
  growTooLong: [1, 0],
  isolated: [7, 8],
  lineForced: [0, 0],
  lineSatisfied: [0, 1],
  mustExtend: [0, 2],
  neverTouch: [0, 1],
  onlyRunsLeft: [1, 0],
  refuted: [8, 0],
  runTooShort: [1, 7],
  sharedDiagonal: [8, 0],
};

/** Scan fixed seeds for the first board whose plan contains `kind`, and return
 * that firing together with the state it fired from — the idiom for reaching a
 * specific deduction without hand-crafting a desc (docs/games/hints.md § "Verifying a hint in-process"). */
function findFiring(
  kind: BoatsFiring["technique"]["kind"],
  presets: readonly number[] = [0, 1, 4, 7, 8, 9, 11],
): { firing: BoatsFiring; state: BoatsState } {
  const pinned = FIRST_FOUND_AT[kind];
  if (pinned && presets.includes(pinned[0])) {
    const hit = scan(kind, [pinned[0]], pinned[1], pinned[1] + 1);
    if (hit) return hit;
  }
  const hit = scan(kind, presets, 0, 12);
  if (hit) return hit;
  throw new Error(`no generated board reached the ${kind} technique`);
}

function scan(
  kind: BoatsFiring["technique"]["kind"],
  presets: readonly number[],
  from: number,
  to: number,
): { firing: BoatsFiring; state: BoatsState } | null {
  for (const preset of presets) {
    for (let s = from; s < to; s++) {
      const start = board(preset, `find-${kind}-${preset}-${s}`, s % 2 === 0);
      let state = start;
      for (let guard = 0; guard < 60; guard++) {
        const plan = deduceBoatsPlan(state);
        if (plan.firings.length === 0) break;
        const at = plan.firings.findIndex((f) => f.technique.kind === kind);
        if (at >= 0) {
          // Replay the plan's own prefix so the returned state is the board the
          // firing actually fired from.
          const b = boardOf(state);
          for (let i = 0; i < at; i++) applyBoatsFiring(b, plan.firings[i]);
          return {
            firing: plan.firings[at],
            state: { ...state, grid: b.grid },
          };
        }
        const b = boardOf(state);
        applyBoatsFiring(b, plan.firings[0]);
        state = { ...state, grid: b.grid };
      }
    }
  }
  return null;
}

describe("boats hint — soundness", () => {
  it("every square a plan forces matches the unique solution", () => {
    let checked = 0;
    for (const [preset] of TIERS) {
      for (let s = 0; s < 4; s++) {
        const state = board(preset, `sound-${preset}-${s}`, s % 2 === 0);
        const truth = solveToGrid(state);
        expect(truth.ok).toBe(true);
        if (!truth.ok) continue;

        const b = boardOf(state);
        for (const f of deduceBoatsPlan(state).firings) {
          for (const sq of [...f.squares, ...f.consequences]) {
            const i = sq.y * state.params.w + sq.x;
            // Reported as an object so a failure names the guilty technique.
            expect({
              technique: f.technique.kind,
              at: `${sq.x},${sq.y}`,
              ship: sq.ship,
            }).toEqual({
              technique: f.technique.kind,
              at: `${sq.x},${sq.y}`,
              ship: isShip(truth.grid[i]),
            });
            checked++;
          }
          applyBoatsFiring(b, f);
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it("hint() does not mutate the state it is given", () => {
    const state = board(4, "purity");
    const before = Int8Array.from(state.grid);
    hintOf(state);
    expect(state.grid).toEqual(before);
  });
});

describe("boats hint — convergence", () => {
  it.each(
    TIERS,
  )("solves a %s board one freshly-recomputed hint at a time", (preset) => {
    for (let s = 0; s < 3; s++) {
      let state = board(preset, `converge-${preset}-${s}`);
      for (let guard = 0; guard < 500 && !isSolved(state); guard++) {
        const r = hintOf(state);
        expect(r.ok, `stuck at step ${guard}: ${r.ok ? "" : r.error}`).toBe(true);
        if (!r.ok) break;
        // Only the first step, exactly as the app does when the player then
        // goes their own way — the plan must be recomputable from anywhere.
        state = play(state, r.steps[0].move);
      }
      expect(isSolved(state)).toBe(true);
    }
  });

  it("resumes from a position the player reached themselves", () => {
    // Every third turn, ignore the hint and play a correct square of the
    // player's own choosing instead, so the board keeps arriving at positions
    // no plan proposed. A recording solver written to run from empty is not
    // automatically resumable (docs/games/hints.md § "A hint must resume from
    // any position"); this is what catches it.
    let state = board(4, "resume-own-play");
    const truth = solveToGrid(state);
    expect(truth.ok).toBe(true);
    if (!truth.ok) return;
    const { w, h } = state.params;

    for (let turn = 0; turn < 500 && !isSolved(state); turn++) {
      if (turn % 3 === 2) {
        // The player's own move: the last still-undecided square of the grid.
        let played = false;
        for (let i = w * h - 1; i >= 0 && !played; i--) {
          if (state.gridClues[i] !== EMPTY || fillOf(state.grid[i]) !== "-") continue;
          state = play(state, {
            kind: "fill",
            x0: i % w,
            y0: Math.floor(i / w),
            x1: i % w,
            y1: Math.floor(i / w),
            from: "-",
            to: isShip(truth.grid[i]) ? "B" : "W",
          });
          played = true;
        }
        if (played) continue;
      }
      const r = hintOf(state);
      expect(r.ok, r.ok ? "" : r.error).toBe(true);
      if (!r.ok) break;
      state = play(state, r.steps[0].move);
    }
    expect(isSolved(state)).toBe(true);
  });

  it("replays at the board's own difficulty, not at the maximum", () => {
    // The solver is not monotone in its cap, so a hint that replayed at
    // DIFFCOUNT would strand most Easy boards *and* teach a harder technique
    // than the board needs.
    const easy = deduceBoatsPlan(board(0, "tier-easy"));
    expect(easy.diff).toBe(0);
    expect(easy.firings.length).toBeGreaterThan(0);
    expect(easy.firings.every((f) => f.technique.kind !== "refuted")).toBe(true);
  });
});

describe("boats hint — narration", () => {
  /** Every technique the deduction reaches on generated boards, with the phrase
   * that proves the narration explains *why* rather than only *what*. */
  const NARRATIONS: [BoatsFiring["technique"]["kind"], RegExp][] = [
    ["givenClue", /boat's (top|bottom|left|right) end|one-square boat/],
    ["neverTouch", /Boats never touch, not even at a corner/],
    ["lineSatisfied", /(already shows the \d+ ships? its number allows|number is 0)/],
    ["lineForced", /still needs .* and has (just|only) .* free square/],
    ["allWaterPlaced", /Every square of water .* is already marked/],
    ["centerForced", /middle segment has water/],
    ["isolated", /water or the board's edge surrounds this square/],
    ["mustExtend", /closes three sides/],
    [
      "centerCount",
      /so a boat can't run (?:across|up and down) through this middle segment/,
    ],
    ["growTooLong", /would make a boat of \d+/],
    ["runTooShort", /every \d+-boat is already placed/],
    ["onlyRunsLeft", /run[s]? can still hold the \d+-boat/],
    ["sharedDiagonal", /can take only \d+ more water squares?/],
    ["refuted", /^If this square (were water|held a boat segment),/],
  ];

  it.each(NARRATIONS)("explains the %s deduction", (kind, phrase) => {
    const { firing, state } = findFiring(kind);
    const r = hintOf(state);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The scan's firing is somewhere in this state's plan; find the step for it.
    const step = r.steps.find((s) => phrase.test(s.explanation));
    expect(step, `no step narrated the ${kind} firing`).toBeDefined();
    expect(firing.technique.kind).toBe(kind);
  });

  it("states a refutation's rule rather than asserting the square is forced", () => {
    const { state } = findFiring("refuted", [9, 11]);
    const r = hintOf(state);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const step = r.steps.find((s) => s.explanation.startsWith("If this square"));
    expect(step).toBeDefined();
    // A "so it is forced" with no named rule is exactly the un-narrated step
    // the spec forbids.
    expect(step?.explanation).toMatch(
      /(touching corner to corner|could no longer reach its \d+|complete a boat the fleet has no room for|more boat squares than the whole fleet|rest of the fleet would no longer fit|given segment's own shape|could no longer be placed legally)/,
    );
  });

  it("never narrates the never-touch water as a deduction of its own", () => {
    // The water a placement drags along is shown as part of the same step, not
    // explained again — a rule of the game belongs in the help
    // (docs/games/hints.md § "Rules belong in the help").
    const { state } = findFiring("lineForced");
    const r = hintOf(state);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const step = r.steps.find((s) => /still needs/.test(s.explanation));
    expect(step?.explanation).not.toContain("never touch");
  });
});

describe("boats hint — one deduction is one hint", () => {
  it("emits a multi-square firing as one journey, not several hints", () => {
    // A whole-line water fill is the canonical case.
    const { state } = findFiring("lineSatisfied");
    const r = hintOf(state);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const opener = r.steps.findIndex((s) => s.continuesPrevious !== true);
    expect(opener).toBeGreaterThanOrEqual(0);
    // Every continuation leg repeats its journey's explanation and highlight,
    // so the picture never shrinks mid-hint.
    for (let i = 1; i < r.steps.length; i++) {
      if (!r.steps[i].continuesPrevious) continue;
      expect(r.steps[i].explanation).toBe(r.steps[i - 1].explanation);
      expect(r.steps[i].highlights).toBe(r.steps[i - 1].highlights);
    }
  });

  it("fills a whole deduced line with a single move where it can", () => {
    const { firing, state } = findFiring("lineSatisfied");
    expect(firing.squares.length).toBeGreaterThan(1);
    const r = hintOf(state);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // The journey whose marked squares are exactly this firing's.
    const key = (c: { x: number; y: number }) => `${c.x},${c.y}`;
    const want = firing.squares.map(key).sort().join(" ");
    const at = r.steps.findIndex(
      (s) =>
        !s.continuesPrevious &&
        (s.highlights as BoatsHint).targets.map(key).sort().join(" ") === want,
    );
    expect(at).toBeGreaterThanOrEqual(0);
    // One move: no continuation leg follows it.
    expect(r.steps[at + 1]?.continuesPrevious ?? false).toBe(false);

    const move = r.steps[at].move;
    if (move.kind !== "fill") throw new Error("expected a fill move");
    const { w } = state.params;
    // The rectangle covers every square the deduction decides…
    for (const s of firing.squares)
      expect(
        s.x >= move.x0 && s.x <= move.x1 && s.y >= move.y0 && s.y <= move.y1,
        `${key(s)} outside the move`,
      ).toBe(true);
    // …and nothing else it could change: its other squares were already decided
    // on the board as the firing fired, so a `from: "-"` fill leaves them alone.
    let undecided = 0;
    for (let y = move.y0; y <= move.y1; y++)
      for (let x = move.x0; x <= move.x1; x++)
        if (firing.grid[y * w + x] === EMPTY) undecided++;
    expect(undecided).toBe(firing.squares.length);
  });

  it("never asks for a square the step did not claim", () => {
    // A `fill` rectangle sets every still-empty square in its span, so a step
    // whose span reaches past its own targets would silently decide squares the
    // narration never mentioned — and, worse, decide them wrongly.
    let decided = 0;
    for (const [preset] of TIERS) {
      let state = board(preset, `span-${preset}`);
      for (let guard = 0; guard < 40 && !isSolved(state); guard++) {
        const r = hintOf(state);
        if (!r.ok) break;
        const step = r.steps[0];
        const hl = step.highlights as BoatsHint;
        const after = play(state, step.move);
        const { w, h } = state.params;
        for (let i = 0; i < w * h; i++) {
          // Compare *decidedness*, not raw bytes: `executeMove` runs
          // `adjustShips`, which rewrites an existing SHIP_VAGUE into its
          // resolved shape — a change in the byte, not a decision.
          if (fillOf(after.grid[i]) === fillOf(state.grid[i])) continue;
          const t = hl.targets.find((c) => c.y * w + c.x === i);
          expect(
            t,
            `${preset}: changed ${i % w},${Math.floor(i / w)} un-asked`,
          ).toBeDefined();
          expect(isShip(after.grid[i])).toBe(t?.ship);
          decided++;
        }
        state = after;
      }
    }
    // A plan whose moves decided nothing would walk every tier and assert
    // nothing — the comparison is on decidedness, so it is easy to empty.
    expect(decided, "no hinted move decided a square").toBeGreaterThan(0);
  });
});

describe("boats hint — refusals", () => {
  it("refuses a solved board", () => {
    const state = board(0, "refuse-solved");
    const solved = boatsGame.solve?.(state, state);
    expect(solved?.ok).toBe(true);
    if (!solved?.ok) return;
    const r = hintOf(play(state, solved.move));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already solved/i);
  });

  it("refuses a board carrying a wrong-but-rule-legal placement", () => {
    // The whole point of basing the refusal on a re-solve: this square breaks
    // no rule yet, so a live rule check would happily let the hint reason on.
    const state = board(0, "refuse-wrong");
    const truth = solveToGrid(state);
    expect(truth.ok).toBe(true);
    if (!truth.ok) return;

    const { w, h } = state.params;
    let wrong: BoatsState | null = null;
    for (let i = 0; i < w * h && !wrong; i++) {
      if (state.gridClues[i] !== EMPTY || isShip(truth.grid[i])) continue;
      const candidate = play(state, {
        kind: "fill",
        x0: i % w,
        y0: Math.floor(i / w),
        x1: i % w,
        y1: Math.floor(i / w),
        from: "-",
        to: "B",
      });
      // Keep only a placement the live rules still accept.
      if (validateFullState(boardOf(candidate)) !== STATUS_INVALID) wrong = candidate;
    }
    expect(wrong).not.toBeNull();
    if (!wrong) return;

    const r = hintOf(wrong);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/mistake/i);
    // …and the offending square is what the overlay will highlight.
    expect(boatsGame.findMistakes?.(wrong).length).toBeGreaterThan(0);
  });

  it("refuses when no deduction is available", () => {
    // Reachable only from a hand-written game id, since every generated board is
    // solver-gated: here every occupancy number is hidden and no segment given,
    // so the clues determine nothing at all.
    const p = { ...presetParams(0), strip: true };
    const blank = newState(p, "-,".repeat(p.w + p.h));
    const r = hintOf(blank);
    expect(r.ok).toBe(false);
    // The constant, not a substring of it: a regex over a message is a second,
    // weaker statement of what the message is, and goes stale when the wording
    // changes.
    if (!r.ok) expect(r.error).toBe(DEDUCTION_EXHAUSTED);
  });
});

describe("boats hint — keeping track", () => {
  it("advances only when every square the step marks is placed", () => {
    const state = board(4, "track");
    const r = hintOf(state);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const step = r.steps[0];
    const hl = step.highlights as BoatsHint;
    if (step.move.kind !== "fill") throw new Error("expected a fill move");
    const leg = step.move;
    const legTargets = hl.targets.filter(
      (t) =>
        t.x >= leg.x0 &&
        t.x <= leg.x1 &&
        t.y >= leg.y0 &&
        t.y <= leg.y1 &&
        t.ship === (leg.to === "B"),
    );
    expect(legTargets.length).toBeGreaterThan(0);

    // The step's own move finishes the leg it belongs to.
    expect(boatsGame.hintKeepTrack?.(leg, step, state)).toBe("completed");

    const one = legTargets[0];
    const single = (to: "B" | "W"): BoatsMove => ({
      kind: "fill",
      x0: one.x,
      y0: one.y,
      x1: one.x,
      y1: one.y,
      from: "-",
      to,
    });

    if (legTargets.length > 1)
      expect(boatsGame.hintKeepTrack?.(single(one.ship ? "B" : "W"), step, state)).toBe(
        "onTrack",
      );

    // Setting one of the leg's squares to the opposite is off-plan.
    expect(boatsGame.hintKeepTrack?.(single(one.ship ? "W" : "B"), step, state)).toBe(
      "off",
    );
  });

  it("completes a journey leg by leg, so the plan actually advances", () => {
    // The failure this guards: judging a leg against the whole journey's
    // squares means leg 1 never completes, the midend never advances, and
    // auto-play re-applies the same leg for ever.
    const { state } = findFiring("lineForced");
    const r = hintOf(state);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    let at = state;
    for (const step of r.steps) {
      const verdict = boatsGame.hintKeepTrack?.(step.move, step, at);
      expect(verdict).toBe("completed");
      at = play(at, step.move);
      if (step === r.steps[1]) break;
    }
  });
});

/** Palette-index probe: a `rect`/`line`/`text` op carries `color`, a
 * `polygon`/`circle` op carries `fill`/`outline`. */
function usesColor(ops: readonly DrawOp[], index: number): boolean {
  return ops.some(
    (o) =>
      ("color" in o && o.color === index) ||
      ("fill" in o && o.fill === index) ||
      ("outline" in o && o.outline === index),
  );
}

describe("boats hint — rendering", () => {
  function frame(preset: number, showHint: boolean) {
    const p = presetParams(preset);
    const desc = newBoatsDesc(p, randomNew(`render-${preset}`)).desc;
    return renderScenario({
      game: boatsGame,
      id: `${encodeParams(p, true)}:${desc}`,
      showHint,
    });
  }

  it.each(TIERS)("paints the %s hint's targets in the hint color", (preset) => {
    const result = frame(preset, true);
    const hl = result.hint?.highlights as BoatsHint | undefined;
    expect(hl?.targets.length).toBeGreaterThan(0);
    // The mark is drawn in the game's own vocabulary — a segment for a boat,
    // the water tildes for water — recolored `COL_HINT`.
    expect(usesColor(result.recording.ops, COL_HINT)).toBe(true);
  });

  it("shades or rings the evidence the deduction reasons over", () => {
    // Find a tier whose opening hint actually carries evidence; `allWaterPlaced`
    // is the one honestly-global technique and declares none.
    for (const [preset] of TIERS) {
      const result = frame(preset, true);
      const hl = result.hint?.highlights as BoatsHint | undefined;
      if (!hl || hl.evidence.length === 0) continue;
      expect(usesColor(result.recording.ops, COL_HINT_CELL)).toBe(true);
      return;
    }
    throw new Error("no tier's opening hint carried evidence");
  });

  it("paints no hint color at all when no hint is displayed", () => {
    const result = frame(0, false);
    expect(usesColor(result.recording.ops, COL_HINT)).toBe(false);
    expect(usesColor(result.recording.ops, COL_HINT_CELL)).toBe(false);
  });

  it("matches the recorded hint frame", () => {
    expect(frame(0, true).recording.ops).toMatchSnapshot();
  });
});

/** Guards the two placement marks stay distinct — a single color standing for
 * "place a boat" and "place water" would read as one action
 * (docs/games/hints.md § "Echo the move's shape in the hint color"). */
describe("boats hint — the two move shapes", () => {
  it("carries both placement shapes on the step that forces both", () => {
    // A line filled with boats drags its never-touch water along, so one step
    // routinely asks for both actions — and each must be marked as itself.
    const { state } = findFiring("lineForced");
    const r = hintOf(state);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const step = r.steps.find((s) => /still needs/.test(s.explanation));
    const hl = step?.highlights as BoatsHint | undefined;
    expect(hl?.targets.some((t) => t.ship)).toBe(true);
    expect(hl?.targets.some((t) => !t.ship)).toBe(true);
  });
});
