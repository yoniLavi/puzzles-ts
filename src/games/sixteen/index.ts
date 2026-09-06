import { assertNever } from "../../engine/assert-never.ts";
import type {
  Game,
  HintResult,
  HintStep,
  HintTrackVerdict,
  UiUpdate,
} from "../../engine/game.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import { ALREADY_SOLVED, NO_MOVE_WORTH_MAKING } from "../../engine/hint-refusal.ts";
import { HINT_SETTING_UP, workingOn } from "../../engine/hint-vocab.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  MOD_CTRL,
  MOD_MASK,
  MOD_NUM_KEYPAD,
  MOD_SHFT,
  newCursor,
  RIGHT_BUTTON,
  showCursor,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import {
  planSlides,
  type SlideMove,
  slidePieces,
  toroidalDist,
} from "../../engine/slide-planner.ts";
import type { Point } from "../../engine/types.ts";
import {
  ANIM_TIME,
  colors,
  computeSize,
  FLASH_FRAME,
  fromCoord,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type SixteenDrawState,
  type SixteenHintHighlights,
} from "./render.ts";
import {
  CursorMode,
  decodeParams,
  defaultParams,
  encodeParams,
  newDesc,
  newState,
  paramConfig,
  presets,
  type SixteenMove,
  type SixteenParams,
  type SixteenState,
  type SixteenUi,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

// --- move logic -------------------------------------------------------

export function executeMove(state: SixteenState, move: SixteenMove): SixteenState {
  if (move.type === "solve") {
    const tiles = new Int32Array(state.n);
    for (let i = 0; i < state.n; i++) tiles[i] = i + 1;
    return {
      ...state,
      tiles,
      cheated: true,
      completed: state.moveCount + 1,
      moveCount: state.moveCount + 1,
    };
  }
  if (move.type !== "slide") return assertNever(move, "sixteen: executeMove");

  const { axis, index, delta } = move;
  const tiles = new Int32Array(state.tiles);

  if (axis === "row") {
    for (let x = 0; x < state.w; x++) {
      const srcX = (((x - delta) % state.w) + state.w) % state.w;
      tiles[index * state.w + x] = state.tiles[index * state.w + srcX];
    }
  } else {
    for (let y = 0; y < state.h; y++) {
      const srcY = (((y - delta) % state.h) + state.h) % state.h;
      tiles[y * state.w + index] = state.tiles[srcY * state.w + index];
    }
  }

  const moveCount = state.moveCount + 1;
  let completed = state.completed;
  if (!completed) {
    let done = true;
    for (let i = 0; i < state.n; i++) {
      if (tiles[i] !== i + 1) {
        done = false;
        break;
      }
    }
    if (done) completed = moveCount;
  }

  return {
    ...state,
    tiles,
    moveCount,
    completed,
    lastMovementSense: axis === "row" ? delta : 0 + (axis === "column" ? delta : 0),
    lastMove: move,
  };
}

// --- UI ---------------------------------------------------------------

function newUi(_state: SixteenState): SixteenUi {
  return {
    cursor: newCursor(),
    curMode: CursorMode.Unlocked,
  };
}

function interpretMove(
  state: SixteenState,
  ui: SixteenUi,
  ds: SixteenDrawState,
  p: Point,
  button: number,
): SixteenMove | null | UiUpdate {
  const shift = !!(button & MOD_SHFT);
  const control = !!(button & MOD_CTRL);
  const pad = button & MOD_NUM_KEYPAD;
  const rawButton = button & ~MOD_MASK;

  // Cursor movement.
  if (isCursorMove(rawButton) || pad) {
    if (control || shift || ui.curMode !== CursorMode.Unlocked) {
      // In these modes the arrow *is* a slide, so a hidden cursor still only
      // reveals: a first press must not move the board out from under a player
      // who cannot yet see where it would act. The unlocked mode below is the
      // plain cursor walk, and reveals and moves in one press like every other
      // game's (`ts-engine`, "One keyboard-cursor vocabulary across games").
      if (showCursor(ui.cursor)) return UI_UPDATE;
      if (
        ui.cursor.x < 0 ||
        ui.cursor.x >= state.w ||
        ui.cursor.y < 0 ||
        ui.cursor.y >= state.h
      )
        return null;

      const { x: nx, y: ny } = gridCursorMove(
        rawButton | pad,
        ui.cursor.x,
        ui.cursor.y,
        state.w,
        state.h,
        false,
      ) ?? { x: ui.cursor.x, y: ui.cursor.y };
      const { x: nwx, y: nwy } = gridCursorMove(
        rawButton | pad,
        ui.cursor.x,
        ui.cursor.y,
        state.w,
        state.h,
        true,
      ) ?? { x: ui.cursor.x, y: ui.cursor.y };

      let move: SixteenMove;
      if (nx !== nwx) {
        move = {
          type: "slide",
          axis: "row",
          index: ui.cursor.y,
          delta: nx > ui.cursor.x ? 1 : -1,
        };
      } else if (ny !== nwy) {
        move = {
          type: "slide",
          axis: "column",
          index: ui.cursor.x,
          delta: ny > ui.cursor.y ? 1 : -1,
        };
      } else if (nx === ui.cursor.x) {
        move = {
          type: "slide",
          axis: "column",
          index: ui.cursor.x,
          delta: ny - ui.cursor.y,
        };
      } else {
        move = {
          type: "slide",
          axis: "row",
          index: ui.cursor.y,
          delta: nx - ui.cursor.x,
        };
      }

      if (control || (!shift && ui.curMode === CursorMode.LockTile)) {
        ui.cursor.x = nwx;
        ui.cursor.y = nwy;
      }

      return move;
    } else {
      const { x: nx, y: ny } = gridCursorMove(
        rawButton | pad,
        ui.cursor.x + 1,
        ui.cursor.y + 1,
        state.w + 2,
        state.h + 2,
        false,
      ) ?? { x: ui.cursor.x + 1, y: ui.cursor.y + 1 };

      if (nx === 0 && ny === 0) {
        const t = ui.cursor.x;
        ui.cursor.x = ui.cursor.y;
        ui.cursor.y = t;
      } else if (nx === 0 && ny === state.h + 1) {
        const t = ui.cursor.x;
        ui.cursor.x = state.h - 1 - ui.cursor.y;
        ui.cursor.y = state.h - 1 - t;
      } else if (nx === state.w + 1 && ny === 0) {
        const t = ui.cursor.x;
        ui.cursor.x = state.w - 1 - ui.cursor.y;
        ui.cursor.y = state.w - 1 - t;
      } else if (nx === state.w + 1 && ny === state.h + 1) {
        const t = ui.cursor.x;
        ui.cursor.x = state.w - state.h + ui.cursor.y;
        ui.cursor.y = state.h - state.w + t;
      } else {
        ui.cursor.x = nx - 1;
        ui.cursor.y = ny - 1;
      }

      ui.cursor.visible = true;
      return UI_UPDATE;
    }
  }

  if (ui.dragging) {
    if (rawButton === LEFT_DRAG) {
      ui.dragX = p.x;
      ui.dragY = p.y;

      if (!ui.dragAxis) {
        const dx = p.x - (ui.dragStartX ?? p.x);
        const dy = p.y - (ui.dragStartY ?? p.y);
        const threshold = 5; // pixels
        if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
          if (Math.abs(dx) > Math.abs(dy)) {
            ui.dragAxis = "row";
            ui.dragIndex = ui.dragStartCellY;
          } else {
            ui.dragAxis = "column";
            ui.dragIndex = ui.dragStartCellX;
          }
        }
      }
      return UI_UPDATE;
    }

    if (rawButton === LEFT_RELEASE) {
      const ts = ds.tilesize;
      const axis = ui.dragAxis;
      const index = ui.dragIndex;
      const startX = ui.dragStartX ?? p.x;
      const startY = ui.dragStartY ?? p.y;

      // Reset drag state
      ui.dragging = false;
      ui.dragStartX = undefined;
      ui.dragStartY = undefined;
      ui.dragX = undefined;
      ui.dragY = undefined;
      ui.dragAxis = undefined;
      ui.dragIndex = undefined;
      ui.dragStartCellX = undefined;
      ui.dragStartCellY = undefined;

      if (axis && index !== undefined && index >= 0) {
        const dist = axis === "row" ? p.x - startX : p.y - startY;
        const delta = Math.round(dist / ts);

        if (delta !== 0) {
          const lim = axis === "row" ? state.w : state.h;
          let normalizedDelta = ((delta % lim) + lim) % lim;
          if (normalizedDelta > lim / 2) {
            normalizedDelta -= lim;
          }
          if (normalizedDelta !== 0) {
            ui.justDragged = true;
            return {
              type: "slide",
              axis,
              index,
              delta: normalizedDelta,
            };
          }
        }
      }
      return UI_UPDATE;
    }
  }

  // Mouse click / cursor select.
  let cx = -1,
    cy = -1;
  if (rawButton === LEFT_BUTTON || rawButton === RIGHT_BUTTON) {
    const ts = ds.tilesize;
    cx = fromCoord(p.x, ts);
    cy = fromCoord(p.y, ts);
    ui.cursor.visible = false;

    if (
      rawButton === LEFT_BUTTON &&
      cx >= 0 &&
      cx < state.w &&
      cy >= 0 &&
      cy < state.h
    ) {
      ui.dragging = true;
      ui.dragStartX = p.x;
      ui.dragStartY = p.y;
      ui.dragX = p.x;
      ui.dragY = p.y;
      ui.dragAxis = null;
      ui.dragIndex = -1;
      ui.dragStartCellX = cx;
      ui.dragStartCellY = cy;
      return UI_UPDATE;
    }
  } else if (rawButton === CURSOR_SELECT || rawButton === CURSOR_SELECT2) {
    if (ui.cursor.visible) {
      if (
        ui.cursor.x === -1 ||
        ui.cursor.x === state.w ||
        ui.cursor.y === -1 ||
        ui.cursor.y === state.h
      ) {
        cx = ui.cursor.x;
        cy = ui.cursor.y;
      } else {
        const m =
          rawButton === CURSOR_SELECT2 ? CursorMode.LockPosition : CursorMode.LockTile;
        ui.curMode = ui.curMode === m ? CursorMode.Unlocked : m;
        return UI_UPDATE;
      }
    } else {
      ui.cursor.visible = true;
      return UI_UPDATE;
    }
  } else {
    return null;
  }

  // Determine slide direction from click position.
  let dx = 0,
    dy = 0;
  if (cx === -1 && cy >= 0 && cy < state.h) {
    dx = -1;
    dy = 0;
  } else if (cx === state.w && cy >= 0 && cy < state.h) {
    dx = 1;
    dy = 0;
  } else if (cy === -1 && cx >= 0 && cx < state.w) {
    dy = -1;
    dx = 0;
  } else if (cy === state.h && cx >= 0 && cx < state.w) {
    dy = 1;
    dx = 0;
  } else return UI_UPDATE;

  // Reverse direction for right button / CURSOR_SELECT2.
  if (rawButton === RIGHT_BUTTON || rawButton === CURSOR_SELECT2) {
    dx = -dx;
    dy = -dy;
  }

  if (dx) return { type: "slide", axis: "row", index: cy, delta: dx };
  return { type: "slide", axis: "column", index: cx, delta: dy };
}

