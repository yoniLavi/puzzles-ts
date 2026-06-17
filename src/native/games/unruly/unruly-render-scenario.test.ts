// Tier-2.5 render scenario + snapshot for Unruly: drive a real Midend to a
// fixed generated board and capture redraw. Targeted op assertions (clue
// tiles + grid frame present) plus a snapshot so a render regression is a
// reviewable text diff. `vitest -u` re-baselines an intended change — keep
// the targeted assertions so a careless `-u` can't silently erase them.
import { describe, expect, it } from "vitest";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newDesc } from "./generator.ts";
import { unrulyGame } from "./index.ts";
import { COL_0, COL_1, COL_ERROR, COL_GRID } from "./render.ts";
import { solveToString } from "./solver.ts";
import { type Cell, newState, ONE, type UnrulyMove, ZERO } from "./state.ts";

describe("Unruly render scenarios", () => {
  it("matches the opener-frame snapshot of a fixed generated board", () => {
    // A fixed descriptive board → a stable frame.
    const P = { w2: 6, h2: 6, unique: false, diff: 0 };
    const desc = newDesc(P, randomNew("unruly-render-opener")).desc;
    const id = `6x6dt:${desc}`;
    const { recording, size } = renderScenario({ game: unrulyGame, id });

    const ts = unrulyGame.preferredTileSize ?? 32;
    const fullBody = (colour: number) =>
      recording.ops.some(
        (o) =>
          o.op === "rect" && o.colour === colour && o.w === ts - 1 && o.h === ts - 1,
      );

    // The board has clues of both colours (black ones, white zeros).
    expect(fullBody(COL_1)).toBe(true);
    expect(fullBody(COL_0)).toBe(true);
    // The outer grid frame is drawn.
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_GRID)).toBe(
      true,
    );
    // The board fills its declared size.
    expect(size.w).toBe(6 * ts + 2 * Math.floor(ts / 2));

    expect(recording.ops).toMatchSnapshot();
  });

  it("Check & Save path: midend.findMistakes flags a wrong mark and the overlay renders", () => {
    // The exact wiring Check & Save uses: a real Midend computes findMistakes
    // and passes the overlay to redraw. Place the *opposite* of the unique
    // solution at one non-immutable cell → guaranteed mistake.
    const P = { w2: 8, h2: 8, unique: false, diff: 1 };
    const desc = newDesc(P, randomNew("unruly-mistake-scenario")).desc;
    const state = newState(P, desc);
    const sol = solveToString(state);
    if (!sol) throw new Error("expected solvable board");

    let idx = -1;
    for (let i = 0; i < P.w2 * P.h2; i++) {
      if (!state.immutable[i]) {
        idx = i;
        break;
      }
    }
    const wrong: Cell = sol[idx] === "1" ? ZERO : ONE;
    const move: UnrulyMove = {
      type: "place",
      x: idx % P.w2,
      y: Math.floor(idx / P.w2),
      value: wrong,
    };

    const { recording, mistakeCount } = renderScenario({
      game: unrulyGame,
      id: `8x8de:${desc}`,
      moves: [move],
      showMistakes: true,
    });

    expect(mistakeCount).toBeGreaterThanOrEqual(1);
    // The mistake overlay paints inset error-coloured strips on the wrong cell.
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_ERROR)).toBe(
      true,
    );
  });
});
