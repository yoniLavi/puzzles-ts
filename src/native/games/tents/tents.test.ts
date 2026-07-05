/**
 * Tier-1 behavioural + tier-2 render tests for the tents port.
 * Byte-match generation/solver agreement lives in tents-differential.test.ts;
 * a render-scenario snapshot in tents-render-scenario.test.ts.
 */
import { describe, expect, it } from "vitest";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { randomNew } from "../../random/index.ts";
import { newTentsDesc } from "./generator.ts";
import { tentsGame } from "./index.ts";
import { COL_MISTAKE, computeSize, newDrawState, redraw } from "./render.ts";
import { tentsSolve } from "./solver.ts";
import {
  BLANK,
  checkCompletion,
  decodeDesc,
  DIFF_EASY,
  DIFF_TRICKY,
  encodeDesc,
  encodeParams,
  executeMove,
  newState,
  NONTENT,
  TENT,
  type TentsParams,
  type TentsState,
  TREE,
  validateDesc,
  validateParams,
} from "./state.ts";

function genBoard(
  p: TentsParams,
  seed: string,
): { state: TentsState; soln: Int8Array; aux: string } {
  const { desc, aux } = newTentsDesc(p, randomNew(seed));
  const state = newState(p, desc);
  const puzzle = Int8Array.from(state.grid, (v) => (v === TREE ? TREE : 0));
  const { soln } = tentsSolve(p.w, p.h, puzzle, state.numbers, DIFF_TRICKY);
  return { state, soln, aux };
}

describe("tents params", () => {
  it("round-trips through encode/decode", () => {
    for (const p of [
      { w: 8, h: 8, diff: DIFF_EASY },
      { w: 15, h: 15, diff: DIFF_TRICKY },
      { w: 6, h: 9, diff: DIFF_TRICKY },
    ]) {
      expect(tentsGame.decodeParams(encodeParams(p, true))).toEqual(p);
    }
    expect(tentsGame.decodeParams("10")).toEqual({ w: 10, h: 10, diff: DIFF_EASY });
  });

  it("rejects too-small grids and unknown difficulty", () => {
    expect(validateParams({ w: 3, h: 8, diff: DIFF_EASY }, true)).not.toBeNull();
    expect(validateParams({ w: 8, h: 3, diff: DIFF_EASY }, true)).not.toBeNull();
    expect(validateParams({ w: 8, h: 8, diff: 5 }, true)).not.toBeNull();
    expect(validateParams({ w: 8, h: 8, diff: DIFF_EASY }, true)).toBeNull();
  });
});

describe("tents desc codec", () => {
  it("round-trips a generated desc", () => {
    const p = { w: 8, h: 8, diff: DIFF_EASY };
    const { desc } = newTentsDesc(p, randomNew("codec-0"));
    expect(validateDesc(p, desc)).toBeNull();
    const { grid, numbers } = decodeDesc(p, desc);
    expect(encodeDesc(p.w, p.h, grid, numbers)).toBe(desc);
  });

  it("rejects malformed descs", () => {
    const p = { w: 4, h: 4, diff: DIFF_EASY };
    expect(validateDesc(p, "Q,0,0,0,0,0,0,0,0")).not.toBeNull(); // bad char
    expect(validateDesc(p, "_,0,0,0,0,0,0,0,0")).not.toBeNull(); // too little grid data
    expect(validateDesc(p, "zzza")).not.toBeNull(); // missing numbers
  });
});

describe("tents generator", () => {
  it(
    "produces uniquely-solvable boards at exactly their difficulty",
    () => {
      for (const [p, seed] of [
        [{ w: 8, h: 8, diff: DIFF_EASY }, "gen-e"],
        [{ w: 8, h: 8, diff: DIFF_TRICKY }, "gen-t"],
        [{ w: 10, h: 10, diff: DIFF_TRICKY }, "gen-t2"],
      ] as const) {
        const { state } = genBoard(p, seed);
        const puzzle = Int8Array.from(state.grid, (v) => (v === TREE ? TREE : 0));
        expect(tentsSolve(p.w, p.h, puzzle, state.numbers, p.diff).ret).toBe(1);
        expect(tentsSolve(p.w, p.h, puzzle, state.numbers, p.diff - 1).ret).toBe(2);
      }
    },
    30_000,
  );

  it("the solution satisfies every completion constraint", () => {
    const p = { w: 10, h: 10, diff: DIFF_EASY };
    const { state, soln } = genBoard(p, "gen-valid");
    const full = Int8Array.from(state.grid);
    for (let i = 0; i < p.w * p.h; i++) {
      if (full[i] !== TREE) full[i] = soln[i] === TENT ? TENT : NONTENT;
    }
    expect(checkCompletion(p.w, p.h, full, state.numbers)).toBe(true);
  });
});

