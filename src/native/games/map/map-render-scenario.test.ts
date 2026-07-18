/**
 * Tier-2.5 render scenarios for Map: drive a real Midend to a target frame and
 * capture `redraw`. Targeted op assertions (region fills, grid lines, the red
 * adjacency error polygon) plus a snapshot so a render regression is a
 * reviewable text diff (`vitest -u` re-baselines; the targeted assertions
 * survive a careless `-u`).
 */

import { describe, expect, it } from "vitest";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newMapDesc } from "./generator.ts";
import { mapGame } from "./index.ts";
import { COL_0, COL_3, COL_ERROR, COL_GRID } from "./render.ts";
import type { MapMove, MapParams, MapState } from "./state.ts";

const P: MapParams = { w: 12, h: 10, n: 12, diff: 1 };
const SEED = "map-scenario";
const ID = `${mapGame.encodeParams(P, true)}#${SEED}`;

describe("map render scenarios", () => {
  it("opener frame: region fills + grid lines drawn", () => {
    const { recording } = renderScenario({ game: mapGame, id: ID });

    // Clue regions are painted with a map colour (COL_0..COL_3).
    expect(
      recording.ops.some(
        (o) => o.op === "rect" && o.colour >= COL_0 && o.colour <= COL_3,
      ),
    ).toBe(true);
    // Region boundaries draw grid lines.
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_GRID)).toBe(
      true,
    );

    expect(recording.ops).toMatchSnapshot();
  });

  it("error frame: two same-coloured adjacent regions draw a red diamond", () => {
    // Colour a blank region the same as an adjacent clue → adjacency error.
    const { desc } = newMapDesc(P, randomNew(SEED));
    const st = mapGame.newState(P, desc) as MapState;
    const { graph, ngraph, immutable } = st.map;

    let move: MapMove | null = null;
    for (let i = 0; i < ngraph && !move; i++) {
      const a = Math.floor(graph[i] / P.n);
      const b = graph[i] % P.n;
      const clue = immutable[a] ? a : immutable[b] ? b : -1;
      const blank = immutable[a] ? b : a;
      if (clue >= 0 && !immutable[blank])
        move = { ops: [{ op: "colour", region: blank, colour: st.colouring[clue] }] };
    }
    if (!move) throw new Error("no clue/blank adjacency");

    const { recording } = renderScenario({ game: mapGame, id: ID, moves: [move] });
    expect(recording.ops.some((o) => o.op === "polygon" && o.fill === COL_ERROR)).toBe(
      true,
    );
  });
});
