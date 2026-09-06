/**
 * Behavioral tests for the Salad port.
 *
 * Tier 1 — pure logic: the params and description codecs (both modes), the
 * solver's verdicts, generator quality across every preset, the move
 * transitions, completion, `findMistakes`, the keypad, and Solve through a real
 * `Midend`. Tier 2 — the paint-twice mistake-overlay regression (playbook
 * §3.2); the tier-2.5 render scenarios live in `salad-render.test.ts`.
 *
 * The byte-for-byte C differential is `salad-differential.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/index.ts";
import {
  CURSOR_RIGHT,
  CURSOR_SELECT,
  LEFT_BUTTON,
  MIDDLE_BUTTON,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import { randomNew } from "../../engine/random/index.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { DEFAULT_BACKGROUND } from "../../engine/testing/render-scenario.ts";
import { sizedDrawState } from "../../engine/testing/sized-draw-state.ts";
import type { ChangeNotification } from "../../engine/types.ts";
import { newSaladDesc } from "./generator.ts";
import { saladGame } from "./index.ts";
import { COL_MISTAKE, PREFERRED_TILE_SIZE } from "./render.ts";
import { saladFindMistakes, saladSolution, saladSolve } from "./solver.ts";
import {
  CIRCLE,
  CROSS,
  DIFF_EASY,
  DIFF_HARD,
  decodeParams,
  encodeParams,
  GAMEMODE_LETTERS,
  GAMEMODE_NUMBERS,
  newState,
  newUi,
  PRESETS,
  presetLabel,
  type SaladMove,
  type SaladParams,
  type SaladState,
  scratchBoard,
  serialize,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A 4×4 ABC End View board and a 5×5 Number Ball board, both taken from the
 * frozen C reference so the fixtures and these tests describe one game. */
const LETTERS: { p: SaladParams; desc: string } = {
  p: { order: 4, nums: 3, mode: GAMEMODE_LETTERS, diff: DIFF_EASY },
  desc: "CaCbAfBaAa,p",
};
const NUMBERS: { p: SaladParams; desc: string } = {
  p: { order: 5, nums: 3, mode: GAMEMODE_NUMBERS, diff: DIFF_EASY },
  desc: "d1cO32b3aXa1d2b",
};
const LETTERS_ID = `${encodeParams(LETTERS.p, true)}:${LETTERS.desc}`;
const NUMBERS_ID = `${encodeParams(NUMBERS.p, true)}:${NUMBERS.desc}`;

type SaladMidend = Midend<SaladParams, SaladState, SaladMove, unknown, unknown>;

function stateOf(me: SaladMidend): SaladState {
  return (me as unknown as { state: SaladState }).state;
}

function play(id: string): SaladMidend {
  const me = new Midend(saladGame) as unknown as SaladMidend;
  expect(me.newGameFromId(id)).toBeUndefined();
  return me;
}

// --- tier 1: params --------------------------------------------------------

describe("salad params codec", () => {
  it("round-trips every preset at both difficulties", () => {
    for (const p of PRESETS) {
      for (const diff of [DIFF_EASY, DIFF_HARD]) {
        const full = { ...p, diff };
        expect(decodeParams(encodeParams(full, true))).toEqual(full);
      }
    }
  });

  it("encodes the mode letter and the difficulty suffix", () => {
    expect(encodeParams(LETTERS.p, true)).toBe("4n3Lde");
    expect(encodeParams(LETTERS.p, false)).toBe("4n3L");
    expect(
      encodeParams(
        { order: 8, nums: 5, mode: GAMEMODE_NUMBERS, diff: DIFF_HARD },
        true,
      ),
    ).toBe("8n5Bdx");
  });

  it("labels presets the way upstream does", () => {
    expect(presetLabel(PRESETS[0])).toBe("Letters: 4x4 A~C");
    expect(presetLabel(PRESETS[2])).toBe("Numbers: 5x5 1~3");
  });

  it("validates in upstream's order, with upstream's messages", () => {
    const base = { order: 5, nums: 3, mode: GAMEMODE_LETTERS, diff: DIFF_EASY };
    expect(validateParams(base, true)).toBeNull();
    expect(validateParams({ ...base, nums: 1 }, true)).toBe(
      "Symbols must be at least 2.",
    );
    expect(validateParams({ ...base, nums: 5 }, true)).toBe(
      "Symbols must be lower than the size.",
    );
    expect(validateParams({ ...base, order: 3, nums: 2 }, true)).toBeNull();
    expect(validateParams({ order: 2, nums: 2, mode: 0, diff: 0 }, true)).toBe(
      "Symbols must be lower than the size.",
    );
    expect(validateParams({ order: 11, nums: 10, mode: 0, diff: 0 }, true)).toBe(
      "Symbols must be no more than 9.",
    );
  });

  it("parks an unknown difficulty letter out of range so validation rejects it", () => {
    expect(validateParams(decodeParams("5n3Ldq"), true)).toBe(
      "Unknown difficulty rating",
    );
  });
});