describe("tents completion (executeMove)", () => {
  it("marks the board complete when the solution is applied", () => {
    const p = { w: 8, h: 8, diff: DIFF_EASY };
    const { state, soln } = genBoard(p, "complete-0");
    const tents: number[] = [];
    for (let i = 0; i < p.w * p.h; i++) if (soln[i] === TENT) tents.push(i);
    const done = executeMove(state, { type: "solve", tents });
    expect(done.completed).toBe(true);
    expect(done.usedSolve).toBe(true);
  });

  it("an all-non-tent board is not complete", () => {
    const p = { w: 8, h: 8, diff: DIFF_EASY };
    const { state } = genBoard(p, "complete-1");
    const cleared = executeMove(state, {
      type: "cells",
      cells: [...Array(p.w * p.h).keys()]
        .filter((i) => state.grid[i] !== TREE)
        .map((i) => ({ x: i % p.w, y: Math.floor(i / p.w), v: NONTENT })),
    });
    expect(cleared.completed).toBe(false);
  });
});

describe("tents solve()", () => {
  it("recovers the solution (aux path) and matches the re-solve", () => {
    const p = { w: 8, h: 8, diff: DIFF_EASY };
    const { state, soln, aux } = genBoard(p, "solve-0");
    const res = tentsGame.solve?.(state, state, aux);
    expect(res?.ok).toBe(true);
    if (res?.ok) {
      expect(executeMove(state, res.move).completed).toBe(true);
      if (res.move.type === "solve") {
        const set = new Set(res.move.tents);
        for (let i = 0; i < p.w * p.h; i++) expect(set.has(i)).toBe(soln[i] === TENT);
      }
    }
  });

  it("recovers without aux (re-solve path)", () => {
    const p = { w: 8, h: 8, diff: DIFF_TRICKY };
    const { state } = genBoard(p, "solve-1");
    const res = tentsGame.solve?.(state, state);
    expect(res?.ok).toBe(true);
    if (res?.ok) expect(executeMove(state, res.move).completed).toBe(true);
  });
});

describe("tents findMistakes", () => {
  it("flags a wrong tent and a wrong non-tent, not blanks", () => {
    const p = { w: 8, h: 8, diff: DIFF_EASY };
    const { state, soln } = genBoard(p, "mistake-0");
    let notTentIdx = -1;
    let tentIdx = -1;
    for (let i = 0; i < p.w * p.h; i++) {
      if (state.grid[i] === TREE) continue;
      if (soln[i] !== TENT && notTentIdx < 0) notTentIdx = i;
      if (soln[i] === TENT && tentIdx < 0) tentIdx = i;
    }
    const dirty = executeMove(state, {
      type: "cells",
      cells: [
        { x: notTentIdx % p.w, y: Math.floor(notTentIdx / p.w), v: TENT },
        { x: tentIdx % p.w, y: Math.floor(tentIdx / p.w), v: NONTENT },
      ],
    });
    const mistakes = tentsGame.findMistakes?.(dirty) ?? [];
    const keys = new Set(mistakes.map((m) => m.y * p.w + m.x));
    expect(keys.has(notTentIdx)).toBe(true);
    expect(keys.has(tentIdx)).toBe(true);
    expect(mistakes.length).toBe(2);
  });

  it("reports no mistakes for a partially-correct board", () => {
    const p = { w: 8, h: 8, diff: DIFF_EASY };
    const { state, soln } = genBoard(p, "mistake-1");
    const cells: { x: number; y: number; v: number }[] = [];
    let placed = 0;
    for (let i = 0; i < p.w * p.h && placed < 3; i++) {
      if (soln[i] === TENT && state.grid[i] !== TREE) {
        cells.push({ x: i % p.w, y: Math.floor(i / p.w), v: TENT });
        placed++;
      }
    }
    const partial = executeMove(state, { type: "cells", cells });
    expect(tentsGame.findMistakes?.(partial) ?? []).toEqual([]);
  });
});

