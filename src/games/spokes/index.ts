/**
 * Spokes — native TS port of `puzzles/unreleased/spokes.c` (© 2014 Lennard
 * Sprong). Draw horizontal, vertical and diagonal lines between numbered hubs
 * so that every hub carries exactly its number of lines, no two diagonals
 * cross, and all the hubs end up in one connected group.
 *
 * Controls: drag from a hub towards a neighbor to toggle the line between
 * them; drag with the right button to toggle a "ruled out" mark. The keyboard
 * cursor lives on a half-grid — arrow keys step between a hub and each of its
 * eight spoke positions, Enter draws a line and Space places a mark.
 *
 * Fork addition: `findMistakes` re-solves from the clues and flags every line
 * the unique solution forbids (and every mark it needs a line at), so Check &
 * Save refuses to checkpoint a board that has already gone wrong. That is
 * distinct from the live error coloring the game has always had — a red rim
 * on a group that can no longer reach the rest, a red clue on an over-filled
 * hub — which is immediate local validation, not a comparison against the
 * answer.
 */

import { assertNever } from "../../engine/assert-never.ts";
import type { DifficultyContract } from "../../engine/difficulty.ts";
import { winFlash } from "../../engine/flash.ts";
import {
  type Game,
  type HintResult,
  type HintStep,
  type HintTrackVerdict,
  type PresetMenu,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { fromCoord } from "../../engine/geometry.ts";
import {
  ALREADY_SOLVED,
  FIX_MISTAKES_FIRST,
  NO_DEDUCTION_LEFT,
  PUZZLE_NOT_REASONABLE,
} from "../../engine/hint-refusal.ts";
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
import type { RandomState } from "../../engine/random/index.ts";
import { registerGame } from "../../engine/registry.ts";
import type { ConfigValues, GameStatus, Point, Size } from "../../engine/types.ts";
import { newSpokesDesc } from "./generator.ts";
import {
  colors,
  computeSize,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type SpokesDrawState,
  setTileSize,
  toCoord,
} from "./render.ts";
import {
  deduceSpokesPlan,
  type SpokesFiring,
  spokesSolve,
  spokesValidate,
} from "./solver.ts";
import {
  clearBoard,
  cloneBoard,
  cloneState,
  crossingSpoke,
  DIFF_NAMES,
  DIFFCOUNT,
  DIFFS,
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
  syncDiagonalBlock,
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

/** The eight-way direction a drag from a hub's center points in: the pointer
 * angle snapped to the nearest 45°, in `DIR_*` order. */
function dragDirection(dx: number, dy: number): number {
  const angle = (Math.atan2(dy, dx) + Math.PI / 8) / (Math.PI / 4);
  return Math.trunc(angle + 16) & 7;
}

function interpretMove(
  state: SpokesState,
  ui: SpokesUi,
  ds: SpokesDrawState,
  p: Point,
  rawButton: number,
): SpokesMove | null | UiUpdate {
  const { w, h } = state;
  const ts = ds.tilesize;
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
    ui.cursor.visible = false;
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

  if (ui.cursor.visible && (button === CURSOR_SELECT || button === CURSOR_SELECT2)) {
    // The half-grid puts a hub on every third sub-cell and its eight spoke
    // pickers on the ones between, so the cursor already names both ends.
    const cx = ((ui.cursor.x + 1) / 3) | 0;
    const cy = ((ui.cursor.y + 1) / 3) | 0;
    from = cy * w + cx;
    to = from + ((((ui.cursor.y + 1) % 3) - 1) * w + (((ui.cursor.x + 1) % 3) - 1));
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
      if (old === SPOKE_HIDDEN) continue;

      // A diagonal whose crossing partner is already a line is auto-ruled-out
      // and inert — the game placed that mark, so the player can't toggle it
      // (and can't draw a crossing line). Erasing the *line* clears it.
      const cross = crossingSpoke(state, start, dir);
      if (cross && getSpoke(state.spokes[cross.i], cross.d) === SPOKE_LINE) {
        return UI_UPDATE;
      }

      const next =
        drag === "left"
          ? old === SPOKE_EMPTY
            ? SPOKE_LINE
            : SPOKE_EMPTY
          : old === SPOKE_EMPTY
            ? SPOKE_MARKED
            : SPOKE_EMPTY;

      return { kind: "set", index: start, dir, state: next };
    }

    // Nothing to toggle (the two hubs aren't adjacent, or the spoke can't
    // exist): a local no-op, so no history entry.
    return UI_UPDATE;
  }

  if (isCursorMove(button)) {
    const moved = gridCursorMove(
      button,
      ui.cursor.x,
      ui.cursor.y,
      w * 3 - 2,
      h * 3 - 2,
    );
    if (moved) {
      ui.cursor.x = moved.x;
      ui.cursor.y = moved.y;
    }
    if (!ui.cursor.visible) {
      ui.cursor.visible = true;
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
  if (move.kind !== "set") return assertNever(move, "spokes: executeMove");

  if (getSpoke(next.spokes[move.index], move.dir) !== SPOKE_HIDDEN) {
    const old = getSpoke(next.spokes[move.index], move.dir);
    spokesPlace(next, move.index, move.dir, move.state);
    // Drawing a diagonal line auto-rules-out its crossing; erasing it clears
    // that (the player can see a line blocks the crossing, so the game marks
    // it rather than making them).
    syncDiagonalBlock(next, move.index, move.dir, old, move.state);
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

// --- hint (a second projection of the deductive solver) ---------------------

/**
 * Highlight data for a Spokes hint leg. `spokes` are *all* the spokes the
 * firing forces (only shown where the board still has them EMPTY — a leg
 * already followed has become a real line or mark); a `SPOKE_LINE` spoke is
 * drawn as a `COL_HINT` line ("draw this"), a `SPOKE_MARKED` spoke as a
 * `COL_HINT` dot at its rim ("rule this out"), so the picture never claims a
 * different action than the words. `evidence` are the hubs whose clue or lines
 * are the argument, ringed `COL_HINT_CELL`. Every leg of one firing carries the
 * same object, so the whole deduction stays visible while its legs are followed
 * one at a time (design D2).
 */
export interface SpokesHint {
  spokes: { index: number; dir: number; state: number }[];
  evidence: number[];
}

/**
 * Narrate why a firing is forced — one crisp line for a player who knows the
 * rules, premise then conclusion, in the necessity voice (the hint quality bar).
 * Every claim here is one {@link deduceSpokesPlan} has checked.
 */
function narrate(f: SpokesFiring): string {
  switch (f.kind) {
    case "twoOnes":
      return "Connecting two 1-hubs would strand them from the rest — so rule out this spoke.";
    case "saturation":
      return f.forced.length === 1
        ? "Only one free spoke left for this hub's count — so it must be a line."
        : "Just enough free spokes left for this hub's count — so they must all be lines.";
    case "exhaustion":
      return "This hub already has its lines, so the rest can't — rule them out.";
    case "contradiction": {
      const asLine = f.hypothesis?.state === SPOKE_LINE;
      const consequence =
        f.breakKind === "overfilled"
          ? "over-fill the ringed hub"
          : f.breakKind === "crossing"
            ? "force two diagonals to cross"
            : "strand the ringed hubs";
      return asLine
        ? `Drawing this line would ${consequence} — so rule it out.`
        : `Ruling this out would ${consequence} — so it must be a line.`;
    }
  }
}

/** The short continuation narration for legs 2+ of a multi-spoke firing — still
 * necessity-voiced (the hint quality bar), and reading as "same deduction". */
function continuation(f: SpokesFiring): string {
  return f.kind === "saturation"
    ? "And this one must be a line too."
    : "And rule this one out too.";
}

/** All of a firing's forced spokes, as highlight geometry — the renderer draws
 * each still-empty one in `COL_HINT` (a line for `SPOKE_LINE`, a dot for
 * `SPOKE_MARKED`). */
function firingSpokes(
  f: SpokesFiring,
): { index: number; dir: number; state: number }[] {
  return f.forced.map(({ index, dir, state }) => ({ index, dir, state }));
}

/** Flatten one firing into its journey of legs: leg 0 carries the full
 * narration, the rest continue it (design D2). All legs share the highlight, so
 * the whole deduction stays on screen as its spokes are drawn one by one. */
function stepsOfFiring(f: SpokesFiring): HintStep<SpokesMove, SpokesHint>[] {
  const highlights: SpokesHint = {
    spokes: firingSpokes(f),
    evidence: f.evidenceHubs,
  };
  return f.forced.map((sp, leg) => ({
    move: { kind: "set", index: sp.index, dir: sp.dir, state: sp.state },
    explanation: leg === 0 ? narrate(f) : continuation(f),
    highlights,
    continuesPrevious: leg > 0,
  }));
}

function hint(state: SpokesState): HintResult<SpokesMove, SpokesHint> {
  if (state.completed) return { ok: false, error: ALREADY_SOLVED };

  // A hint off a contradictory board would present a "forced" move that only
  // follows from the player's own error, so refuse and light up the offenders
  // (Check & Save paints the same overlay — design D4).
  if (findMistakes(state).length > 0) {
    return {
      ok: false,
      error: FIX_MISTAKES_FIRST,
    };
  }
  if (!solveFromClues(state)) {
    return { ok: false, error: PUZZLE_NOT_REASONABLE };
  }

  const plan = deduceSpokesPlan(cloneBoard(state));
  if (plan.length === 0) {
    return { ok: false, error: NO_DEDUCTION_LEFT };
  }
  return { ok: true, steps: plan.flatMap((f) => stepsOfFiring(f)) };
}

/** A move completes the current leg when it sets the leg's exact spoke to the
 * hinted state. Following a *different* spoke of the same firing reads as
 * off-plan, but a recompute simply re-offers the firing's remaining spokes, so
 * the deduction resumes either way (design D1 recompute-stability). */
function hintKeepTrack(
  m: SpokesMove,
  step: HintStep<SpokesMove, SpokesHint>,
  _state: SpokesState,
): HintTrackVerdict {
  if (m.kind !== "set") return "off";
  const target = step.move;
  if (target.kind !== "set") return "off";
  return sameEdge(m, target, _state.w) && m.state === target.state
    ? "completed"
    : "off";
}

/** Do two `set` moves name the same edge? A spoke has two ends; a move may cite
 * either, so compare in the canonical `dir < 4` form. */
function sameEdge(
  a: { index: number; dir: number },
  b: { index: number; dir: number },
  w: number,
): boolean {
  const ca = canonicalEdge(a.index, a.dir, w);
  const cb = canonicalEdge(b.index, b.dir, w);
  return ca.index === cb.index && ca.dir === cb.dir;
}

/** The canonical end of an edge — the `dir < 4` end, so the two ends of one
 * spoke reduce to the same `(index, dir)`. */
function canonicalEdge(
  index: number,
  dir: number,
  w: number,
): { index: number; dir: number } {
  if (dir < 4) return { index, dir };
  const nx = (index % w) + SPOKE_DIRS[dir].dx;
  const ny = ((index / w) | 0) + SPOKE_DIRS[dir].dy;
  return { index: ny * w + nx, dir: dir ^ 4 };
}

// --- the game ---------------------------------------------------------------

/** Spokes' difficulty contract (`engine/difficulty.ts`). `spokesSolve` returns
 * `"valid"` (fully and uniquely solved — what the generator gates on),
 * `"incomplete"` or `"invalid"`; the board is cleared of the player's marks
 * first, exactly as `solveFromClues` does. */
const difficulty: DifficultyContract<SpokesParams> = {
  tierOf: (p) => diffToLevel(p.diff),
  withTier: (p, tier) => ({ ...p, diff: DIFFS[tier] }),
  solveAtCap: (p, desc, cap) => {
    const board = cloneBoard(newState(p, desc));
    clearBoard(board);
    const ret = spokesSolve(board, null, cap);
    return ret === "valid" ? "solved" : ret === "invalid" ? "impossible" : "unsolved";
  },
};

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
      // Fork aid: gray a hub once its clue is met (visual only, no lock) —
      // the same cue Bridges offers on a satisfied island. Upstream nominally
      // filled such a hub white, which is invisible against either mode's
      // background; see `COL_SATISFIED`.
      kw: "mark-satisfied",
      name: "Gray out hubs once their spoke count is met",
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
  difficulty,
  hint,
  hintKeepTrack,
  findMistakes,
  textFormat,

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: SpokesParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength: (from, to) => winFlash(from, to, FLASH_TIME),
};

registerGame(spokesGame);
