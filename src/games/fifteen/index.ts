import { assertNever } from "../../engine/assert-never.ts";
import type {
  Game,
  HintResult,
  HintStep,
  HintTrackVerdict,
  UiUpdate,
} from "../../engine/game.ts";
import { ALREADY_SOLVED, NO_MOVE_WORTH_MAKING } from "../../engine/hint-refusal.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_UP,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { Point } from "../../engine/types.ts";
import { say } from "./hint-text.ts";
import {
  ANIM_TIME,
  colors,
  computeSize,
  type FifteenDrawState,
  type FifteenHintHighlights,
  FLASH_FRAME,
  fromCoord,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
} from "./render.ts";
import { computeHint } from "./solver.ts";
import {
  decodeParams,
  defaultParams,
  encodeParams,
  type FifteenMove,
  type FifteenParams,
  type FifteenState,
  type FifteenUi,
  isCompletedTiles,
  newDesc,
  newState,
  paramConfig,
  presets,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

// --- move logic -------------------------------------------------------

export function executeMove(state: FifteenState, move: FifteenMove): FifteenState {
  const { w, h, n } = state;

  if (move.type === "solve") {
    const tiles = new Int32Array(n);
    for (let i = 0; i < n; i++) tiles[i] = (i + 1) % n;
    // Upstream snaps movecount and completed to 1 (Solve resets to a
    // clean solved board to practice from; "Moves since auto-solve: 0").
    return {
      ...state,
      tiles,
      gapPos: n - 1,
      cheated: true,
      completed: 1,
      moveCount: 1,
    };
  }
  if (move.type !== "move") return assertNever(move, "fifteen: executeMove");

  const { x: dx, y: dy } = move;
  const gx = state.gapPos % w;
  const gy = Math.floor(state.gapPos / w);

  if (
    dx < 0 ||
    dx >= w ||
    dy < 0 ||
    dy >= h ||
    (dx === gx) === (dy === gy) // must share exactly one coordinate
  ) {
    throw new Error(`Illegal fifteen move to (${dx}, ${dy})`);
  }

  // Unit step from the old gap toward the destination, and its flat
  // stride.
  const ux = dx < gx ? -1 : dx > gx ? +1 : 0;
  const uy = dy < gy ? -1 : dy > gy ? +1 : 0;
  const up = uy * w + ux;

  const tiles = new Int32Array(state.tiles);
  const newGap = dy * w + dx;
  tiles[newGap] = 0;

  let moveCount = state.moveCount;
  for (let p = state.gapPos; p !== newGap; p += up) {
    tiles[p] = state.tiles[p + up];
    moveCount++;
  }

  let completed = state.completed;
  if (!completed && isCompletedTiles(tiles, n)) completed = moveCount;

  return { ...state, tiles, gapPos: newGap, moveCount, completed };
}

// --- UI / input -------------------------------------------------------

function newUi(_state: FifteenState): FifteenUi {
  return { invertCursor: false };
}

function flipCursor(button: number): number {
  switch (button) {
    case CURSOR_UP:
      return CURSOR_DOWN;
    case CURSOR_DOWN:
      return CURSOR_UP;
    case CURSOR_LEFT:
      return CURSOR_RIGHT;
    case CURSOR_RIGHT:
      return CURSOR_LEFT;
    default:
      return 0;
  }
}

function interpretMove(
  state: FifteenState,
  ui: FifteenUi,
  ds: FifteenDrawState,
  p: Point,
  button: number,
): FifteenMove | null | UiUpdate {
  const w = state.w;
  const h = state.h;
  const cx = state.gapPos % w;
  const cy = Math.floor(state.gapPos / w);
  let nx = cx;
  let ny = cy;

  const raw = stripModifiers(button);

  if (raw === LEFT_BUTTON) {
    const ts = ds.tilesize;
    nx = fromCoord(p.x, ts);
    ny = fromCoord(p.y, ts);
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) return null; // out of bounds
  } else if (isCursorMove(raw)) {
    // Default arrow semantics: the pressed arrow moves a *tile* in that
    // direction, so the gap moves the opposite way (flip). The
    // (never-set) invertCursor preference would undo the flip.
    let b = flipCursor(raw);
    if (ui.invertCursor) b = flipCursor(b);
    // Clamped move (no wrap); a no-op edge move leaves (cx, cy) — which
    // then fails the share-one-coordinate test below and returns null,
    // matching upstream `move_cursor(..., wrap=false)`.
    ({ x: nx, y: ny } = gridCursorMove(b, cx, cy, w, h) ?? { x: cx, y: cy });
  } else {
    return null;
  }

  // A legal target shares exactly one coordinate with the gap.
  if ((cx === nx) !== (cy === ny)) {
    return { type: "move", x: nx, y: ny };
  }
  return null;
}

