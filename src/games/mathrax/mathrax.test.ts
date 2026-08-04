/**
 * Mathrax behavioural tests (tiers 1 and 2.5). The generator / solver / codec
 * are pinned byte-for-byte against C by `mathrax-differential.test.ts`; here we
 * cover what a desc differential cannot reach — the clue semantics, the input
 * mapping, `executeMove`'s live-error and completion paths, `findMistakes`
 * (including notes), the keypad, and the render frames.
 */
import { describe, expect, it } from "vitest";
import { UI_UPDATE } from "../../engine/game.ts";
import { Midend } from "../../engine/index.ts";
import {
  CURSOR_DOWN,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  LEFT_BUTTON,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import { randomNew } from "../../engine/random/index.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import {
  DEFAULT_BACKGROUND,
  renderScenario,
} from "../../engine/testing/render-scenario.ts";
import type { ChangeNotification, GameStatus } from "../../engine/types.ts";
import cReference from "./__fixtures__/mathrax-c-reference.json" with { type: "json" };
import { mathraxCandidateClue, newMathraxDesc } from "./generator.ts";
import { mathraxGame } from "./index.ts";
import {
  BORDER,
  COL_ERROR,
  clueLabel,
  computeSize,
  PREFERRED_TILE_SIZE,
} from "./render.ts";
import { mathraxSolve, SOLVE_STUCK, SOLVE_UNIQUE } from "./solver.ts";
import {
  bitOf,
  CLUE_ADD,
  CLUE_DIV,
  CLUE_EVN,
  CLUE_MUL,
  CLUE_ODD,
  CLUE_SUB,
  clueNum,
  clueType,
  DIFF_EASY,
  DIFF_NORMAL,
  DIFF_RECURSIVE,
  DIFF_TRICKY,
  decodeParams,
  diffFromLevel,
  encodeDesc,
  encodeParams,
  F_IMMUTABLE,
  FE_COUNT,
  FE_ERRORMASK,
  loadGame,
  type MathraxDiff,
  type MathraxMove,
  type MathraxParams,
  type MathraxState,
  type MathraxUi,
  mathraxOptions,
  mathraxValidate,
  newState,
  newUi,
  OPTION_ADD,
  OPTION_DIV,
  OPTION_EQL,
  OPTION_MUL,
  OPTION_ODD,
  OPTION_SUB,
  OPTIONSMASK,
  STATUS_COMPLETE,
  STATUS_INVALID,
  STATUS_UNFINISHED,
  setClueNum,
  validateDesc,
  validateParams,
} from "./state.ts";

interface Fixture {
  o: number;
  diff: number;
  options: number;
  seed: string;
  desc: string;
}
const fixtures = (cReference as { fixtures: Fixture[] }).fixtures;
const paramsOf = (f: Fixture): MathraxParams => ({
  o: f.o,
  diff: diffFromLevel(f.diff),
  options: f.options,
});

/** A 5×5 Easy board (the first fixture) used as the standard scenario. */
const FIX = fixtures[0];
const FIX_PARAMS = paramsOf(FIX);
const FIX_ID = `${encodeParams(FIX_PARAMS, true)}:${FIX.desc}`;

const TS = PREFERRED_TILE_SIZE;

/** Pixel centre of cell `(x, y)` at the default tile size. */
const centre = (x: number, y: number) => ({
  x: BORDER + x * TS + TS / 2,
  y: BORDER + y * TS + TS / 2,
});

function press(
  state: MathraxState,
  ui: MathraxUi,
  button: number,
  p: { x: number; y: number } = { x: 0, y: 0 },
): MathraxMove | null | typeof UI_UPDATE {
  return mathraxGame.interpretMove(state, ui, null, p, button);
}

