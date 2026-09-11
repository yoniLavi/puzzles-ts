/**
 * Crossing's explained hint.
 *
 * The load-bearing guard is **soundness**: the recording pass re-derives the
 * named technique from its own candidate lattice rather than calling
 * `solveCrossing`, so nothing but a test ties its conclusions to the puzzle's
 * real answer. Everything a plan forces is therefore checked against the unique
 * solution, on every preset.
 *
 * Beyond that: per-technique reachability and narration form (each premise must
 * be the one that actually discriminates), the three refusals, the keep-track
 * and refresh contracts, and a tier-2.5 render frame asserting the evidence
 * reaches both surfaces — the run on the grid *and* the clue list, which is
 * where half of every Crossing premise lives.
 */
import { describe, expect, it } from "vitest";
import type { HintStep } from "../../engine/game.ts";
import { ALREADY_SOLVED, DEDUCTION_EXHAUSTED } from "../../engine/hint-refusal.ts";
import { Midend } from "../../engine/index.ts";
import { LEFT_BUTTON, newCursor } from "../../engine/pointer.ts";
import { randomNew } from "../../engine/random/index.ts";
import { expectRing, markSides } from "../../engine/testing/mark-shape.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import {
  DEFAULT_BACKGROUND,
  renderScenario,
} from "../../engine/testing/render-scenario.ts";
import { newCrossingDesc } from "./generator.ts";
import {
  applyCrossingFiring,
  type CrossingFiring,
  deduceCrossingPlan,
  narrateCrossing,
} from "./hint-solver.ts";
import { crossingGame } from "./index.ts";
import {
  COL_ACROSS,
  COL_DOWN,
  COL_HINT,
  COL_HINT_CELL,
  COL_SELECTED,
  type CrossingDrawState,
  type CrossingHint,
  PREFERRED_TILE_SIZE,
} from "./render.ts";
import { solveCrossing } from "./solver.ts";
import {
  type CrossingMove,
  type CrossingParams,
  type CrossingState,
  type CrossingUi,
  crossingPresets,
  newState,
  numberAvailableTo,
  placedRuns,
  runForNumber,
  validateBoard,
} from "./state.ts";

type Step = HintStep<CrossingMove, CrossingHint>;

function board(p: CrossingParams, seed: string): CrossingState {
  const { desc } = newCrossingDesc(p, randomNew(seed));
  return newState(p, desc);
}

/** Apply a firing to a state, as the plan's own working board does. */
function afterFiring(state: CrossingState, f: CrossingFiring): CrossingState {
  const next = { ...state, grid: state.grid.slice(), pencil: state.pencil.slice() };
  applyCrossingFiring({ puzzle: next.puzzle, grid: next.grid, marks: next.pencil }, f);
  return next;
}

/** Walk a board to solved, one **freshly recomputed** plan at a time, calling
 * back on every firing. Returns the number of steps taken. */
function walk(
  state: CrossingState,
  each: (f: CrossingFiring, before: CrossingState) => void,
): number {
  let cur = state;
  let steps = 0;
  for (let guard = 0; guard < 2000; guard++) {
    if (validateBoard(cur.puzzle, cur.grid).status === "valid") return steps;
    const plan = deduceCrossingPlan(cur);
    expect(
      plan.firings.length,
      "the plan gave up before the board was solved",
    ).toBeGreaterThan(0);
    each(plan.firings[0], cur);
    cur = afterFiring(cur, plan.firings[0]);
    steps++;
  }
  throw new Error("crossing hint walk did not terminate");
}

