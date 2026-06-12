// Tier-1 solver + generator: populateCell clue/full/empty rules,
// solveCell deductions and contradiction, solveGameActual, generator
// validity + deduction-solvability across sizes/seeds, hideClues
// minimisation, the solve-command bitmap, and findMistakes.
import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import {
  encodeSolution,
  findMistakes,
  type GenCells,
  hideClues,
  newDesc,
  populateCell,
  solveCell,
  solveCheck,
  solveGameActual,
  startPointCheck,
} from "./solver.ts";
import {
  executeMove,
  newState,
  STATE_BLANK,
  STATE_MARKED,
  validateDesc,
} from "./state.ts";

function genCellsFromImage(width: number, height: number, image: Uint8Array): GenCells {
  const size = width * height;
  const cells: GenCells = {
    clue: new Int8Array(size),
    shown: new Uint8Array(size).fill(1),
    full: new Uint8Array(size),
    empty: new Uint8Array(size),
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const { clue, full, empty } = populateCell(width, height, image, x, y);
      const pos = y * width + x;
      cells.clue[pos] = clue;
      cells.full[pos] = full ? 1 : 0;
      cells.empty[pos] = empty ? 1 : 0;
    }
  }
  return cells;
}

describe("populateCell", () => {
  // 3×3 image: top row black, rest white.
  const image = Uint8Array.from([1, 1, 1, 0, 0, 0, 0, 0, 0]);

  it("counts the clipped 3×3 neighbourhood including the cell", () => {
    expect(populateCell(3, 3, image, 0, 0).clue).toBe(2); // (0,0),(1,0) black
    expect(populateCell(3, 3, image, 1, 0).clue).toBe(3); // whole top row
    expect(populateCell(3, 3, image, 1, 1).clue).toBe(3);
    expect(populateCell(3, 3, image, 1, 2).clue).toBe(0);
  });

  it("detects full at the saturation count of each position", () => {
    const allBlack = new Uint8Array(9).fill(1);
    expect(populateCell(3, 3, allBlack, 0, 0)).toMatchObject({ clue: 4, full: true }); // corner
    expect(populateCell(3, 3, allBlack, 1, 0)).toMatchObject({ clue: 6, full: true }); // edge
    expect(populateCell(3, 3, allBlack, 1, 1)).toMatchObject({ clue: 9, full: true }); // interior
  });

  it("detects empty at zero", () => {
    expect(populateCell(3, 3, image, 1, 2)).toMatchObject({ empty: true, full: false });
  });

  it("does not call a partial edge count full", () => {
    // Corner with 3 of 4 black: clue 3, not full.
    const img = Uint8Array.from([1, 1, 0, 1, 0, 0, 0, 0, 0]);
    expect(populateCell(3, 3, img, 0, 0)).toMatchObject({ clue: 3, full: false });
  });
});

describe("solveCell / solveCheck / solveGameActual", () => {
  it("a full clue marks its whole neighbourhood", () => {
    const sol = {
      cell: new Uint8Array(9),
      solved: new Uint8Array(9),
      needed: new Uint8Array(9),
    };
    expect(solveCell(3, 3, 9, true, false, sol, 1, 1)).toBe("progress");
    expect(Array.from(sol.cell)).toEqual(new Array(9).fill(STATE_MARKED));
    expect(sol.needed[4]).toBe(1);
  });

  it("a satisfied clue blanks the remaining unknowns", () => {
    const sol = {
      cell: new Uint8Array(9),
      solved: new Uint8Array(9),
      needed: new Uint8Array(9),
    };
    sol.cell[0] = STATE_MARKED;
    // Clue 1 at the centre: one black already known → rest blank.
    expect(solveCell(3, 3, 1, false, false, sol, 1, 1)).toBe("progress");
    expect(sol.cell[0]).toBe(STATE_MARKED);
    for (let i = 1; i < 9; i++) expect(sol.cell[i]).toBe(STATE_BLANK);
  });

  it("reports a contradiction on an unmet, fully-determined clue", () => {
    const sol = {
      cell: new Uint8Array(9),
      solved: new Uint8Array(9),
      needed: new Uint8Array(9),
    };
    sol.cell.fill(STATE_BLANK);
    // Everything blank but the clue says 2 blacks → impossible.
    expect(solveCell(3, 3, 2, false, false, sol, 1, 1)).toBe("contradiction");
  });

  it("solveCheck solves an all-clues-shown board", () => {
    const image = Uint8Array.from([1, 1, 1, 0, 0, 0, 0, 0, 0]);
    const cells = genCellsFromImage(3, 3, image);
    const { solved, sol } = solveCheck(3, 3, cells, null);
    expect(solved).toBe(true);
    expect(Array.from(sol.cell.slice(0, 3))).toEqual([
      STATE_MARKED,
      STATE_MARKED,
      STATE_MARKED,
    ]);
    expect(Array.from(sol.cell.slice(3))).toEqual(new Array(6).fill(STATE_BLANK));
  });

  it("solveGameActual recovers the image from a parsed desc", () => {
    // The all-black 3×3 board.
    const state = newState({ width: 3, height: 3, aggressive: true }, "464696464");
    const sol = solveGameActual(state.board);
    expect(sol).not.toBeNull();
    expect(Array.from(sol as Uint8Array)).toEqual(new Array(9).fill(STATE_MARKED));
  });

  it("solveGameActual returns null when deduction stalls", () => {
    // A lone central clue 5 on 3×3 determines nothing.
    const state = newState({ width: 3, height: 3, aggressive: true }, "d5d");
    expect(solveGameActual(state.board)).toBeNull();
  });
});

