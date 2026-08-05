/**
 * Behavioural tests for the Subsets port (add-subsets-ts-port): params and
 * desc codecs with upstream's exact validation messages, the six-rule
 * solver's three verdicts, the generator's tier-1 properties, the
 * tri-state slot input (pointer + keyboard, gap-skipping cursor),
 * `executeMove` and completion, Solve through a real `Midend` (including
 * the faithful upstream quirk that Solve does not mark the game
 * completed), `findMistakes`, text format, and tier-2.5 render scenarios
 * with snapshots.
 */
import { describe, expect, it } from "vitest";
import { UI_UPDATE } from "../../engine/game.ts";
import { Midend } from "../../engine/index.ts";
import {
  CURSOR_DOWN,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  LEFT_BUTTON,
  MIDDLE_BUTTON,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import { randomNew } from "../../engine/random/index.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { seedBudget } from "../../engine/testing/slow.ts";
import type { ChangeNotification, GameStatus } from "../../engine/types.ts";
import cReference from "./__fixtures__/subsets-c-reference.json" with { type: "json" };
import { generateCandidate, newSubsetsDesc } from "./generator.ts";
import { subsetsGame } from "./index.ts";
import {
  COL_ERROR,
  COL_HIGHLIGHT,
  COL_INNERBG,
  newDrawState,
  redraw,
  setTileSize,
} from "./render.ts";
import {
  deduceHintPlan,
  findMistakes,
  solveCopy,
  subsetsSolveGame,
  subsetsValidate,
} from "./solver.ts";
import {
  ALL_BITS,
  cloneState,
  DIFF_EASY,
  DIFF_NAMES,
  DIFF_TRICKY,
  decodeParams,
  defaultParams,
  encodeDesc,
  encodeParams,
  newState,
  type SubsetsMove,
  type SubsetsState,
  type SubsetsUi,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

const PARAMS = { w: 4, h: 4, n: 4, diff: DIFF_EASY };
const FIX = cReference.fixtures[0];
const FIX_ID = `4x4n4:${FIX.desc}`;

/** The fixture board's unique solution (known === mask everywhere). */
function fixtureSolution(): SubsetsState {
  const { solved, result } = solveCopy(newState(PARAMS, FIX.desc));
  expect(result).toBe("complete");
  return solved;
}

/** The `set` moves that fill the fixture board to its solution: for every
 * non-given cell, each letter set known or cleared per the solution. */
function solutionMoves(): Extract<SubsetsMove, { kind: "set" }>[] {
  const solution = fixtureSolution();
  const start = newState(PARAMS, FIX.desc);
  const moves: Extract<SubsetsMove, { kind: "set" }>[] = [];
  for (let i = 0; i < 16; i++) {
    if (start.immutable[i]) continue;
    for (let b = 0; b < 4; b++) {
      moves.push({
        kind: "set",
        type: solution.known[i] & (1 << b) ? "known" : "cleared",
        pos: i,
        bit: b,
      });
    }
  }
  return moves;
}

const newUi = (): SubsetsUi => subsetsGame.newUi(newState(PARAMS, FIX.desc));

/** Drive interpretMove at the default 36px tile size (half-tile border). */
function press(
  state: SubsetsState,
  ui: SubsetsUi,
  button: number,
  x: number,
  y: number,
): SubsetsMove | null | typeof UI_UPDATE {
  return subsetsGame.interpretMove(state, ui, null, { x, y }, button);
}

/** Pixel centre of letter slot (sx, sy) of cell (cx, cy) at 36px tiles. */
const slotCentre = (
  cx: number,
  cy: number,
  sx: number,
  sy: number,
): { x: number; y: number } => ({
  x: Math.floor((cx * 3 + sx + 1) * 36),
  y: Math.floor((cy * 3 + sy + 1) * 36),
});

/** A midend plus a reader of the last notified game status. */
function harness() {
  const notes: ChangeNotification[] = [];
  const m = new Midend(subsetsGame);
  m.setCallbacks(
    (n) => notes.push(n),
    () => {},
    () => {},
  );
  const status = (): GameStatus | undefined =>
    (
      [...notes].reverse().find((n) => n.type === "game-state-change") as
        | Extract<ChangeNotification, { type: "game-state-change" }>
        | undefined
    )?.status;
  return { m, status };
}

// ---------------------------------------------------------------------------

describe("subsets params", () => {
  it("encode/decode round-trips", () => {
    expect(encodeParams(PARAMS, true)).toBe("4x4n4de");
    expect(decodeParams("4x4n4de")).toEqual(PARAMS);
    const tricky = { ...PARAMS, diff: DIFF_TRICKY };
    expect(encodeParams(tricky, true)).toBe("4x4n4dt");
    expect(decodeParams("4x4n4dt")).toEqual(tricky);
  });

  it("the short form drops the tier; every tier gets its own full ID", () => {
    // The non-vacuous half of the contract's tier guard, asserted locally too:
    // a tier that does not survive the codec to a distinct ID is a tier the
    // player cannot link to.
    expect(encodeParams(PARAMS, false)).toBe("4x4n4");
    const ids = new Set(
      DIFF_NAMES.map((_, diff) => encodeParams({ ...PARAMS, diff }, true)),
    );
    expect(ids.size).toBe(DIFF_NAMES.length);
  });

  it("rejects an unrecognised difficulty char rather than silently downgrading", () => {
    expect(validateParams(decodeParams("4x4n4dz"), true)).toBe(
      "Unknown difficulty rating",
    );
  });

  it("decode is lenient (bare width, missing n)", () => {
    expect(decodeParams("4")).toEqual({ w: 4, h: 4, n: 4, diff: DIFF_EASY });
    expect(decodeParams("5x6")).toEqual({ w: 5, h: 6, n: 4, diff: DIFF_EASY });
  });

  it("accepts only 4x4 n=4, with the upstream message", () => {
    expect(validateParams(PARAMS, true)).toBeNull();
    for (const bad of [
      { w: 5, h: 4, n: 4, diff: DIFF_EASY },
      { w: 4, h: 5, n: 4, diff: DIFF_EASY },
      { w: 4, h: 4, n: 3, diff: DIFF_EASY },
    ]) {
      expect(validateParams(bad, true)).toBe(
        "Currently only 4x4 puzzles are supported",
      );
    }
  });
});

describe("subsets desc codec", () => {
  it("decodes a fixture desc and re-encodes it identically", () => {
    const state = newState(PARAMS, FIX.desc);
    expect(encodeDesc(state)).toBe(FIX.desc);
  });

  it("the encoding is stable across play (player edits don't leak in)", () => {
    const state = newState(PARAMS, FIX.desc);
    const i = state.immutable.indexOf(0);
    const played = subsetsGame.executeMove(state, {
      kind: "set",
      type: "known",
      pos: i,
      bit: 0,
    });
    expect(encodeDesc(played)).toBe(FIX.desc);
  });

  it("rejects each malformed desc with the upstream message", () => {
    const blanks = (k: number): string =>
      Array.from({ length: k }, () => "_").join(",");
    expect(validateDesc(PARAMS, `${blanks(17)}`)).toBe("Too much data to fill grid");
    expect(validateDesc(PARAMS, `16,${blanks(15)}`)).toBe(
      "Out-of-range number in game description",
    );
    expect(validateDesc(PARAMS, `x,${blanks(15)}`)).toBe(
      "Expecting number in game description",
    );
    expect(validateDesc(PARAMS, "1 2")).toBe("Missing separator");
    // "Not enough data" needs a trailing comma — otherwise the missing
    // separator is detected first (upstream quirk, reproduced).
    expect(validateDesc(PARAMS, "1")).toBe("Missing separator");
    expect(validateDesc(PARAMS, "1,2,")).toBe("Not enough data to fill grid");
    expect(validateDesc(PARAMS, `0U,${blanks(15)}`)).toBe("Flags go off grid");
    expect(validateDesc(PARAMS, `0R,1L,${blanks(14)}`)).toBe(
      "Flags contradicting each other",
    );
  });
});

describe("subsets solver", () => {
  it("solves a generated board to completion", () => {
    const solution = fixtureSolution();
    for (let i = 0; i < 16; i++) {
      expect(solution.known[i]).toBe(solution.mask[i]);
    }
    // Every set-value placed exactly once.
    const seen = new Set(Array.from(solution.known));
    expect(seen.size).toBe(16);
  });

  it("reports invalid for a board with duplicated givens", () => {
    // All sixteen cells given, value 0 twice, value 15 missing.
    const tokens = Array.from({ length: 16 }, (_, i) => (i === 15 ? "0" : String(i)));
    const state = newState(PARAMS, tokens.join(","));
    expect(subsetsSolveGame(state, DIFF_EASY)).toBe("invalid");
  });

  it("reports unfinished for an underdetermined board", () => {
    // No givens, no arrows: nothing forces any placement.
    const state = newState(PARAMS, Array.from({ length: 16 }, () => "_").join(","));
    expect(subsetsSolveGame(state, DIFF_TRICKY)).toBe("unfinished");
  });

  it("validate classifies a partially-played board as unfinished", () => {
    const state = newState(PARAMS, FIX.desc);
    expect(subsetsValidate(state)).toBe("unfinished");
  });
});

describe("subsets generator (tier 1)", () => {
  it("generates a valid, uniquely-solvable desc, deterministically", () => {
    const { desc } = newSubsetsDesc(PARAMS, randomNew("tier1-seed"));
    expect(validateDesc(PARAMS, desc)).toBeNull();
    const { result } = solveCopy(newState(PARAMS, desc));
    expect(result).toBe("complete");
    expect(newSubsetsDesc(PARAMS, randomNew("tier1-seed")).desc).toBe(desc);
  });
});

// --- difficulty tiers (add-subsets-difficulty-tiers) ------------------------
//
// The cross-game contract guards (`engine/difficulty-contract.test.ts`) already
// hold cap-monotonicity and tier-reachability for this game; what is left here
// is what only Subsets can assert — that the restored head half of
// `applyArrowsAdvanced` is *sound*, and that the tier gate actually binds.

const TRICKY = { ...PARAMS, diff: DIFF_TRICKY };

describe("subsets difficulty tiers", () => {
  it("a Tricky board needs the restored rung: it does not solve at Easy", () => {
    const boards = seedBudget(6, 24);
    for (let s = 0; s < boards; s++) {
      const { desc } = newSubsetsDesc(TRICKY, randomNew(`tricky-${s}`));
      expect(validateDesc(TRICKY, desc)).toBeNull();
      expect(subsetsSolveGame(newState(TRICKY, desc), DIFF_TRICKY)).toBe("complete");
      expect(subsetsSolveGame(newState(TRICKY, desc), DIFF_EASY)).not.toBe("complete");
    }
  });

  it("the restored rung is sound: it never eliminates the true solution", () => {
    // The one property that matters, and the one the C's `// TODO repair this`
    // put in doubt. An *unsound* elimination is worse than a weak solver: it
    // yields boards whose advertised unique solution the solver has ruled out.
    // `generateCandidate` hands back the full assignment it blanked (the desc
    // hides it, `known` does not), so this compares the capped solve against
    // the board's own truth rather than against the other cap.
    const boards = seedBudget(40, 200);
    for (let s = 0; s < boards; s++) {
      const truth = generateCandidate(TRICKY, randomNew(`sound-${s}`));
      const solved = newState(TRICKY, encodeDesc(truth));
      expect(subsetsSolveGame(solved, DIFF_TRICKY)).toBe("complete");
      expect([...solved.known]).toEqual([...truth.known]);
    }
  });

  it("Easy generation is untouched: it draws upstream's rules, in order", () => {
    // The differential fixtures are the real statement of this (12 C-recorded
    // descs, reproduced byte-for-byte on the live default path). This is the
    // local restatement: the tier that reproduces today's boards exists, and it
    // is the default.
    expect(defaultParams().diff).toBe(DIFF_EASY);
    const { desc } = newSubsetsDesc(PARAMS, randomNew("tier1-seed"));
    expect(newSubsetsDesc(defaultParams(), randomNew("tier1-seed")).desc).toBe(desc);
  });

  it("the hint plan reaches the end of a Tricky board", () => {
    // A hint that cannot narrate a deduction the solver uses fails the bar: the
    // recorder has to carry the restored rung too, or a Tricky board's plan
    // stops partway with nothing to say.
    const boards = seedBudget(4, 20);
    for (let s = 0; s < boards; s++) {
      const { desc } = newSubsetsDesc(TRICKY, randomNew(`hintable-${s}`));
      expect(deduceHintPlan(newState(TRICKY, desc)).status).toBe("complete");
      // And the rung is load-bearing, not decorative: capped below it the same
      // recorder stalls. Without this the Easy-plan test below would be
      // comparing two things that could never have differed.
      expect(deduceHintPlan(newState(TRICKY, desc), DIFF_EASY).status).toBe(
        "unfinished",
      );
    }
  });

  it("an Easy board's hint plan does not reach for the Tricky rung", () => {
    // The rung is a *fallback*, engaged only once the cheaper vocabulary runs
    // out — which on an Easy board it never does. So an Easy plan is exactly
    // the plan this game shipped before it had tiers.
    //
    // Asserted, not assumed: the same board is planned by the production
    // recorder (which *can* reach the rung) and by one capped below it, and the
    // two plans must be identical firing for firing. An earlier cut ran the
    // rung unconditionally, which is sound but silently re-planned Easy boards;
    // this is the check that would have caught it without a render snapshot.
    const boards = seedBudget(4, 20);
    for (let s = 0; s < boards; s++) {
      const { desc } = newSubsetsDesc(PARAMS, randomNew(`easyplan-${s}`));
      const full = deduceHintPlan(newState(PARAMS, desc));
      const capped = deduceHintPlan(newState(PARAMS, desc), DIFF_EASY);
      expect(full.status).toBe("complete");
      expect(full.deductions.length).toBeGreaterThan(0);
      expect(capped).toEqual(full);
    }
  });
});

describe("subsets input", () => {
  it("left-click cycles a slot unknown -> known -> cleared -> unknown", () => {
    let state = newState(PARAMS, FIX.desc);
    const i = state.immutable.indexOf(0);
    const c = slotCentre(i % 4, Math.floor(i / 4), 0, 0);
    const ui = newUi();

    const m1 = press(state, ui, LEFT_BUTTON, c.x, c.y);
    expect(m1).toEqual({ kind: "set", type: "known", pos: i, bit: 0 });
    state = subsetsGame.executeMove(state, m1 as SubsetsMove);

    const m2 = press(state, ui, LEFT_BUTTON, c.x, c.y);
    expect(m2).toEqual({ kind: "set", type: "cleared", pos: i, bit: 0 });
    state = subsetsGame.executeMove(state, m2 as SubsetsMove);

    const m3 = press(state, ui, LEFT_BUTTON, c.x, c.y);
    expect(m3).toEqual({ kind: "set", type: "unknown", pos: i, bit: 0 });
  });

  it("right-click cycles the other way; middle resets to unknown", () => {
    let state = newState(PARAMS, FIX.desc);
    const i = state.immutable.indexOf(0);
    const c = slotCentre(i % 4, Math.floor(i / 4), 1, 1);
    const ui = newUi();

    const m1 = press(state, ui, RIGHT_BUTTON, c.x, c.y);
    expect(m1).toEqual({ kind: "set", type: "cleared", pos: i, bit: 3 });
    state = subsetsGame.executeMove(state, m1 as SubsetsMove);

    const m2 = press(state, ui, RIGHT_BUTTON, c.x, c.y);
    expect(m2).toEqual({ kind: "set", type: "known", pos: i, bit: 3 });
    state = subsetsGame.executeMove(state, m2 as SubsetsMove);

    const m3 = press(state, ui, MIDDLE_BUTTON, c.x, c.y);
    expect(m3).toEqual({ kind: "set", type: "unknown", pos: i, bit: 3 });
  });

  it("an immutable slot rejects every toggle", () => {
    const state = newState(PARAMS, FIX.desc);
    const i = state.immutable.findIndex((m) => m !== 0);
    const c = slotCentre(i % 4, Math.floor(i / 4), 0, 0);
    expect(press(state, newUi(), LEFT_BUTTON, c.x, c.y)).toBeNull();
    expect(press(state, newUi(), RIGHT_BUTTON, c.x, c.y)).toBeNull();
  });

  it("a click in the gap between cell blocks does nothing", () => {
    const state = newState(PARAMS, FIX.desc);
    // Virtual column 2 is the first gap: pixel x ~ (2 + 0.5 + 0.5) * 36.
    expect(press(state, newUi(), LEFT_BUTTON, 3 * 36, 36)).toBeNull();
    // Inside the half-tile border.
    expect(press(state, newUi(), LEFT_BUTTON, 5, 5)).toBeNull();
  });

  it("the keyboard cursor skips gap columns and toggles with select keys", () => {
    const state = newState(PARAMS, FIX.desc);
    const ui = newUi();
    expect(press(state, ui, CURSOR_RIGHT, 0, 0)).toBe(UI_UPDATE);
    expect(ui.cshow).toBe(true);
    expect(ui.cx).toBe(1);
    // The next step crosses the gap column (2) straight to column 3.
    expect(press(state, ui, CURSOR_RIGHT, 0, 0)).toBe(UI_UPDATE);
    expect(ui.cx).toBe(3);
    expect(press(state, ui, CURSOR_DOWN, 0, 0)).toBe(UI_UPDATE);
    expect(ui.cy).toBe(1);

    // Cursor now on cell (1,0)'s slot (0,1) = letter 2.
    const pos = 1;
    const bit = 2;
    if (state.immutable[pos]) return; // fixture-dependent guard
    const m = press(state, ui, CURSOR_SELECT, 0, 0);
    expect(m).toEqual({ kind: "set", type: "known", pos, bit });
    const s2 = subsetsGame.executeMove(state, m as SubsetsMove);
    // Backspace resets to unknown; Select2 from unknown clears.
    expect(press(s2, ui, 8, 0, 0)).toEqual({
      kind: "set",
      type: "unknown",
      pos,
      bit,
    });
    expect(press(state, ui, CURSOR_SELECT2, 0, 0)).toEqual({
      kind: "set",
      type: "cleared",
      pos,
      bit,
    });
  });

  it("the cursor clamps at the far edge without entering a gap", () => {
    const state = newState(PARAMS, FIX.desc);
    const ui = newUi();
    for (let k = 0; k < 20; k++) press(state, ui, CURSOR_RIGHT, 0, 0);
    expect(ui.cx).toBe(10); // last slot column of the 0..10 virtual grid
    expect(ui.cx % 3).not.toBe(2);
  });
});

describe("subsets executeMove and completion", () => {
  it("completing the board sets completed and arms the flash", () => {
    const moves = solutionMoves();
    const last = moves.pop();
    if (!last) throw new Error("fixture has no blank cells");
    let state = newState(PARAMS, FIX.desc);
    for (const m of moves) state = subsetsGame.executeMove(state, m);
    expect(state.completed).toBe(false);
    const done = subsetsGame.executeMove(state, last);
    expect(done.completed).toBe(true);
    expect(subsetsGame.status(done)).toBe("solved");
    expect(subsetsGame.flashLength?.(state, done, 1, newUi())).toBeGreaterThan(0);
  });

  it("completed is monotonic (matches upstream: never reset)", () => {
    let state = newState(PARAMS, FIX.desc);
    for (const m of solutionMoves()) state = subsetsGame.executeMove(state, m);
    expect(state.completed).toBe(true);
    const i = state.immutable.indexOf(0);
    const broken = subsetsGame.executeMove(state, {
      kind: "set",
      type: "unknown",
      pos: i,
      bit: 0,
    });
    expect(broken.completed).toBe(true);
  });

  it("rejects an illegal move", () => {
    const state = newState(PARAMS, FIX.desc);
    const given = state.immutable.findIndex((m) => m !== 0);
    expect(() =>
      subsetsGame.executeMove(state, {
        kind: "set",
        type: "known",
        pos: given,
        bit: 0,
      }),
    ).toThrow();
    expect(() =>
      subsetsGame.executeMove(state, { kind: "set", type: "known", pos: 99, bit: 0 }),
    ).toThrow();
  });
});

describe("subsets solve (through a real Midend)", () => {
  it("Solve completes the board as solved-with-help, without the flash", () => {
    const { m, status } = harness();
    expect(m.newGameFromId(FIX_ID)).toBeUndefined();
    const before = newState(PARAMS, FIX.desc);
    expect(m.solve()).toBeUndefined();
    // The board is fully decided and the game completes — a deliberate
    // divergence from upstream, whose 'S' move skips the completion check
    // and leaves the game "ongoing" for ever (collection convention wins;
    // playbook §3.6).
    const text = m.formatAsText();
    expect(text).toBeDefined();
    expect(text).not.toContain("?");
    expect(status()).toBe("solved-with-help");
    // The solve move marks the state cheated, so the win flash stays off.
    const solved = subsetsGame.executeMove(before, {
      kind: "solve",
      known: Array.from(fixtureSolution().known),
      mask: Array.from(fixtureSolution().mask),
    });
    expect(solved.completed).toBe(true);
    expect(solved.cheated).toBe(true);
    expect(subsetsGame.flashLength?.(before, solved, 1, newUi())).toBe(0);
  });

  it("saveGame -> loadGame restores an equivalent game", () => {
    const me = new Midend(subsetsGame);
    expect(me.newGameFromId(FIX_ID)).toBeUndefined();
    const start = newState(PARAMS, FIX.desc);
    const i = start.immutable.indexOf(0);
    me.playMoves([{ kind: "set", type: "known", pos: i, bit: 1 }] as SubsetsMove[]);
    const saved = me.saveGame();
    const me2 = new Midend(subsetsGame);
    expect(me2.loadGame(saved)).toBeUndefined();
    expect(me2.formatAsText()).toBe(me.formatAsText());
  });
});

describe("subsets findMistakes", () => {
  it("a correct partial board flags nothing", () => {
    const state = newState(PARAMS, FIX.desc);
    expect(findMistakes(state)).toEqual([]);
    // Following the solution part-way stays clean.
    let played = state;
    for (const m of solutionMoves().slice(0, 8))
      played = subsetsGame.executeMove(played, m);
    expect(findMistakes(played)).toEqual([]);
  });

  it("a duplicated placement flags both offending cells", () => {
    const solution = fixtureSolution();
    const start = newState(PARAMS, FIX.desc);
    // Fully decide one blank cell to a value another (given) cell holds.
    const blank = start.immutable.indexOf(0);
    const given = start.immutable.findIndex((v) => v !== 0);
    const dupValue = solution.known[given];
    const state = cloneState(start);
    state.known[blank] = dupValue;
    state.mask[blank] = dupValue;
    const cells = findMistakes(state).filter((m) => m.kind === "cell");
    expect(cells.map((m) => m.pos).sort((a, b) => a - b)).toEqual(
      [blank, given].sort((a, b) => a - b),
    );
  });

  it("a violated arrow relation flags that edge", () => {
    // Find an arrow between a given and a blank cell, then decide the blank
    // so the subset relation is broken.
    const state = newState(PARAMS, FIX.desc);
    const solution = fixtureSolution();
    for (let i = 0; i < 16; i++) {
      for (let d = 0; d < 4; d++) {
        const dirs = [
          { f: 1, dx: 0, dy: -1 },
          { f: 2, dx: 1, dy: 0 },
          { f: 4, dx: 0, dy: 1 },
          { f: 8, dx: -1, dy: 0 },
        ];
        if (!(state.clues[i] & dirs[d].f)) continue;
        const i2 = i + dirs[d].dy * 4 + dirs[d].dx;
        if (!state.immutable[i] || state.immutable[i2]) continue;
        // Arrow i -> i2: set(i2) must be within set(i). Decide i2 as the
        // complement of the solution set at i — never a subset of it
        // (both are proper subsets of the universe, so complement(sol(i))
        // has a letter outside sol(i)).
        const bad = ALL_BITS(4) & ~solution.known[i];
        const s2 = cloneState(state);
        s2.known[i2] = bad;
        s2.mask[i2] = bad;
        const edges = findMistakes(s2).filter((m) => m.kind === "edge");
        expect(edges.length).toBeGreaterThan(0);
        expect(edges.some((m) => m.pos === i && m.dir === d)).toBe(true);
        return;
      }
    }
    throw new Error("fixture has no given->blank arrow");
  });
});

describe("subsets text format", () => {
  it("renders givens, unknowns and arrows", () => {
    const state = newState(PARAMS, FIX.desc);
    const text = textFormat(state);
    expect(text).toContain("?");
    expect(text).toMatch(/[><v^]/);
    const solved = fixtureSolution();
    const solvedText = textFormat(solved);
    expect(solvedText).not.toContain("?");
    // Solved cells carry letters and dots only.
    expect(solvedText).toMatch(/[A-D]/);
  });
});

describe("subsets rendering (tier 2.5)", () => {
  it("opening frame: slots, arrows, tally; snapshot", () => {
    const result = renderScenario({ game: subsetsGame, id: FIX_ID });
    const ops = result.recording.ops;
    // Bevel-highlight slots for decided (given) letters exist.
    expect(ops.some((o) => o.op === "rect" && o.colour === COL_HIGHLIGHT)).toBe(true);
    // Undecided slots use the inner background.
    expect(ops.some((o) => o.op === "rect" && o.colour === COL_INNERBG)).toBe(true);
    // Horseshoe arrows are drawn (circles) and no error colour yet.
    expect(ops.some((o) => o.op === "circle")).toBe(true);
    expect(ops.some((o) => "colour" in o && o.colour === COL_ERROR)).toBe(false);
    expect(result.recording.ops).toMatchSnapshot();
  });

  it("mistake frame: a duplicated placement draws in the error colour", () => {
    const solution = fixtureSolution();
    const start = newState(PARAMS, FIX.desc);
    const blank = start.immutable.indexOf(0);
    const given = start.immutable.findIndex((v) => v !== 0);
    const dup = solution.known[given];
    const moves: SubsetsMove[] = [];
    for (let b = 0; b < 4; b++) {
      moves.push({
        kind: "set",
        type: dup & (1 << b) ? "known" : "cleared",
        pos: blank,
        bit: b,
      });
    }
    const result = renderScenario({
      game: subsetsGame,
      id: FIX_ID,
      moves,
      showMistakes: true,
    });
    expect(result.mistakeCount).toBeGreaterThan(0);
    // The duplicate shows red: the tally count and the overlay frame.
    expect(
      result.recording.ops.some((o) => o.op === "rect" && o.colour === COL_ERROR),
    ).toBe(true);
    expect(
      result.recording.ops.some((o) => o.op === "text" && o.colour === COL_ERROR),
    ).toBe(true);
    expect(result.recording.ops).toMatchSnapshot();
  });

  it("completion flash: slots blink to the inner background on a flash beat", () => {
    // Drive redraw directly at a mid-flash time (tier 2, recording double —
    // renderScenario captures settled frames, never a mid-flash one).
    const solution = fixtureSolution();
    const ds = newDrawState(solution);
    setTileSize(ds, 36);
    const ui = newUi();
    const dr = new RecordingDrawing(subsetsGame.colours([1, 1, 1]));
    // Flash-on beat: floor(0.15 / 0.12) = 1 -> odd -> slots blink off.
    redraw(dr, ds, null, solution, 1, ui, 0, 0.15);
    expect(dr.ops.some((o) => o.op === "rect" && o.colour === COL_INNERBG)).toBe(true);
    expect(dr.ops.some((o) => o.op === "rect" && o.colour === COL_HIGHLIGHT)).toBe(
      false,
    );
    // A flash-off beat shows the bevel again (same drawstate — the flash
    // bit is in the diff key, so the repaint actually happens).
    const dr2 = new RecordingDrawing(subsetsGame.colours([1, 1, 1]));
    redraw(dr2, ds, null, solution, 1, ui, 0, 0.05);
    expect(dr2.ops.some((o) => o.op === "rect" && o.colour === COL_HIGHLIGHT)).toBe(
      true,
    );
    expect(dr.ops).toMatchSnapshot();
  });
});
