/**
 * Behavioural tests for the Undead port (tier 1 + a tier-2.5 render smoke).
 *
 * Generation is seeded for determinism; the heavy generate/solve blocks carry an
 * explicit generous timeout (playbook §5.2). End-to-end consistency is checked by
 * decoding a generated desc and confirming its unique solution equals the
 * generator's recorded `aux` solution — exercising codec + solver + generator
 * together.
 */
import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/index.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newUndeadDesc } from "./generator.ts";
import { undeadGame } from "./index.ts";
import { findUndeadSolution, gradeUndead, isUniquelySolvable } from "./solver.ts";
import {
  type Difficulty,
  decodeParams,
  encodeParams,
  MON_GHOST,
  MON_NONE,
  MON_VAMPIRE,
  MON_ZOMBIE,
  newState,
  newUi,
  type UndeadParams,
  type UndeadState,
  validateDesc,
  validateParams,
} from "./state.ts";

function gen(w: number, h: number, diff: Difficulty, seed: string) {
  const params: UndeadParams = { w, h, diff };
  const { desc, aux } = newUndeadDesc(params, randomNew(`undead-${seed}`));
  const state = newState(params, desc);
  return { params, desc, aux, state };
}

function auxToGuess(aux: string): number[] {
  return [...aux.slice(1)].map((c) => (c === "G" ? MON_GHOST : c === "V" ? MON_VAMPIRE : MON_ZOMBIE));
}

// --- params ----------------------------------------------------------------

describe("undead params", () => {
  it("round-trips encode/decode", () => {
    const p: UndeadParams = { w: 5, h: 5, diff: "tricky" };
    expect(encodeParams(p, true)).toBe("5x5dt");
    expect(encodeParams(p, false)).toBe("5x5");
    expect(decodeParams("5x5dt")).toEqual(p);
    expect(decodeParams("4x4")).toEqual({ w: 4, h: 4, diff: "normal" });
    expect(decodeParams("7x7dn")).toEqual({ w: 7, h: 7, diff: "normal" });
  });

  it("rejects invalid params", () => {
    expect(validateParams({ w: 2, h: 4, diff: "easy" }, true)).not.toBeNull();
    expect(validateParams({ w: 4, h: 2, diff: "easy" }, true)).not.toBeNull();
    expect(validateParams({ w: 8, h: 8, diff: "easy" }, true)).not.toBeNull(); // 8*8 > 54
    expect(validateParams({ w: 5, h: 5, diff: "normal" }, true)).toBeNull();
  });
});

// --- generation + codec + solver (end-to-end) ------------------------------

describe("undead generation", () => {
  const cases: [number, number, Difficulty][] = [
    [4, 4, "easy"],
    [4, 4, "normal"],
    [4, 4, "tricky"],
    [5, 5, "normal"],
  ];
  for (const [w, h, diff] of cases) {
    it(
      `generates a unique, on-difficulty ${w}x${h} ${diff} board`,
      () => {
        const { params, desc, aux, state } = gen(w, h, diff, `${w}x${h}-${diff}`);
        expect(validateDesc(params, desc)).toBeNull();
        expect(isUniquelySolvable(state.common)).toBe(true);

        // The unique solution equals the generator's recorded solution.
        const sol = findUndeadSolution(state);
        expect(sol.ok).toBe(true);
        if (sol.ok) expect(Array.from(sol.guess)).toEqual(auxToGuess(aux));

        // Grading reaches the requested difficulty class.
        const start = new Uint8Array(state.common.numTotal).fill(MON_NONE);
        const grade = gradeUndead(state.common, start, diff !== "easy");
        expect(grade.inconsistent).toBe(false);
        if (diff === "easy") {
          expect(grade.iterativeSolved).toBe(true);
        } else if (diff === "normal") {
          expect(grade.iterativeSolved || grade.bruteforceSolved).toBe(true);
        } else {
          expect(grade.bruteforceSolved).toBe(true);
          expect(grade.ambiguous).toBeGreaterThanOrEqual(4);
        }
      },
      30_000,
    );
  }
});

// --- desc decoding ---------------------------------------------------------

describe("undead validateDesc", () => {
  it("accepts a generated desc and rejects corruptions", () => {
    const { params, desc } = gen(4, 4, "normal", "valid");
    expect(validateDesc(params, desc)).toBeNull();
    expect(validateDesc(params, "")).not.toBeNull();
    expect(validateDesc(params, "0,2,6")).not.toBeNull(); // no grid/sightings
    // A grid character that overfills.
    expect(validateDesc(params, desc.replace(/^(\d+,\d+,\d+,)/, "$1z"))).not.toBeNull();
  });
});

// --- moves -----------------------------------------------------------------