function harness() {
  const notes: ChangeNotification[] = [];
  const m = new Midend(mathraxGame);
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

/** The unique solution of a fixture board, from the givens alone. */
function solutionOf(state: MathraxState): Uint8Array {
  const o = state.params.o;
  const grid = new Uint8Array(o * o);
  for (let i = 0; i < o * o; i++)
    if (state.flags[i] & F_IMMUTABLE) grid[i] = state.grid[i];
  expect(mathraxSolve(o, grid, state.clues, DIFF_RECURSIVE)).toBe(SOLVE_UNIQUE);
  return grid;
}

// --- params ----------------------------------------------------------------

describe("mathrax params", () => {
  it("round-trips size, difficulty and a restricted clue set", () => {
    const p = decodeParams("7dtAM");
    expect(p).toEqual({ o: 7, diff: "tricky", options: OPTION_ADD | OPTION_MUL });
    expect(encodeParams(p, true)).toBe("7dtAM");
    expect(encodeParams(p, false)).toBe("7");
  });

  it("writes the full clue set as nothing, and reads nothing back as all", () => {
    const all: MathraxParams = { o: 6, diff: "normal", options: OPTIONSMASK };
    expect(encodeParams(all, true)).toBe("6dn");
    expect(decodeParams("6dn").options).toBe(OPTIONSMASK);
  });

  it("reads the clue letters only in upstream's fixed A S M D E O order", () => {
    // 'D' comes after 'S', so "SD" reads both...
    expect(decodeParams("6dnSD").options).toBe(OPTION_SUB | OPTION_DIV);
    // ...but out of order, the later letter is simply never reached, and an
    // empty resulting set falls back to "all" (upstream's six sequential ifs).
    expect(decodeParams("6dnDS").options).toBe(OPTION_DIV);
    expect(decodeParams("6dnOA").options).toBe(OPTION_ODD);
  });

  it("rejects out-of-range sizes, unknown difficulties and an empty clue set", () => {
    expect(mathraxGame.validateParams(decodeParams("2dn"), true)).toMatch(/at least 3/);
    expect(mathraxGame.validateParams(decodeParams("10dn"), true)).toMatch(
      /no more than 9/,
    );
    expect(mathraxGame.validateParams(decodeParams("6dq"), true)).toMatch(
      /difficulty/i,
    );
    expect(
      mathraxGame.validateParams({ o: 6, diff: "normal", options: 0 }, true),
    ).toMatch(/at least one clue type/i);
    // ...but an empty clue set is only a *full* (generation) constraint.
    expect(
      mathraxGame.validateParams({ o: 6, diff: "normal", options: 0 }, false),
    ).toBeNull();
  });

  it("exposes every preset through the menu", () => {
    const submenu = mathraxGame.presets().submenu ?? [];
    expect(submenu).toHaveLength(9);
    expect(submenu[0]).toMatchObject({ title: "5x5 Easy" });
    expect(submenu[8]).toMatchObject({ title: "9x9 Normal" });
  });

  it("describes params with the keys augmentation.ts's summary reads", () => {
    const values = mathraxGame.describeParams?.({
      o: 7,
      diff: "tricky",
      options: OPTION_ADD,
    });
    expect(values).toEqual({
      size: "7",
      difficulty: 2,
      "addition-clues": 1,
      "subtraction-clues": 0,
      "multiplication-clues": 0,
      "division-clues": 0,
      "equality-clues": 0,
      "even-odd-clues": 0,
    });
  });
});

// --- desc codec ------------------------------------------------------------

describe("mathrax desc codec", () => {
  it("round-trips every fixture description", () => {
    for (const f of fixtures) {
      const p = paramsOf(f);
      expect(validateDesc(p, f.desc)).toBeNull();
      const st = newState(p, f.desc);
      expect(encodeDesc(p.o, st.grid, st.clues)).toBe(f.desc);
    }
  });

  it("splits an empty run longer than 26 cells", () => {
    // A 6×6 board with no givens at all: 36 empties = 'z' (26) + 'j' (10).
    const grid = new Uint8Array(36);
    const clues = new Int32Array(25);
    expect(encodeDesc(6, grid, clues)).toBe("zj,y");
  });

  it("encodes equality as a zero-valued subtraction clue", () => {
    const clues = new Int32Array(4);
    clues[0] = CLUE_SUB | setClueNum(0);
    expect(encodeDesc(3, new Uint8Array(9), clues)).toBe("i,S0c");
    const back = loadGame({ o: 3, diff: "easy", options: OPTIONSMASK }, "i,S0c");
    expect(back.ok && clueType(back.value.clues[0])).toBe(CLUE_SUB);
    expect(back.ok && clueNum(back.value.clues[0])).toBe(0);
  });

  it("rejects the descriptions upstream rejects", () => {
    const p: MathraxParams = { o: 3, diff: "easy", options: OPTIONSMASK };
    expect(validateDesc(p, "1231231231,c")).toMatch(/too long/i);
    expect(validateDesc(p, "12345678,d")).toMatch(/out of range/i); // 8 > o
    expect(validateDesc(p, "12?,d")).toMatch(/invalid characters/i);
    expect(validateDesc(p, "12,d")).toMatch(/too short/i);
    expect(validateDesc(p, "i,A100")).toMatch(/too high/i);
    expect(validateDesc(p, "i,A1")).toMatch(/too short/i);
    expect(validateDesc(p, "i,dA1")).toMatch(/too long/i);
  });
});

// --- clue semantics --------------------------------------------------------

describe("mathrax clue semantics", () => {
  const ALL = (o: number) => (1 << o) - 1;

  it("enumerates the partners an arithmetic clue admits", () => {
    // "sum to 7" against a confirmed 3 admits only 4.
    expect(mathraxOptions(CLUE_ADD | setClueNum(7), bitOf(3), false)).toBe(bitOf(4));
    // "differ by 2" against a confirmed 3 admits 1 and 5.
    expect(mathraxOptions(CLUE_SUB | setClueNum(2), bitOf(3), false)).toBe(
      bitOf(1) | bitOf(5),
    );
    // Equality is "differ by 0".
    expect(mathraxOptions(CLUE_SUB | setClueNum(0), bitOf(3), false)).toBe(bitOf(3));
    // "multiply to 12" against a confirmed 3 admits only 4.
    expect(mathraxOptions(CLUE_MUL | setClueNum(12), bitOf(3), false)).toBe(bitOf(4));
    // "ratio 3" against a confirmed 3 admits 1 and 9 (3/1 and 9/3).
    expect(mathraxOptions(CLUE_DIV | setClueNum(3), bitOf(3), false)).toBe(
      bitOf(1) | bitOf(9),
    );
  });

  it("returns the fixed even/odd masks, and 'no constraint' for no clue", () => {
    expect(mathraxOptions(CLUE_EVN, ALL(9), false) & ALL(9)).toBe(
      bitOf(2) | bitOf(4) | bitOf(6) | bitOf(8),
    );
    expect(mathraxOptions(CLUE_ODD, ALL(9), false) & ALL(9)).toBe(
      bitOf(1) | bitOf(3) | bitOf(5) | bitOf(7) | bitOf(9),
    );
    expect(mathraxOptions(0, bitOf(1), false) & ALL(9)).toBe(ALL(9));
  });

  it("declines an arithmetic clue in Easy mode until the opposite cell is confirmed", () => {
    const twoCandidates = bitOf(3) | bitOf(4);
    // Unconfirmed opposite + simple ⇒ no constraint at all…
    expect(mathraxOptions(CLUE_ADD | setClueNum(7), twoCandidates, true) & ALL(9)).toBe(
      ALL(9),
    );
    // …whereas the harder tiers do the full enumeration.
    expect(mathraxOptions(CLUE_ADD | setClueNum(7), twoCandidates, false)).toBe(
      bitOf(3) | bitOf(4),
    );
  });

  it("follows upstream's candidate-clue precedence cascade", () => {
    // 3+4 == 2+5 and 3−4 != 2−5, so addition wins over everything below it.
    expect(clueType(mathraxCandidateClue(3, 4, 2, 5, OPTIONSMASK))).toBe(CLUE_ADD);
    // With addition disabled, the same digits fall through to nothing here.
    expect(mathraxCandidateClue(3, 4, 2, 5, OPTIONSMASK & ~OPTION_ADD)).toBe(0);
    // Equal pairs reach the equality arm only after subtraction declines them
    // (a zero difference fails its `> 0` test) — encoded as `Sub 0`.
    const eq = mathraxCandidateClue(3, 3, 5, 5, OPTION_SUB | OPTION_EQL);
    expect(clueType(eq)).toBe(CLUE_SUB);
    expect(clueNum(eq)).toBe(0);
    // 6×2 == 4×3, with sums and differences unequal ⇒ multiplication.
    expect(clueType(mathraxCandidateClue(6, 2, 4, 3, OPTIONSMASK))).toBe(CLUE_MUL);
    // A ratio of 1 is explicitly excluded from the division arm.
    expect(mathraxCandidateClue(3, 3, 5, 5, OPTION_DIV)).toBe(0);
    // The *even* clue is gated on the odd option — the two share one setting.
    expect(mathraxCandidateClue(8, 2, 6, 2, OPTION_ODD)).toBe(CLUE_EVN);
    expect(mathraxCandidateClue(8, 2, 6, 2, OPTIONSMASK & ~OPTION_ODD)).toBe(0);
  });

  it("labels each clue type the way the board shows it", () => {
    expect(clueLabel(CLUE_ADD | setClueNum(7))).toBe("7+");
    expect(clueLabel(CLUE_SUB | setClueNum(2))).toBe("2−");
    expect(clueLabel(CLUE_SUB | setClueNum(0))).toBe("=");
    expect(clueLabel(CLUE_MUL | setClueNum(12))).toBe("12×");
    expect(clueLabel(CLUE_DIV | setClueNum(3))).toBe("3÷");
    expect(clueLabel(CLUE_EVN)).toBe("E");
    expect(clueLabel(CLUE_ODD)).toBe("O");
  });
});

// --- solver and generator --------------------------------------------------

describe("mathrax solver", () => {
  it("solves every faithfully-reproduced C board uniquely, at no more than its tier", () => {
    // The Recursive fixtures are excluded: upstream strips those boards past
    // uniqueness (they are literally blank), which is the defect the generator's
    // divergence fixes — `mathrax-differential.test.ts` pins them by verdict.
    for (const f of fixtures.filter((x) => x.diff < DIFF_RECURSIVE)) {
      const p = paramsOf(f);
      const st = newState(p, f.desc);
      const grid = Uint8Array.from(st.grid);
      expect(mathraxSolve(p.o, grid, st.clues, DIFF_RECURSIVE)).toBe(SOLVE_UNIQUE);
      // The filled grid really is a legal board.
      const flags = new Uint8Array(p.o * p.o);
      expect(mathraxValidate(p.o, grid, st.clues, flags)).toBe(STATUS_COMPLETE);
      // And the board's own tier suffices (the generator gated on exactly this).
      expect(mathraxSolve(p.o, Uint8Array.from(st.grid), st.clues, f.diff)).toBe(
        SOLVE_UNIQUE,
      );
    }
  });

  it("reports a clueless board as stuck rather than solved", () => {
    const p: MathraxParams = { o: 5, diff: "tricky", options: OPTIONSMASK };
    expect(mathraxSolve(p.o, new Uint8Array(25), new Int32Array(16), DIFF_TRICKY)).toBe(
      SOLVE_STUCK,
    );
  });

  it("grades an Easy board as Easy and a Tricky board as beyond Easy", () => {
    const easy = fixtures.find((f) => f.o === 6 && f.diff === DIFF_EASY);
    const tricky = fixtures.find((f) => f.o === 6 && f.diff === DIFF_TRICKY);
    if (!easy || !tricky) throw new Error("fixture set changed");
    const e = newState(paramsOf(easy), easy.desc);
    expect(mathraxSolve(6, Uint8Array.from(e.grid), e.clues, DIFF_EASY)).toBe(
      SOLVE_UNIQUE,
    );
    const t = newState(paramsOf(tricky), tricky.desc);
    expect(mathraxSolve(6, Uint8Array.from(t.grid), t.clues, DIFF_EASY)).toBe(
      SOLVE_STUCK,
    );
  });
});

describe("mathrax generator", () => {
  it("generates a validly-described, uniquely-solvable board for a fresh seed", () => {
    // Order 3 is Easy-or-Tricky only — see `validateParams` and the tier tests
    // below — so the smallest Normal board is order 4.
    for (const o of [4, 5, 7]) {
      const p: MathraxParams = { o, diff: "normal", options: OPTIONSMASK };
      const { desc } = newMathraxDesc(p, randomNew(`fresh-${o}`));
      expect(validateDesc(p, desc)).toBeNull();
      const st = newState(p, desc);
      expect(mathraxSolve(o, Uint8Array.from(st.grid), st.clues, DIFF_NORMAL)).toBe(
        SOLVE_UNIQUE,
      );
    }
  });

  it("generates a *uniquely* solvable Recursive board (the upstream fix)", () => {
    // Upstream's Recursive tier keeps stripping while the board is merely
    // "not stuck", which accepts an ambiguous verdict — every sampled upstream
    // board had several solutions. The port requires a unique solve instead.
    for (let i = 0; i < 5; i++) {
      const p: MathraxParams = { o: 5, diff: "recursive", options: OPTIONSMASK };
      const { desc } = newMathraxDesc(p, randomNew(`recursive-${i}`));
      const st = newState(p, desc);
      expect(mathraxSolve(5, Uint8Array.from(st.grid), st.clues, DIFF_RECURSIVE)).toBe(
        SOLVE_UNIQUE,
      );
      // And it genuinely needs the recursion — Tricky alone can't finish it.
      expect(mathraxSolve(5, Uint8Array.from(st.grid), st.clues, DIFF_TRICKY)).toBe(
        SOLVE_STUCK,
      );
    }
  });

  // The tier gate (grade-difficulty-tiers-honestly). Upstream had none, so a
  // tier need not bind: 3 of the 23 frozen C fixtures above Easy fall lower.
  describe("difficulty tiers bind", () => {
    const CASES: [number, MathraxDiff, number, number][] = [
      [3, "tricky", DIFF_TRICKY, DIFF_NORMAL],
      [4, "normal", DIFF_NORMAL, DIFF_EASY],
      [5, "normal", DIFF_NORMAL, DIFF_EASY],
      [5, "tricky", DIFF_TRICKY, DIFF_NORMAL],
      [6, "tricky", DIFF_TRICKY, DIFF_NORMAL],
      [7, "normal", DIFF_NORMAL, DIFF_EASY],
    ];
    for (const [o, diff, level, below] of CASES) {
      it(`${o}x${o} ${diff} needs its own tier, not the one below`, () => {
        const p: MathraxParams = { o, diff, options: OPTIONSMASK };
        const { desc } = newMathraxDesc(p, randomNew(`tier-${o}-${diff}`));
        const st = newState(p, desc);
        expect(mathraxSolve(o, Uint8Array.from(st.grid), st.clues, level)).toBe(
          SOLVE_UNIQUE,
        );
        expect(mathraxSolve(o, Uint8Array.from(st.grid), st.clues, below)).not.toBe(
          SOLVE_UNIQUE,
        );
      });
    }

    // Order 3 has only four intersections, and two of its four tiers have
    // nothing to grade with — measured at 0 binding boards in 3,000 candidates
    // each. Refusing beats generating a board of the wrong difficulty.
    for (const diff of ["normal", "recursive"] as const) {
      it(`refuses to generate 3x3 ${diff}, which has no such board`, () => {
        const p: MathraxParams = { o: 3, diff, options: OPTIONSMASK };
        expect(validateParams(p, true)).toMatch(/Size 3/);
        // Loading an existing description at those params still works.
        expect(validateParams(p, false)).toBeNull();
      });
    }
  });

  it("emits only the clue types the options allow", () => {
    const p: MathraxParams = { o: 6, diff: "normal", options: OPTION_ADD };
    const { desc } = newMathraxDesc(p, randomNew("only-add"));
    const st = newState(p, desc);
    const kinds = new Set([...st.clues].filter(Boolean).map(clueType));
    expect(kinds).toEqual(new Set([CLUE_ADD]));
  });
});

// --- live validity ---------------------------------------------------------

describe("mathrax live error flags", () => {
  it("flags a duplicated digit in a row or column", () => {
    const o = 3;
    const grid = new Uint8Array([1, 1, 0, 0, 0, 0, 0, 0, 0]);
    const flags = new Uint8Array(9);
    expect(mathraxValidate(o, grid, new Int32Array(4), flags)).toBe(STATUS_INVALID);
    expect(flags[0] & FE_COUNT).toBeTruthy();
    expect(flags[1] & FE_COUNT).toBeTruthy();
    expect(flags[2] & FE_COUNT).toBeFalsy();
  });

  it("flags both cells of a diagonal pair a clue cannot admit", () => {
    // A single "sum to 5" clue at the only interior intersection of a 3×3, with
    // 1 and 1 on its main diagonal: 1 + 1 != 5, so both are in error.
    const o = 3;
    const clues = new Int32Array(4);
    clues[0] = CLUE_ADD | setClueNum(5);
    const grid = new Uint8Array([1, 0, 0, 0, 1, 0, 0, 0, 0]);
    const flags = new Uint8Array(9);
    expect(mathraxValidate(o, grid, clues, flags)).toBe(STATUS_INVALID);
    expect(flags[0] & FE_ERRORMASK).toBeTruthy();
    expect(flags[4] & FE_ERRORMASK).toBeTruthy();
  });

  it("reports an untouched board as unfinished, not invalid", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    const flags = Uint8Array.from(st.flags);
    expect(mathraxValidate(FIX_PARAMS.o, st.grid, st.clues, flags)).toBe(
      STATUS_UNFINISHED,
    );
  });
});

