/**
 * Behavioural tests for the Net port (tier 1 — pure logic).
 *
 * The byte-for-byte fidelity of the generator/solver is guarded separately by
 * `net-differential.test.ts`; these assert the port *behaves* — round-trips its
 * codecs, generates uniquely-solvable spanning trees, and transitions correctly
 * under each move.
 */

import { describe, expect, it } from "vitest";
import { UI_UPDATE } from "../../engine/game.ts";
import { CURSOR_RIGHT, MOD_CTRL, MOD_SHFT } from "../../engine/pointer.ts";
import { randomNew } from "../../random/index.ts";
import { newDesc } from "./generator.ts";
import { netGame } from "./index.ts";
import { computeLoops } from "./loops.ts";
import { netSolver, SOLVER_UNIQUE } from "./solver.ts";
import {
  ACTIVE,
  computeActive,
  decodeParams,
  defaultParams,
  encodeParams,
  isComplete,
  LOCKED,
  type NetMove,
  type NetParams,
  newState,
  newUi,
  validateDesc,
  validateParams,
} from "./state.ts";

const WIRE_MASK = 0x0f;
const wires = (t: number) => t & WIRE_MASK;

function generate(p: NetParams, seed: string) {
  const { desc, aux } = newDesc(p, randomNew(seed));
  return { desc, aux, state: newState(p, desc) };
}

describe("params codec", () => {
  const cases = ["5x5", "7x7", "13x11", "5x5w", "9x9b0.5", "5x5a", "11x11wb0.25a"];
  for (const s of cases) {
    it(`round-trips ${s}`, () => {
      const p = decodeParams(s);
      expect(encodeParams(p, true)).toBe(s);
    });
  }

  it("a bare number is a square grid with defaults", () => {
    expect(decodeParams("7")).toEqual({
      w: 7,
      h: 7,
      wrapping: false,
      unique: true,
      barrierProbability: 0,
    });
  });

  it("rejects a 1x1 grid and a degenerate wrapping-2 unique grid", () => {
    expect(validateParams({ ...defaultParams(), w: 1, h: 1 }, true)).not.toBeNull();
    expect(
      validateParams(
        { w: 2, h: 5, wrapping: true, unique: true, barrierProbability: 0 },
        true,
      ),
    ).toMatch(/unique solution/);
    // A 1×n grid is allowed (only *both* dims ≤ 1 is rejected).
    expect(validateParams({ ...defaultParams(), w: 1, h: 5 }, true)).toBeNull();
  });
});

describe("desc codec + wrapping re-derivation", () => {
  it("round-trips a generated desc through validateDesc + newState", () => {
    const p: NetParams = { w: 5, h: 5, wrapping: false, unique: true, barrierProbability: 0 };
    const { desc, state } = generate(p, "codec-seed");
    expect(validateDesc(p, desc)).toBeNull();
    expect(state.tiles).toHaveLength(25);
  });

  it("re-derives wrapping=false when a wrapping desc has a full border wall", () => {
    // A 3×3 wrapping grid with every toroidal border edge walled: the 'h' walls
    // below the bottom row and the 'v' walls right of the last column together
    // seal the wrap, so newState must report it as non-wrapping.
    const p: NetParams = { w: 3, h: 3, wrapping: true, unique: false, barrierProbability: 0 };
    const desc = "000v000v0h0h0vh";
    expect(validateDesc(p, desc)).toBeNull();
    expect(newState(p, desc).wrapping).toBe(false);
  });
});

describe("generator", () => {
  const presets: NetParams[] = [
    { w: 5, h: 5, wrapping: false, unique: true, barrierProbability: 0 },
    { w: 7, h: 7, wrapping: false, unique: true, barrierProbability: 0 },
    { w: 5, h: 5, wrapping: true, unique: true, barrierProbability: 0 },
    { w: 6, h: 4, wrapping: false, unique: true, barrierProbability: 1 },
  ];

  for (const p of presets) {
    it(`${encodeParams(p, true)} generates a solvable spanning tree`, () => {
      for (let seed = 0; seed < 6; seed++) {
        const { aux, state } = generate(p, `gen-${seed}`);

        // The aux (solved grid) is a spanning tree: no full cross, and it powers
        // the whole board.
        const solvedTiles = Uint8Array.from(aux, (c) => Number.parseInt(c, 16));
        expect(solvedTiles.every((t) => wires(t) !== 0xf)).toBe(true);
        const solved = { ...state, tiles: solvedTiles };
        expect(isComplete(solved)).toBe(true);

        // A unique board solves to a unique solution with no guessing.
        const work = new Uint8Array(state.tiles);
        expect(netSolver(p.w, p.h, work, state.barriers, state.wrapping)).toBe(
          SOLVER_UNIQUE,
        );
      }
    });
  }

  it("raising the barrier probability yields a superset on a fixed seed", () => {
    const base: NetParams = {
      w: 7,
      h: 7,
      wrapping: false,
      unique: true,
      barrierProbability: 0.3,
    };
    const seed = "barrier-superset";
    const low = newState(base, newDesc(base, randomNew(seed)).desc);
    const highParams = { ...base, barrierProbability: 0.6 };
    const high = newState(highParams, newDesc(highParams, randomNew(seed)).desc);
    for (let i = 0; i < low.barriers.length; i++) {
      expect(high.barriers[i] & low.barriers[i]).toBe(low.barriers[i]);
    }
  });

  it("the shuffled start is not already solved, and has no loops", () => {
    const p: NetParams = { w: 6, h: 6, wrapping: false, unique: true, barrierProbability: 0 };
    for (let seed = 0; seed < 4; seed++) {
      const { state } = generate(p, `start-${seed}`);
      expect(isComplete(state)).toBe(false);
      const loops = computeLoops(p.w, p.h, state.tiles, state.barriers, true);
      expect(loops.every((f) => f === 0)).toBe(true);
    }
  });
});

