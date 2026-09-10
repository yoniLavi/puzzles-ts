import { assertNever } from "../../engine/assert-never.ts";
import type {
  Game,
  HintResult,
  HintStep,
  HintTrackVerdict,
  UiUpdate,
} from "../../engine/game.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import { ALREADY_SOLVED, SEARCH_OUT_OF_REACH } from "../../engine/hint-refusal.ts";
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
  type SlidePuzzle,
  slidePieces,
  toroidalDist,
} from "../../engine/slide-planner.ts";
import type { Point } from "../../engine/types.ts";
import { type Line, say } from "./hint-text.ts";
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

/**
 * What one **tangle too many** is worth to the hint's measure of a board, over
 * and above the distance its tiles have to travel. See {@link TANGLES_IN_REACH}
 * for what "too many" means, and the measure itself for what a tangle is.
 *
 * Four, because a slide that breaks a tangle open costs about that much travel:
 * anything at or above it makes untangling read as progress rather than as
 * damage, which is the whole job. The exact value matters much less than the
 * sign — measured on the four-tangle board this exists for, weights from 2 to 8
 * all escape it, and 4 is the one that escapes it with a plan that reaches the
 * finished board rather than merely a better one.
 */
const TANGLE_COST = 4;

/**
 * How many tangles the searches above the heuristic can unwind on their own.
 *
 * **This is the number that keeps the two measures the same board-for-board
 * wherever it matters.** A tangle is about four and a half moves — a pair of
 * tiles in each other's cells is nine moves from home, measured — so the deep
 * search's nine-move reach is exactly two of them. On any board at or under
 * that, the exact searches give a genuinely shortest plan and the heuristic is
 * not consulted at all; pricing tangles there would only change which board the
 * *fallback* prefers, and it would do one thing worse: the deep search's gate
 * is "the fallback found nothing better than standing still", so a measure that
 * escapes a two-tangle endgame stops that gate from ever opening and turns a
 * complete nine-move plan into a five-move partial one. Measured, on the 5×4
 * one-pair board, when this term was priced from the first tangle.
 *
 * So the measure differs from plain travel **only past the point where nothing
 * else can help**, which is also the only place it was ever needed.
 */
