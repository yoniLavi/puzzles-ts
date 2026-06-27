/**
 * Behavioural tests for the Solo port (tiers 1 + 2.5).
 *
 * Tier 1 drives the move/solve/findMistakes logic on fixture-derived boards.
 * Tier 2.5 drives a real `Midend` to an initial frame for each of the four
 * variants (standard / X / jigsaw / killer) via the shared recording drawing,
 * asserting the distinctive ops plus a frozen snapshot.
 *
 * Board descs are taken from the differential fixture so the tests are
 * deterministic without running the (slow) generator.
 */
import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/index.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import cReference from "./__fixtures__/solo-c-reference.json" with { type: "json" };
import { soloGame } from "./index.ts";
import { COL_KILLER, COL_XDIAGONALS } from "./render.ts";
import {
  checkValid,
  encodeParams,
  newState,
  type SoloParams,
  type SoloState,
} from "./state.ts";

interface Fixture {
  c: number;
  r: number;
  symm: number;
  diff: number;
  kdiff: number;
  xtype: boolean;
  killer: boolean;
  seed: string;
  desc: string;
}

const fixtures = (cReference as { fixtures: Fixture[] }).fixtures;

function paramsOf(f: Fixture): SoloParams {
  const { c, r, symm, diff, kdiff, xtype, killer } = f;
  return { c, r, symm, diff, kdiff, xtype, killer };
}

function fixtureBy(pred: (f: Fixture) => boolean): Fixture {
  const f = fixtures.find(pred);
  if (!f) throw new Error("no matching fixture");
  return f;
}

const STD = fixtureBy((f) => !f.xtype && !f.killer && f.r === 3 && f.c === 3);
const XTYPE = fixtureBy((f) => f.xtype && !f.killer && f.r === 3);
const JIGSAW = fixtureBy((f) => f.r === 1 && !f.xtype && !f.killer);
const KILLER = fixtureBy((f) => f.killer);

function idOf(f: Fixture): string {
  return `${encodeParams(paramsOf(f), false)}:${f.desc}`;
}

function stateOf(f: Fixture): SoloState {
  return newState(paramsOf(f), f.desc);
}

function getState(me: unknown): SoloState {
  return (me as { state: SoloState }).state;
}

function firstEditable(s: SoloState): number {
  for (let k = 0; k < s.cr * s.cr; k++) if (!s.immutable[k]) return k;
  throw new Error("no editable cell");
}

function solvedGrid(f: Fixture): Int8Array {
  const me = new Midend(soloGame);
  me.newGameFromId(idOf(f));
  me.solve();
  return getState(me).grid.slice();
}

// --- tier 1: solve / moves / completion ------------------------------------

describe("solo solve", () => {
  it("solve fills a valid grid for a uniquely-solvable board", () => {
    const me = new Midend(soloGame);
    expect(me.newGameFromId(idOf(STD))).toBeUndefined();
    expect(me.solve()).toBeUndefined();
    const s = getState(me);
    expect(s.completed).toBe(true);
    expect(checkValid(s.cr, s.blocks, s.killerData, s.xtype, s.grid)).toBe(true);
  });
});