describe("crossing hint — soundness", () => {
  it("every square a plan forces agrees with the unique solution", () => {
    for (const p of crossingPresets) {
      const state = board(p, `hint-sound-${p.w}x${p.h}${p.sym ? "s" : ""}`);
      const answer = solveCrossing(state.puzzle);
      expect(answer.status).toBe("valid");
      let checked = 0;
      walk(state, (f) => {
        if (f.technique === "onlyNumber") {
          const cells = state.puzzle.runs[f.run].cells;
          const num = state.puzzle.numbers[f.number];
          for (let k = 0; k < cells.length; k++) {
            expect(num.charCodeAt(k) - 48).toBe(answer.grid[cells[k]]);
            checked++;
          }
        } else if (f.technique === "sharedDigit" || f.technique === "crossRuns") {
          expect(f.digit).toBe(answer.grid[f.cell]);
          checked++;
        } else {
          // A rule-out must never strike the answer's own digit.
          expect(f.digits).not.toContain(answer.grid[f.cell]);
          checked++;
        }
      });
      expect(checked, `${p.w}x${p.h}: plan forced nothing`).toBeGreaterThan(0);
    }
  });

  it("a plan solves every preset when followed one recomputed step at a time", () => {
    for (const p of crossingPresets) {
      const state = board(p, `hint-walk-${p.w}x${p.h}${p.sym ? "s" : ""}`);
      const steps = walk(state, () => {});
      expect(steps).toBeGreaterThan(0);
    }
  });

  it("resumes from a board the player has partly filled themselves", () => {
    // Seed the board with a few *correct* entries made out of plan order, then
    // require the hint to carry on from there.
    const p = crossingPresets[2];
    const state = board(p, "hint-resume-9");
    const answer = solveCrossing(state.puzzle);
    const grid = state.grid.slice();
    const open: number[] = [];
    for (let i = 0; i < grid.length; i++) if (!state.puzzle.walls[i]) open.push(i);
    for (const i of open.slice(0, 5)) grid[i] = answer.grid[i];
    expect(walk({ ...state, grid }, () => {})).toBeGreaterThan(0);
  });
});

describe("crossing hint — techniques and narration", () => {
  /** Collect one firing of each technique by scanning generated boards. */
  const found = new Map<string, { f: CrossingFiring; state: CrossingState }>();
  for (const p of [crossingPresets[0], crossingPresets[2], crossingPresets[4]]) {
    for (let s = 0; s < 8; s++) {
      const state = board(p, `hint-tech-${p.w}-${s}`);
      walk(state, (f, before) => {
        if (!found.has(f.technique)) found.set(f.technique, { f, state: before });
      });
    }
  }

  it("reaches all three placement techniques on generated boards", () => {
    expect([...found.keys()].sort()).toEqual([
      "crossRuns",
      "onlyNumber",
      "sharedDigit",
    ]);
  });

  it("a whole-run placement is one step covering the whole run", () => {
    const hit = found.get("onlyNumber");
    if (!hit) throw new Error("no onlyNumber firing");
    const steps = crossingGame.hint?.(hit.state);
    expect(steps?.ok).toBe(true);
    if (!steps?.ok) return;
    const step = steps.steps[0] as Step;
    expect(step.move.kind).toBe("place");
    // One deduction, one hint — not one per square (quality-bar rule 2).
    expect(step.highlights?.targets.length).toBeGreaterThan(1);
  });

  it("states the premise that actually rules the other numbers out", () => {
    // A whole-run placement can be forced three different ways, and saying the
    // wrong one is a bug even though the move is right. In particular the
    // fresh-board opener must not claim to match "the digits already in this
    // run" — on an empty run there are none, so the premise is both vacuous
    // and visibly false.
    const seen = new Set<string>();
    for (let s = 0; s < 12 && seen.size < 3; s++) {
      const state = board(crossingPresets[0], `hint-because-${s}`);
      walk(state, (f, before) => {
        if (f.technique !== "onlyNumber" || seen.has(f.because) || f.deep) return;
        seen.add(f.because);
        const text = narrateCrossing(before.puzzle, f);
        if (f.because === "digits") {
          expect(text).toMatch(/matches the digits already in this run/);
        } else {
          expect(text, `${f.because}: cites digits that are not there`).not.toContain(
            "already in this run",
          );
        }
        if (f.because === "length") {
          expect(text).toMatch(/^This run is \d+ squares long, and only one number/);
        }
        if (f.because === "used") {
          expect(text).toMatch(/^Every other \d+-digit number is already on the board/);
        }
      });
    }
    // "length" opens a fresh board and "digits" carries the mid-solve steps;
    // both must be exercised for the assertions above to mean anything.
    expect([...seen].sort()).toEqual(["digits", "length", "used"]);
  });

  it("narrates each technique in the necessity voice, naming its premise", () => {
    const texts = new Map<string, string>();
    for (const [k, { f, state }] of found) {
      texts.set(k, narrateCrossing(state.puzzle, f));
    }
    expect(texts.get("onlyNumber")).toMatch(/so it must be \d+\.$/);
    expect(texts.get("sharedDigit")).toMatch(
      /^Every number that (still fits|can still go in) this (across|down) run/,
    );
    expect(texts.get("sharedDigit")).toMatch(/so it must be \d\.$/);
    // The crossing deduction names both runs and never lists candidates with
    // "and" (which would read as "both at once", the opposite of the claim).
    const cross = texts.get("crossRuns") ?? "";
    expect(cross).toMatch(/^(Across|Down), this square can only be/);
    expect(cross).toMatch(/rules out all but (\d), so it must be \1\.$/);
    expect(cross.split(", and the ")[0]).not.toMatch(/ and /);
  });

  it("keeps every narration terse enough to read in the banner", () => {
    for (const [, { f, state }] of found) {
      expect(narrateCrossing(state.puzzle, f).length).toBeLessThanOrEqual(300);
    }
  });
});

