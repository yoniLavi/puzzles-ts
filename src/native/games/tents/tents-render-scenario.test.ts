/**
 * Tier-2.5 render scenarios for tents: drive a real Midend to a target frame
 * and capture `redraw`. Targeted op assertions (grid lines, a tree, the edge
 * numbers, the adjacency error diamond, the findMistakes overlay) plus one
 * snapshot so a render regression is a reviewable text diff (`vitest -u`
 * re-baselines an intended change; the targeted assertions survive a careless
 * `-u`).
 */
import { describe, expect, it } from "vitest";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { tentsGame } from "./index.ts";
import { COL_ERROR, COL_GRID, COL_MISTAKE, COL_TREELEAF } from "./render.ts";
import { tentsSolve } from "./solver.ts";
import {
  DIFF_EASY,
  DIFF_TRICKY,
  encodeParams,
  newState,
  TENT,
  type TentsMove,
  type TentsParams,
  TREE,
} from "./state.ts";

function board(p: TentsParams, seed: string) {
  const { desc } = tentsGame.newDesc(p, randomNew(seed));
  const state = newState(p, desc);
  const puzzle = Int8Array.from(state.grid, (v) => (v === TREE ? TREE : 0));
  const { soln } = tentsSolve(p.w, p.h, puzzle, state.numbers, DIFF_TRICKY);
  return { id: `${encodeParams(p, true)}:${desc}`, state, soln };
}

describe("tents render scenarios", () => {
  it("opener frame: grid lines, a tree, edge numbers", () => {
    const p = { w: 8, h: 8, diff: DIFF_EASY };
    const { id } = board(p, "trs-0");
    const { recording, size } = renderScenario({ game: tentsGame, id });

    // Grid lines in COL_GRID.
    expect(recording.ops.some((o) => o.op === "line" && o.colour === COL_GRID)).toBe(
      true,
    );
    // A tree leaf (green circle).
    expect(
      recording.ops.some((o) => o.op === "circle" && o.fill === COL_TREELEAF),
    ).toBe(true);
    // The edge numbers (text).
    expect(recording.ops.some((o) => o.op === "text")).toBe(true);
    expect(size.w).toBeGreaterThan(0);

    expect(recording.ops).toMatchSnapshot();
  });

  it("adjacency error frame: two adjacent tents draw a red error diamond", () => {
    const p = { w: 8, h: 8, diff: DIFF_EASY };
    const { id, state } = board(p, "trs-adj");
    // Find two horizontally-adjacent non-tree cells.
    let ax = -1;
    let ay = -1;
    for (let y = 0; y < p.h && ax < 0; y++) {
      for (let x = 0; x + 1 < p.w; x++) {
        if (state.grid[y * p.w + x] !== TREE && state.grid[y * p.w + x + 1] !== TREE) {
          ax = x;
          ay = y;
          break;
        }
      }
    }
    const moves: TentsMove[] = [
      { type: "cells", cells: [{ x: ax, y: ay, v: TENT }] },
      { type: "cells", cells: [{ x: ax + 1, y: ay, v: TENT }] },
    ];
    const { recording } = renderScenario({ game: tentsGame, id, moves });

    // The adjacency diamond is a polygon filled COL_ERROR.
    expect(recording.ops.some((o) => o.op === "polygon" && o.fill === COL_ERROR)).toBe(
      true,
    );
  });

  it("mistake frame: a wrong tent draws the COL_MISTAKE overlay", () => {
    const p = { w: 8, h: 8, diff: DIFF_EASY };
    const { id, state, soln } = board(p, "trs-mis");
    let idx = -1;
    for (let i = 0; i < p.w * p.h; i++) {
      if (state.grid[i] !== TREE && soln[i] !== TENT) {
        idx = i;
        break;
      }
    }
    const moves: TentsMove[] = [
      { type: "cells", cells: [{ x: idx % p.w, y: Math.floor(idx / p.w), v: TENT }] },
    ];
    const { recording, mistakeCount } = renderScenario({
      game: tentsGame,
      id,
      moves,
      showMistakes: true,
    });
    expect(mistakeCount).toBeGreaterThanOrEqual(1);
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_MISTAKE)).toBe(
      true,
    );
  });
});
