/**
 * Behavioural tests for the Map port (tier 1 + a tier-2 paint-twice render
 * check). Byte-match generation/solver fidelity lives in
 * `map-differential.test.ts`; this file covers the codec, input → move mapping,
 * `executeMove`, completion, `findMistakes`, and `solve`.
 */

import { describe, expect, it } from "vitest";
import { UI_UPDATE } from "../../engine/game.ts";
import { Midend } from "../../engine/index.ts";
import {
  LEFT_BUTTON,
  LEFT_RELEASE,
  RIGHT_BUTTON,
  RIGHT_RELEASE,
} from "../../engine/pointer.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { randomNew } from "../../random/index.ts";
import { newMapDesc } from "./generator.ts";
import { mapGame } from "./index.ts";
import { TE, validateDesc } from "./map-data.ts";
import { COL_MISTAKE, newDrawState, redraw, setTileSize } from "./render.ts";
import {
  cloneState,
  DIFF_HARD,
  DIFF_NORMAL,
  decodeParams,
  defaultParams,
  encodeParams,
  type MapOp,
  type MapParams,
  type MapState,
  newUi,
} from "./state.ts";

const TS = 20;

function makeGame(p: MapParams, seed: string): { state: MapState; aux: string } {
  const { desc, aux } = newMapDesc(p, randomNew(seed));
  return { state: mapGame.newState(p, desc) as MapState, aux };
}

function solutionFromAux(aux: string, n: number): Int32Array {
  const sol = new Int32Array(n).fill(-1);
  for (const tok of aux.split(";")) {
    if (tok === "S" || tok === "") continue;
    const [c, r] = tok.split(":");
    sol[Number(r)] = Number(c);
  }
  return sol;
}

/** A cell whose four quadrants all belong to `region` — a safe click point. */
function solidCellOf(state: MapState, region: number): { x: number; y: number } | null {
  const { w, h } = state.params;
  const wh = w * h;
  const M = state.map.map;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = y * w + x;
      if (
        M[TE * wh + c] === region &&
        M[wh + c] === region &&
        M[2 * wh + c] === region &&
        M[3 * wh + c] === region
      )
        return { x, y };
    }
  return null;
}

function centreOf(cell: { x: number; y: number }): { x: number; y: number } {
  return { x: cell.x * TS + Math.floor(TS / 2), y: cell.y * TS + Math.floor(TS / 2) };
}

function firstBlank(state: MapState): number {
  for (let i = 0; i < state.params.n; i++) if (!state.map.immutable[i]) return i;
  throw new Error("no blank region");
}

function firstClue(state: MapState): number {
  for (let i = 0; i < state.params.n; i++) if (state.map.immutable[i]) return i;
  throw new Error("no clue");
}

function findClueBlankPair(state: MapState): { clue: number; blank: number } | null {
  const { graph, ngraph, immutable } = state.map;
  const n = state.params.n;
  for (let i = 0; i < ngraph; i++) {
    const a = Math.floor(graph[i] / n);
    const b = graph[i] % n;
    if (immutable[a] && !immutable[b]) return { clue: a, blank: b };
    if (immutable[b] && !immutable[a]) return { clue: b, blank: a };
  }
  return null;
}

// --- params ----------------------------------------------------------