// A hand-authored, deliberately ambiguous board: two 4-square runs separated by
// a wall row, and two 4-digit numbers that could go in either. Nothing can be
// deduced — which is exactly the position that reaches the rule-out rung, and
// the "no further move" refusal.
const AMBIGUOUS: CrossingParams = { w: 4, h: 3, sym: false };
const AMBIGUOUS_DESC = "4d4,1234,5678";

describe("crossing hint — ruling a candidate out", () => {
  const noted = (marks: [number, number, number][]): CrossingState => {
    let state = newState(AMBIGUOUS, AMBIGUOUS_DESC);
    for (const [x, y, digit] of marks) {
      state = crossingGame.executeMove(state, { kind: "pencil", x, y, digit });
    }
    return state;
  };

  it("strikes a note no still-fitting number supports, and only that note", () => {
    // Position 0 of either number is 1 or 5; a penciled 9 is refuted, the 1 is
    // not. Deduction is otherwise exhausted here, which is what lets the tail
    // rung surface at all.
    const state = noted([
      [0, 0, 9],
      [0, 0, 1],
    ]);
    const res = crossingGame.hint?.(state);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    const step = res.steps[0] as Step;
    expect(step.move).toEqual({
      kind: "pencilStrike",
      marks: [{ x: 0, y: 0, n: 9 }],
    });
    expect(step.explanation).toMatch(/^No number that still fits this across run/);
    expect(step.explanation).toMatch(/so rule it out\.$/);
    // The rule-out is marked on the candidate, not as a placement.
    expect(step.highlights?.marks).toEqual([{ x: 0, y: 0, n: 9 }]);
  });

  it("the strike move only ever removes, so replaying it is idempotent", () => {
    const state = noted([
      [0, 0, 9],
      [0, 0, 1],
    ]);
    const move: CrossingMove = {
      kind: "pencilStrike",
      marks: [{ x: 0, y: 0, n: 9 }],
    };
    const once = crossingGame.executeMove(state, move);
    const twice = crossingGame.executeMove(once, move);
    expect([...twice.pencil]).toEqual([...once.pencil]);
    expect(once.pencil[0]).toBe(1); // the 1 survives, the 9 is gone
  });
});