// --- tier 1: desc codec ----------------------------------------------------

describe("salad description codec", () => {
  it("decodes a letters description into border and grid clues", () => {
    const s = newState(LETTERS.p, LETTERS.desc);
    // "CaCbAfBaAa" = C, skip 1, C, skip 2, A, skip 6, B, skip 1, A, skip 1.
    expect([...s.borderclues]).toEqual([
      3, 0, 3, 0, 0, 1, 0, 0, 0, 0, 0, 0, 2, 0, 1, 0,
    ]);
    // "p" is a run of 16 blanks: an ABC End View board below 8×8 carries no
    // grid clues at all.
    expect([...s.gridclues]).toEqual(new Array(16).fill(0));
  });

  it("decodes a numbers description's balls, crosses and digits", () => {
    const s = newState(NUMBERS.p, NUMBERS.desc);
    expect(s.gridclues[4]).toBe(1); // "d1" = four blanks then a 1
    expect(s.grid[4]).toBe(1);
    expect(s.holes[4]).toBe(CIRCLE);
    expect(s.gridclues[8]).toBe(CIRCLE); // "cO"
    expect(s.holes[8]).toBe(CIRCLE);
    expect(s.gridclues[15]).toBe(CROSS); // the "X"
    expect(s.holes[15]).toBe(CROSS);
    // Border clues do not exist in Number Ball mode.
    expect([...s.borderclues].every((v) => v === 0)).toBe(true);
  });

  it("serialize is the decoder's inverse", () => {
    const n = newState(NUMBERS.p, NUMBERS.desc);
    expect(serialize(n.gridclues, 48)).toBe(NUMBERS.desc);
    const l = newState(LETTERS.p, LETTERS.desc);
    expect(`${serialize(l.borderclues, 64)},${serialize(l.gridclues, 64)}`).toBe(
      LETTERS.desc,
    );
  });

  it("reports each upstream rejection message", () => {
    const p = LETTERS.p;
    expect(validateDesc(p, "CaCbAfBaAaA,p")).toBe("Border description is too long.");
    expect(validateDesc(p, "C!aCbAfBaAa,p")).toBe(
      "Border description contains invalid characters.",
    );
    expect(validateDesc(p, "IaCbAfBaAa,p")).toBe("Border clue is out of range.");
    expect(validateDesc(p, "CaCbAfBa,p")).toBe("Description is too short.");
    expect(validateDesc(NUMBERS.p, "d1cO32b3aXa1d2bX")).toBe(
      "Grid description is too long.",
    );
    expect(validateDesc(NUMBERS.p, "d1cO32b3aXa1d2!")).toBe(
      "Grid description contains invalid characters.",
    );
    expect(validateDesc(NUMBERS.p, "d9")).toBe("Grid clue is out of range.");
    expect(validateDesc(NUMBERS.p, "d1cO32b3aXa1d")).toBe("Description is too short.");
    expect(validateDesc(LETTERS.p, LETTERS.desc)).toBeNull();
    expect(validateDesc(NUMBERS.p, NUMBERS.desc)).toBeNull();
  });
});

// --- tier 1: solver + generator -------------------------------------------