describe("map params codec", () => {
  it("round-trips every preset", () => {
    const menu = mapGame.presets();
    for (const entry of menu.submenu ?? []) {
      const p = entry.params as MapParams;
      expect(decodeParams(encodeParams(p, true))).toEqual(p);
    }
  });

  it("encodes with a full difficulty suffix", () => {
    expect(encodeParams({ w: 20, h: 15, n: 30, diff: DIFF_NORMAL }, true)).toBe(
      "20x15n30dn",
    );
    expect(encodeParams({ w: 20, h: 15, n: 30, diff: DIFF_NORMAL }, false)).toBe(
      "20x15n30",
    );
  });

  it("decodes leniently (square, default n, difficulty char, `.` fraction)", () => {
    expect(decodeParams("12")).toEqual({ w: 12, h: 12, n: 18, diff: DIFF_NORMAL });
    expect(decodeParams("20x15n30dh")).toEqual({
      w: 20,
      h: 15,
      n: 30,
      diff: DIFF_HARD,
    });
    expect(decodeParams("10x10n5.5").n).toBe(5);
  });

  it("rejects out-of-range params", () => {
    expect(
      mapGame.validateParams({ w: 20, h: 15, n: 4, diff: 0 }, true),
    ).not.toBeNull();
    expect(mapGame.validateParams({ w: 3, h: 3, n: 30, diff: 0 }, true)).not.toBeNull();
    expect(mapGame.validateParams(defaultParams(), true)).toBeNull();
  });
});

// --- desc validation -------------------------------------------------

describe("map desc validation", () => {
  const p: MapParams = { w: 12, h: 10, n: 12, diff: DIFF_NORMAL };
  const { desc } = newMapDesc(p, randomNew("desc-valid"));

  it("accepts a generated desc", () => {
    expect(validateDesc(p, desc)).toBeNull();
  });

  it("rejects a desc with the wrong clue count", () => {
    expect(validateDesc(p, `${desc}0`)).not.toBeNull();
  });

  it("rejects an unexpected character", () => {
    expect(validateDesc(p, desc.replace(",", ",!"))).not.toBeNull();
  });
});

// --- executeMove -----------------------------------------------------

describe("map executeMove", () => {
  const p: MapParams = { w: 12, h: 10, n: 12, diff: DIFF_NORMAL };

  it("colours a region and clears its pencil", () => {
    const { state } = makeGame(p, "exec-1");
    const blank = firstBlank(state);
    let s = cloneState(state);
    s = mapGame.executeMove(s, { ops: [{ op: "pencil", region: blank, bit: 2 }] });
    expect(s.pencil[blank]).toBe(1 << 2);
    s = mapGame.executeMove(s, { ops: [{ op: "colour", region: blank, colour: 1 }] });
    expect(s.colouring[blank]).toBe(1);
    expect(s.pencil[blank]).toBe(0);
  });

  it("toggles a pencil bit and rejects pencilling a coloured region", () => {
    const { state } = makeGame(p, "exec-2");
    const blank = firstBlank(state);
    let s = mapGame.executeMove(state, {
      ops: [{ op: "pencil", region: blank, bit: 1 }],
    });
    expect(s.pencil[blank]).toBe(2);
    s = mapGame.executeMove(s, { ops: [{ op: "pencil", region: blank, bit: 1 }] });
    expect(s.pencil[blank]).toBe(0);

    const coloured = mapGame.executeMove(state, {
      ops: [{ op: "colour", region: blank, colour: 0 }],
    });
    expect(() =>
      mapGame.executeMove(coloured, { ops: [{ op: "pencil", region: blank, bit: 0 }] }),
    ).toThrow();
  });

  it("detects completion on the full solution", () => {
    const { state, aux } = makeGame(p, "exec-3");
    const sol = solutionFromAux(aux, p.n);
    const ops: MapOp[] = [];
    for (let i = 0; i < p.n; i++)
      if (!state.map.immutable[i])
        ops.push({ op: "colour", region: i, colour: sol[i] });
    const done = mapGame.executeMove(state, { ops });
    expect(done.completed).toBe(true);
    expect(mapGame.status(done)).toBe("solved");
  });

  it("does not complete a partially-coloured board", () => {
    const { state, aux } = makeGame(p, "exec-4");
    const sol = solutionFromAux(aux, p.n);
    const blank = firstBlank(state);
    const s = mapGame.executeMove(state, {
      ops: [{ op: "colour", region: blank, colour: sol[blank] }],
    });
    expect(s.completed).toBe(false);
  });
});

// --- interpretMove ---------------------------------------------------

