/**
 * Spokes — native TS port of `puzzles/unreleased/spokes.c` (© 2014 Lennard
 * Sprong). Draw horizontal, vertical and diagonal lines between numbered hubs
 * so that every hub carries exactly its number of lines, no two diagonals
 * cross, and all the hubs end up in one connected group.
 *
 * Controls: drag from a hub towards a neighbour to toggle the line between
 * them; drag with the right button to toggle a "ruled out" mark. The keyboard
 * cursor lives on a half-grid — arrow keys step between a hub and each of its
 * eight spoke positions, Enter draws a line and Space places a mark.
 *
 * Fork addition: `findMistakes` re-solves from the clues and flags every line
 * the unique solution forbids (and every mark it needs a line at), so Check &
 * Save refuses to checkpoint a board that has already gone wrong. That is
 * distinct from the live error colouring the game has always had — a red rim
 * on a group that can no longer reach the rest, a red clue on an over-filled
 * hub — which is immediate local validation, not a comparison against the
 * answer.
 */

import type { ConfigValues, GameStatus, Point, Size } from "../../../puzzle/types.ts";
import { winFlash } from "../../engine/flash.ts";
import {
  type Game,
  type PresetMenu,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { fromCoord } from "../../engine/geometry.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { RandomState } from "../../random/index.ts";
import { newSpokesDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type SpokesDrawState,
  setTileSize,
  toCoord,
} from "./render.ts";
import { spokesSolve, spokesValidate } from "./solver.ts";
import {
  clearBoard,
  cloneBoard,
  cloneState,
  DIFF_NAMES,
  DIFFCOUNT,
  DIR_BOTLEFT,
  DIR_BOTRIGHT,
  decodeParams,
  defaultParams,
  diffFromLevel,
  diffName,
  diffToLevel,
  encodeParams,
  getSpoke,
  newState,
  newUi,
  PRESETS,
  SPOKE_DIRS,
  SPOKE_EMPTY,
  SPOKE_HIDDEN,
  SPOKE_LINE,
  SPOKE_MARKED,
  type SpokesDrag,
  type SpokesMistake,
  type SpokesMove,
  type SpokesParams,
  type SpokesState,
  type SpokesUi,
  spokesPlace,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

// --- presets ----------------------------------------------------------------

function presets(): PresetMenu<SpokesParams> {
  return {
    title: "Spokes",
    submenu: PRESETS.map((p) => ({
      title: `${p.w}x${p.h} ${diffName(p.diff)}`,
      params: { ...p },
    })),
  };
}

// --- input ------------------------------------------------------------------

/** The eight-way direction a drag from a hub's centre points in: the pointer
 * angle snapped to the nearest 45°, in `DIR_*` order. */
function dragDirection(dx: number, dy: number): number {
  const angle = (Math.atan2(dy, dx) + Math.PI / 8) / (Math.PI / 4);
  return Math.trunc(angle + 16) & 7;
}

function interpretMove(
  state: SpokesState,
  ui: SpokesUi,
  ds: SpokesDrawState | null,
  p: Point,
  rawButton: number,
): SpokesMove | null | UiUpdate {
  const { w, h } = state;
  const ts = ds?.tilesize || PREFERRED_TILE_SIZE;
  const button = stripModifiers(rawButton);

  let from = -1;
  let to = -1;
  let drag: SpokesDrag = "none";

  if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
    const x = fromCoord(p.x, ts, 0);
    const y = fromCoord(p.y, ts, 0);
    if (x < 0 || x >= w || y < 0 || y >= h) return null;
    ui.dragStart = y * w + x;
    ui.drag = button === LEFT_BUTTON ? "left" : "right";
    ui.cshow = false;
  }

  if (
    button === LEFT_BUTTON ||
    button === RIGHT_BUTTON ||
    button === LEFT_DRAG ||
    button === RIGHT_DRAG
  ) {
    if (ui.dragStart === -1) return null;

    const sx = ui.dragStart % w;
    const sy = (ui.dragStart / w) | 0;
    const dx = p.x - toCoord(sx, ts);
    const dy = p.y - toCoord(sy, ts);
    const dir = dragDirection(dx, dy);
    const nx = sx + SPOKE_DIRS[dir].dx;
    const ny = sy + SPOKE_DIRS[dir].dy;

    // A drag that hasn't left the hub yet points nowhere in particular.
    const deadZone = dx * dx + dy * dy < (ts * ts) / 22;
    ui.dragEnd = nx < 0 || nx >= w || ny < 0 || ny >= h || deadZone ? -1 : ny * w + nx;
    return UI_UPDATE;
  }

  if (button === LEFT_RELEASE || button === RIGHT_RELEASE) {
    from = ui.dragStart;
    to = ui.dragEnd;
    drag = ui.drag;
    ui.dragStart = -1;
    ui.dragEnd = -1;
    ui.drag = "none";
  }

  if (ui.cshow && (button === CURSOR_SELECT || button === CURSOR_SELECT2)) {
    // The half-grid puts a hub on every third sub-cell and its eight spoke
    // pickers on the ones between, so the cursor already names both ends.
    const cx = ((ui.cx + 1) / 3) | 0;
    const cy = ((ui.cy + 1) / 3) | 0;
    from = cy * w + cx;
    to = from + ((((ui.cy + 1) % 3) - 1) * w + (((ui.cx + 1) % 3) - 1));
    drag = button === CURSOR_SELECT ? "left" : "right";
  }

  if (drag !== "none") {
    if (from === -1 || to === -1) return UI_UPDATE;

    const start = Math.min(from, to);
    const end = Math.max(from, to);
    const sx = start % w;
    const sy = (start / w) | 0;

    for (let dir = 0; dir < 4; dir++) {
      if ((sy + SPOKE_DIRS[dir].dy) * w + sx + SPOKE_DIRS[dir].dx !== end) continue;

      const old = getSpoke(state.spokes[start], dir);
      // Also the bounds guard for the crossing checks below: an edge-column
      // hub has no diagonal there, so `start ± 1` is never read off-grid.
      if (old === SPOKE_HIDDEN) continue;

      const next =
        drag === "left"
          ? old === SPOKE_EMPTY
            ? SPOKE_LINE
            : SPOKE_EMPTY
          : old === SPOKE_EMPTY
            ? SPOKE_MARKED
            : SPOKE_EMPTY;

      // Diagonals may not cross.
      if (
        next === SPOKE_LINE &&
        dir === DIR_BOTLEFT &&
        getSpoke(state.spokes[start - 1], DIR_BOTRIGHT) === SPOKE_LINE
      ) {
        continue;
      }
      if (
        next === SPOKE_LINE &&
        dir === DIR_BOTRIGHT &&
        getSpoke(state.spokes[start + 1], DIR_BOTLEFT) === SPOKE_LINE
      ) {
        continue;
      }

      return { kind: "set", index: start, dir, state: next };
    }

    // Nothing to toggle (the two hubs aren't adjacent, or the spoke can't
    // exist): a local no-op, so no history entry.
    return UI_UPDATE;
  }

  if (isCursorMove(button)) {
    const moved = gridCursorMove(button, ui.cx, ui.cy, w * 3 - 2, h * 3 - 2);
    if (moved) {
      ui.cx = moved.x;
      ui.cy = moved.y;
    }
    if (!ui.cshow) {
      ui.cshow = true;
      return UI_UPDATE;
    }
    return moved ? UI_UPDATE : null;
  }

  return null;
}

// --- moves ------------------------------------------------------------------

function executeMove(state: SpokesState, move: SpokesMove): SpokesState {
  const next = cloneState(state);

  if (move.kind === "solve") {
    clearBoard(next);
    for (const { index, dir, state: s } of move.spokes) {
      if (getSpoke(next.spokes[index], dir) !== SPOKE_HIDDEN) {
        spokesPlace(next, index, dir, s);
      }
    }
    if (spokesValidate(next) === "valid") {
      next.completed = true;
      // Only a solver fill that actually completed the grid counts as a cheat
      // (and so suppresses the win flash) — upstream's own rule.
      next.cheated = true;
    }
    return next;
  }

  if (getSpoke(next.spokes[move.index], move.dir) !== SPOKE_HIDDEN) {
    spokesPlace(next, move.index, move.dir, move.state);
  }
  if (spokesValidate(next) === "valid") next.completed = true;
  return next;
}

// --- solving ----------------------------------------------------------------

/** Deduce the unique solution from the clues alone, on a fresh board that
 * keeps this state's spoke topology (which hubs exist, which spokes can) but
 * none of the player's marks. `null` when the board is not uniquely
 * deducible. */
function solveFromClues(state: SpokesState) {
  const board = cloneBoard(state);
  clearBoard(board);
  return spokesSolve(board, null, DIFFCOUNT) === "valid" ? board : null;
}

function solve(orig: SpokesState): SolveResult<SpokesMove> {
  const solved = solveFromClues(orig);
  if (!solved) return { ok: false, error: "No solution exists for this puzzle" };

  const spokes: { index: number; dir: number; state: number }[] = [];
  for (let i = 0; i < solved.w * solved.h; i++) {
    for (let d = 0; d < 4; d++) {
      const s = getSpoke(solved.spokes[i], d);
      if (s === SPOKE_LINE || s === SPOKE_MARKED)
        spokes.push({ index: i, dir: d, state: s });
    }
  }
  return { ok: true, move: { kind: "solve", spokes } };
}

function findMistakes(state: SpokesState): readonly SpokesMistake[] {
  const solved = solveFromClues(state);
  if (!solved) return [];

  const out: SpokesMistake[] = [];
  // `d < 4` visits each edge exactly once, from its lower-indexed end.
  for (let i = 0; i < state.w * state.h; i++) {
    for (let d = 0; d < 4; d++) {
      const player = getSpoke(state.spokes[i], d);
      const answer = getSpoke(solved.spokes[i], d);
      if (player === SPOKE_LINE && answer !== SPOKE_LINE) {
        out.push({ kind: "line", index: i, dir: d });
      } else if (player === SPOKE_MARKED && answer === SPOKE_LINE) {
        out.push({ kind: "mark", index: i, dir: d });
      }
    }
  }
  return out;
}

// --- the game ---------------------------------------------------------------

export const spokesGame: Game<
  SpokesParams,
  SpokesState,
  SpokesMove,
  SpokesUi,
  SpokesDrawState,
  SpokesMistake
> = {
  id: "spokes",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  // Upstream `REQUIRE_RBUTTON`: the right button places the "ruled out" marks,
  // so a touch frontend must surface a secondary-action affordance.
  needsRightButton: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,

  paramConfig: [
    ...dimensionParamConfig<SpokesParams>(),
    {
      kw: "difficulty",
      name: "Difficulty",
      type: "choices",
      choices: [...DIFF_NAMES],
      get: (p) => diffToLevel(p.diff),
      set: (p, v) => {
        p.diff = diffFromLevel(v);
      },
    },
  ],
  describeParams: (p): ConfigValues => ({
    width: String(p.w),
    height: String(p.h),
    difficulty: diffToLevel(p.diff),
  }),

  newDesc: (p: SpokesParams, rng: RandomState) => newSpokesDesc(p, rng),
  validateDesc,
  newState,
  newUi: () => newUi(),
  prefs: [
    {
      // Fork aid: grey a hub once its clue is met (visual only, no lock) —
      // the same cue Bridges offers on a satisfied island. Upstream nominally
      // filled such a hub white, which is invisible against either mode's
      // background; see `COL_SATISFIED`.
      kw: "mark-satisfied",
      name: "Grey out hubs once their spoke count is met",
      type: "boolean",
      get: (ui) => ui.markSatisfied,
      set: (ui, v) => {
        ui.markSatisfied = v;
      },
    },
  ],

  interpretMove,
  executeMove,
  status: (s): GameStatus => (s.completed ? "solved" : "ongoing"),

  solve,
  findMistakes,
  textFormat,

  colours,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: SpokesParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength: (from, to) => winFlash(from, to, FLASH_TIME),
};

registerGame(spokesGame);