describe("undead executeMove", () => {
  function emptyState(): UndeadState {
    return gen(4, 4, "normal", "moves").state;
  }

  it("places and clears a monster", () => {
    const s0 = emptyState();
    const s1 = undeadGame.executeMove(s0, { type: "set", cell: 0, monster: MON_ZOMBIE });
    expect(s1.guess[0]).toBe(MON_ZOMBIE);
    const s2 = undeadGame.executeMove(s1, { type: "clear", cell: 0 });
    expect(s2.guess[0]).toBe(MON_NONE);
    expect(s0.guess[0]).toBe(MON_NONE); // original unmutated
  });

  it("toggles a pencil mark", () => {
    const s0 = emptyState();
    const s1 = undeadGame.executeMove(s0, { type: "pencil", cell: 0, monster: MON_GHOST });
    expect(s1.pencils[0]).toBe(MON_GHOST);
    const s2 = undeadGame.executeMove(s1, { type: "pencil", cell: 0, monster: MON_GHOST });
    expect(s2.pencils[0]).toBe(0);
  });

  it("fills all pencil marks on undecided cells", () => {
    const s0 = emptyState();
    const s1 = undeadGame.executeMove(s0, { type: "set", cell: 0, monster: MON_GHOST });
    const s2 = undeadGame.executeMove(s1, { type: "markAll" });
    expect(s2.pencils[0]).toBe(0); // cell 0 is placed, not pencilled
    for (let i = 1; i < s2.common.numTotal; i++) expect(s2.pencils[i]).toBe(7);
  });

  it("toggles an edge clue's done flag", () => {
    const s0 = emptyState();
    const s1 = undeadGame.executeMove(s0, { type: "hintDone", clue: 0 });
    expect(s1.hintsDone[0]).toBe(1);
    const s2 = undeadGame.executeMove(s1, { type: "hintDone", clue: 0 });
    expect(s2.hintsDone[0]).toBe(0);
  });

  it("marks the board solved when the full correct solution is placed", () => {
    const { state, aux } = gen(4, 4, "normal", "complete");
    const placements = auxToGuess(aux);
    let s = state;
    for (let i = 0; i < placements.length; i++) {
      s = undeadGame.executeMove(s, { type: "set", cell: i, monster: placements[i] });
    }
    expect(s.solved).toBe(true);
    expect(undeadGame.status(s)).toBe("solved");
  });

  it("reddens the count when a monster type is over-placed", () => {
    const { state } = gen(4, 4, "normal", "overcount");
    let s = state;
    // Place every cell as a zombie; once full, the counts must mismatch.
    for (let i = 0; i < s.common.numTotal; i++) {
      s = undeadGame.executeMove(s, { type: "set", cell: i, monster: MON_ZOMBIE });
    }
    expect([...s.countErrors].some((e) => e === 1)).toBe(true);
  });
});

// --- live flash ------------------------------------------------------------

describe("undead flash", () => {
  it("flashes on a genuine solve but not a cheated one", () => {
    const { state, aux } = gen(4, 4, "normal", "flash");
    const placements = auxToGuess(aux);
    let s = state;
    for (let i = 0; i < placements.length - 1; i++) {
      s = undeadGame.executeMove(s, { type: "set", cell: i, monster: placements[i] });
    }
    const before = s;
    const after = undeadGame.executeMove(s, {
      type: "set",
      cell: placements.length - 1,
      monster: placements[placements.length - 1],
    });
    expect(undeadGame.flashLength?.(before, after, 1, newUi(state))).toBeGreaterThan(0);

    const cheated = undeadGame.executeMove(state, { type: "solve", placements });
    expect(undeadGame.flashLength?.(state, cheated, 1, newUi(state))).toBe(0);
  });
});

// --- findMistakes ----------------------------------------------------------

describe("undead findMistakes", () => {
  it("flags a wrong placement and a note that crosses out the solution", () => {
    const { state, aux } = gen(4, 4, "normal", "mistakes");
    const sol = auxToGuess(aux);
    // A wrong monster at cell 0 (any value != solution).
    const wrong = sol[0] === MON_GHOST ? MON_VAMPIRE : MON_GHOST;
    let s = undeadGame.executeMove(state, { type: "set", cell: 0, monster: wrong });
    // A note at cell 1 that excludes its solution monster.
    const other = sol[1] === MON_GHOST ? MON_VAMPIRE : MON_GHOST;
    s = undeadGame.executeMove(s, { type: "pencil", cell: 1, monster: other });

    const mistakes = undeadGame.findMistakes?.(s) ?? [];
    expect(mistakes.some((m) => m.kind === "cell")).toBe(true);
    expect(mistakes.some((m) => m.kind === "note")).toBe(true);
  });

  it("ignores a note that still includes the solution monster", () => {
    const { state, aux } = gen(4, 4, "normal", "mistakes2");
    const sol = auxToGuess(aux);
    // A note at cell 0 that includes the solution plus an extra.
    const extra = sol[0] === MON_ZOMBIE ? MON_GHOST : MON_ZOMBIE;
    let s = undeadGame.executeMove(state, { type: "pencil", cell: 0, monster: sol[0] });
    s = undeadGame.executeMove(s, { type: "pencil", cell: 0, monster: extra });
    const mistakes = undeadGame.findMistakes?.(s) ?? [];
    expect(mistakes.length).toBe(0);
  });
});

// --- Solve via a real Midend -----------------------------------------------

describe("undead Solve via Midend", () => {
  it("solves a freshly generated board (aux path)", () => {
    const me = new Midend(undeadGame);
    expect(me.newGameFromId("4x4dn#undead-solve")).toBeUndefined();
    expect(me.solve()).toBeUndefined();
    const solved = (me as unknown as { state: UndeadState }).state;
    expect(undeadGame.status(solved)).toBe("solved");
    // Every cell is a single placed monster.
    for (let i = 0; i < solved.common.numTotal; i++) {
      const g = solved.guess[i];
      expect(g === MON_GHOST || g === MON_VAMPIRE || g === MON_ZOMBIE).toBe(true);
    }
  });
});

// --- render smoke (tier 2.5) -----------------------------------------------

describe("undead render", () => {
  it("redraws the initial frame and a partially-filled board", () => {
    const r0 = renderScenario({ game: undeadGame, id: "4x4dn#undead-render" });
    expect(r0.recording.ops.length).toBeGreaterThan(0);
    // The grid frame rect is painted.
    expect(r0.recording.ops.some((o) => o.op === "rect")).toBe(true);

    const r1 = renderScenario({
      game: undeadGame,
      id: "4x4dn#undead-render",
      moves: [{ type: "set", cell: 0, monster: MON_ZOMBIE }],
    });
    expect(r1.recording.ops.length).toBeGreaterThan(0);
    expect(r1.recording.ops).toMatchSnapshot();
  });
});