const TANGLES_IN_REACH = 2;

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
  /**
   * How far this board is from finished: how far the tiles have to travel, plus
   * what travel alone cannot see — the **tangles** the board is tied in.
   *
   * A tangle is a non-trivial cycle of the tile permutation: two tiles in each
   * other's cells, three rotating among themselves. Travel prices one at the
   * couple of cells it looks like and it is really nine moves, because nothing
   * short of taking other tiles out and putting them back unwinds it. That is
   * why a tangled board is a *strict local minimum* of travel alone — every
   * slide makes the picture worse — and why a hint steered by travel alone
   * cannot leave one. Four tangles is thirteen-odd moves from home, twice what
   * the exact search stores and four plies past what the deep one walks, and
   * that is the board the hint used to give up on.
   *
   * Counting them is the escape. The measure is not a distance and is not
   * trying to be: the searches that need a true distance do not consult a
   * heuristic at all, and this one only has to make untangling read as progress.
   * Past {@link TANGLES_IN_REACH} it does, and at or under it this is plain
   * travel — see that constant for why the difference has to stop there.
   */
  const cycleSeen = new Uint8Array(n);
  const heuristic = (board: Int32Array): number => {
    let total = 0;
    for (let cell = 0; cell < n; cell++)
      total += distTable[cell * stride + board[cell]];
    cycleSeen.fill(0);
    let tangles = 0;
    for (let cell = 0; cell < n; cell++) {
      if (cycleSeen[cell] || board[cell] - 1 === cell) continue;
      let at = cell;
      let length = 0;
      while (!cycleSeen[at]) {
        cycleSeen[at] = 1;
        at = board[at] - 1;
        length++;
      }
      if (length > 1) tangles++;
    }
    return total + TANGLE_COST * Math.max(0, tangles - TANGLES_IN_REACH);
  };

  const last = state.lastMove;
  const puzzle: Omit<SlidePuzzle, "heuristic"> = {
    w,
    h,
    start: tiles,
    goal,
    moves,
    // The heuristic search only ever runs on boards the exact search below
    // could not reach, which are the ones far from finished. One budget, not the
    // 6000-or-4000 it used to be depending on how close the board looked: that
    // was a gate on a board measure, which is the shape this game's hint cycle
    // came from, and the exact search is the whole cost anyway.
    maxStates: 6000,
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
    // Shortest first, on every board, unconditionally — which is what makes a
    // hint the player keeps re-asking for actually arrive. A local minimum
    // (two swapped pairs) sits ~8 plies uphill of every slide, beyond any
    // forward budget, and meeting in the middle crosses it at ~4 plies a side.
    //
    // **The unconditional part is the whole fix, and it was not obvious.**
    // Arming this only near the finish reads like an easy saving and is a
    // ping-pong: the exact plan walks *uphill* in both of the cheap measures of
    // "near" (measured on a 5×5 board — a plan starting at 9 tiles out of place
    // and a travel distance of 9 peaks at 17 and 30 on the way home), so any
    // gate switches off partway down its own descent and hands the board back
    // to the heuristic, which walks it straight back to where it started. Three
    // gates were tried and all three cycled.
    exactSearch: { maxDepth: 10, maxStates: 2_500_000 },
    // The endgame the search above cannot reach. Sixteen's two-swapped-pairs
    // boards — four tiles out of place, every slide from them looking worse —
    // are **exactly nine moves** from finished, and that search tops out at
    // eight: crossing nine by storing states costs 18–24 million of them, some
    // ten seconds and most of a gigabyte, which is not a thing a browser tab
    // may spend. Walking five plies forward into a four-ply database of the
    // finished board costs the same nine moves of reach for a few tens of MB,
    // and the database is built once and answers every later hint.
    //
    // Without this the hint gave up on about one 5×5 game in five, four tiles
    // from home, on a board that was perfectly solvable.
    deepSearch: { forwardDepth: 5, databaseDepth: 4 },
  };

  const plan = planSlides({ ...puzzle, heuristic });

  const path = plan.moves;
  if (path.length === 0) {
    // **Everything above has run out of reach**, which is the only thing this
    // says. It used to say "No move here would get you closer", which is a
    // claim about the board that nothing here ever checked — and on the board
    // that prompted this it was flatly untrue: plenty of moves got the player
    // closer, and they had followed thirty-three hints to arrive at it.
    //
    // A hint that plans by searching has a *reach*, and no arrangement of this
    // machinery extends it much: each further ply costs about 40×. So past it
    // the truthful answer is that we did not find a way, and the player is told
    // what does still work. `hint-resume.test.ts` accepts this as an honest end
    // to its walk, for the games it derives as planning by search.
    return { ok: false, error: SEARCH_OUT_OF_REACH };
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

  // Goal:tactic narration: the tile being worked toward home, the line this
  // move sends it to, and the line the next move continues it along, if any.
  const first: Line =
    move.axis === "row"
      ? { axis: "column", n: landC + 1 }
      : { axis: "row", n: landR + 1 };
  let second: Line | null = null;

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
        second =
          move.axis === "row"
            ? { axis: "row", n: ultR + 1 }
            : { axis: "column", n: ultC + 1 };
      }
    }
  }

  // Why the move matters (per the hint quality bar): a move that lands the
  // narrated tile in its solved cell (index tile-1) is a **home** move; one
  // that leaves it out of place is a **staging** move. The why attaches to the
  // journey's *end* — for a previewed two-leg journey use the ultimate landing
  // cell, so a first leg that merely stages but whose second leg homes the
  // tile reads as a home move.
  const explanation = say.step({
    tile: bestTile,
    continues: continuesPrevious,
    first,
    second,
    home: (ultimatePos ?? targetPos) === bestTile - 1,
  });

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