describe("salad solver", () => {
  it("solves both reference boards to a complete grid", () => {
    for (const f of [LETTERS, NUMBERS]) {
      const s = newState(f.p, f.desc);
      const board = scratchBoard(s);
      expect(saladSolve(board, DIFF_EASY)).toBe(true);
      // Every line ends up with exactly `nums` symbols; the rest are holes,
      // which the solver leaves as its hole symbol (`nums + 1`) and marks as
      // crosses — the acceptance test is `latinholesCheck`, as upstream's.
      const o = f.p.order;
      for (let y = 0; y < o; y++) {
        let filled = 0;
        for (let x = 0; x < o; x++) {
          const d = board.grid[y * o + x];
          if (d >= 1 && d <= f.p.nums) filled++;
          else expect(board.holes[y * o + x]).toBe(CROSS);
        }
        expect(filled).toBe(f.p.nums);
      }
    }
  });

  it("refuses a board with no clues at all", () => {
    const p: SaladParams = {
      order: 5,
      nums: 3,
      mode: GAMEMODE_NUMBERS,
      diff: DIFF_EASY,
    };
    expect(saladSolve(scratchBoard(newState(p, "y")), DIFF_HARD)).toBe(false);
  });
});

describe("salad generator", () => {
  it("is deterministic: the same seed gives the same description", () => {
    const p = PRESETS[2];
    expect(newSaladDesc(p, randomNew("salad-determinism")).desc).toBe(
      newSaladDesc(p, randomNew("salad-determinism")).desc,
    );
  });

  for (const preset of PRESETS) {
    for (const diff of [DIFF_EASY, DIFF_HARD]) {
      const p = { ...preset, diff };
      it(`generates a solvable ${presetLabel(p)} at difficulty ${diff}`, () => {
        const { desc } = newSaladDesc(
          p,
          randomNew(`salad-gen-${p.order}-${p.nums}-${p.mode}-${diff}`),
        );
        expect(validateDesc(p, desc)).toBeNull();
        const s = newState(p, desc);
        expect(saladSolve(scratchBoard(s), diff)).toBe(true);
      });
    }
  }

  // The tier gate (grade-difficulty-tiers-honestly). Upstream had none, so
  // Extreme was mostly Normal: 12 of its 13 frozen Extreme fixtures, and
  // 71 of 80 freshly generated boards, fell to the Normal solver.
  for (const preset of PRESETS) {
    const p = { ...preset, diff: DIFF_HARD };
    it(`generates an Extreme ${presetLabel(p)} that Normal cannot solve`, () => {
      const { desc } = newSaladDesc(
        p,
        randomNew(`salad-tier-${p.order}-${p.nums}-${p.mode}`),
      );
      const s = newState(p, desc);
      expect(saladSolve(scratchBoard(s), DIFF_HARD)).toBe(true);
      expect(saladSolve(scratchBoard(s), DIFF_EASY)).toBe(false);
    });
  }

  it("gives an ABC End View board below 8x8 no grid clues at all", () => {
    const p: SaladParams = {
      order: 6,
      nums: 4,
      mode: GAMEMODE_LETTERS,
      diff: DIFF_EASY,
    };
    const s = newState(p, newSaladDesc(p, randomNew("salad-nogrid")).desc);
    expect([...s.gridclues].every((v) => v === 0)).toBe(true);
  });
});

// --- tier 1: moves and completion -----------------------------------------

