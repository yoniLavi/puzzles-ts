/**
 * Galaxies' explained hint: the deductions it narrates, the words it uses for
 * each, and the ways a player can follow one.
 *
 * The cross-game guards (`hint-resume`, `hint-overlay`, `hint-quality`) cover
 * convergence, purity, overlay-reaches-the-cache and narration *form* for
 * every hinting game at once; Galaxies is enrolled in
 * `engine/testing/hint-games.ts`. What is here is what only Galaxies can say:
 * that each rung fires with the evidence its sentence claims, that every
 * association it offers is the one the unique solution holds (the property
 * that replaces the byte-match oracle on this new code path), and that
 * following a hint by any of the three gestures counts as following it.
 */
import { describe, expect, it } from "vitest";
import type { HintStep } from "../../engine/index.ts";
import { randomNew } from "../../engine/random/index.ts";
import {
  type GalaxiesHint,
  galaxiesHintPlan,
  galaxiesHintSteps,
  narrate,
} from "./hint.ts";
import { type GalaxiesMove, galaxiesGame } from "./index.ts";
import { clearForSolve, GalaxiesDiff, solverState } from "./solver.ts";
import {
  cloneState,
  F_EDGE_SET,
  F_TILE_ASSOC,
  type GalaxiesState,
  idx,
  rebuildDots,
} from "./state.ts";

type Step = HintStep<GalaxiesMove, GalaxiesHint>;

const NORMAL_7 = { w: 7, h: 7, diff: GalaxiesDiff.Normal };
const UNREASONABLE_7 = { w: 7, h: 7, diff: GalaxiesDiff.Unreasonable };

function board(params: typeof NORMAL_7, seed: string): GalaxiesState {
  const { desc } = galaxiesGame.newDesc(params, randomNew(seed));
  return galaxiesGame.newState(params, desc);
}

function hintOf(s: GalaxiesState): Step[] {
  const res = galaxiesGame.hint?.(s);
  if (!res?.ok) throw new Error(`hint refused: ${res && !res.ok ? res.error : "?"}`);
  return res.steps as Step[];
}

/**
 * Walk a board step by step until one matches, or deduction runs out. A
 * fixed-seed scan, so it lands on the same frame every run.
 *
 * Deliberately walks `galaxiesHintSteps` rather than `hint()`: the public
 * entry point re-runs `findMistakes` — a whole solve — on every call, which is
 * the right thing for a player pressing a button and an order of magnitude of
 * wasted work for a scan whose boards are mistake-free by construction.
 * Every returned `(step, state)` pair is still one the player could see, since
 * the state is the board that step applies to.
 */
function firstStepMatching(
  params: typeof NORMAL_7,
  seeds: string[],
  match: (step: Step, s: GalaxiesState) => boolean,
): { step: Step; state: GalaxiesState } | null {
  for (const seed of seeds) {
    let s = board(params, seed);
    for (let batch = 0; batch < 60 && galaxiesGame.status(s) === "ongoing"; batch++) {
      const steps = galaxiesHintSteps(s);
      if (steps.length === 0) break;
      for (const step of steps) {
        if (match(step, s)) return { step, state: s };
        s = galaxiesGame.executeMove(s, step.move);
      }
    }
  }
  return null;
}

/**
 * The same scan over two board shapes. The rare rungs (a cell with one way
 * out, a detached piece) fire on well under 1% of steps, so finding them wants
 * a *bigger* board rather than more seeds of a small one: one 15x15 walk is
 * ~300 steps where a 7x7 is ~60.
 *
 * Both tiers, because *where a rung sits in the ladder* decides which boards
 * can reach it: mirroring a wall is last, so it fires only once the five
 * direct rungs are spent, and a Normal board is by definition one where they
 * never all are. Nothing is exclusive to a tier by rule — only by how far down
 * the ladder that tier's boards force the hint to go.
 */
function anyBoardSays(match: (step: Step, s: GalaxiesState) => boolean) {
  for (const params of [
    NORMAL_7,
    { w: 15, h: 15, diff: GalaxiesDiff.Normal },
    UNREASONABLE_7,
    { w: 15, h: 15, diff: GalaxiesDiff.Unreasonable },
  ]) {
    const found = firstStepMatching(params, SCAN_SEEDS, match);
    if (found) return found;
  }
  return null;
}