describe("map interpretMove", () => {
  const p: MapParams = { w: 12, h: 10, n: 12, diff: DIFF_NORMAL };

  it("press picks up a region's colour, release drops it", () => {
    const { state } = makeGame(p, "input-1");
    const ui = newUi(state);
    const ds = newDrawState(state);
    setTileSize(ds, TS);

    const found = findClueBlankPair(state);
    expect(found).not.toBeNull();
    if (!found) return;
    const clueCell = solidCellOf(state, found.clue);
    const blankCell = solidCellOf(state, found.blank);
    if (!clueCell || !blankCell) return;

    const press = mapGame.interpretMove(state, ui, ds, centreOf(clueCell), LEFT_BUTTON);
    expect(press).toBe(UI_UPDATE);
    expect(ui.dragColour).toBe(state.colouring[found.clue]);

    const rel = mapGame.interpretMove(state, ui, ds, centreOf(blankCell), LEFT_RELEASE);
    expect(rel).not.toBe(UI_UPDATE);
    expect(rel).not.toBeNull();
    const s2 = mapGame.executeMove(state, rel as { ops: MapOp[] });
    expect(s2.colouring[found.blank]).toBe(state.colouring[found.clue]);
  });

  it("dropping on an immutable region is a no-op", () => {
    const { state } = makeGame(p, "input-2");
    const ui = newUi(state);
    const ds = newDrawState(state);
    setTileSize(ds, TS);

    const clue = firstClue(state);
    const clueCell = solidCellOf(state, clue);
    if (!clueCell) return;
    mapGame.interpretMove(state, ui, ds, centreOf(clueCell), LEFT_BUTTON);
    const rel = mapGame.interpretMove(state, ui, ds, centreOf(clueCell), LEFT_RELEASE);
    expect(rel).toBe(UI_UPDATE);
  });

  it("right-drag toggles a pencil mark on a blank region", () => {
    const { state } = makeGame(p, "input-3");
    const ui = newUi(state);
    const ds = newDrawState(state);
    setTileSize(ds, TS);

    const found = findClueBlankPair(state);
    if (!found) return;
    const clueCell = solidCellOf(state, found.clue);
    const blankCell = solidCellOf(state, found.blank);
    if (!clueCell || !blankCell) return;

    mapGame.interpretMove(state, ui, ds, centreOf(clueCell), RIGHT_BUTTON);
    const rel = mapGame.interpretMove(
      state,
      ui,
      ds,
      centreOf(blankCell),
      RIGHT_RELEASE,
    );
    expect(rel).not.toBe(UI_UPDATE);
    const s2 = mapGame.executeMove(state, rel as { ops: MapOp[] });
    expect(s2.colouring[found.blank]).toBe(-1);
    expect(s2.pencil[found.blank]).toBe(1 << (state.colouring[found.clue] as number));
  });

  it("the 'l' key toggles region numbers", () => {
    const { state } = makeGame(p, "input-4");
    const ui = newUi(state);
    expect(ui.showNumbers).toBe(false);
    const r = mapGame.interpretMove(state, ui, null, { x: 0, y: 0 }, 108);
    expect(r).toBe(UI_UPDATE);
    expect(ui.showNumbers).toBe(true);
  });
});

// --- solve + findMistakes --------------------------------------------