describe("salad moves", () => {
  it("writes a symbol, a cross and a circle, and clears again", () => {
    const s = newState(LETTERS.p, LETTERS.desc);
    const a = saladGame.executeMove(s, { type: "set", x: 0, y: 0, value: 2 });
    expect(a.grid[0]).toBe(2);
    expect(a.holes[0]).toBe(CIRCLE);

    const b = saladGame.executeMove(a, { type: "set", x: 0, y: 0, value: "cross" });
    expect(b.grid[0]).toBe(0);
    expect(b.holes[0]).toBe(CROSS);

    const c = saladGame.executeMove(b, { type: "set", x: 0, y: 0, value: "circle" });
    expect(c.holes[0]).toBe(CIRCLE);
    expect(c.grid[0]).toBe(0);

    const d = saladGame.executeMove(c, { type: "set", x: 0, y: 0, value: "clear" });
    expect(d.holes[0]).toBe(0);
  });

  it("toggles pencil marks, and clears them on an already-empty square", () => {
    const s = newState(LETTERS.p, LETTERS.desc);
    const a = saladGame.executeMove(s, { type: "pencil", x: 1, y: 1, value: 2 });
    expect(a.pencil[5]).toBe(1 << 1);
    const b = saladGame.executeMove(a, { type: "pencil", x: 1, y: 1, value: "cross" });
    expect(b.pencil[5]).toBe((1 << 1) | (1 << 3)); // bit `nums` is the X mark
    const c = saladGame.executeMove(b, { type: "pencil", x: 1, y: 1, value: 2 });
    expect(c.pencil[5]).toBe(1 << 3);
    // Clearing an empty square wipes its marks (upstream applies that arm to a
    // pencil move too).
    const d = saladGame.executeMove(c, { type: "pencil", x: 1, y: 1, value: "clear" });
    expect(d.pencil[5]).toBe(0);
  });

  it("a penciled circle toggles the real marker without emptying the square", () => {
    const s = newState(LETTERS.p, LETTERS.desc);
    const a = saladGame.executeMove(s, { type: "pencil", x: 2, y: 2, value: "circle" });
    expect(a.holes[10]).toBe(CIRCLE);
    const b = saladGame.executeMove(a, { type: "pencil", x: 2, y: 2, value: "circle" });
    expect(b.holes[10]).toBe(0);
  });

  it("markAll fills every empty square's candidates, minus X inside a ball", () => {
    const s = newState(NUMBERS.p, NUMBERS.desc);
    const a = saladGame.executeMove(s, { type: "markAll" });
    const all = (1 << (NUMBERS.p.nums + 1)) - 1;
    const noX = (1 << NUMBERS.p.nums) - 1;
    expect(a.pencil[0]).toBe(all); // a plain empty square
    expect(a.pencil[8]).toBe(noX); // the bare ball: it cannot be empty
    expect(a.pencil[13]).toBe(0); // the cross: nothing to note
    expect(a.pencil[4]).toBe(0); // a given digit
  });

  it("filling in the unique solution completes the board", () => {
    const me = play(NUMBERS_ID);
    const st = stateOf(me);
    const sol = saladSolution(st);
    if (!sol) throw new Error("expected a solution");
    const o = st.order;
    const moves: SaladMove[] = [];
    for (let i = 0; i < o * o; i++) {
      if (st.gridclues[i] && st.gridclues[i] !== CIRCLE) continue;
      moves.push({
        type: "set",
        x: i % o,
        y: (i / o) | 0,
        value: sol[i] === 0 ? "cross" : sol[i],
      });
    }
    me.playMoves(moves);
    expect(stateOf(me).completed).toBe(true);
    expect(stateOf(me).cheated).toBe(false); // a genuine (non-cheated) solve
  });

  it("Solve completes the board and reports solved-with-help", () => {
    const notes: ChangeNotification[] = [];
    const me = new Midend(saladGame);
    me.setCallbacks(
      (n) => notes.push(n),
      () => {},
      () => {},
    );
    expect(me.newGameFromId(LETTERS_ID)).toBeUndefined();
    expect(me.solve()).toBeUndefined();
    const st = (me as unknown as { state: SaladState }).state;
    expect(st.completed).toBe(true);
    expect(st.cheated).toBe(true);
    const status = [...notes].reverse().find((n) => n.type === "game-state-change") as
      | Extract<ChangeNotification, { type: "game-state-change" }>
      | undefined;
    expect(status?.status).toBe("solved-with-help");
    // A solver fill must not fire the win flash.
    expect(saladGame.flashLength?.(stateOf(play(LETTERS_ID)), st, 1, newUi(st))).toBe(
      0,
    );
  });

  it("survives a save/load round-trip mid-solve", () => {
    const me = play(NUMBERS_ID);
    me.playMoves([
      { type: "set", x: 0, y: 0, value: 2 },
      { type: "pencil", x: 1, y: 0, value: 3 },
    ]);
    const saved = me.saveGame();
    const me2 = play(NUMBERS_ID);
    expect(me2.loadGame(saved)).toBeUndefined();
    expect(me2.formatAsText()).toBe(me.formatAsText());
    expect([...stateOf(me2).pencil]).toEqual([...stateOf(me).pencil]);
  });
});

// --- tier 1: findMistakes --------------------------------------------------

function solvedBoard(): { s: SaladState; sol: number[]; o: number } {
  const s = newState(NUMBERS.p, NUMBERS.desc);
  const sol = saladSolution(s);
  if (!sol) throw new Error("expected a solution");
  return { s, sol, o: s.order };
}

