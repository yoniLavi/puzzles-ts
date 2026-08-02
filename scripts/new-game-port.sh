#!/bin/bash
# Scaffold a new native-TS game port: stamp out the mechanical skeleton
# (the index/state/solver/generator/render file shape from
# docs/porting/game-port-playbook.md) so a port starts from a compiling
# stub instead of a blank directory.
#
# Usage:
#   scripts/new-game-port.sh <gameId>
#
# It creates src/games/<gameId>/ with typed Game<…> source stubs, an
# empty __fixtures__/, a starter <gameId>.test.ts (a save round-trip + a
# renderScenario render smoke, both `it.skip` so a fresh scaffold stays green),
# and a commented <gameId>-differential.test.ts stub. It then PRINTS (does not
# perform) the manual-edit checklist that needs judgement — the two
# registration edits and the icon PNGs. (It used to name a C trace harness too;
# there is no C to trace since `retire-c-engine`, and a new port's differential,
# if it has one, is founded on its own behaviour.) Read the Galaxies port as the
# exemplar.

set -euo pipefail

GAME="${1:-}"
if [ -z "${GAME}" ]; then
  echo "usage: scripts/new-game-port.sh <gameId>" >&2
  exit 2
fi
if ! printf '%s' "${GAME}" | grep -Eq '^[a-z][a-z0-9]*$'; then
  echo "gameId must be lowercase letters/digits (e.g. 'singles'); got '${GAME}'" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIR="${REPO_ROOT}/src/games/${GAME}"

if [ -e "${DIR}" ]; then
  echo "refusing to overwrite existing ${DIR}" >&2
  exit 1
fi

# PascalCase prefix for the game's types (e.g. singles -> Singles).
P="$(printf '%s' "${GAME}" | awk '{ print toupper(substr($0,1,1)) substr($0,2) }')"

mkdir -p "${DIR}/__fixtures__"
: > "${DIR}/__fixtures__/.gitkeep"

cat > "${DIR}/state.ts" <<EOF
/** Types and pure state helpers for ${GAME}. */

export interface ${P}Params {
  w: number;
  h: number;
  // TODO: add the rest of this game's parameters.
}

export interface ${P}State {
  params: ${P}Params;
  // TODO: the immutable board state (typed arrays preferred — clone cheap).
}

/** TODO: replace with a discriminated union of this game's moves. */
export type ${P}Move = { type: "todo" };

/** TODO: cursor / drag state (persisted UI, not history). */
export type ${P}Ui = Record<string, never>;

export interface ${P}DrawState {
  started: boolean;
  tileSize: number;
  // TODO: per-tile cache (Int32Array packed-bits — NOT BigInt64Array).
}

/** TODO: highlight data returned by findMistakes (if the game has one). */
export type ${P}Mistake = never;

export function clone${P}State(s: ${P}State): ${P}State {
  // TODO: deep-clone mutable fields; share immutable ones by reference.
  return { ...s };
}
EOF

cat > "${DIR}/solver.ts" <<EOF
import type { ${P}State } from "./state.ts";

/** TODO: implement this game's deductions. */
export function solve${P}(_s: ${P}State): never {
  throw new Error("${GAME} solver: not implemented");
}
EOF

cat > "${DIR}/generator.ts" <<EOF
import type { RandomState } from "../../random/index.ts";
import type { ${P}Params } from "./state.ts";

/** TODO: port the upstream generator (uniqueness/difficulty loop). */
export function new${P}Desc(_p: ${P}Params, _rng: RandomState): { desc: string } {
  throw new Error("${GAME} generator: not implemented");
}
EOF

cat > "${DIR}/render.ts" <<EOF
import type { GameDrawing } from "../../engine/game.ts";
import type { ${P}DrawState, ${P}State } from "./state.ts";

/** TODO: imperative redraw with a per-tile cache + first-draw bg fill. */
export function redraw${P}(
  _dr: GameDrawing,
  _ds: ${P}DrawState | null,
  _prev: ${P}State | null,
  _s: ${P}State,
): void {
  throw new Error("${GAME} render: not implemented");
}
EOF