describe("crossing hint — refusals", () => {
  it("refuses a solved board", () => {
    const state = board(crossingPresets[0], "hint-refuse-solved");
    const answer = solveCrossing(state.puzzle);
    const solved = crossingGame.executeMove(state, {
      kind: "solve",
      grid: Array.from(answer.grid),
    });
    const res = crossingGame.hint?.(solved);
    expect(res).toEqual({ ok: false, error: ALREADY_SOLVED });
  });

  it("refuses a board carrying a wrong entry, pointing at the overlay", () => {
    const state = board(crossingPresets[0], "hint-refuse-wrong");
    const answer = solveCrossing(state.puzzle);
    const i = state.puzzle.walls.findIndex((wall) => !wall);
    const wrong = crossingGame.executeMove(state, {
      kind: "set",
      x: i % state.puzzle.w,
      y: Math.floor(i / state.puzzle.w),
      digit: answer.grid[i] === 9 ? 8 : 9,
    });
    const res = crossingGame.hint?.(wrong);
    expect(res?.ok).toBe(false);
    if (res?.ok) return;
    expect(res?.error).toMatch(/^Fix the highlighted mistakes first/);
    expect(crossingGame.findMistakes?.(wrong).length).toBeGreaterThan(0);
  });

  it("refuses a note that rules out the answer, rather than reasoning from it", () => {
    // The scenario the spec calls out: a pencil note is a first-class marking,
    // so a note excluding the solution's digit is a mistake, not a position to
    // deduce from.
    const state = board(crossingPresets[0], "hint-refuse-note");
    const answer = solveCrossing(state.puzzle);
    const i = state.puzzle.walls.findIndex((wall) => !wall);
    const x = i % state.puzzle.w;
    const y = Math.floor(i / state.puzzle.w);
    const other = answer.grid[i] === 1 ? 2 : 1;
    const noted = crossingGame.executeMove(state, {
      kind: "pencil",
      x,
      y,
      digit: other,
    });
    expect(crossingGame.findMistakes?.(noted)).toEqual([{ x, y, kind: "note" }]);
    const res = crossingGame.hint?.(noted);
    expect(res?.ok).toBe(false);
    if (res?.ok) return;
    expect(res?.error).toMatch(/^Fix the highlighted mistakes first/);
  });

  it("refuses a position nothing can be deduced from", () => {
    const state = newState(AMBIGUOUS, AMBIGUOUS_DESC);
    expect(crossingGame.findMistakes?.(state)).toEqual([]);
    const res = crossingGame.hint?.(state);
    expect(res).toEqual({ ok: false, error: DEDUCTION_EXHAUSTED });
  });
});

describe("crossing hint — following the plan", () => {
  const firstStep = (state: CrossingState): Step => {
    const res = crossingGame.hint?.(state);
    if (!res?.ok) throw new Error("hint refused");
    return res.steps[0] as Step;
  };

  it("counts a clue-list placement of the hinted number as completing the step", () => {
    const state = board(crossingPresets[0], "hint-track-place");
    const step = firstStep(state);
    if (step.move.kind !== "place") throw new Error("expected a whole-run step");
    expect(crossingGame.hintKeepTrack?.(step.move, step, state)).toBe("completed");
  });

  it("counts typing the number in digit by digit as following it", () => {
    // Auto-advance makes this the natural way to enter a run, so it must not
    // read as going off-plan.
    const state = board(crossingPresets[0], "hint-track-place");
    const step = firstStep(state);
    if (step.move.kind !== "place") throw new Error("expected a whole-run step");
    const cells = state.puzzle.runs[step.move.run].cells;
    const num = state.puzzle.numbers[step.move.number];
    let cur = state;
    const verdicts: string[] = [];
    for (let k = 0; k < cells.length; k++) {
      const m: CrossingMove = {
        kind: "set",
        x: cells[k] % state.puzzle.w,
        y: Math.floor(cells[k] / state.puzzle.w),
        digit: num.charCodeAt(k) - 48,
      };
      verdicts.push(crossingGame.hintKeepTrack?.(m, step, cur) ?? "?");
      cur = crossingGame.executeMove(cur, m);
    }
    expect(verdicts.slice(0, -1).every((v) => v === "onTrack")).toBe(true);
    expect(verdicts[verdicts.length - 1]).toBe("completed");
  });

  it("drops the plan on a digit the step did not ask for", () => {
    const state = board(crossingPresets[0], "hint-track-place");
    const step = firstStep(state);
    if (step.move.kind !== "place") throw new Error("expected a whole-run step");
    const cells = state.puzzle.runs[step.move.run].cells;
    const num = state.puzzle.numbers[step.move.number];
    const wrong = num.charCodeAt(0) - 48 === 9 ? 8 : 9;
    const verdict = crossingGame.hintKeepTrack?.(
      {
        kind: "set",
        x: cells[0] % state.puzzle.w,
        y: Math.floor(cells[0] / state.puzzle.w),
        digit: wrong,
      },
      step,
      state,
    );
    expect(verdict).toBe("off");
  });

  it("resolves a whole-run step once the run is full, and shrinks it before that", () => {
    const state = board(crossingPresets[0], "hint-track-place");
    const step = firstStep(state);
    if (step.move.kind !== "place") throw new Error("expected a whole-run step");
    expect(crossingGame.refreshHintStep?.(step, state)).toBe(step);

    const cells = state.puzzle.runs[step.move.run].cells;
    const num = state.puzzle.numbers[step.move.number];
    const partial = crossingGame.executeMove(state, {
      kind: "set",
      x: cells[0] % state.puzzle.w,
      y: Math.floor(cells[0] / state.puzzle.w),
      digit: num.charCodeAt(0) - 48,
    });
    const shrunk = crossingGame.refreshHintStep?.(step, partial) as Step | null;
    expect(shrunk?.highlights?.targets.length).toBe(cells.length - 1);

    const full = crossingGame.executeMove(state, step.move);
    expect(crossingGame.refreshHintStep?.(step, full)).toBeNull();
  });

  it("shrinks a rule-out step as its candidates go, and resolves when they are gone", () => {
    let state = newState(AMBIGUOUS, AMBIGUOUS_DESC);
    for (const digit of [9, 7, 1]) {
      state = crossingGame.executeMove(state, { kind: "pencil", x: 0, y: 0, digit });
    }
    const step = firstStep(state);
    if (step.move.kind !== "pencilStrike") throw new Error("expected a strike step");
    expect(step.move.marks.map((m) => m.n).sort()).toEqual([7, 9]);

    // The player strikes one of the two by hand: the step shrinks and stays up.
    const toggle: CrossingMove = { kind: "pencil", x: 0, y: 0, digit: 9 };
    expect(crossingGame.hintKeepTrack?.(toggle, step, state)).toBe("onTrack");
    state = crossingGame.executeMove(state, toggle);
    expect((step.move as { marks: readonly unknown[] }).marks).toHaveLength(1);

    // Striking the last one completes it; a refresh past that resolves.
    const last: CrossingMove = { kind: "pencil", x: 0, y: 0, digit: 7 };
    expect(crossingGame.hintKeepTrack?.(last, step, state)).toBe("completed");
    state = crossingGame.executeMove(state, last);
    expect(crossingGame.refreshHintStep?.(step, state)).toBeNull();
  });
});