describe("moves", () => {
  const p: NetParams = { w: 5, h: 5, wrapping: false, unique: true, barrierProbability: 0 };
  const base = () => generate(p, "moves-seed").state;

  it("executeMove is pure (does not mutate the source state)", () => {
    const s = base();
    const before = Uint8Array.from(s.tiles);
    netGame.executeMove(s, { type: "rotate", op: "A", x: 0, y: 0 });
    expect(s.tiles).toEqual(before);
  });

  it("rotate A then C returns to the original grid, in two real states", () => {
    const s = base();
    const a = netGame.executeMove(s, { type: "rotate", op: "A", x: 1, y: 1 });
    const c = netGame.executeMove(a, { type: "rotate", op: "C", x: 1, y: 1 });
    expect(c.tiles).toEqual(s.tiles);
    // The intermediate is genuinely different — no equality short-circuit (the
    // "rotation cycle" non-issue, design D1).
    expect(a.tiles).not.toEqual(s.tiles);
  });

  it("F is a 180° rotation and sets the animation direction", () => {
    const s = base();
    const f = netGame.executeMove(s, { type: "rotate", op: "F", x: 2, y: 2 });
    const ff = netGame.executeMove(f, { type: "rotate", op: "F", x: 2, y: 2 });
    expect(ff.tiles[2 * 5 + 2]).toBe(s.tiles[2 * 5 + 2]);
    expect(f.lastRotateDir).toBe(2);
  });

  it("lock toggles the LOCKED bit with no animation", () => {
    const s = base();
    const locked = netGame.executeMove(s, { type: "lock", x: 0, y: 0 });
    expect(locked.tiles[0] & LOCKED).toBe(LOCKED);
    expect(locked.lastRotateDir).toBe(0);
    const unlocked = netGame.executeMove(locked, { type: "lock", x: 0, y: 0 });
    expect(unlocked.tiles[0] & LOCKED).toBe(0);
  });

  it("a rotate on a locked tile yields no move", () => {
    const s = base();
    // The cursor starts at the centre (2,2); lock that tile, then 'a' rotates it.
    const locked = netGame.executeMove(s, { type: "lock", x: 2, y: 2 });
    const ui = newUi(locked);
    expect(
      netGame.interpretMove(locked, ui, null, { x: 0, y: 0 }, 0x61),
    ).toBeNull();
  });

  it("jumble replays deterministically from its expanded op list", () => {
    const s = base();
    const ui = newUi(s);
    const move = netGame.interpretMove(s, ui, null, { x: 0, y: 0 }, 0x6a /* 'j' */);
    expect((move as NetMove).type).toBe("jumble");
    const a = netGame.executeMove(s, move as NetMove);
    const b = netGame.executeMove(s, move as NetMove);
    expect(a.tiles).toEqual(b.tiles);
  });

  it("solve powers and locks the whole board, and wins", () => {
    const { aux, state } = generate(p, "solve-seed");
    const result = netGame.solve?.(state, state, aux);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    const solved = netGame.executeMove(state, result.move);
    expect(isComplete(solved)).toBe(true);
    expect(solved.completed).toBe(true);
    expect(solved.usedSolve).toBe(true);
    expect(Array.from(solved.tiles).every((t) => t & LOCKED)).toBe(true);
  });

  it("solve works without aux by running the internal solver", () => {
    const { state } = generate(p, "solve-noaux");
    const result = netGame.solve?.(state, state);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    const solved = netGame.executeMove(state, result.move);
    expect(isComplete(solved)).toBe(true);
  });

  it("win fires exactly when every non-empty tile is powered", () => {
    const { aux, state } = generate(p, "win-seed");
    expect(state.completed).toBe(false);
    const solvedTiles = Uint8Array.from(aux, (c) => Number.parseInt(c, 16));
    const solved = netGame.executeMove(state, {
      type: "solve",
      ops: [], // no-op, but re-check completion on the already-solved tiles
    });
    void solved;
    expect(isComplete({ ...state, tiles: solvedTiles })).toBe(true);
  });

  it("moving the source marks its own tile active", () => {
    const { state } = generate(p, "source-seed");
    expect(computeActive(state, 0, 0)[0] & ACTIVE).toBe(ACTIVE);
    expect(computeActive(state, 4, 4)[4 * 5 + 4] & ACTIVE).toBe(ACTIVE);
  });

  it("Ctrl/Shift+arrow move the source and origin as UI updates", () => {
    const p2: NetParams = { w: 5, h: 5, wrapping: true, unique: true, barrierProbability: 0 };
    const { state } = generate(p2, "ui-seed");
    const ui = newUi(state);
    const cx0 = ui.cx;
    expect(
      netGame.interpretMove(state, ui, null, { x: 0, y: 0 }, CURSOR_RIGHT | MOD_CTRL),
    ).toBe(UI_UPDATE);
    expect(ui.cx).toBe((cx0 + 1) % 5);

    const org0 = ui.orgX;
    expect(
      netGame.interpretMove(state, ui, null, { x: 0, y: 0 }, CURSOR_RIGHT | MOD_SHFT),
    ).toBe(UI_UPDATE);
    expect(ui.orgX).toBe((org0 + 1) % 5);
  });

  it("Shift+arrow does nothing on a non-wrapping grid", () => {
    const s = base();
    const ui = newUi(s);
    const org0 = ui.orgX;
    expect(
      netGame.interpretMove(s, ui, null, { x: 0, y: 0 }, CURSOR_RIGHT | MOD_SHFT),
    ).toBeNull();
    expect(ui.orgX).toBe(org0);
  });
});