describe("startPointCheck", () => {
  it("honours the upstream scan-size quirk", () => {
    const image = new Uint8Array(9); // all white → every cell empty
    const cells = genCellsFromImage(3, 3, image);
    expect(startPointCheck(cells, 4)).toBe(true);
    // No full/empty inside the scanned prefix → not a valid start.
    cells.empty.fill(0, 0, 4);
    cells.full.fill(0, 0, 4);
    expect(startPointCheck(cells, 4)).toBe(false);
  });
});

describe("generator", () => {
  it("generates valid, deduction-solvable boards across sizes and modes", () => {
    for (const [n, aggressive, seed] of [
      [3, true, "alpha"],
      [5, true, "bravo"],
      [10, true, "charlie"],
      [7, false, "delta"],
    ] as const) {
      const p = { width: n, height: n, aggressive };
      const rng = randomNew(seed);
      const { desc } = newDesc(p, rng);
      expect(validateDesc(p, desc), `desc for ${n}/${seed}`).toBeNull();
      const state = newState(p, desc);
      expect(solveGameActual(state.board), `solvable for ${n}/${seed}`).not.toBeNull();
      // Some clue must survive minimisation.
      expect(state.notCompletedClues).toBeGreaterThan(0);
    }
  });

  it("hideClues keeps the board solvable while hiding clues", () => {
    const image = Uint8Array.from([1, 1, 1, 0, 0, 0, 0, 0, 0]);
    const cells = genCellsFromImage(3, 3, image);
    const shownBefore = cells.shown.reduce((a, b) => a + b, 0);
    hideClues(3, 3, cells, randomNew("echo"), true);
    const shownAfter = cells.shown.reduce((a, b) => a + b, 0);
    expect(shownAfter).toBeLessThan(shownBefore);
    expect(solveCheck(3, 3, cells, null).solved).toBe(true);
  });
});

describe("solve command + findMistakes", () => {
  it("encodeSolution packs marked cells MSB-first", () => {
    const cells = new Uint8Array(9).fill(STATE_MARKED);
    expect(encodeSolution(cells)).toBe("ff80");
    const alt = Uint8Array.from([
      STATE_MARKED,
      STATE_BLANK,
      STATE_MARKED,
      STATE_BLANK,
      STATE_MARKED,
      STATE_BLANK,
      STATE_MARKED,
      STATE_BLANK,
      STATE_MARKED,
    ]);
    expect(encodeSolution(alt)).toBe("aa80");
  });

  it("flags a determined cell that contradicts the solution", () => {
    // All-black board: blanking any cell is a mistake; marking is not.
    let state = newState({ width: 3, height: 3, aggressive: true }, "464696464");
    expect(findMistakes(state)).toEqual([]);
    state = executeMove(state, { type: "toggle", x: 1, y: 0, double: true }); // blank
    expect(findMistakes(state)).toEqual([{ x: 1, y: 0 }]);
    state = executeMove(state, { type: "toggle", x: 1, y: 0, double: true }); // → black
    expect(findMistakes(state)).toEqual([]);
  });

  it("reports nothing when deduction cannot determine the board", () => {
    const state = newState({ width: 3, height: 3, aggressive: true }, "d5d");
    expect(findMistakes(state)).toEqual([]);
  });
});