const SCAN_SEEDS = Array.from({ length: 12 }, (_, i) => `gh-scan-${i}`);

/** The canonical solution's dot for every tile — the board the hint's every
 * claim is measured against. */
function solution(s: GalaxiesState): GalaxiesState {
  const sol = cloneState(s);
  clearForSolve(sol);
  sol.dots = rebuildDots(sol);
  const diff = solverState(sol, GalaxiesDiff.Unreasonable);
  expect([GalaxiesDiff.Normal, GalaxiesDiff.Unreasonable]).toContain(diff);
  return sol;
}

describe("the plan is sound: every step agrees with the unique solution", () => {
  // The property that stands in for the byte-match oracle here. A hint is a
  // second projection of the solver, so a wrong deduction would not show up
  // in the generator's frozen differential at all — it would show up as a
  // player being told to draw an arrow the puzzle contradicts.
  for (const [name, params] of [
    ["Normal", NORMAL_7],
    ["Unreasonable", UNREASONABLE_7],
  ] as const) {
    it(`${name}: no association or wall contradicts the solution`, () => {
      for (const seed of ["sound-a", "sound-b", "sound-c"]) {
        const start = board(params, seed);
        const sol = solution(start);
        let s = start;
        for (let i = 0; i < 400 && galaxiesGame.status(s) === "ongoing"; i++) {
          // An Unreasonable board may legitimately run out of deduction; what
          // is under test is that nothing the hint *did* say was wrong.
          const res = galaxiesGame.hint?.(s);
          if (!res?.ok && params.diff === GalaxiesDiff.Unreasonable) break;
          const steps = hintOf(s);
          for (const step of steps) {
            const hl = step.highlights;
            if (!hl) continue;
            for (const t of hl.targets) {
              const si = idx(sol, t.x, t.y);
              expect(sol.flags[si] & F_TILE_ASSOC).toBeTruthy();
              expect(
                [sol.dotx[si], sol.doty[si]],
                `${seed}: hint pointed (${t.x},${t.y}) at the wrong dot`,
              ).toEqual([hl.targetDot?.x, hl.targetDot?.y]);
            }
            for (const wall of hl.targetWalls) {
              expect(
                sol.flags[idx(sol, wall.x, wall.y)] & F_EDGE_SET,
                `${seed}: hint asked for a wall at (${wall.x},${wall.y}) the solution does not have`,
              ).toBeTruthy();
            }
          }
          s = galaxiesGame.executeMove(s, steps[0].move);
        }
        if (params.diff === GalaxiesDiff.Normal) {
          expect(
            galaxiesGame.status(s),
            `${seed}: hints did not finish the board`,
          ).toBe("solved");
        }
      }
    });
  }
});