cat > "${DIR}/index.ts" <<EOF
/**
 * ${GAME} — native TS port. Implements the engine Game interface.
 * Read docs/porting/game-port-playbook.md and the Galaxies port first.
 */

import type { Colour, GameStatus, Size } from "../../../puzzle/types.ts";
import type { Game } from "../../engine/game.ts";
import { mkhighlight } from "../../engine/colour/colour-mkhighlight.ts";
import { parseDimensions } from "../../engine/params.ts";
import { registerGame } from "../../engine/registry.ts";
import type { RandomState } from "../../random/index.ts";
import { new${P}Desc } from "./generator.ts";
import { redraw${P} } from "./render.ts";
import type {
  ${P}DrawState,
  ${P}Mistake,
  ${P}Move,
  ${P}Params,
  ${P}State,
  ${P}Ui,
} from "./state.ts";

export const ${GAME}Game: Game<
  ${P}Params,
  ${P}State,
  ${P}Move,
  ${P}Ui,
  ${P}DrawState,
  ${P}Mistake
> = {
  id: "${GAME}",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: false,
  canFormatAsText: false,

  defaultParams(): ${P}Params {
    return { w: 5, h: 5 };
  },
  presets() {
    return { title: "${P}", submenu: [{ title: "5x5", params: { w: 5, h: 5 } }] };
  },
  encodeParams(p: ${P}Params, _full: boolean): string {
    return \`\${p.w}x\${p.h}\`;
  },
  decodeParams(s: string): ${P}Params {
    const { w, h } = parseDimensions(s);
    return { w, h };
  },
  validateParams(_p: ${P}Params, _full: boolean): string | null {
    return null; // TODO: bounds checks.
  },

  newDesc(p: ${P}Params, rng: RandomState): { desc: string } {
    return new${P}Desc(p, rng);
  },
  validateDesc(_p: ${P}Params, _desc: string): string | null {
    return null; // TODO.
  },
  newState(_p: ${P}Params, _desc: string): ${P}State {
    throw new Error("${GAME} newState: not implemented");
  },
  newUi(_state: ${P}State): ${P}Ui {
    return {};
  },

  interpretMove(): ${P}Move | null {
    return null; // TODO.
  },
  executeMove(_s: ${P}State, _m: ${P}Move): ${P}State {
    throw new Error("${GAME} executeMove: not implemented");
  },

  status(_s: ${P}State): GameStatus {
    return "ongoing"; // TODO: return "solved" when the board is complete.
  },

  colours(defaultBackground: Colour): Colour[] {
    const { background } = mkhighlight(defaultBackground);
    return [background];
  },
  computeSize(p: ${P}Params, tileSize: number): Size {
    return { w: p.w * tileSize, h: p.h * tileSize };
  },
  redraw(dr, ds, prev, s): void {
    redraw${P}(dr, ds, prev, s);
  },
};

registerGame(${GAME}Game);
EOF

# Starter tier-1/2.5 test: a save round-trip + a renderScenario render smoke.
# Both are `it.skip` so a fresh scaffold type-checks, lints, and stays green
# against the throwing stubs — drop `.skip` and set a real id as you port.
cat > "${DIR}/${GAME}.test.ts" <<EOF
/**
 * Starter tests for the ${GAME} port — scaffolded by scripts/new-game-port.sh.
 *
 * SKELETONS: the \`it.skip(...)\` blocks below type-check and lint clean against
 * the (throwing) stubs, so the gate stays green on a fresh scaffold. As you
 * fill in the port, drop \`.skip\`, set a real game id, and flesh out the
 * assertions. Read the galaxies/flip tests as exemplars; the test tiers are in
 * docs/porting/game-port-playbook.md §4.
 */
import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/index.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { ${GAME}Game } from "./index.ts";

// TODO: a real game id — "<params>:<desc>" (descriptive) or "<params>#<seed>"
// (random, reproducible via the bit-identical RNG). Replace once newDesc /
// newState are implemented; until then the skipped tests don't evaluate it.
const SCAFFOLD_ID = "5x5#scaffold-seed";

describe("${GAME} save round-trip", () => {
  it.skip("saveGame -> loadGame restores an equivalent game", () => {
    const me = new Midend(${GAME}Game);
    expect(me.newGameFromId(SCAFFOLD_ID)).toBeUndefined();
    // TODO: play a move or two so the save carries real progress.
    const saved = me.saveGame();
    const me2 = new Midend(${GAME}Game);
    expect(me2.loadGame(saved)).toBeUndefined();
    // TODO: assert me2 matches me (formatAsText / status / a render compare).
  });
});

describe("${GAME} render smoke", () => {
  it.skip("redraws the initial frame without throwing", () => {
    const { recording } = renderScenario({ game: ${GAME}Game, id: SCAFFOLD_ID });
    // TODO: assert the ops that matter (a tile rect, the grid lines, …) and add
    // \`expect(recording.ops).toMatchSnapshot()\` once the frame is stable
    // (tier 2.5 — see the playbook).
    expect(recording.ops.length).toBeGreaterThan(0);
  });
});
EOF

# Differential stub: a fresh scaffold has no C fixture yet, so the actual
# differential (the describeDescDifferential wiring) stays COMMENTED — only a
# single `it.todo` marker is live, which keeps vitest happy (a fully-commented
# *.test.ts fails collection) and the file type-checks before any fixture
# exists. Uncomment the body once __fixtures__/${GAME}-c-reference.json exists.
# NOTE: since `retire-c-engine` there is no C build, so a NEW game has no
# upstream oracle to differ against — the frozen fixtures under
# src/games/*/__fixtures__/ belong to games ported while the C existed.
# A greenfield game's assurance is behavioural: "every generated board is
# uniquely solvable at exactly its stated difficulty" as a property test. This
# scaffold therefore emits that, not a differential stub.
cat > "${DIR}/${GAME}-generation.test.ts" <<EOF
/**
 * Generation invariants for ${GAME} — SCAFFOLD STUB.
 *
 * Ports made while the C engine existed could lean on a byte-match
 * differential: because the generator is solver-gated, one desc comparison
 * validated generator, solver and codec at once. `retire-c-engine` removed
 * that build, so a new game states the property directly instead.
 *
 * Fill this in with the strongest claim the game can actually support — for a
 * logic puzzle that is normally: for each difficulty tier, a sample of
 * generated boards is (a) solvable by the solver at that tier, and (b) NOT
 * solvable at the tier below, so the tier means something.
 */
import { describe, it } from "vitest";

describe("${GAME} generation", () => {
  it.todo("every generated board is uniquely solvable at exactly its tier");
});
EOF

echo "Scaffolded ${DIR}:"
echo "  state.ts solver.ts generator.ts render.ts index.ts"
echo "  ${GAME}.test.ts ${GAME}-generation.test.ts (stub) __fixtures__/"
echo ""
echo "Now do the parts that need judgement (the script will not):"
echo "  1. Fill the stubs. (There is no C reference to read: retire-c-engine"
echo "     deleted the engine. If upstream ever had one, it is in git history.)"
echo "  2. Register the game (do these two together — the gate checks they agree):"
echo "       - add 'import \"./${GAME}/index.ts\";' to src/games/index.ts"
echo "       - add its catalog entry to src/puzzle/catalog-data.ts"
echo "  3. Fill in ${GAME}-generation.test.ts: say what replaces the byte-match"
echo "     oracle for this game, and assert it."
echo "  4. Add the two icon PNGs (src/assets/icons/${GAME}-{64,128}d8.png) via the"
echo "     ?screenshot capture mode — see openspec/specs/puzzle-icons/spec.md."
echo "  5. Open an openspec change for the port (openspec proposal)."