// --- status bar -------------------------------------------------------

function statusbarText(state: FifteenState, _ui: FifteenUi): string {
  if (state.cheated) {
    return `Moves since auto-solve: ${state.moveCount - state.completed}`;
  }
  const prefix = state.completed ? "COMPLETED! " : "";
  const moves = state.completed || state.moveCount;
  return `${prefix}Moves: ${moves}`;
}

// --- hint -------------------------------------------------------------

/** Narrate one greedy step, explaining *why* it matters (per the hint
 * quality bar). The tile being slid lands at the old gap (`board.gapPos`),
 * and tile `t`'s solved cell is index `t - 1`.
 *
 * The narration is framed around a **stable goal** tile (see `hint`): the
 * one we are working toward home right now. Crucially this is *not* the
 * solver's memoryless `nextpiece`, which flips around during the
 * end-of-row/column rotation. To place the last tiles of a line the solver
 * temporarily displaces an already-home tile and then restores it; if we
 * re-narrated the goal as whatever `nextpiece` currently is, the banner
 * would read "Working on tile 8" then "Working on tile 7" and look like it
 * lost the plot (the owner-reported case). Holding the goal steady, the
 * displaced tile's restoration reads as a sub-step ("slide tile 7 into
 * place") of the same goal.
 *
 * Cases, given the stable `goal`:
 * - the goal tile lands in its solved cell → "slide it into place" (home);
 * - the goal tile slides but not home → compare its Manhattan distance to
 *   home before vs after and say "slide it closer" only when it actually
 *   decreases, else "reposition it" (the solver often pushes the goal
 *   *away* to route the gap to the far side of it — tile 8 sliding *down*);
 * - a non-goal tile lands in *its* solved cell → "slide tile N into place"
 *   (restoring a tile displaced earlier in the rotation);
 * - any other non-goal slide → "slide tile N out of the way". */
function narrateFifteenStep(
  board: FifteenState,
  tile: number,
  goal: number,
  dest: { x: number; y: number },
): string {
  const w = board.w;
  const landsAtOwnHome = board.gapPos === tile - 1;

  if (tile === goal) {
    if (landsAtOwnHome) return say.goalHome(goal);
    // The goal sits at `dest` before the slide and at the old gap after it.
    const hx = (goal - 1) % w;
    const hy = Math.floor((goal - 1) / w);
    const distBefore = Math.abs(dest.x - hx) + Math.abs(dest.y - hy);
    const distAfter =
      Math.abs((board.gapPos % w) - hx) + Math.abs(Math.floor(board.gapPos / w) - hy);
    return distAfter < distBefore ? say.goalCloser(goal) : say.goalReposition(goal);
  }

  if (landsAtOwnHome) return say.tileHome(goal, tile);
  return say.outOfWay(goal, tile);
}

/** Compute the *whole* greedy solution as a hint plan: one narrated
 * single-cell gap slide per step, simulated forward from the current
 * board. Returning the full plan (rather than one step per request) is
 * what keeps the hint banner populated through an auto-hint run instead
 * of clearing and recomputing on every step — matching Sixteen, where a
 * single multi-step plan stays on display while it is followed. The plan
 * is cheap (the greedy solver is fast) and recomputed only when the
 * player deviates (see `hintKeepTrack`). */
