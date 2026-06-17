#!/bin/bash
# Scaffold a new native-TS game port: stamp out the mechanical skeleton
# (the index/state/solver/generator/render file shape from
# docs/porting/game-port-playbook.md) so a port starts from a compiling
# stub instead of a blank directory.
#
# Usage:
#   scripts/new-game-port.sh <gameId>
#
# It creates src/native/games/<gameId>/ with typed Game<…> stubs and an
# empty __fixtures__/, then PRINTS (does not perform) the manual-edit
# checklist that needs judgement — the C trace harness and the two
# registration edits. Read the Galaxies port as the exemplar.

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
DIR="${REPO_ROOT}/src/native/games/${GAME}"

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

/** TODO: port the upstream solver's deductions (read puzzles/${GAME}.c). */
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
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
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

const ${GAME}Game: Game<
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

echo "Scaffolded ${DIR}:"
echo "  state.ts solver.ts generator.ts render.ts index.ts __fixtures__/"
echo ""
echo "Now do the parts that need judgement (the script will not):"
echo "  1. Read puzzles/${GAME}.c as the logic reference; fill the stubs."
echo "  2. Register the port (do these two together — the gate checks they agree):"
echo "       - add 'import \"./${GAME}/index.ts\";' to src/native/games/index.ts"
echo "       - add \"${GAME}\" to TS_PORTED_PUZZLE_IDS in src/native/games/ts-ported-ids.ts"
echo "  3. Write puzzles/auxiliary/${GAME}-trace.c + its cliprogram() line for the"
echo "     differential fixture, if this game earns a differential (solver/codec)."
echo "  4. Add the two icon PNGs (src/assets/icons/${GAME}-{64,128}d8.png) via the"
echo "     ?screenshot capture mode — see openspec/specs/puzzle-icons/spec.md."
echo "  5. Open an openspec change for the port (openspec proposal)."