// --- status bar -------------------------------------------------------

function statusbarText(state: SixteenState, _ui: SixteenUi): string {
  if (state.cheated) {
    return `Moves since auto-solve: ${state.moveCount - state.completed}`;
  }
  const prefix = state.completed ? "COMPLETED! " : "";
  const moves = state.completed || state.moveCount;
  let s = `${prefix}Moves: ${moves}`;
  if (state.moveTarget) s += ` (target ${state.moveTarget})`;
  return s;
}

// --- hint heuristic ----------------------------------------------------

/** Test-only diagnostic: whether the most recent `hint()` engaged the exact
 * bidirectional fallback — the expensive (~0.5-2s) path the no-progress gate
 * exists to avoid on boards the forward search can already make progress on.
 * Tests assert this directly instead of timing a wall-clock proxy (which
 * flakes under full-suite CPU contention). Unused in production. */
let lastHintEngagedFallback = false;
export function __lastHintEngagedFallback(): boolean {
  return lastHintEngagedFallback;
}

/** Sixteen's own move for a planned slide. The planner's `delta` already means
 * "how far a tile travels", which is Sixteen's sense too, so only the axis
 * spelling differs. */
function toSixteenMove(m: SlideMove): SixteenMove {
  return {
    type: "slide",
    axis: m.axis === "row" ? "row" : "column",
    index: m.index,
    delta: m.delta,
  };
}