// --- input -----------------------------------------------------------------

describe("mathrax input", () => {
  it("selects an editable cell, and refuses to highlight a given", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    const ui = newUi(st);
    const empty = [...st.flags].findIndex((f) => !(f & F_IMMUTABLE));
    const given = [...st.flags].findIndex((f) => f & F_IMMUTABLE);
    const o = FIX_PARAMS.o;

    expect(press(st, ui, LEFT_BUTTON, centre(empty % o, (empty / o) | 0))).toBe(
      UI_UPDATE,
    );
    expect(ui.cshow).toBe(true);
    expect(ui).toMatchObject({ hx: empty % o, hy: (empty / o) | 0 });

    press(st, ui, LEFT_BUTTON, centre(given % o, (given / o) | 0));
    expect(ui.cshow).toBe(false);
  });

  it("enters a digit, and suppresses re-entering the same one", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    const ui = newUi(st);
    const o = FIX_PARAMS.o;
    const empty = [...st.flags].findIndex((f) => !(f & F_IMMUTABLE));
    const x = empty % o;
    const y = (empty / o) | 0;

    press(st, ui, LEFT_BUTTON, centre(x, y));
    expect(press(st, ui, "3".charCodeAt(0))).toEqual({
      type: "set",
      x,
      y,
      n: 3,
      pencil: false,
    });

    const after = mathraxGame.executeMove(st, {
      type: "set",
      x,
      y,
      n: 3,
      pencil: false,
    });
    press(st, ui, LEFT_BUTTON, centre(x, y)); // re-show the highlight
    // Re-entering 3 changes nothing, so it produces no move.
    expect(press(after, ui, "3".charCodeAt(0))).toBe(UI_UPDATE);
    expect(ui.cshow).toBe(false);
  });

  it("refuses a digit above the grid order, and refuses to edit a given", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    const ui = newUi(st);
    const o = FIX_PARAMS.o;
    const empty = [...st.flags].findIndex((f) => !(f & F_IMMUTABLE));
    press(st, ui, LEFT_BUTTON, centre(empty % o, (empty / o) | 0));
    expect(press(st, ui, "9".charCodeAt(0))).toBeNull(); // o is 5

    const given = [...st.flags].findIndex((f) => f & F_IMMUTABLE);
    ui.cshow = true;
    ui.hx = given % o;
    ui.hy = (given / o) | 0;
    expect(press(st, ui, "1".charCodeAt(0))).toBeNull();
  });

  it("toggles a sticky pencil mode on right-click, and pencil-marks with it", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    const ui = newUi(st);
    const o = FIX_PARAMS.o;
    const empty = [...st.flags].findIndex((f) => !(f & F_IMMUTABLE));
    const x = empty % o;
    const y = (empty / o) | 0;

    expect(press(st, ui, RIGHT_BUTTON, centre(x, y))).toBe(UI_UPDATE);
    expect(ui.cpencil).toBe(true);
    expect(press(st, ui, "4".charCodeAt(0))).toEqual({
      type: "set",
      x,
      y,
      n: 4,
      pencil: true,
    });
    // A second right-click turns the mode back off (CapsLock-style).
    press(st, ui, RIGHT_BUTTON, centre(x, y));
    expect(ui.cpencil).toBe(false);
  });

  it("never pencil-marks a filled cell", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    const ui = newUi(st);
    const o = FIX_PARAMS.o;
    const given = [...st.flags].findIndex((f) => f & F_IMMUTABLE);
    ui.cshow = true;
    ui.cpencil = true;
    ui.hx = given % o;
    ui.hy = (given / o) | 0;
    expect(press(st, ui, "2".charCodeAt(0))).toBeNull();
  });

  it("moves and reveals the keyboard cursor, and Enter switches ink/pencil", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    const ui = newUi(st);
    expect(press(st, ui, CURSOR_RIGHT)).toBe(UI_UPDATE);
    expect(ui).toMatchObject({ hx: 1, hy: 0, cshow: true, ckey: true });
    press(st, ui, CURSOR_DOWN);
    expect(ui).toMatchObject({ hx: 1, hy: 1 });
    expect(press(st, ui, CURSOR_SELECT)).toBe(UI_UPDATE);
    expect(ui.cpencil).toBe(true);
  });

  it("fills all notes on the first M, then strikes the obvious ones on the next", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    const ui = newUi(st);
    const first = press(st, ui, "M".charCodeAt(0));
    expect(first).toEqual({ type: "pencilAll" });

    const noted = mathraxGame.executeMove(st, first as MathraxMove);
    const second = press(noted, ui, "m".charCodeAt(0));
    // Every empty cell now carries every candidate, so the adaptive second press
    // strikes the values already placed in that cell's row or column.
    expect(second).toMatchObject({ type: "pencilStrike" });
    const marks = (second as { type: "pencilStrike"; marks: unknown[] }).marks;
    expect(marks.length).toBeGreaterThan(0);
  });

  it("ignores a press outside the grid", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    const ui = newUi(st);
    const outside = computeSize(FIX_PARAMS, TS).h - 1; // the indicator strip
    expect(press(st, ui, LEFT_BUTTON, { x: 10, y: outside })).toBeNull();
  });

  it("offers a keypad of exactly the grid's digits plus Clear", () => {
    expect(mathraxGame.requestKeys?.({ ...FIX_PARAMS, o: 5 })).toEqual([
      { button: 49, label: "1" },
      { button: 50, label: "2" },
      { button: 51, label: "3" },
      { button: 52, label: "4" },
      { button: 53, label: "5" },
      { button: 8, label: "Clear" },
    ]);
  });
});