describe("salad findMistakes", () => {
  it("reports nothing on an untouched board", () => {
    expect(saladFindMistakes(newState(NUMBERS.p, NUMBERS.desc))).toEqual([]);
  });

  it("flags a symbol that contradicts the unique solution", () => {
    const { s, sol, o } = solvedBoard();
    const i = sol.findIndex((v, k) => v > 0 && !s.gridclues[k]);
    const next = saladGame.executeMove(s, {
      type: "set",
      x: i % o,
      y: (i / o) | 0,
      value: (sol[i] % NUMBERS.p.nums) + 1,
    });
    expect(saladFindMistakes(next)).toContainEqual({
      kind: "cell",
      x: i % o,
      y: (i / o) | 0,
    });
  });

  it("flags a cross on a square the solution fills, and a circle on a hole", () => {
    const { s, sol, o } = solvedBoard();
    const filled = sol.findIndex((v, k) => v > 0 && !s.gridclues[k]);
    const hole = sol.findIndex((v, k) => v === 0 && !s.gridclues[k]);

    const a = saladGame.executeMove(s, {
      type: "set",
      x: filled % o,
      y: (filled / o) | 0,
      value: "cross",
    });
    expect(saladFindMistakes(a)).toContainEqual({
      kind: "cross",
      x: filled % o,
      y: (filled / o) | 0,
    });

    const b = saladGame.executeMove(s, {
      type: "set",
      x: hole % o,
      y: (hole / o) | 0,
      value: "circle",
    });
    expect(saladFindMistakes(b)).toContainEqual({
      kind: "circle",
      x: hole % o,
      y: (hole / o) | 0,
    });
  });

  it("treats notes as first-class: crossing out the solution value is a mistake", () => {
    const { s, sol, o } = solvedBoard();
    const i = sol.findIndex((v, k) => v > 0 && !s.gridclues[k]);
    // Note only a *wrong* candidate: the solution's value has been ruled out.
    const noted = saladGame.executeMove(s, {
      type: "pencil",
      x: i % o,
      y: (i / o) | 0,
      value: (sol[i] % NUMBERS.p.nums) + 1,
    });
    expect(saladFindMistakes(noted)).toContainEqual({
      kind: "note",
      x: i % o,
      y: (i / o) | 0,
    });

    // A note carrying *extra* candidates alongside the right one is ordinary
    // mid-solve state, not a mistake.
    const alsoRight = saladGame.executeMove(noted, {
      type: "pencil",
      x: i % o,
      y: (i / o) | 0,
      value: sol[i],
    });
    expect(saladFindMistakes(alsoRight)).toEqual([]);
  });
});

// --- tier 1: input ---------------------------------------------------------

const TS = PREFERRED_TILE_SIZE;
/** The center of play cell `(x, y)`, allowing for the one-tile clue margin. */
const at = (x: number, y: number) => ({
  x: (x + 1) * TS + TS / 2,
  y: (y + 1) * TS + TS / 2,
});