function hint(state: SixteenState): HintResult<SixteenMove, SixteenHintHighlights> {
  const { w, h, n, tiles } = state;

  let outOfPlace = 0;
  for (let i = 0; i < n; i++) {
    if (tiles[i] !== i + 1) outOfPlace++;
  }
  if (outOfPlace === 0) return { ok: false, error: ALREADY_SOLVED };

  // Every legal move: a slide of any line by any distance. A slide by any
  // distance is a *single* move — the same granularity as a player's drag and
  // as the move counter — so the plan's first move is directly executable
  // (executing a longer journey than the plan's first step deviated from the
  // plan and caused auto-hint cycles).
  const moves: SlideMove[] = [];
  for (let r = 0; r < h; r++) {
    for (let delta = 1; delta < w; delta++) {
      moves.push({ axis: "row", index: r, delta });
    }
  }
  for (let c = 0; c < w; c++) {
    for (let delta = 1; delta < h; delta++) {
      moves.push({ axis: "col", index: c, delta });
    }
  }

  // Every tile is distinct and belongs in the cell one below its own number, so
  // "how far from finished" is just the total distance the tiles must travel.
  // Precomputed per (cell, tile) so the heuristic is a sum of table lookups.
  const goal = new Int32Array(n);
  for (let i = 0; i < n; i++) goal[i] = i + 1;

  const stride = n + 1;
  const distTable = new Int32Array(n * stride);
  for (let cell = 0; cell < n; cell++) {
    for (let tile = 1; tile <= n; tile++) {
      distTable[cell * stride + tile] =
        toroidalDist(Math.floor(cell / w), Math.floor((tile - 1) / w), h) +
        toroidalDist(cell % w, (tile - 1) % w, w);
    }
  }
  const heuristic = (board: Int32Array): number => {
    let total = 0;
    for (let cell = 0; cell < n; cell++)
      total += distTable[cell * stride + board[cell]];
    return total;
  };

  const last = state.lastMove;
  const plan = planSlides({
    w,
    h,
    start: tiles,
    goal,
    heuristic,
    moves,
    // Near the solved state a somewhat larger budget resolves shallow
    // plateaus; deep local minima (two swapped pairs) are beyond *any* sane
    // forward budget and are the exact fallback's job, so there is no point
    // burning a huge budget here.
    maxStates: outOfPlace <= 8 ? 6000 : 4000,
    // Don't open by undoing (or partly undoing) the slide the player just made.
    rejectFirstMove:
      last?.type === "slide"
        ? (m) => {
            const axis = m.axis === "row" ? "row" : "column";
            if (axis !== last.axis || m.index !== last.index) return false;
            const lim = m.axis === "row" ? w : h;
            const normalize = (d: number) => {
              let nd = ((d % lim) + lim) % lim;
              if (nd > lim / 2) nd -= lim;
              return nd;
            };
            return (
              Math.abs(normalize(last.delta + m.delta)) <
              Math.abs(normalize(last.delta))
            );
          }
        : undefined,
    // A local minimum sits ~8 plies uphill — beyond any forward budget — but
    // meeting in the middle crosses it at ~4 plies a side, paid once for the
    // whole endgame thanks to plan-carrying. Only worth it near the end, and
    // only once the forward search has proved itself helpless.
    exactSearch:
      outOfPlace <= 8
        ? { when: "no-progress" as const, maxDepth: 10, maxStates: 4_000_000 }
        : undefined,
  });

  lastHintEngagedFallback = plan.usedExactSearch;
  const path = plan.moves;
  if (path.length === 0) {
    return { ok: false, error: NO_MOVE_WORTH_MAKING };
  }

  // Narrate each step against the simulated board it applies to: the
  // plan is computed once, so every step's story must already be told
  // from the state its predecessors produce. A step that the previous
  // step previewed as the continuation of a tile's journey ("then to
  // column 2") is narrated around that same tile — the user who
  // follows the journey must see its second leg, not an unrelated
  // story about whichever tile happens to be lowest-numbered on the
  // line.
  const steps: HintStep<SixteenMove, SixteenHintHighlights>[] = [];
  let board = tiles;
  for (let k = 0; k < path.length; k++) {
    const prev = steps[k - 1]?.highlights;
    const journey =
      prev && prev.ultimatePos !== undefined
        ? { tile: prev.tile, ultimatePos: prev.ultimatePos }
        : null;
    steps.push(narrateStep(board, w, h, path[k], path[k + 1] ?? null, journey));
    const next = new Int32Array(n);
    slidePieces(board, next, w, h, path[k]);
    board = next;
  }

  return { ok: true, steps };
}