// --- moves, completion and solve -------------------------------------------

describe("mathrax moves", () => {
  it("clears a cell, and clears all of a cell's notes with 0", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    const o = FIX_PARAMS.o;
    const empty = [...st.flags].findIndex((f) => !(f & F_IMMUTABLE));
    const x = empty % o;
    const y = (empty / o) | 0;

    let s = mathraxGame.executeMove(st, { type: "set", x, y, n: 2, pencil: true });
    s = mathraxGame.executeMove(s, { type: "set", x, y, n: 5, pencil: true });
    expect(s.marks[empty]).toBe((1 << 2) | (1 << 5));
    s = mathraxGame.executeMove(s, { type: "set", x, y, n: 0, pencil: true });
    expect(s.marks[empty]).toBe(0);
  });

  it("rejects a move onto a given", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    const o = FIX_PARAMS.o;
    const given = [...st.flags].findIndex((f) => f & F_IMMUTABLE);
    expect(() =>
      mathraxGame.executeMove(st, {
        type: "set",
        x: given % o,
        y: (given / o) | 0,
        n: 1,
        pencil: false,
      }),
    ).toThrow();
  });

  it("completes the game — and flashes — when the player fills the last cell", () => {
    const { m, status } = harness();
    expect(m.newGameFromId(FIX_ID)).toBeUndefined();
    const st = (m as unknown as { state: MathraxState }).state;
    const o = st.params.o;
    const sol = solutionOf(st);

    const moves: MathraxMove[] = [];
    for (let i = 0; i < o * o; i++) {
      if (st.flags[i] & F_IMMUTABLE) continue;
      moves.push({ type: "set", x: i % o, y: (i / o) | 0, n: sol[i], pencil: false });
    }
    m.playMoves(moves);
    expect(status()).toBe("solved");

    // A player-completed board celebrates; a solved-with-help one must not.
    const before = mathraxGame.executeMove(newState(FIX_PARAMS, FIX.desc), moves[0]);
    const solved = moves
      .slice(1)
      .reduce((s, mv) => mathraxGame.executeMove(s, mv), before);
    expect(solved.completed).toBe(true);
    expect(solved.cheated).toBe(false);
    expect(
      mathraxGame.flashLength?.(
        moves
          .slice(0, -1)
          .reduce(
            (s, mv) => mathraxGame.executeMove(s, mv),
            newState(FIX_PARAMS, FIX.desc),
          ),
        solved,
        1,
        newUi(solved),
      ),
    ).toBeGreaterThan(0);
  });

  it("Solve fills the board, reports solved-with-help and does not flash", () => {
    const { m, status } = harness();
    expect(m.newGameFromId(FIX_ID)).toBeUndefined();
    expect(m.solve()).toBeUndefined();
    expect(status()).toBe("solved-with-help");

    const st = (m as unknown as { state: MathraxState }).state;
    expect(st.cheated).toBe(true);
    expect([...st.grid].every((d) => d > 0)).toBe(true);
    expect(mathraxGame.flashLength?.(st, st, 1, newUi(st))).toBe(0);
  });

  it("saveGame -> loadGame restores an equivalent game", () => {
    const { m } = harness();
    expect(m.newGameFromId(FIX_ID)).toBeUndefined();
    const st = (m as unknown as { state: MathraxState }).state;
    const o = st.params.o;
    const empty = [...st.flags].findIndex((f) => !(f & F_IMMUTABLE));
    m.playMoves([
      { type: "set", x: empty % o, y: (empty / o) | 0, n: 1, pencil: false },
      { type: "pencilAll" },
    ]);
    const saved = m.saveGame();

    const m2 = new Midend(mathraxGame);
    expect(m2.loadGame(saved)).toBeUndefined();
    const st2 = (m2 as unknown as { state: MathraxState }).state;
    expect([...st2.grid]).toEqual([
      ...(m as unknown as { state: MathraxState }).state.grid,
    ]);
    expect([...st2.marks]).toEqual([
      ...(m as unknown as { state: MathraxState }).state.marks,
    ]);
  });
});

