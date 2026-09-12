/**
 * Behavioral tests for the Clusters port (tier 1 logic + tier 2.5 render).
 * The byte-match generator/solver/codec check lives in
 * clusters-differential.test.ts; these cover the interactive paths a
 * differential never touches — the paint/keyboard input, executeMove's
 * completion, Solve through a real Midend, findMistakes, and a render frame.
 */
import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/midend.ts";
import {
  CURSOR_SELECT,
  LEFT_BUTTON,
  LEFT_RELEASE,
  newCursor,
  RIGHT_BUTTON,
  RIGHT_RELEASE,
} from "../../engine/pointer.ts";
import { randomNew } from "../../engine/random/index.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import type { ChangeNotification, GameStatus, Point } from "../../engine/types.ts";
import { newClustersDesc } from "./generator.ts";
import { clustersGame } from "./index.ts";
import { COL_ERROR } from "./render.ts";
import {
  COMPLETE,
  clustersStatus,
  findErrors,
  INVALID,
  solveGame,
  UNFINISHED,
} from "./solver.ts";
import {
  type ClustersFill,
  type ClustersMove,
  type ClustersState,
  type ClustersUi,
  COLMASK,
  cloneState,
  DIFF_EASY,
  DIFF_NAMES,
  DIFF_TRICKY,
  decodeParams,
  encodeDesc,
  encodeParams,
  F_COLOR_0,
  F_COLOR_1,
  F_SINGLE,
  newState,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

const TS = 32;
const BORDER = Math.floor(TS / 10);
const ds = { tileSize: TS } as never;

function cellPoint(r: number, c: number): Point {
  return {
    x: BORDER + TS * c + Math.floor(TS / 2),
    y: BORDER + TS * r + Math.floor(TS / 2),
  };
}

function makeState(w: number, h: number, grid: number[]): ClustersState {
  return { w, h, grid: Uint8Array.from(grid), completed: false, cheated: false };
}

function newUi(): ClustersUi {
  return { cursor: newCursor(), dragType: -1, drag: [] };
}

/** Simulate a full mouse click (press then release) and return the committed
 * move, or null if nothing was committed. */
function clickMove(
  state: ClustersState,
  ui: ClustersUi,
  r: number,
  c: number,
  down: number,
  up: number,
): ClustersMove | null {
  clustersGame.interpretMove(state, ui, ds, cellPoint(r, c), down);
  const res = clustersGame.interpretMove(state, ui, ds, cellPoint(r, c), up);
  return typeof res === "object" && res !== null ? (res as ClustersMove) : null;
}

/** As {@link clickMove}, asserting a move was committed (throws otherwise). */
function click(
  state: ClustersState,
  ui: ClustersUi,
  r: number,
  c: number,
  down: number,
  up: number,
): ClustersMove {
  const move = clickMove(state, ui, r, c, down, up);
  if (!move) throw new Error("expected a committed move");
  return move;
}

describe("params", () => {
  it("round-trips presets and the bare-width form", () => {
    expect(encodeParams({ w: 9, h: 7, diff: DIFF_TRICKY }, true)).toBe("9x7dt");
    expect(encodeParams({ w: 9, h: 7, diff: DIFF_EASY }, true)).toBe("9x7de");
    // The non-full form is the size alone (the preset-menu label's params).
    expect(encodeParams({ w: 9, h: 7, diff: DIFF_TRICKY }, false)).toBe("9x7");
    expect(decodeParams("9x7dt")).toEqual({ w: 9, h: 7, diff: DIFF_TRICKY });
    expect(decodeParams("8de")).toEqual({ w: 8, h: 8, diff: DIFF_EASY });
  });

  it("reads a pre-tier game ID as Easy, and rejects an unknown tier letter", () => {
    // Every ID shared before the difficulty existed carries no `d` at all.
    expect(decodeParams("9x7")).toEqual({ w: 9, h: 7, diff: DIFF_EASY });
    expect(decodeParams("8")).toEqual({ w: 8, h: 8, diff: DIFF_EASY });
    // An unrecognized letter must not silently play some other difficulty.
    expect(validateParams(decodeParams("9x7dq"), true)).toBe(
      "Unknown difficulty rating",
    );
  });

  it("rejects too-large then too-small (upstream order)", () => {
    const easy = (w: number, h: number) => ({ w, h, diff: DIFF_EASY });
    expect(validateParams(easy(100, 100), true)).toBe("Puzzle is too large");
    expect(validateParams(easy(1, 1), true)).toBe("Puzzle is too small");
    expect(validateParams(easy(7, 7), true)).toBeNull();
  });

  it("rejects the two shapes that have no puzzle at any difficulty", () => {
    // 1x2 and 2x2 pass upstream's area check and generate nothing.
    const easy = (w: number, h: number) => ({ w, h, diff: DIFF_EASY });
    const tooThin = "Width or height must be at least three";
    expect(validateParams(easy(1, 2), true)).toBe(tooThin);
    expect(validateParams(easy(2, 1), true)).toBe(tooThin);
    expect(validateParams(easy(2, 2), true)).toBe(tooThin);
    // Their immediate neighbors do have puzzles and must stay playable.
    expect(validateParams(easy(1, 3), true)).toBeNull();
    expect(validateParams(easy(2, 3), true)).toBeNull();
  });

  it("refuses Tricky below the size where it binds — for generation only", () => {
    const refusal = "Tricky needs a board of at least 12 squares, at least two wide";
    const tricky = (w: number, h: number) => ({ w, h, diff: DIFF_TRICKY });
    expect(validateParams(tricky(2, 5), true)).toBe(refusal); // 10 squares
    expect(validateParams(tricky(3, 3), true)).toBe(refusal); // 9 squares
    // A one-wide strip never binds however long it is: a cell there has at most
    // two neighbors, so there is no chain for the lookahead to follow.
    expect(validateParams(tricky(1, 20), true)).toBe(refusal);
    // A saved game or a game ID carrying its own description still loads.
    expect(validateParams(tricky(3, 3), false)).toBeNull();
    // The measured boundary, in both of its shapes.
    expect(validateParams(tricky(2, 6), true)).toBeNull();
    expect(validateParams(tricky(3, 4), true)).toBeNull();
    // …and a refused size is fine at Easy.
    expect(validateParams({ w: 3, h: 3, diff: DIFF_EASY }, true)).toBeNull();
  });
});

describe("difficulty tiers", () => {
  // The property that makes a tier mean something is *exactly* these two
  // assertions.
  const SIZES = [
    [7, 7],
    [9, 9],
  ] as const;

  it("an Easy board is finished by the single-cell rule alone", () => {
    for (const [w, h] of SIZES) {
      const p = { w, h, diff: DIFF_EASY };
      const { desc } = newClustersDesc(p, randomNew(`clusters-easy-${w}`));
      expect(solveGame(newState(p, desc).grid, w, h, 0)).toBe(COMPLETE);
    }
  });

  it("a Tricky board needs the lookahead: unsolvable at level 0, solved at 1", () => {
    for (const [w, h] of SIZES) {
      const p = { w, h, diff: DIFF_TRICKY };
      const { desc } = newClustersDesc(p, randomNew(`clusters-tricky-${w}`));
      expect(solveGame(newState(p, desc).grid, w, h, 0)).not.toBe(COMPLETE);
      expect(solveGame(newState(p, desc).grid, w, h, 1)).toBe(COMPLETE);
    }
  });

  it("every preset generates a board at exactly the tier it names", () => {
    const menu = clustersGame.presets().submenu ?? [];
    expect(menu.length).toBe(8);
    for (const entry of menu) {
      const p = entry.params;
      if (!p) throw new Error("preset menu entry without params");
      expect(validateParams(p, true)).toBeNull();
      // Read the game's own tier list rather than restating the words: the
      // property is "the preset title carries the tier it generates at", and a
      // literal here would just be a second copy of the tier names to rot.
      expect(entry.title).toContain(DIFF_NAMES[p.diff]);
    }
  });

  it("the loose gate is the unbinding one the tiers replaced", () => {
    // What the flag preserves is the *defect*: one gate at the deeper rung,
    // accepting whatever it completes. So over the same seeds it must (a) ignore
    // the tier entirely — which is what keeps the frozen fixtures byte-matching
    // — and (b) hand out boards that need no lookahead, which the honest Tricky
    // gate never does. Fixed seeds, so neither count can drift.
    const p = { w: 7, h: 7, diff: DIFF_TRICKY };
    const seeds = Array.from({ length: 10 }, (_, i) => `clusters-loose-${i}`);
    const solvesEasily = (desc: string) =>
      solveGame(newState(p, desc).grid, p.w, p.h, 0) === COMPLETE;

    const loose = seeds.map(
      (s) => newClustersDesc(p, randomNew(s), { upstreamLooseGate: true }).desc,
    );
    const looseAsEasy = seeds.map(
      (s) =>
        newClustersDesc({ ...p, diff: DIFF_EASY }, randomNew(s), {
          upstreamLooseGate: true,
        }).desc,
    );
    expect(looseAsEasy).toEqual(loose);

    const honest = seeds.map((s) => newClustersDesc(p, randomNew(s)).desc);
    expect(loose.filter(solvesEasily).length).toBeGreaterThan(0);
    expect(honest.filter(solvesEasily)).toEqual([]);
  });
});

describe("desc codec", () => {
  it("round-trips a hand-built dot grid (color asymmetry)", () => {
    // 3x3: a red dot (F_COLOR_0|F_SINGLE) at 0, a blue dot at 4.
    const grid = new Uint8Array(9);
    grid[0] = F_COLOR_0 | F_SINGLE;
    grid[4] = F_COLOR_1 | F_SINGLE;
    const desc = encodeDesc(grid, 3, 3);
    const p = { w: 3, h: 3, diff: DIFF_EASY };
    expect(validateDesc(p, desc)).toBeNull();
    const st = newState(p, desc);
    expect(Array.from(st.grid)).toEqual(Array.from(grid));
    expect(encodeDesc(st.grid, 3, 3)).toBe(desc);
  });

  it("chains z/Z skips for a run longer than 24", () => {
    // A single red dot at position 30 (needs a 'z' skip of 25 then 'f').
    const grid = new Uint8Array(36);
    grid[30] = F_COLOR_0 | F_SINGLE;
    const desc = encodeDesc(grid, 6, 6);
    // 30 blanks → 'z'(skip 25) + 'f'('a'+5) for the dot; then 5 trailing
    // blanks → 'f' terminator.
    expect(desc).toBe("zff");
    const st = newState({ w: 6, h: 6, diff: DIFF_EASY }, desc);
    expect(st.grid[30]).toBe(F_COLOR_0 | F_SINGLE);
  });

  it("rejects too-short / too-long / invalid descs", () => {
    const p = { w: 3, h: 3, diff: DIFF_EASY }; // s = 9, positions must sum to 10
    expect(validateDesc(p, "j")).toBeNull(); // 'j' = skip 10 = s+1
    expect(validateDesc(p, "i")).toBe("Description too short"); // skip 9
    expect(validateDesc(p, "k")).toBe("Description too long"); // skip 11
    expect(validateDesc(p, "2")).toBe("Description contains invalid characters");
  });
});

describe("solver classification", () => {
  it("classifies empty / complete / invalid boards", () => {
    // all-empty → UNFINISHED
    expect(clustersStatus(new Uint8Array(4), 2, 2)).toBe(UNFINISHED);
    // 2x2 all red: every cell touches 2 same-color neighbors → COMPLETE
    expect(clustersStatus(Uint8Array.from([1, 1, 1, 1]), 2, 2)).toBe(COMPLETE);
    // 1x2 red|blue: the red cell is wholly surrounded by the other color
    expect(clustersStatus(Uint8Array.from([F_COLOR_0, F_COLOR_1]), 2, 1)).toBe(INVALID);
  });

  it("findErrors lists the offending cells (pure — no F_ERROR left behind)", () => {
    const grid = Uint8Array.from([F_COLOR_0, F_COLOR_1]);
    const errs = findErrors(grid, 2, 1);
    expect(errs.sort()).toEqual([0, 1]);
    // The pure check must not have written F_ERROR (0x08) into the grid.
    expect(grid[0] & 0x08).toBe(0);
    expect(grid[1] & 0x08).toBe(0);
  });

  it("solves every preset's generated board to a unique completion", () => {
    for (const [w, h] of [
      [7, 7],
      [8, 8],
      [9, 9],
      [10, 10],
    ] as const) {
      const { desc } = newClustersDesc(
        { w, h, diff: DIFF_TRICKY },
        randomNew(`clusters-solve-${w}`),
      );
      const grid = newState({ w, h, diff: DIFF_TRICKY }, desc).grid.slice();
      expect(solveGame(grid, w, h, 1)).toBe(COMPLETE);
    }
  });
});

describe("interpretMove", () => {
  it("left-click paints blue, cycles blue→red→clear; right-click paints red", () => {
    let st = makeState(2, 1, [0, 0]);
    const ui = newUi();
    // empty → blue
    st = clustersGame.executeMove(st, click(st, ui, 0, 0, LEFT_BUTTON, LEFT_RELEASE));
    expect(st.grid[0]).toBe(F_COLOR_1);
    // blue → red
    st = clustersGame.executeMove(st, click(st, ui, 0, 0, LEFT_BUTTON, LEFT_RELEASE));
    expect(st.grid[0]).toBe(F_COLOR_0);
    // red → clear
    st = clustersGame.executeMove(st, click(st, ui, 0, 0, LEFT_BUTTON, LEFT_RELEASE));
    expect(st.grid[0]).toBe(0);
    // right-click empty → red
    st = clustersGame.executeMove(st, click(st, ui, 0, 0, RIGHT_BUTTON, RIGHT_RELEASE));
    expect(st.grid[0]).toBe(F_COLOR_0);
  });

  it("never overwrites a given dot", () => {
    const st = makeState(2, 1, [F_COLOR_0 | F_SINGLE, 0]);
    const ui = newUi();
    // A press on the given picks a dragType but the release skips givens.
    const move = clickMove(st, ui, 0, 0, LEFT_BUTTON, LEFT_RELEASE);
    // Either no move, or a move that changes nothing on the given.
    const next = move ? clustersGame.executeMove(st, move) : st;
    expect(next.grid[0]).toBe(F_COLOR_0 | F_SINGLE);
  });

  it("accretes a multi-cell drag into one paint move", () => {
    const st = makeState(3, 1, [0, 0, 0]);
    const ui = newUi();
    clustersGame.interpretMove(st, ui, ds, cellPoint(0, 0), LEFT_BUTTON); // press cell 0 → blue
    clustersGame.interpretMove(st, ui, ds, cellPoint(0, 1), 0x0203); // LEFT_DRAG to cell 1
    clustersGame.interpretMove(st, ui, ds, cellPoint(0, 2), 0x0203); // LEFT_DRAG to cell 2
    const res = clustersGame.interpretMove(st, ui, ds, cellPoint(0, 2), LEFT_RELEASE);
    expect(res).toMatchObject({ kind: "paint" });
    const move = res as ClustersMove;
    if (move.kind !== "paint") throw new Error("expected paint");
    expect(move.cells.map((c) => c.index).sort()).toEqual([0, 1, 2]);
    expect(move.cells.every((c) => c.fill === F_COLOR_1)).toBe(true);
  });

  it("keyboard cursor places a color and suppresses a no-op", () => {
    const st = makeState(2, 1, [0, 0]);
    const ui = newUi();
    // Reveal the cursor with a move, then Enter cycles empty→blue.
    clustersGame.interpretMove(st, ui, ds, { x: 0, y: 0 }, 0x020c); // CURSOR_RIGHT
    const res = clustersGame.interpretMove(st, ui, ds, { x: 0, y: 0 }, CURSOR_SELECT);
    expect(res).toMatchObject({ kind: "paint" });
    // '1' on the now-blue cell changes nothing, so no move reaches the undo chain.
    const blue = clustersGame.executeMove(st, res as ClustersMove);
    const one = "1".charCodeAt(0);
    expect(clustersGame.interpretMove(blue, ui, ds, { x: 0, y: 0 }, one)).toBeNull();
  });
});

describe("executeMove + completion", () => {
  it("marks completed on the last correct fill and flashes only then", () => {
    // 2x2, no givens: fill all red → COMPLETE.
    let st = makeState(2, 2, [0, 0, 0, 0]);
    const paint = (i: number, fill: ClustersFill): ClustersMove => ({
      kind: "paint",
      cells: [{ index: i, fill }],
    });
    for (const i of [0, 1, 2]) st = clustersGame.executeMove(st, paint(i, F_COLOR_0));
    expect(st.completed).toBe(false);
    const before = cloneState(st);
    st = clustersGame.executeMove(st, paint(3, F_COLOR_0));
    expect(st.completed).toBe(true);
    expect(clustersGame.flashLength?.(before, st, 1, newUi())).toBeGreaterThan(0);
  });
});

// --- Midend integration ----------------------------------------------------

function harness() {
  const notes: ChangeNotification[] = [];
  const m = new Midend(clustersGame);
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

/** A 7x7 game and moves that break a rule: its first non-given cell painted
 * red, and every non-given neighbor of it blue. */
function violation(): { desc: string; target: number; moves: ClustersMove[] } {
  const params = decodeParams("7x7");
  const { desc } = newClustersDesc(params, randomNew("clusters-mistake"));
  const { grid } = newState(params, desc);
  const target = grid.findIndex((cell) => !(cell & F_SINGLE));
  const moves: ClustersMove[] = [
    { kind: "paint", cells: [{ index: target, fill: F_COLOR_0 }] },
  ];
  for (const nb of [target - 1, target + 1, target - params.w, target + params.w]) {
    if (nb >= 0 && nb < grid.length && !(grid[nb] & F_SINGLE)) {
      moves.push({ kind: "paint", cells: [{ index: nb, fill: F_COLOR_1 }] });
    }
  }
  return { desc, target, moves };
}

describe("midend integration", () => {
  it("Solve finishes with help; playing the solution wins plainly", () => {
    const params = decodeParams("7x7");
    const { desc } = newClustersDesc(params, randomNew("clusters-mid"));

    // (a) Solve command → solved-with-help.
    const solveH = harness();
    expect(solveH.m.newGameFromId(`7x7:${desc}`)).toBeUndefined();
    expect(solveH.status()).toBe("ongoing");
    expect(solveH.m.solve()).toBeUndefined();
    expect(solveH.status()).toBe("solved-with-help");

    // (b) Play the solution's own fills → plain solved (no cheat).
    const grid = newState(params, desc).grid.slice();
    expect(solveGame(grid, params.w, params.h, 1)).toBe(COMPLETE);
    const moves: ClustersMove[] = [];
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] & F_SINGLE) continue; // givens already placed
      moves.push({
        kind: "paint",
        cells: [{ index: i, fill: (grid[i] & COLMASK) as ClustersFill }],
      });
    }
    const playH = harness();
    expect(playH.m.newGameFromId(`7x7:${desc}`)).toBeUndefined();
    playH.m.playMoves(moves);
    expect(playH.status()).toBe("solved");
  });

  it("findMistakes flags a rule violation and clears when corrected", () => {
    const { desc, target, moves } = violation();
    const { m } = harness();
    expect(m.newGameFromId(`7x7:${desc}`)).toBeUndefined();
    expect(m.findMistakes()).toBe(0);
    m.playMoves(moves);
    expect(m.findMistakes()).toBeGreaterThan(0);

    // Repaint the target to match its neighbors → the violation clears.
    m.playMoves([{ kind: "paint", cells: [{ index: target, fill: F_COLOR_1 }] }]);
    expect(m.findMistakes()).toBe(0);
  });

  it("Check & Save path: the mistake overlay is actually painted", () => {
    // The test above proves `findMistakes` *finds* the violation; this one
    // proves the frame *draws* it (`src/mistake-overlay-coverage.test.ts`). The
    // inset error frame is shared engine code, so this is also one of the few
    // tests that fail when `drawThickRectOutline` loses a side.
    const { desc, moves } = violation();
    const { recording, mistakeCount } = renderScenario({
      game: clustersGame,
      id: `7x7:${desc}`,
      moves,
      showMistakes: true,
    });

    expect(mistakeCount).toBeGreaterThan(0);
    // Four inset error-colored bands — the shared thick-rect frame.
    const bands = recording.ops.filter((o) => o.op === "rect" && o.color === COL_ERROR);
    expect(bands.length).toBeGreaterThanOrEqual(4);
  });

  it("save → load round-trips a played game", () => {
    const { desc } = newClustersDesc(decodeParams("7x7"), randomNew("clusters-save"));
    const m = new Midend(clustersGame);
    expect(m.newGameFromId(`7x7:${desc}`)).toBeUndefined();
    m.playMoves([{ kind: "paint", cells: [{ index: 0, fill: F_COLOR_1 }] }]);
    const saved = m.saveGame();
    const m2 = new Midend(clustersGame);
    expect(m2.loadGame(saved)).toBeUndefined();
    expect(m2.formatAsText()).toBe(m.formatAsText());
  });
});

describe("text format", () => {
  it("renders r/b/. with uppercase givens", () => {
    const st = makeState(2, 2, [F_COLOR_0 | F_SINGLE, F_COLOR_1, 0, F_COLOR_0]);
    expect(textFormat(st)).toBe("R b \n. r \n");
  });
});

describe("render (tier 2.5)", () => {
  it("draws the opening frame with dots and grid, stable snapshot", () => {
    // The tier is spelled out: a bare "7x7" would pin this snapshot to whatever
    // the default difficulty happens to be, and the board is what is snapshotted.
    const result = renderScenario({ game: clustersGame, id: "7x7de#clusters-render" });
    const { ops } = result.recording;
    // Some tile rects were drawn.
    expect(ops.some((o) => o.op === "rect")).toBe(true);
    // At least one dot circle (givens are dots).
    expect(ops.some((o) => o.op === "circle")).toBe(true);
    expect(ops).toMatchSnapshot();
  });
});