describe("crossing hint — the frame", () => {
  const scenario = (seed: string) =>
    renderScenario({
      game: crossingGame,
      id: `${crossingGame.encodeParams(crossingPresets[0], true)}#${seed}`,
      showHint: true,
    });

  it("marks the squares to fill and shades the run it reasoned over", () => {
    const res = scenario("hint-frame");
    expect(res.hint).toBeDefined();
    const rects = res.recording.ops.filter((o) => o.op === "rect");
    expect(rects.some((o) => o.color === COL_HINT)).toBe(true);
    expect(rects.some((o) => o.color === COL_HINT_CELL)).toBe(true);
  });

  it("names at least one listed number as evidence, and paints it in the panel", () => {
    // Every technique reasons over *which listed numbers still fit*, and that
    // set lives in the clue list. A grid-only highlight would make the
    // narration point at something the player cannot see.
    const res = scenario("hint-frame");
    const hint = res.hint as Step | undefined;
    expect(hint?.highlights?.numbers.length ?? 0).toBeGreaterThan(0);

    // The panel sits below the grid; a hint patch must land there.
    const gridBottom = (crossingPresets[0].h + 0.5) * PREFERRED_TILE_SIZE;
    const inPanel = res.recording.ops.filter(
      (o) => o.op === "rect" && o.y >= gridBottom,
    );
    expect(
      inPanel.some(
        (o) => o.op === "rect" && (o.color === COL_HINT || o.color === COL_HINT_CELL),
      ),
      "no hint patch in the clue list",
    ).toBe(true);
  });

  it("puts the dimension wash away while a hint is displayed", () => {
    // Crossing's pale blue "this is an across run" wash and the collection's
    // hint blue are near-identical, so the hint takes green and owns the
    // board's coloring for as long as it is up.
    const params = crossingPresets[0];
    const state = board(params, "hint-wash");
    const res = crossingGame.hint?.(state);
    if (!res?.ok) throw new Error("hint refused");
    // A square in a run is selected, so without the hint its runs are washed.
    const cell = state.puzzle.runs[0].cells[0];
    const ui: CrossingUi = {
      ...crossingGame.newUi(state),
      cursor: newCursor(cell % params.w, Math.floor(cell / params.w), true),
    };
    const washes = (step?: Step): number => {
      const ds = crossingGame.newDrawState(state);
      crossingGame.setTileSize?.(ds, PREFERRED_TILE_SIZE);
      const dr = new RecordingDrawing(crossingGame.colors(DEFAULT_BACKGROUND));
      crossingGame.redraw(dr, ds, null, state, 1, ui, 0, 0, step);
      return dr.ops.filter(
        (o) => o.op === "rect" && (o.color === COL_ACROSS || o.color === COL_DOWN),
      ).length;
    };
    expect(washes()).toBeGreaterThan(0);
    expect(washes(res.steps[0] as Step)).toBe(0);
  });

  type CrossingMidend = Midend<
    CrossingParams,
    CrossingState,
    CrossingMove,
    CrossingUi,
    CrossingDrawState
  >;

  /** Click the square at cell index `i` (a selection, not a move). With no
   * drawstate the midend falls back to the preferred tile size. */
  const clickCell = (
    midend: CrossingMidend,
    w: number,
    i: number,
    ts: number = PREFERRED_TILE_SIZE,
  ): void => {
    const half = Math.floor(ts / 2);
    midend.processInput(
      (i % w) * ts + half + 2,
      Math.floor(i / w) * ts + half + 2,
      LEFT_BUTTON,
    );
  };

  /** A midend on a fresh board with its first hint displayed. */
  const hinted = (seed: string): { midend: CrossingMidend; step: Step } => {
    const midend = new Midend(crossingGame);
    const id = `${crossingGame.encodeParams(crossingPresets[0], true)}#${seed}`;
    expect(midend.newGameFromId(id)).toBeUndefined();
    expect(midend.hint()).toBeUndefined();
    const step = midend.activeHintStep() as Step | undefined;
    expect(step).toBeDefined();
    if (!step) throw new Error("no hint step");
    return { midend, step };
  };

  it("a click outside the hint puts it away and gives the board back", () => {
    // Without this, clicking a square to carry on by hand would leave the hint
    // on screen *and* — because a displayed hint suppresses the run wash — do
    // nothing visible at all, leaving no way out of hint mode. A selection
    // change is a `UI_UPDATE`, which `hintKeepTrack` never sees;
    // `uiUpdateClearsHint` is what dismisses it (Subsets' precedent).
    const { midend, step } = hinted("hint-dismiss");
    const params = crossingPresets[0];
    const puzzle = board(params, "hint-dismiss").puzzle;
    const inHint = new Set(
      [...(step.highlights?.area ?? []), ...(step.highlights?.targets ?? [])].map(
        (c) => c.y * params.w + c.x,
      ),
    );
    const away = [...puzzle.walls].findIndex(
      (wall, i) => !wall && !inHint.has(i) && puzzle.acrossRun[i] >= 0,
    );
    expect(away, "no open square outside the hint").toBeGreaterThanOrEqual(0);

    clickCell(midend, params.w, away);
    expect(midend.activeHintStep()).toBeUndefined();
  });

  it("a click inside the hint keeps it up, so it can be followed by hand", () => {
    // Clicking into the squares the hint is about must not delete the
    // explanation of what to type there.
    const { midend, step } = hinted("hint-dismiss");
    const params = crossingPresets[0];
    const inside = step.highlights?.area[0];
    expect(inside).toBeDefined();
    if (!inside) return;

    clickCell(midend, params.w, inside.y * params.w + inside.x);
    expect(midend.activeHintStep()).toBeDefined();
  });

  it("keeps the cursor visible on a square the hint has marked", () => {
    // The corollary of keeping the hint up: the player has to see where they are
    // about to type. The mark is a *ring*, so the background is still the
    // selection's and both cues show at once — the ring saying which square the
    // deduction is about, the fill saying which square the keystroke goes to.
    const params = crossingPresets[0];
    const palette = crossingGame.colors(DEFAULT_BACKGROUND);

    /** Click `cell` on a board whose hint is (or is not) displayed, and report
     * the frame it produces. */
    const frameAfterClick = (showHint: boolean, cell: { x: number; y: number }) => {
      const midend = new Midend(crossingGame);
      const id = `${crossingGame.encodeParams(params, true)}#hint-dismiss`;
      expect(midend.newGameFromId(id)).toBeUndefined();
      const size = midend.size({ w: 600, h: 900 });
      const ts = size.w / (params.w + 1);
      if (showHint) expect(midend.hint()).toBeUndefined();
      midend.redraw(new RecordingDrawing(palette));
      clickCell(midend, params.w, cell.y * params.w + cell.x, ts);

      const frame = new RecordingDrawing(palette);
      midend.redraw(frame);
      return { frame, ts };
    };

    const { step } = hinted("hint-dismiss");
    const target = step.highlights?.targets[0];
    expect(target).toBeDefined();
    if (!target) return;

    /** Is the selection fill drawn over the whole of cell `c`? */
    const selectionFill = (
      ops: readonly { op: string; color?: number; x?: number; y?: number }[],
      c: { x: number; y: number },
      ts: number,
    ) =>
      ops.some(
        (o) =>
          o.op === "rect" &&
          o.color === COL_SELECTED &&
          o.x === Math.round(c.x * ts + ts / 2) &&
          o.y === Math.round(c.y * ts + ts / 2),
      );

    const hintUp = frameAfterClick(true, target);
    const plain = frameAfterClick(false, target);
    // The selection reads the same way whether or not a hint is displayed —
    // which is the whole gain from ringing rather than filling.
    expect(selectionFill(hintUp.frame.ops, target, hintUp.ts)).toBe(true);
    expect(selectionFill(plain.frame.ops, target, plain.ts)).toBe(true);
    // ...and only the hinted frame carries the ring. The count covers the clue
    // list too: a whole-run placement boxes the number it writes in, in the same
    // color and the same shape as the square it writes it into.
    const boxes =
      (step.highlights?.targets.length ?? 0) +
      (step.highlights?.numberTarget == null ? 0 : 1);
    expectRing(hintUp.frame.ops, COL_HINT, boxes);
    expect(markSides(plain.frame.ops, COL_HINT)).toHaveLength(0);
  });

  it("matches its recorded frame", () => {
    expect(scenario("hint-frame").recording.ops).toMatchSnapshot();
  });
});