describe("each deduction is narrated in its own vocabulary", () => {
  // Wording is asserted byte-exactly: the narration *is* the product, so a
  // silent edit should be a visible test diff. The seed scan reaches each
  // rung deterministically (docs/games/hints.md § "Verifying a hint
  // in-process").
  // Each case is one sentence the hint can utter, asserted by *finding* it:
  // a scan that never reaches the exact string means either the rule stopped
  // firing or its wording drifted, and both are worth a red test. Only the
  // dot's color is normalized, since which dot a scan lands on is incidental.
  const cases: [string, string][] = [
    // A dot sitting *inside* a cell needs no arrow — the game refuses to draw
    // one there, so that firing is never shown and the singular wording is not
    // among the sentences below. A dot on an edge owns two cells, a dot on a
    // corner four, and those are the two the player is ever told about.
    [
      "the pair of cells a dot sits between",
      "A galaxy always covers the cells its own dot sits on, so both these cells must belong to the white dot between them.",
    ],
    [
      "the four cells a dot's corner touches",
      "A galaxy always covers the cells its own dot sits on, so these 4 cells must belong to the white dot at their shared corner.",
    ],
    [
      "a wall between two galaxies",
      "These two cells point at different dots, so they belong to different galaxies — a wall must run between them.",
    ],
    [
      "the only dot that could own a cell",
      "Only one dot could ever own this cell — for any other, the cell across the dot from it would be off the board or on top of another dot. So it must belong to the ringed white dot.",
    ],
    [
      "the limit of a galaxy's reach",
      "The outline shows how far the ringed white dot's galaxy can still stretch. No other galaxy can reach this cell at all, so it must belong to the ringed dot.",
    ],
    [
      "a wall mirrored about the dot",
      "A galaxy looks the same turned 180° about its dot: the two outlined cells are partners across the white dot, so the marked wall beside one must be matched beside the other.",
    ],
    [
      "a wall mirrored off the board's edge",
      "The two outlined cells are partners across the white dot, and one of them is up against the edge of the board — so the other must be walled off on the matching side.",
    ],
    // Two ways out or three: the common shape of this rung. (One way out is a
    // fourth wording the scan never reaches — see the branch test below.)
    [
      "a cell hemmed in on some sides",
      "Every way out of this cell leads into the outlined galaxy — its other sides are walled, and a galaxy is one connected region, so this cell must belong to the ringed white dot.",
    ],
    [
      "a cell with no walls but only one galaxy around it",
      "Every way out of this cell leads into the outlined galaxy, and a galaxy is one connected region, so this cell must belong to the ringed white dot.",
    ],
    [
      "a detached piece of a galaxy",
      "The outlined cells belong to the ringed white dot but are cut off from it, and this is the only cell they can still grow through — so it must belong to the ringed dot too.",
    ],
  ];

  for (const [what, wording] of cases) {
    it(`${what}`, () => {
      const says = (s: Step) =>
        s.explanation.replace("black dot", "white dot") === wording;
      expect(
        anyBoardSays(says),
        `no board in the scan said it: ${what}`,
      ).not.toBeNull();
    });
  }

  it("a cell with a single way out reads in the singular", () => {
    // The one wording asserted on a *constructed* firing rather than a found
    // one: 48 board-walks produce this rung 25 times and never with one
    // opening, because walling three sides of a still-unassociated cell takes
    // an unusual board. The branch stays — the alternative is saying "Every
    // way out" about one way out — so its wording is checked here instead of
    // pretending a scan covers it.
    const s = board(NORMAL_7, "singular");
    const dot = s.dots[0];
    expect(
      narrate(s, {
        kind: "enclosed",
        tile: { x: 3, y: 3 },
        opp: null,
        dot,
        openings: [{ x: 5, y: 3 }],
      }).replace("black dot", "white dot"),
    ).toBe(
      "The only way out of this cell leads into the outlined galaxy — its other sides are walled, and a galaxy is one connected region, so this cell must belong to the ringed white dot.",
    );
  });
});