function hint(state: FifteenState): HintResult<FifteenMove, FifteenHintHighlights> {
  if (isCompletedTiles(state.tiles, state.n)) {
    return { ok: false, error: ALREADY_SOLVED };
  }

  const steps: HintStep<FifteenMove, FifteenHintHighlights>[] = [];
  let board = state;
  // The greedy solver terminates within the upstream 5·n³ bound; the
  // guard is a belt-and-braces cap against an unexpected non-terminating
  // board, never reached for a solvable one.
  let guard = 5 * state.n * state.n * state.n;
  // The *stable* goal tile: the one we are working toward home. The solver's
  // per-step `nextpiece` drops to a lower tile mid-rotation when it displaces
  // an already-home tile, so we hold the goal at the running maximum until it
  // is actually homed, then let the next step pick a fresh one. This keeps the
  // banner from flip-flopping (e.g. "tile 8" → "tile 7" → "tile 8") through the
  // end-of-line corner dance.
  let goal: number | null = null;
  while (!isCompletedTiles(board.tiles, board.n) && guard-- > 0) {
    const dest = computeHint(board);
    if (!dest) break;
    const tile = board.tiles[dest.y * board.w + dest.x];
    goal = goal === null ? dest.target : Math.max(goal, dest.target);
    const move: FifteenMove = { type: "move", x: dest.x, y: dest.y };
    steps.push({
      move,
      explanation: narrateFifteenStep(board, tile, goal, dest),
      highlights: { tile },
    });
    // Reset the goal once it lands home so the next pursuit starts fresh.
    const homedGoal = tile === goal && board.gapPos === goal - 1;
    board = executeMove(board, move);
    if (homedGoal) goal = null;
  }

  if (steps.length === 0) return { ok: false, error: NO_MOVE_WORTH_MAKING };
  return { ok: true, steps };
}

/** Classify a player move against the current plan step. A move that
 * produces exactly the board the plan expects after this step completes
 * it (so the remaining steps stay valid); anything else is a deviation,
 * which drops the plan and lets the next hint request recompute. */
function hintKeepTrack(
  m: FifteenMove,
  step: HintStep<FifteenMove, FifteenHintHighlights>,
  state: FifteenState,
): HintTrackVerdict {
  if (m.type !== "move" || step.move.type !== "move") return "off";
  const expected = executeMove(state, step.move);
  const actual = executeMove(state, m);
  if (actual.gapPos !== expected.gapPos) return "off";
  for (let i = 0; i < expected.n; i++) {
    if (actual.tiles[i] !== expected.tiles[i]) return "off";
  }
  return "completed";
}

// --- Game object ------------------------------------------------------

export const fifteenGame: Game<
  FifteenParams,
  FifteenState,
  FifteenMove,
  FifteenUi,
  FifteenDrawState
> = {
  id: "fifteen",
  wantsStatusbar: true,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  // Sliding a tile is the only gesture; the secondary button has no meaning,
  // so a touch player's held press must not be promoted into one.
  ignoresSecondaryButton: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig,

  newDesc: (p, rng) => newDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve(_orig, _curr) {
    return { ok: true, move: { type: "solve" as const } };
  },

  hint,
  hintKeepTrack,

  textFormat,
  statusbarText,

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize: (ds, ts) => {
    ds.tilesize = ts;
  },
  newDrawState,
  redraw,

  animLength: () => ANIM_TIME,
  // Not `winFlash`: Fifteen's `completed` is the move count it was solved at,
  // frozen so the status bar stops counting, not a flag. Sixteen, Twiddle and
  // Slide hold the same shape for the same reason.
  flashLength: (a, b) =>
    !a.completed && b.completed && !a.cheated && !b.cheated ? 2 * FLASH_FRAME : 0,
};

registerGame(fifteenGame);
