/**
 * Starter tests for the solo port — scaffolded by scripts/new-game-port.sh.
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
import { soloGame } from "./index.ts";

// TODO: a real game id — "<params>:<desc>" (descriptive) or "<params>#<seed>"
// (random, reproducible via the bit-identical RNG). Replace once newDesc /
// newState are implemented; until then the skipped tests don't evaluate it.
const SCAFFOLD_ID = "5x5#scaffold-seed";

describe("solo save round-trip", () => {
  it.skip("saveGame -> loadGame restores an equivalent game", () => {
    const me = new Midend(soloGame);
    expect(me.newGameFromId(SCAFFOLD_ID)).toBeUndefined();
    // TODO: play a move or two so the save carries real progress.
    const saved = me.saveGame();
    const me2 = new Midend(soloGame);
    expect(me2.loadGame(saved)).toBeUndefined();
    // TODO: assert me2 matches me (formatAsText / status / a render compare).
  });
});

describe("solo render smoke", () => {
  it.skip("redraws the initial frame without throwing", () => {
    const { recording } = renderScenario({ game: soloGame, id: SCAFFOLD_ID });
    // TODO: assert the ops that matter (a tile rect, the grid lines, …) and add
    // `expect(recording.ops).toMatchSnapshot()` once the frame is stable
    // (tier 2.5 — see the playbook).
    expect(recording.ops.length).toBeGreaterThan(0);
  });
});