describe("the hint never guesses, and says so when that is the end of the road", () => {
  // The guess-free policy's line, in the sharp form (owner, 2026-08-11): a
  // contradiction you can *see* from a placement is checking, and belongs
  // anywhere; one you only reach by *propagating* from a hypothesis is
  // guessing, and is not a technique a hint can teach at all. Galaxies once
  // shipped a rung of the second kind on the Unreasonable tier; it was
  // removed, so the guarantee below is now unconditional rather than
  // per-tier.
  it("every step it offers is a rule the board shows, on either tier", () => {
    // A guessing step would have to say what it *tried*; a deduced one states
    // a premise. This is a shape check on the vocabulary, cheap and blunt.
    //
    // Kept **stricter than** the cross-game version now in
    // `engine/hint-quality.test.ts` (`audit-guessing-tier-names` promoted it
    // there, since a rule enforced in one game is not enforced). This one also
    // rejects `suppose` / `if it were` outright, which the shared check cannot:
    // several games narrate a *single-step* refutation that way and are right
    // to. Galaxies has no such arm, so the tighter net costs it nothing and
    // pins the game the rule was written from.
    const speculative =
      /\btr(y|ied|ies)\b|\bsuppose\b|\bif it were\b|\bbreak the board\b/i;
    for (const params of [NORMAL_7, UNREASONABLE_7]) {
      for (const seed of ["gf-a", "gf-b"]) {
        let s = board(params, seed);
        for (
          let batch = 0;
          batch < 40 && galaxiesGame.status(s) === "ongoing";
          batch++
        ) {
          const res = galaxiesGame.hint?.(s);
          if (!res?.ok) break;
          for (const step of res.steps) {
            expect(
              speculative.test(step.explanation),
              `${seed}: a speculative step — "${step.explanation}"`,
            ).toBe(false);
            s = galaxiesGame.executeMove(s, step.move);
          }
        }
      }
    }
  });

  it("a Normal board is always carried all the way to solved", () => {
    // The tier's promise: pure deduction suffices, so the hint must never
    // reach the refusal below on a Normal board.
    for (const size of [7, 10]) {
      for (const seed of ["gf-a", "gf-b", "gf-c"]) {
        const params = { w: size, h: size, diff: GalaxiesDiff.Normal };
        let s = board(params, `${seed}-${size}`);
        for (let b = 0; b < 40 && galaxiesGame.status(s) === "ongoing"; b++) {
          const res = galaxiesGame.hint?.(s);
          expect(res?.ok, `${seed}/${size}: Normal board stalled`).toBe(true);
          if (!res?.ok) break;
          for (const step of res.steps) s = galaxiesGame.executeMove(s, step.move);
        }
        expect(galaxiesGame.status(s), `${seed}/${size}: not solved`).toBe("solved");
      }
    }
  });

  it("an Unreasonable board that runs out gets told what to do instead", () => {
    // Where deduction genuinely ends, the refusal has to be useful: this is
    // the position the tier exists for, not an error.
    let refusals = 0;
    for (const seed of ["gu-a", "gu-b", "gu-c", "gu-d"]) {
      let s = board(UNREASONABLE_7, seed);
      for (let b = 0; b < 40 && galaxiesGame.status(s) === "ongoing"; b++) {
        const res = galaxiesGame.hint?.(s);
        if (!res?.ok) {
          refusals++;
          expect(res?.error).toMatch(/^Nothing further follows by deduction here\./);
          expect(res?.error).toMatch(/save a checkpoint/);
          break;
        }
        for (const step of res.steps) s = galaxiesGame.executeMove(s, step.move);
      }
    }
    // If this ever came out zero the tier would be indistinguishable from
    // Normal, which is its own defect (`grade-difficulty-tiers-honestly`).
    expect(refusals, "no Unreasonable board needed to guess").toBeGreaterThan(0);
  });
});

describe("a deduction the player cannot act on never costs the plan a step", () => {
  // The shipped bug this pins (owner-reported on a 15x15): a dot sitting
  // *inside* a cell forces that cell, the game refuses to draw an arrow
  // there, and so the firing re-derives on every recompute and can never be
  // shown. With the plan capped by firings rather than by showable steps,
  // twenty of those in a row spent the entire budget and the hint announced
  // "No further move can be deduced" on a board with a hundred moves left.
  const REPORTED = "fnizegzhxrhzzzsfcjzlfdprczfzfezqcinjjyvtzybbmdtxpzzcjgfizfjgh";
  const params = { w: 15, h: 15, diff: GalaxiesDiff.Unreasonable };

  it("the reported board keeps offering hints deep into the solve", () => {
    let s = galaxiesGame.newState(params, REPORTED);
    let sawUnshowable = false;
    let offered = 0;
    // Batch-replay whole plans rather than recomputing per move: this reaches
    // the same mid-game depth in a few calls instead of dozens, and the plan
    // machinery is what is under test, not the walk.
    for (let batch = 0; batch < 6 && galaxiesGame.status(s) === "ongoing"; batch++) {
      const plan = galaxiesHintPlan(s);
      sawUnshowable ||= plan.some((p) => !p.showable);
      const res = galaxiesGame.hint?.(s);
      // A refusal *deep* in an Unreasonable board is legitimate — deduction
      // can genuinely run out there. Refusing at the first ask, on a board
      // with a hundred moves left, is the bug this pins.
      if (!res?.ok) break;
      offered++;
      for (const step of res.steps) s = galaxiesGame.executeMove(s, step.move);
    }
    expect(offered, "the reported board refused straight away").toBeGreaterThan(3);
    // The guard is only meaningful if this board really does produce firings
    // the player can never act on — the whole point of the class.
    expect(
      sawUnshowable,
      "no unshowable firing occurred; the test proves nothing",
    ).toBe(true);
  });
});