// --- findMistakes ----------------------------------------------------------

describe("mathrax findMistakes", () => {
  it("reports nothing on an untouched or correctly-played board", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    expect(mathraxGame.findMistakes?.(st)).toEqual([]);

    const o = FIX_PARAMS.o;
    const sol = solutionOf(st);
    const empty = [...st.flags].findIndex((f) => !(f & F_IMMUTABLE));
    const right = mathraxGame.executeMove(st, {
      type: "set",
      x: empty % o,
      y: (empty / o) | 0,
      n: sol[empty],
      pencil: false,
    });
    expect(mathraxGame.findMistakes?.(right)).toEqual([]);
  });

  it("flags a digit that contradicts the unique solution", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    const o = FIX_PARAMS.o;
    const sol = solutionOf(st);
    const empty = [...st.flags].findIndex((f) => !(f & F_IMMUTABLE));
    const wrong = (sol[empty] % o) + 1;
    const bad = mathraxGame.executeMove(st, {
      type: "set",
      x: empty % o,
      y: (empty / o) | 0,
      n: wrong,
      pencil: false,
    });
    expect(mathraxGame.findMistakes?.(bad)).toEqual([
      { kind: "cell", x: empty % o, y: (empty / o) | 0 },
    ]);
  });

  it("flags a note that has crossed the solution digit out (notes are markings)", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    const o = FIX_PARAMS.o;
    const sol = solutionOf(st);
    const empty = [...st.flags].findIndex((f) => !(f & F_IMMUTABLE));
    const x = empty % o;
    const y = (empty / o) | 0;

    // Pencil in every candidate, then strike the correct one.
    let s = mathraxGame.executeMove(st, { type: "pencilAll" });
    s = mathraxGame.executeMove(s, {
      type: "pencilStrike",
      marks: [{ x, y, n: sol[empty] }],
    });
    expect(mathraxGame.findMistakes?.(s)).toContainEqual({ kind: "note", x, y });

    // A note carrying merely *extra* candidates is ordinary mid-solve state.
    const noted = mathraxGame.executeMove(st, { type: "pencilAll" });
    expect(mathraxGame.findMistakes?.(noted)).toEqual([]);
  });
});