/** Narrate one plan step against the board it applies to. The
 * highlighted tile is the lowest-numbered out-of-place tile on the
 * moved line — unless the previous step previewed this move as the
 * continuation of a tile's journey, in which case that journey tile
 * carries the narration through its second leg. The target is the
 * narrated tile's landing cell under the move (with a second-leg
 * preview when the next planned move continues the same tile's
 * journey perpendicular to this one); the returned move's delta is
 * normalized to the in-grid direction of travel. (An earlier version
 * narrated the tile's *solved* row/column regardless of what the move
 * achieved; once hints started executing the narrated slide, that
 * overpromise pushed the game off the solver's path and auto-play
 * could cycle.) The narration reads "Working on tile N: move it to
 * <line>[, then <line>]" and explains *why* via a trailing clause —
 * ", its final spot" when the journey ends in the tile's solved cell,
 * else "(setting up)" — per the shared sliding-tile hint vocabulary. */
function narrateStep(
  tiles: Int32Array,
  w: number,
  h: number,
  move: SlideMove,
  nextMove: SlideMove | null,
  journey: { tile: number; ultimatePos: number } | null = null,
): HintStep<SixteenMove, SixteenHintHighlights> {
  // A previewed journey continuation keeps narrating the same tile,
  // provided this move really does carry it to the previewed cell.
  let bestTile = 0;
  let continuesPrevious = false;
  if (journey) {
    const idx = tiles.indexOf(journey.tile);
    const r = Math.floor(idx / w);
    const c = idx % w;
    const onLine = move.axis === "row" ? r === move.index : c === move.index;
    if (onLine) {
      const jLandR = move.axis === "row" ? r : (r + move.delta + h) % h;
      const jLandC = move.axis === "row" ? (c + move.delta + w) % w : c;
      if (jLandR * w + jLandC === journey.ultimatePos) {
        bestTile = journey.tile;
        continuesPrevious = true;
      }
    }
  }

  // Otherwise pick the lowest-numbered out-of-place tile on the moved
  // row/column; if every tile on the line is in place (the move only
  // serves another line's journey), the lowest-numbered tile on it.
  if (bestTile === 0 && move.axis === "row") {
    const r = move.index;
    for (let c = 0; c < w; c++) {
      const tile = tiles[r * w + c];
      const targetCol = (tile - 1) % w;
      const targetRow = Math.floor((tile - 1) / w);
      if (targetRow !== r || targetCol !== c) {
        if (bestTile === 0 || tile < bestTile) {
          bestTile = tile;
        }
      }
    }
    if (bestTile === 0) {
      for (let c = 0; c < w; c++) {
        const tile = tiles[r * w + c];
        if (bestTile === 0 || tile < bestTile) {
          bestTile = tile;
        }
      }
    }
  } else if (bestTile === 0) {
    const colIndex = move.index;
    for (let r = 0; r < h; r++) {
      const tile = tiles[r * w + colIndex];
      const targetCol = (tile - 1) % w;
      const targetRow = Math.floor((tile - 1) / w);
      if (targetRow !== r || targetCol !== colIndex) {
        if (bestTile === 0 || tile < bestTile) {
          bestTile = tile;
        }
      }
    }
    if (bestTile === 0) {
      for (let r = 0; r < h; r++) {
        const tile = tiles[r * w + colIndex];
        if (bestTile === 0 || tile < bestTile) {
          bestTile = tile;
        }
      }
    }
  }

  // bestTile is selected from the moved line, so it is always found.
  const currentIdx = tiles.indexOf(bestTile);
  const curR = Math.floor(currentIdx / w);
  const curC = currentIdx % w;

  const landR = move.axis === "row" ? curR : (curR + move.delta + h) % h;
  const landC = move.axis === "row" ? (curC + move.delta + w) % w : curC;
  const targetPos = landR * w + landC;

  // Goal:tactic narration. The prefix names the tile being worked toward
  // home; the tactic states the destination line this move sends it to.
  // A continuation leg ("then to …") repeats neither the verb nor the why
  // — leg 0 of its journey already carried both and is still on screen.
  const firstDest = move.axis === "row" ? `column ${landC + 1}` : `row ${landR + 1}`;
  let tactic = continuesPrevious ? `then to ${firstDest}` : `move it to ${firstDest}`;

  let ultimatePos: number | undefined;

  if (nextMove && nextMove.axis !== move.axis) {
    const onSecondLine =
      nextMove.axis === "col" ? nextMove.index === landC : nextMove.index === landR;
    if (onSecondLine) {
      const ultR = nextMove.axis === "col" ? (landR + nextMove.delta + h) % h : landR;
      const ultC = nextMove.axis === "row" ? (landC + nextMove.delta + w) % w : landC;
      const ult = ultR * w + ultC;
      if (ult !== targetPos && ult !== currentIdx) {
        ultimatePos = ult;
        const secondDest =
          move.axis === "row" ? `row ${ultR + 1}` : `column ${ultC + 1}`;
        tactic += `, then ${secondDest}`;
      }
    }
  }

  // Explain *why* the move matters (per the hint quality bar): a move
  // that lands the narrated tile in its solved cell (index tile-1) is a
  // **home** move; one that leaves it out of place is a **staging** move.
  // The why attaches to the journey's *end* — for a previewed two-leg
  // journey use the ultimate landing cell, so a first leg that merely
  // stages but whose second leg homes the tile reads as a home move. A
  // continuation leg carries no why (leg 0 of its journey already did).
  let suffix = "";
  if (!continuesPrevious) {
    const finalPos = ultimatePos ?? targetPos;
    suffix = finalPos === bestTile - 1 ? ", its final spot" : ` ${HINT_SETTING_UP}`;
  }

  const explanation = `${workingOn(bestTile)}${tactic}${suffix}`;

  // Normalize the returned delta to the in-grid direction of travel
  // (same permutation mod w/h) so the slide animation glides the tile
  // straight to its target box rather than wrapping across the edge.
  const inGridDelta = move.axis === "row" ? landC - curC : landR - curR;
  const outMove = toSixteenMove(
    inGridDelta === move.delta ? move : { ...move, delta: inGridDelta },
  );

  return {
    move: outMove,
    explanation,
    highlights: { tile: bestTile, targetPos, ultimatePos },
    ...(continuesPrevious ? { continuesPrevious } : {}),
  };
}