describe("the picture carries the argument", () => {
  it("every step highlights something, and the acted-on cell is never also evidence", () => {
    for (const seed of ["pic-a", "pic-b"]) {
      let s = board(NORMAL_7, seed);
      for (let i = 0; i < 400 && galaxiesGame.status(s) === "ongoing"; i++) {
        const steps = hintOf(s);
        for (const step of steps) {
          const hl = step.highlights;
          expect(hl, "a step with no highlights").toBeDefined();
          if (!hl) continue;
          const marks =
            hl.targets.length + hl.targetWalls.length + (hl.targetDot ? 1 : 0);
          expect(
            marks,
            `${step.explanation} — marks nothing to act on`,
          ).toBeGreaterThan(0);
          // Only the cell being acted on is kept out of its own evidence: it
          // owns the action color and the doubled ring. The *partner* stays in
          // the evidence — it is inside the area the sentence describes, and
          // marking it there is what keeps it the quieter of the two.
          const f = hl.focus;
          if (f) {
            expect(
              hl.area.some((a) => a.x === f.x && a.y === f.y),
              "the acted-on cell is also marked as evidence",
            ).toBe(false);
          } else {
            for (const t of hl.targets) {
              expect(
                hl.area.some((a) => a.x === t.x && a.y === t.y),
                "a target cell is also marked as evidence",
              ).toBe(false);
            }
          }
        }
        s = galaxiesGame.executeMove(s, steps[0].move);
      }
    }
  });

  it("an outlined-evidence deduction actually outlines something", () => {
    // The per-game form of the visible-evidence rule: the four rungs whose
    // sentences say "the outlined cells" must have some.
    const shading = /outlined|outline shows/;
    for (const seed of SCAN_SEEDS.slice(0, 4)) {
      let s = board(UNREASONABLE_7, seed);
      for (let i = 0; i < 400 && galaxiesGame.status(s) === "ongoing"; i++) {
        const res = galaxiesGame.hint?.(s);
        if (!res?.ok) break; // deduction ran out — legitimate on this tier
        const step = res.steps[0] as Step;
        if (shading.test(step.explanation)) {
          expect(
            step.highlights?.area.length ?? 0,
            `"${step.explanation}" says outlined and outlines nothing`,
          ).toBeGreaterThan(0);
        }
        s = galaxiesGame.executeMove(s, step.move);
      }
    }
  });

  it("a wall step points at a wall, an association step points at a dot", () => {
    for (const seed of ["role-a", "role-b"]) {
      let s = board(NORMAL_7, seed);
      for (let i = 0; i < 400 && galaxiesGame.status(s) === "ongoing"; i++) {
        const step = hintOf(s)[0];
        const hl = step.highlights;
        if (!hl) continue;
        const isWall = hl.targetWalls.length > 0;
        expect(isWall ? hl.targets.length : hl.targetWalls.length).toBe(0);
        // One ring role at a time, so "the ringed dot" is never ambiguous.
        if (hl.targetDot) expect(hl.refDots.length).toBe(0);
        s = galaxiesGame.executeMove(s, step.move);
      }
    }
  });
});

describe("refusals", () => {
  it("refuses on a solved board", () => {
    let s = board(NORMAL_7, "refuse-solved");
    const res = galaxiesGame.solve?.(s, s);
    expect(res?.ok).toBe(true);
    if (res?.ok) s = galaxiesGame.executeMove(s, res.move);
    expect(galaxiesGame.status(s)).toBe("solved");
    const hint = galaxiesGame.hint?.(s);
    expect(hint?.ok).toBe(false);
  });

  it("refuses on a board with a wrong association, and the mistake overlay has it", () => {
    const s = board(NORMAL_7, "refuse-wrong");
    const sol = solution(s);
    // Find a tile and a dot the solution does *not* pair, and pair them.
    let wrong: GalaxiesMove | null = null;
    for (let y = 1; y < s.sy - 1 && !wrong; y += 2) {
      for (let x = 1; x < s.sx - 1 && !wrong; x += 2) {
        const si = idx(sol, x, y);
        for (const d of s.dots) {
          if (sol.dotx[si] === d.x && sol.doty[si] === d.y) continue;
          const move: GalaxiesMove = {
            ops: [{ kind: "assoc", x, y, ax: d.x, ay: d.y }],
            solving: false,
          };
          const after = galaxiesGame.executeMove(s, move);
          if ((after.flags[idx(after, x, y)] & F_TILE_ASSOC) === 0) continue;
          if (after.dotx[idx(after, x, y)] !== d.x) continue;
          wrong = move;
          break;
        }
      }
    }
    expect(wrong, "no wrong association was placeable on this board").not.toBeNull();
    if (!wrong) return;
    const dirty = galaxiesGame.executeMove(s, wrong);
    expect(galaxiesGame.findMistakes?.(dirty).length ?? 0).toBeGreaterThan(0);
    const res = galaxiesGame.hint?.(dirty);
    expect(res?.ok).toBe(false);
    if (res && !res.ok)
      expect(res.error).toMatch(/^Fix the highlighted mistakes first/);
  });
});