describe("solo moves", () => {
  it("a real placement that completes the grid sets completed", () => {
    const soln = solvedGrid(STD);
    const me = new Midend(soloGame);
    me.newGameFromId(idOf(STD));
    const s0 = getState(me);
    for (let i = 0; i < s0.cr * s0.cr; i++) {
      if (s0.immutable[i]) continue;
      me.playMoves([
        { type: "set", x: i % s0.cr, y: (i / s0.cr) | 0, n: soln[i], pencil: false },
      ]);
    }
    expect(getState(me).completed).toBe(true);
  });

  it("pencilAll fills every empty cell's notes; a real placement clears them", () => {
    const me = new Midend(soloGame);
    me.newGameFromId(idOf(STD));
    me.playMoves([{ type: "pencilAll" }]);
    const s = getState(me);
    const cr = s.cr;
    const all = ((1 << (cr + 1)) - (1 << 1)) | 0;
    let emptyIdx = -1;
    for (let i = 0; i < cr * cr; i++) {
      if (!s.grid[i]) {
        expect(s.pencil[i]).toBe(all);
        if (emptyIdx < 0) emptyIdx = i;
      }
    }
    me.playMoves([
      { type: "set", x: emptyIdx % cr, y: (emptyIdx / cr) | 0, n: 1, pencil: false },
    ]);
    expect(getState(me).pencil[emptyIdx]).toBe(0);
  });

  it("pencilStrike clears only the named candidates", () => {
    const me = new Midend(soloGame);
    me.newGameFromId(idOf(STD));
    me.playMoves([{ type: "pencilAll" }]);
    const cr = getState(me).cr;
    const i = firstEditable(getState(me));
    const x = i % cr;
    const y = (i / cr) | 0;
    me.playMoves([{ type: "pencilStrike", marks: [{ x, y, n: 1 }] }]);
    expect(getState(me).pencil[i] & (1 << 1)).toBe(0);
    expect(getState(me).pencil[i] & (1 << 2)).not.toBe(0);
  });

  it("auto-pencil strikes the placed digit from its row and column", () => {
    const me = new Midend(soloGame);
    me.newGameFromId(idOf(STD));
    me.playMoves([{ type: "pencilAll" }]);
    const cr = getState(me).cr;
    const i = firstEditable(getState(me));
    const x = i % cr;
    const y = (i / cr) | 0;
    me.playMoves([{ type: "set", x, y, n: 5, pencil: false, autoElim: true }]);
    const after = getState(me);
    for (let k = 0; k < cr; k++) {
      const row = y * cr + k;
      const col = k * cr + x;
      if (k !== x && !after.grid[row]) expect(after.pencil[row] & (1 << 5)).toBe(0);
      if (k !== y && !after.grid[col]) expect(after.pencil[col] & (1 << 5)).toBe(0);
    }
  });
});

// --- tier 1: findMistakes --------------------------------------------------

describe("solo findMistakes", () => {
  it("flags a wrong filled digit", () => {
    const s = stateOf(STD);
    const soln = solvedGrid(STD);
    const cr = s.cr;
    const i = firstEditable(s);
    s.grid[i] = (soln[i] % cr) + 1; // any digit other than the solution
    const mistakes = soloGame.findMistakes?.(s) ?? [];
    expect(
      mistakes.some(
        (m) => m.kind === "cell" && m.x === i % cr && m.y === ((i / cr) | 0),
      ),
    ).toBe(true);
  });

  it("flags a note that crossed out the solution digit", () => {
    const s = stateOf(STD);
    const soln = solvedGrid(STD);
    const cr = s.cr;
    const i = firstEditable(s);
    let bits = 0;
    for (let n = 1; n <= cr; n++) if (n !== soln[i]) bits |= 1 << n;
    s.pencil[i] = bits;
    const mistakes = soloGame.findMistakes?.(s) ?? [];
    expect(mistakes.some((m) => m.kind === "note")).toBe(true);
  });

  it("returns [] for an untouched (correct) board", () => {
    expect(soloGame.findMistakes?.(stateOf(STD)) ?? []).toHaveLength(0);
  });
});

// --- tier 2.5: render frames per variant -----------------------------------

describe("solo render (initial frame)", () => {
  it("standard board: draws clue digits on the grid backing", () => {
    const { recording } = renderScenario({ game: soloGame, id: idOf(STD) });
    expect(recording.ops.length).toBeGreaterThan(0);
    expect(recording.ops.some((o) => o.op === "text")).toBe(true);
    expect(recording.ops).toMatchSnapshot();
  });

  it("X variant: shades the diagonals with COL_XDIAGONALS", () => {
    const { recording } = renderScenario({ game: soloGame, id: idOf(XTYPE) });
    expect(
      recording.ops.some((o) => o.op === "rect" && o.colour === COL_XDIAGONALS),
    ).toBe(true);
    expect(recording.ops).toMatchSnapshot();
  });

  it("jigsaw board: renders and draws digits", () => {
    const { recording } = renderScenario({ game: soloGame, id: idOf(JIGSAW) });
    expect(recording.ops.some((o) => o.op === "text")).toBe(true);
    expect(recording.ops).toMatchSnapshot();
  });

  it("killer board: draws cage outlines in COL_KILLER", () => {
    const { recording } = renderScenario({ game: soloGame, id: idOf(KILLER) });
    expect(recording.ops.some((o) => o.op === "line" && o.colour === COL_KILLER)).toBe(
      true,
    );
    expect(recording.ops).toMatchSnapshot();
  });

  it("mistake overlay path runs cleanly on a correct board", () => {
    const { recording, mistakeCount } = renderScenario({
      game: soloGame,
      id: idOf(STD),
      showMistakes: true,
    });
    expect(mistakeCount).toBe(0);
    expect(recording.ops.length).toBeGreaterThan(0);
  });
});