// --- Game object ------------------------------------------------------

export const sixteenGame: Game<
  SixteenParams,
  SixteenState,
  SixteenMove,
  SixteenUi,
  SixteenDrawState
> = {
  id: "sixteen",
  wantsStatusbar: true,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig,
  describeParams: (p) => ({
    "number-of-shuffling-moves": String(p.movetarget),
  }),

  newDesc: (p, rng) => newDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status: (s) => (s.completed > 0 ? "solved" : "ongoing"),

  solve(_orig, _curr) {
    return { ok: true, move: { type: "solve" as const } };
  },

  hint,

  hintKeepTrack(
    m: SixteenMove,
    step: HintStep<SixteenMove, SixteenHintHighlights>,
    state: SixteenState,
  ): HintTrackVerdict {
    if (m.type !== "slide" || step.move.type !== "slide") return "off";

    // Only slides of the hinted row/column relate to the step at all.
    if (m.axis !== step.move.axis || m.index !== step.move.index) {
      return "off";
    }

    const hl = step.highlights;
    if (!hl) return "off";

    // A slide of the hinted line that lands the tile on the step's
    // target completes the step. This is safe exactly because a line
    // slide is determined by its displacement: any slide landing the
    // tile there produces the same permutation as the planned move,
    // so the post-move state matches the plan and the remaining
    // steps stay valid.
    const nextState = executeMove(state, m);
    const tilePos = nextState.tiles.indexOf(hl.tile);
    if (tilePos === hl.targetPos) return "completed";

    // Any other slide of the line is partial progress (or a detour):
    // shrink the step's move to the remaining in-grid distance so a
    // later executeHint doesn't overshoot.
    const curR = Math.floor(tilePos / state.w);
    const curC = tilePos % state.w;
    const tgtR = Math.floor(hl.targetPos / state.w);
    const tgtC = hl.targetPos % state.w;
    const remaining = step.move.axis === "row" ? tgtC - curC : tgtR - curR;
    step.move = { ...step.move, delta: remaining };
    return "onTrack";
  },

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

  animLength: (_oldState, _newState, _dir, ui) => {
    if (ui.justDragged) {
      ui.justDragged = false;
      return 0;
    }
    return ANIM_TIME;
  },
  // Not `winFlash`: `completed` here is the move count, not a flag — see
  // Fifteen's note.
  flashLength: (a, b) =>
    !a.completed && b.completed && !a.cheated && !b.cheated ? 2 * FLASH_FRAME : 0,
};

registerGame(sixteenGame);
