/**
 * Starter tests for the bridges port — scaffolded by scripts/new-game-port.sh.
 *
 * SKELETONS: the `it.skip(...)` blocks below type-check and lint clean against
 * the (throwing) stubs, so the gate stays green on a fresh scaffold. As you
 * fill in the port, drop `.skip`, set a real game id, and flesh out the
 * assertions. Read the galaxies/flip tests as exemplars; the test tiers are in
 * docs/porting/game-port-playbook.md §4.
 */
import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/index.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { bridgesGame } from "./index.ts";
import {
  BRIDGES_PRESETS,
  decodeParams,
  encodeGame,
  encodeParams,
  newStateFromDesc,
  validateDesc,
  validateParams,
} from "./state.ts";

describe("bridges params codec", () => {
  it("round-trips every preset in full form", () => {
    for (const p of BRIDGES_PRESETS) {
      expect(decodeParams(encodeParams(p, true))).toEqual(p);
    }
  });

  it("encodes the full form as C does (7x7 hard)", () => {
    expect(encodeParams(BRIDGES_PRESETS[2], true)).toBe("7x7i30e10m2d2");
  });

  it("non-full form carries maxb and the loop flag", () => {
    const p = { ...BRIDGES_PRESETS[0], allowloops: false };
    expect(encodeParams(p, false)).toBe("7x7m2L");
    expect(decodeParams("7x7m2L").allowloops).toBe(false);
  });

  it("rejects a too-small grid", () => {
    expect(validateParams({ ...BRIDGES_PRESETS[0], w: 2, h: 2 }, true)).not.toBeNull();
    expect(validateParams(BRIDGES_PRESETS[0], true)).toBeNull();
  });
});

describe("bridges desc codec", () => {
  // A hand-built 3x3 with islands at the four corners: counts 1,2,2,1 reading
  // row-major, separated by run-length skips ('a' = skip 1).
  const p3 = { ...BRIDGES_PRESETS[0], w: 3, h: 3 };
  const desc = "1a2c2a1"; // (0,0)=1 skip1 (2,0)=2 skip3 (0,2)=2 skip1 (2,2)=1

  it("parses a desc and re-encodes it identically", () => {
    const state = newStateFromDesc(p3, desc);
    expect(state.islands.length).toBe(4);
    expect(encodeGame(state)).toBe(desc);
  });

  it("places island counts at the right cells", () => {
    const state = newStateFromDesc(p3, desc);
    expect(state.islandAt(0, 0)?.count).toBe(1);
    expect(state.islandAt(2, 0)?.count).toBe(2);
    expect(state.islandAt(0, 2)?.count).toBe(2);
    expect(state.islandAt(2, 2)?.count).toBe(1);
    expect(state.islandAt(1, 1)).toBeNull();
  });

  it("finds orthogonal neighbours across empty cells", () => {
    const state = newStateFromDesc(p3, desc);
    // (0,0) sees (2,0) to its right (off 2) and (0,2) below (off 2).
    const is = state.islandAt(0, 0);
    expect(is?.nislands).toBe(2);
  });

  it("validateDesc accepts a good desc and rejects overruns / lone islands", () => {
    expect(validateDesc(p3, desc)).toBeNull();
    expect(validateDesc(p3, "zzz")).not.toBeNull(); // run overruns the grid
    expect(validateDesc(p3, "1i")).not.toBeNull(); // only one island
  });
});

// TODO: a real game id — "<params>:<desc>" (descriptive) or "<params>#<seed>"
// (random, reproducible via the bit-identical RNG). Replace once newDesc /
// newState are implemented; until then the skipped tests don't evaluate it.
const SCAFFOLD_ID = "5x5#scaffold-seed";

describe("bridges save round-trip", () => {
  it.skip("saveGame -> loadGame restores an equivalent game", () => {
    const me = new Midend(bridgesGame);
    expect(me.newGameFromId(SCAFFOLD_ID)).toBeUndefined();
    // TODO: play a move or two so the save carries real progress.
    const saved = me.saveGame();
    const me2 = new Midend(bridgesGame);
    expect(me2.loadGame(saved)).toBeUndefined();
    // TODO: assert me2 matches me (formatAsText / status / a render compare).
  });
});

describe("bridges render smoke", () => {
  it.skip("redraws the initial frame without throwing", () => {
    const { recording } = renderScenario({ game: bridgesGame, id: SCAFFOLD_ID });
    // TODO: assert the ops that matter (a tile rect, the grid lines, …) and add
    // `expect(recording.ops).toMatchSnapshot()` once the frame is stable
    // (tier 2.5 — see the playbook).
    expect(recording.ops.length).toBeGreaterThan(0);
  });
});