// A 4x3 board walled down to exactly two runs, both 3 long, crossing at (1,1):
// an across run at y=1 (x=0..2) and a down run at x=1 (y=0..2).
const CROSS: CrossingParams = { w: 4, h: 3, sym: false };
const CROSS_DESC = "a1b3b1b,421,265";

describe("crossing clue placement — which run a clue goes in", () => {
  it("prefers the run the board already constrains, not the fill direction", () => {
    // With "4_1" written across and the crossing down run still blank, both
    // runs admit 421, and the sticky fill direction must not decide: agreeing
    // with digits the player has already entered is evidence of what they
    // meant; a blank run admits every number of its length, so it is no
    // evidence at all.
    let state = newState(CROSS, CROSS_DESC);
    state = crossingGame.executeMove(state, { kind: "set", x: 0, y: 1, digit: 4 });
    state = crossingGame.executeMove(state, { kind: "set", x: 2, y: 1, digit: 1 });

    const l = state.puzzle.numbers.indexOf("421");
    expect(l).toBeGreaterThanOrEqual(0);
    const placed = placedRuns(state.puzzle, state.grid);
    const across = state.puzzle.acrossRun[1 * CROSS.w + 1];
    const down = state.puzzle.downRun[1 * CROSS.w + 1];
    expect(across).toBeGreaterThanOrEqual(0);
    expect(down).toBeGreaterThanOrEqual(0);

    // Both runs admit it, so this is exactly the tie in question.
    expect(numberAvailableTo(state.puzzle, state.grid, placed, across, l)).toBe(true);
    expect(numberAvailableTo(state.puzzle, state.grid, placed, down, l)).toBe(true);

    for (const dir of ["across", "down"] as const) {
      expect(
        runForNumber(state.puzzle, state.grid, placed, 1, 1, l, dir),
        `dir=${dir}: should complete the partly-written run`,
      ).toBe(across);
    }
  });

  it("still lets the fill direction decide when neither run is more constrained", () => {
    const state = newState(CROSS, CROSS_DESC);
    const l = state.puzzle.numbers.indexOf("421");
    const placed = placedRuns(state.puzzle, state.grid);
    const across = state.puzzle.acrossRun[1 * CROSS.w + 1];
    const down = state.puzzle.downRun[1 * CROSS.w + 1];
    expect(runForNumber(state.puzzle, state.grid, placed, 1, 1, l, "across")).toBe(
      across,
    );
    expect(runForNumber(state.puzzle, state.grid, placed, 1, 1, l, "down")).toBe(down);
  });
});