describe("salad input", () => {
  it("left-click selects a square and a symbol key enters it", () => {
    const s = newState(LETTERS.p, LETTERS.desc);
    const ui = newUi(s);
    expect(
      saladGame.interpretMove(
        s,
        ui,
        sizedDrawState(saladGame, s),
        at(1, 2),
        LEFT_BUTTON,
      ),
    ).toBeTruthy();
    expect(ui.cursor.visible).toBe(true);
    expect(ui.cursor.x).toBe(1);
    expect(ui.cursor.y).toBe(2);
    expect(
      saladGame.interpretMove(
        s,
        ui,
        sizedDrawState(saladGame, s),
        at(1, 2),
        "B".charCodeAt(0),
      ),
    ).toEqual({
      type: "set",
      x: 1,
      y: 2,
      value: 2,
    });
  });

  it("refuses a symbol beyond the puzzle's range", () => {
    const s = newState(LETTERS.p, LETTERS.desc);
    const ui = newUi(s);
    saladGame.interpretMove(s, ui, sizedDrawState(saladGame, s), at(0, 0), LEFT_BUTTON);
    expect(
      saladGame.interpretMove(
        s,
        ui,
        sizedDrawState(saladGame, s),
        at(0, 0),
        "D".charCodeAt(0),
      ),
    ).toBeNull();
    expect(
      saladGame.interpretMove(
        s,
        ui,
        sizedDrawState(saladGame, s),
        at(0, 0),
        "4".charCodeAt(0),
      ),
    ).toBeNull();
  });

  it("right-click toggles the sticky pencil mode and pencils the next key", () => {
    const s = newState(LETTERS.p, LETTERS.desc);
    const ui = newUi(s);
    expect(ui.pencilSticky).toBe(true);
    saladGame.interpretMove(
      s,
      ui,
      sizedDrawState(saladGame, s),
      at(0, 0),
      RIGHT_BUTTON,
    );
    expect(ui.pencilMode).toBe(true);
    expect(
      saladGame.interpretMove(
        s,
        ui,
        sizedDrawState(saladGame, s),
        at(0, 0),
        "A".charCodeAt(0),
      ),
    ).toEqual({
      type: "pencil",
      x: 0,
      y: 0,
      value: 1,
    });
    // ...and stays on for the next square, unlike upstream's per-click mode.
    saladGame.interpretMove(s, ui, sizedDrawState(saladGame, s), at(1, 0), LEFT_BUTTON);
    expect(ui.pencilMode).toBe(true);
  });

  it("middle-click cycles a blank square: ball, cross, blank", () => {
    const s0 = newState(LETTERS.p, LETTERS.desc);
    const ui = newUi(s0);
    const first = saladGame.interpretMove(
      s0,
      ui,
      sizedDrawState(saladGame, s0),
      at(2, 1),
      MIDDLE_BUTTON,
    );
    expect(first).toEqual({ type: "set", x: 2, y: 1, value: "circle" });
    const s1 = saladGame.executeMove(s0, first as SaladMove);
    const second = saladGame.interpretMove(
      s1,
      ui,
      sizedDrawState(saladGame, s1),
      at(2, 1),
      MIDDLE_BUTTON,
    );
    expect(second).toEqual({ type: "set", x: 2, y: 1, value: "cross" });
    const s2 = saladGame.executeMove(s1, second as SaladMove);
    expect(
      saladGame.interpretMove(
        s2,
        ui,
        sizedDrawState(saladGame, s2),
        at(2, 1),
        MIDDLE_BUTTON,
      ),
    ).toEqual({
      type: "set",
      x: 2,
      y: 1,
      value: "clear",
    });
  });

  it("the keyboard cursor moves and Enter flips ink/pencil", () => {
    const s = newState(LETTERS.p, LETTERS.desc);
    const ui = newUi(s);
    saladGame.interpretMove(
      s,
      ui,
      sizedDrawState(saladGame, s),
      { x: 0, y: 0 },
      CURSOR_RIGHT,
    );
    expect(ui.cursor.x).toBe(1);
    expect(ui.cursor.visible).toBe(true);
    saladGame.interpretMove(
      s,
      ui,
      sizedDrawState(saladGame, s),
      { x: 0, y: 0 },
      CURSOR_SELECT,
    );
    expect(ui.pencilMode).toBe(true);
  });

  it("'M' fills, then only ever removes — never resets the player's notes", () => {
    // Owner-directed 2026-07-29: the Mark-all press is the collection's adaptive
    // one (shared `adaptiveMarkAll`) — first press fills the squares with no
    // marks, later presses clear the candidates a placed symbol already rules
    // out. It must never reset a square the player has narrowed, which is what
    // upstream's `M` (`markAll`, now legacy-replay-only) does.
    const s = newState(NUMBERS.p, NUMBERS.desc);
    const ui = newUi(s);
    const press = (st: typeof s) =>
      saladGame.interpretMove(
        st,
        ui,
        sizedDrawState(saladGame, st),
        { x: 0, y: 0 },
        109,
      );

    // 1. Fill.
    expect(press(s)).toEqual({ type: "pencilAll" });
    const filled = saladGame.executeMove(s, { type: "pencilAll" });

    // 2. Clean: strike the candidates the given symbols already rule out.
    const second = press(filled);
    expect((second as { type: string }).type).toBe("pencilStrike");
    const cleaned = saladGame.executeMove(filled, second as SaladMove);
    for (let i = 0; i < s.order * s.order; i++) {
      // Only ever removes.
      expect(cleaned.pencil[i] & ~filled.pencil[i]).toBe(0);
    }

    // 3. Converges: a third press has nothing left to remove.
    expect(press(cleaned)).toBeNull();

    // 4. A narrowed square survives a press that fills elsewhere.
    const narrowed = saladGame.executeMove(cleaned, {
      type: "set",
      x: 0,
      y: 0,
      value: "clear",
    });
    const kept = narrowed.pencil.slice();
    const refill = press(narrowed);
    expect(refill).toEqual({ type: "pencilAll" });
    const after = saladGame.executeMove(narrowed, refill as SaladMove);
    for (let i = 1; i < s.order * s.order; i++) {
      expect(after.pencil[i]).toBe(kept[i]);
    }
  });

  it("cannot select or overwrite a fixed clue", () => {
    const s = newState(NUMBERS.p, NUMBERS.desc);
    const ui = newUi(s);
    // Cell 4 (x=4, y=0) carries a given digit.
    saladGame.interpretMove(s, ui, sizedDrawState(saladGame, s), at(4, 0), LEFT_BUTTON);
    expect(ui.cursor.visible).toBe(false);
    expect(
      saladGame.interpretMove(
        s,
        ui,
        sizedDrawState(saladGame, s),
        at(4, 0),
        "1".charCodeAt(0),
      ),
    ).toBeNull();
  });
});