// --- rendering (tier 2.5) --------------------------------------------------

describe("mathrax rendering", () => {
  it("sizes the board from the tile size, plus the pencil-indicator strip", () => {
    const size = computeSize({ o: 5 }, 40);
    expect(size.w).toBe(5 * 40 + 2);
    expect(size.h).toBe(size.w + 20);
  });

  it("draws the opening frame", () => {
    const { recording } = renderScenario({ game: mathraxGame, id: FIX_ID });
    // Every clue is a circle; every given is text.
    expect(recording.ops.filter((o) => o.op === "circle").length).toBeGreaterThan(0);
    expect(recording.ops.filter((o) => o.op === "text").length).toBeGreaterThan(0);
    expect(recording.ops).toMatchSnapshot();
  });

  it("draws pencil marks for a noted cell", () => {
    const plain = renderScenario({ game: mathraxGame, id: FIX_ID });
    const noted = renderScenario({
      game: mathraxGame,
      id: FIX_ID,
      moves: [{ type: "pencilAll" }],
    });
    const texts = (r: typeof plain) =>
      r.recording.ops.filter((o) => o.op === "text").length;
    expect(texts(noted)).toBeGreaterThan(texts(plain));
    expect(noted.recording.ops).toMatchSnapshot();
  });

  it("marks a wrong digit with the COL_ERROR mistake outline", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    const o = FIX_PARAMS.o;
    const sol = solutionOf(st);
    const empty = [...st.flags].findIndex((f) => !(f & F_IMMUTABLE));
    const { recording, mistakeCount } = renderScenario({
      game: mathraxGame,
      id: FIX_ID,
      moves: [
        {
          type: "set",
          x: empty % o,
          y: (empty / o) | 0,
          n: (sol[empty] % o) + 1,
          pencil: false,
        },
      ],
      showMistakes: true,
    });
    expect(mistakeCount).toBe(1);
    expect(
      recording.ops.some((op) => op.op === "line" && op.colour === COL_ERROR),
    ).toBe(true);
  });

  it("repaints the mistake overlay on a cell that was already drawn", () => {
    // Regression guard for playbook §3.2: the overlay isn't part of the packed
    // tile value, so it must also be compared in the cache-miss test — Check &
    // Save runs a frame *after* the move that drew the cell.
    const m = new Midend(mathraxGame);
    expect(m.newGameFromId(FIX_ID)).toBeUndefined();
    const st = (m as unknown as { state: MathraxState }).state;
    const o = st.params.o;
    const sol = solutionOf(st);
    const empty = [...st.flags].findIndex((f) => !(f & F_IMMUTABLE));
    m.playMoves([
      {
        type: "set",
        x: empty % o,
        y: (empty / o) | 0,
        n: (sol[empty] % o) + 1,
        pencil: false,
      },
    ]);

    const palette = mathraxGame.colours(DEFAULT_BACKGROUND);
    m.redraw(new RecordingDrawing(palette)); // first paint: no overlay yet
    expect(m.findMistakes()).toBe(1);
    const after = new RecordingDrawing(palette);
    m.redraw(after);
    expect(after.ops.some((op) => op.op === "line" && op.colour === COL_ERROR)).toBe(
      true,
    );

    // …and a third frame without the overlay erases it again.
    m.playMoves([{ type: "pencilAll" }]);
    const cleared = new RecordingDrawing(palette);
    m.redraw(cleared);
    expect(cleared.ops.some((op) => op.op === "line" && op.colour === COL_ERROR)).toBe(
      false,
    );
  });
});