describe("map solve + findMistakes", () => {
  const p: MapParams = { w: 12, h: 10, n: 12, diff: DIFF_NORMAL };

  it("solve (re-derived) colours every region correctly", () => {
    const { state, aux } = makeGame(p, "solve-1");
    const sol = solutionFromAux(aux, p.n);
    const res = mapGame.solve?.(state, state, undefined);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    const done = mapGame.executeMove(state, res.move);
    expect(done.cheated).toBe(true);
    for (let i = 0; i < p.n; i++) expect(done.colouring[i]).toBe(sol[i]);
  });

  it("solve via aux matches re-derivation", () => {
    const { state, aux } = makeGame(p, "solve-2");
    const res = mapGame.solve?.(state, state, aux);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    const done = mapGame.executeMove(state, res.move);
    const sol = solutionFromAux(aux, p.n);
    for (let i = 0; i < p.n; i++) expect(done.colouring[i]).toBe(sol[i]);
  });

  it("flags a region coloured against the unique solution", () => {
    const { state, aux } = makeGame(p, "mistake-1");
    const sol = solutionFromAux(aux, p.n);
    const blank = firstBlank(state);
    const wrong = (sol[blank] + 1) % 4;
    const s = mapGame.executeMove(state, {
      ops: [{ op: "colour", region: blank, colour: wrong }],
    });
    const mistakes = mapGame.findMistakes?.(s) ?? [];
    expect(mistakes.some((m) => m.region === blank)).toBe(true);
  });

  it("reports no mistakes on a correctly-coloured partial board", () => {
    const { state, aux } = makeGame(p, "mistake-2");
    const sol = solutionFromAux(aux, p.n);
    const blank = firstBlank(state);
    const s = mapGame.executeMove(state, {
      ops: [{ op: "colour", region: blank, colour: sol[blank] }],
    });
    expect(mapGame.findMistakes?.(s) ?? []).toHaveLength(0);
  });
});

// --- Midend save round-trip ------------------------------------------

describe("map save round-trip", () => {
  it("saveGame -> loadGame -> saveGame is a fixpoint after a move", () => {
    const p: MapParams = { w: 12, h: 10, n: 12, diff: DIFF_NORMAL };
    const id = `${encodeParams(p, true)}#save-rt`;
    // Same seed as the id, so `blank` is a blank region on the Midend's board.
    const { state } = makeGame(p, "save-rt");
    const blank = firstBlank(state);

    const me = new Midend(mapGame);
    expect(me.newGameFromId(id)).toBeUndefined();
    me.playMoves([{ ops: [{ op: "colour", region: blank, colour: 2 }] }]);
    const saved = me.saveGame();

    const me2 = new Midend(mapGame);
    expect(me2.loadGame(saved)).toBeUndefined();
    // A faithful reconstruction re-serialises to the same bytes.
    expect(Array.from(me2.saveGame())).toEqual(Array.from(saved));
  });
});

// --- tier 2: paint-twice mistake overlay -----------------------------

describe("map mistake overlay repaints on an already-drawn board", () => {
  it("reds a wrong region even when the cell was already drawn", () => {
    const p: MapParams = { w: 12, h: 10, n: 12, diff: DIFF_NORMAL };
    const { desc, aux } = newMapDesc(p, randomNew("paint-twice"));
    const state0 = mapGame.newState(p, desc) as MapState;
    const sol = solutionFromAux(aux, p.n);
    const blank = firstBlank(state0);
    const wrong = (sol[blank] + 1) % 4;
    const state = mapGame.executeMove(state0, {
      ops: [{ op: "colour", region: blank, colour: wrong }],
    });

    const ui = newUi(state);
    const ds = newDrawState(state);
    setTileSize(ds, TS);

    // Frame 1: no overlay — warm the cache.
    const dr1 = new RecordingDrawing(mapGame.colours([0.9, 0.9, 0.9]));
    dr1.startDraw();
    redraw(dr1, ds, null, state, 0, ui, 0, 0, undefined, []);
    dr1.endDraw();

    // Frame 2: same drawstate, now with the mistake overlay.
    const mistakes = mapGame.findMistakes?.(state) ?? [];
    expect(mistakes.length).toBeGreaterThan(0);
    const dr2 = new RecordingDrawing(mapGame.colours([0.9, 0.9, 0.9]));
    dr2.startDraw();
    redraw(dr2, ds, state, state, 0, ui, 0, 0, undefined, mistakes);
    dr2.endDraw();

    expect(dr2.ops.some((o) => o.op === "rect" && o.colour === COL_MISTAKE)).toBe(true);
  });
});