describe("following the plan", () => {
  /** The first association step of a fresh board. */
  function firstAssociation(seed: string): { step: Step; state: GalaxiesState } {
    const found = firstStepMatching(
      NORMAL_7,
      [seed],
      (s) => (s.highlights?.targets.length ?? 0) > 0,
    );
    if (!found) throw new Error("no association step");
    return found;
  }

  it("counts the association as completed however the player draws it", () => {
    const { step, state } = firstAssociation("follow-a");
    const hl = step.highlights;
    expect(hl?.targetDot).toBeDefined();
    if (!hl?.targetDot) return;
    const target = hl.targets[0];
    const dot = hl.targetDot;
    // Dragging from the dot, dragging from the cell and the keyboard all end
    // in the same move shape, but the *op* need not match the plan's own: the
    // plan may have asked at the dot's coordinates and the player at the
    // cell's. Judged by effect, both are following.
    const byCell: GalaxiesMove = {
      ops: [{ kind: "assoc", x: target.x, y: target.y, ax: dot.x, ay: dot.y }],
      solving: false,
    };
    expect(["completed", "onTrack"]).toContain(
      galaxiesGame.hintKeepTrack?.(byCell, step, state),
    );
  });

  it("holds a multi-cell step on track until its last cell lands", () => {
    const found = firstStepMatching(
      NORMAL_7,
      SCAN_SEEDS,
      (s) => (s.highlights?.targets.length ?? 0) > 1,
    );
    expect(found, "no multi-cell association in the scan").not.toBeNull();
    if (!found) return;
    const hl = found.step.highlights;
    if (!hl?.targetDot) return;
    const one: GalaxiesMove = {
      ops: [
        {
          kind: "assoc",
          x: hl.targets[0].x,
          y: hl.targets[0].y,
          ax: hl.targetDot.x,
          ay: hl.targetDot.y,
        },
      ],
      solving: false,
    };
    const verdict = galaxiesGame.hintKeepTrack?.(one, found.step, found.state);
    // Either the pair the game commits atomically finished the step, or the
    // step wants more cells and stays displayed — never "off".
    expect(["completed", "onTrack"]).toContain(verdict);
  });

  it("drops the plan when the player goes their own way", () => {
    const { step, state } = firstAssociation("follow-b");
    // An unrelated wall somewhere the step never mentions.
    let elsewhere: GalaxiesMove | null = null;
    for (let y = 1; y < state.sy - 1 && !elsewhere; y++) {
      for (let x = 1; x < state.sx - 1; x++) {
        if (x % 2 === y % 2) continue; // not an edge cell
        if (state.flags[idx(state, x, y)] & F_EDGE_SET) continue;
        if (step.highlights?.targetWalls.some((w) => w.x === x && w.y === y)) continue;
        elsewhere = { ops: [{ kind: "edge", x, y }], solving: false };
        break;
      }
    }
    expect(elsewhere).not.toBeNull();
    if (!elsewhere) return;
    expect(galaxiesGame.hintKeepTrack?.(elsewhere, step, state)).toBe("off");
  });

  it("refreshes a step away once the board already shows it", () => {
    const { step, state } = firstAssociation("follow-c");
    expect(galaxiesGame.refreshHintStep?.(step, state)).toBe(step);
    const after = galaxiesGame.executeMove(state, step.move);
    expect(galaxiesGame.refreshHintStep?.(step, after)).toBeNull();
  });
});