// --- tier 1: presentation hooks -------------------------------------------

describe("salad presentation hooks", () => {
  it("offers the symbol keys plus X, O and clear", () => {
    expect(saladGame.requestKeys?.(LETTERS.p)).toEqual([
      { button: 65, label: "A" },
      { button: 66, label: "B" },
      { button: 67, label: "C" },
      { button: 88, label: "X" },
      { button: 79, label: "O" },
      { button: 8, label: "Clear" },
    ]);
    expect(saladGame.requestKeys?.(NUMBERS.p)?.slice(0, 3)).toEqual([
      { button: 49, label: "1" },
      { button: 50, label: "2" },
      { button: 51, label: "3" },
    ]);
  });

  it("shows the symbol range in the status bar", () => {
    const s = newState(LETTERS.p, LETTERS.desc);
    expect(saladGame.statusbarText?.(s, newUi(s))).toBe("A~C");
    const n = newState(NUMBERS.p, NUMBERS.desc);
    expect(saladGame.statusbarText?.(n, newUi(n))).toBe("1~3");
  });

  it("renders the board as text with its border clues", () => {
    const lines = textFormat(newState(LETTERS.p, LETTERS.desc)).split("\n");
    expect(lines[1].trim().startsWith("+---")).toBe(true);
    expect(lines[0]).toContain("C"); // a top clue
    expect(lines[3][0]).toBe("A"); // the left clue of row 1
  });

  it("describes its params with the keys augmentation.ts reads", () => {
    expect(saladGame.describeParams?.(NUMBERS.p)).toEqual({
      "game-mode": GAMEMODE_NUMBERS,
      size: "5",
      symbols: "3",
      difficulty: DIFF_EASY,
    });
  });
});

// --- tier 2: the mistake overlay must be in the diff key -------------------

describe("salad mistake overlay", () => {
  it("highlights a mistake even when the square was already drawn", () => {
    // Regression guard (docs/games/rendering.md § "Overlay sidecars"): the overlay isn't part of a cell's tile
    // value, so it must be in the cache-miss test — otherwise a Check & Save a
    // frame after the move repaints nothing and nothing turns red.
    const me = play(NUMBERS_ID);
    const st = stateOf(me);
    const sol = saladSolution(st);
    if (!sol) throw new Error("expected a solution");
    const o = st.order;
    const i = sol.findIndex((v, k) => v > 0 && !st.gridclues[k]);
    me.playMoves([
      { type: "set", x: i % o, y: (i / o) | 0, value: (sol[i] % NUMBERS.p.nums) + 1 },
    ]);

    const palette = saladGame.colors(DEFAULT_BACKGROUND);
    me.redraw(new RecordingDrawing(palette));
    expect(me.findMistakes()).toBeGreaterThan(0);
    const after = new RecordingDrawing(palette);
    me.redraw(after);
    // The overlay is drawn as stroked lines, so it records as `line` ops
    // (docs/games/testing.md § "Render-op vocabulary" — a stroked box is not a `rect`).
    expect(after.ops.some((op) => op.op === "line" && op.color === COL_MISTAKE)).toBe(
      true,
    );
  });
});