describe("tents input (drag model)", () => {
  it("left click places a tent then clears it; right click a non-tent", () => {
    const p = { w: 8, h: 8, diff: DIFF_EASY };
    const { state } = genBoard(p, "input-0");
    const ui = tentsGame.newUi(state);
    const ds = newDrawState(state);
    tentsGame.setTileSize?.(ds, 32);
    const blank = [...Array(p.w * p.h).keys()].find((i) => state.grid[i] === BLANK);
    expect(blank).toBeDefined();
    const bx = (blank as number) % p.w;
    const by = Math.floor((blank as number) / p.w);
    const px = { x: bx * 32 + 17, y: by * 32 + 17 };

    const LEFT_BUTTON = 0x0200;
    const LEFT_RELEASE = 0x0206;
    const RIGHT_BUTTON = 0x0202;
    const RIGHT_RELEASE = 0x0208;

    tentsGame.interpretMove(state, ui, ds, px, LEFT_BUTTON);
    const m1 = tentsGame.interpretMove(state, ui, ds, px, LEFT_RELEASE);
    expect(m1).toMatchObject({ type: "cells", cells: [{ x: bx, y: by, v: TENT }] });
    const s1 = executeMove(state, m1 as never);

    tentsGame.interpretMove(s1, ui, ds, px, LEFT_BUTTON);
    const m2 = tentsGame.interpretMove(s1, ui, ds, px, LEFT_RELEASE);
    expect(m2).toMatchObject({ type: "cells", cells: [{ x: bx, y: by, v: BLANK }] });

    tentsGame.interpretMove(state, ui, ds, px, RIGHT_BUTTON);
    const m3 = tentsGame.interpretMove(state, ui, ds, px, RIGHT_RELEASE);
    expect(m3).toMatchObject({ type: "cells", cells: [{ x: bx, y: by, v: NONTENT }] });
  });
});

describe("tents render (tier 2)", () => {
  it("draws the mistake overlay even when the tile was already drawn", () => {
    const p = { w: 8, h: 8, diff: DIFF_EASY };
    const { state, soln } = genBoard(p, "render-0");
    let idx = -1;
    for (let i = 0; i < p.w * p.h; i++) {
      if (state.grid[i] !== TREE && soln[i] !== TENT) {
        idx = i;
        break;
      }
    }
    const wrong = executeMove(state, {
      type: "cells",
      cells: [{ x: idx % p.w, y: Math.floor(idx / p.w), v: TENT }],
    });
    const mistakes = tentsGame.findMistakes?.(wrong) ?? [];
    expect(mistakes.length).toBe(1);

    const rec = new RecordingDrawing(tentsGame.colours([0.9, 0.9, 0.9]));
    const ds = newDrawState(wrong);
    tentsGame.setTileSize?.(ds, 32);
    const ui = tentsGame.newUi(wrong);

    // Paint the tent tile without the overlay, then again WITH it (no tile-
    // value change) — the overlay must still appear on the second paint.
    redraw(rec, ds, null, wrong, 1, ui, 0, 0, undefined, undefined);
    rec.ops.length = 0;
    redraw(rec, ds, null, wrong, 1, ui, 0, 0, undefined, mistakes);

    expect(rec.ops.some((o) => o.op === "rect" && o.colour === COL_MISTAKE)).toBe(true);
  });

  it("computeSize matches the NARROW_BORDERS geometry", () => {
    expect(computeSize({ w: 8, h: 8, diff: DIFF_EASY }, 32)).toEqual({
      w: 1 + (32 + 2) + 32 * 8,
      h: 1 + (32 + 2) + 32 * 8,
    });
  });
});
