/**
 * Loopy — native TS port of `loopy.c` (Mike Pinna 2005-6; substantially
 * rewritten for general grids by Lambros Lambrou, 2008).
 *
 * Draw a single closed loop along the grid's edges so that every numbered face
 * is bordered by exactly that many loop segments. Playable on **all eighteen**
 * tilings `grid.ts` provides, from squares to Penrose patches, hats and
 * spectres — and the renderer has no per-tiling code at all, because every
 * geometric difference comes out of `grid.ts`.
 *
 * **Two ways to reach an edge, one way to set it.** A pointer reaches an edge
 * by `gridNearestEdge`; the keyboard reaches one as (dot, direction) through
 * the cursor in `cursor.ts`. Both then go through {@link setEdge}, so a
 * keyboard selection *is* the click on that edge — autofollow included — rather
 * than a second input model beside it. Left / Enter cycles an edge towards
 * YES, right / Space towards NO, middle / Backspace clears. Loopy does
 * genuinely read `MOD_STYLUS`, and `wantsStylusModifier` is set for it — see
 * {@link nextLineState}; the keyboard has two keys and needs no such cycle.
 *
 * Upstream gives Loopy no keyboard at all (`loopy.c` has no `CURSOR_`
 * reference), so the keyboard here is this fork's design, not a port.
 *
 * The port is split across `params.ts`, `state.ts`, `dlines.ts`, `solver.ts`,
 * `generator.ts`, `grid-build.ts`, `cursor.ts` and `render.ts`; this file is
 * the `Game` glue plus input handling.
 */

import { assertNever } from "../../engine/assert-never.ts";
import type { DifficultyContract } from "../../engine/difficulty.ts";
import { winFlash } from "../../engine/flash.ts";
import {
  type Game,
  type GameDrawing,
  type GamePref,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import type { Grid, GridDot, GridEdge } from "../../engine/grid/index.ts";
import { gridNearestEdge } from "../../engine/grid/index.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  isCancelKey,
  isCursorMove,
  isEraseKey,
  isMouseDown,
  LEFT_BUTTON,
  MIDDLE_BUTTON,
  MOD_SHFT,
  MOD_STYLUS,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { Point } from "../../engine/types.ts";
import {
  edgesByDirection,
  farDot,
  type LoopyCursor,
  newLoopyCursor,
  nextEdgeFor,
} from "./cursor.ts";
import { newDesc } from "./generator.ts";
import {
  DIFF_MAX,
  decodeParams,
  defaultParams,
  encodeParams,
  LOOPY_DIFFS,
  type LoopyParams,
  paramConfig,
  presets,
  validateParams,
} from "./params.ts";
import {
  border,
  colours,
  computeSize,
  FLASH_TIME,
  type LoopyDrawState,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import { solveGame } from "./solver.ts";
import {
  checkCompletion,
  cloneState,
  LINE_NO,
  LINE_UNKNOWN,
  LINE_YES,
  type LineState,
  type LoopyState,
  newState,
  textFormat,
  validateDesc,
} from "./state.ts";

/** One edge set to one state. Moves are **absolute sets, never toggles**, so
 * re-applying a move is idempotent — which is what lets the autofollow walk
 * name the same edge twice without consequence. */
export interface LoopyOp {
  edge: number;
  state: LineState;
}

/** A player move (or the Solve action, which additionally marks the game as
 * solved with help). Upstream encodes these as a string that `execute_move`
 * re-parses; the string was a C program's only way to express a variant, not
 * part of the game's meaning, and the save format is ours. */
export type LoopyMove =
  | { kind: "set"; ops: readonly LoopyOp[] }
  | { kind: "solve"; ops: readonly LoopyOp[] };

/** How much an edge click drags its neighbours along with it. */
export const AF_OFF = 0;
export const AF_FIXED = 1;
export const AF_ADAPTIVE = 2;

export interface LoopyUi {
  /** Draw excluded (NO) lines very faintly rather than invisibly. */
  drawFaintLines: boolean;
  /** {@link AF_OFF} / {@link AF_FIXED} / {@link AF_ADAPTIVE}. */
  autofollow: number;
  /** The keyboard cursor: a dot and one of its incident edges (`cursor.ts`). */
  cursor: LoopyCursor;
}

function newUi(state: LoopyState): LoopyUi {
  // Upstream also consults `LOOPY_FAINT_LINES` / `LOOPY_AUTOFOLLOW` environment
  // variables here (`legacy_prefs_override`), a pre-preferences-dialog relic
  // with no meaning in a browser. Dropped; the prefs below are the whole story.
  return {
    drawFaintLines: true,
    autofollow: AF_OFF,
    cursor: newLoopyCursor(state.grid),
  };
}

const prefs: GamePref<LoopyUi>[] = [
  {
    kw: "draw-faint-lines",
    name: "Draw excluded grid lines faintly",
    type: "boolean",
    get: (ui) => ui.drawFaintLines,
    set: (ui, v) => {
      ui.drawFaintLines = v;
    },
  },
  {
    kw: "auto-follow",
    name: "Auto-follow unique paths of edges",
    type: "choices",
    choices: ["No", "Based on grid only", "Based on grid and game state"],
    get: (ui) => ui.autofollow,
    set: (ui, v) => {
      ui.autofollow = v;
    },
  },
];

/**
 * What clicking `button` does to an edge currently in state `old`.
 *
 * With a mouse each button is a **2-state toggle** between its own state and
 * UNKNOWN: left flips YES on and off, right flips NO on and off, middle always
 * clears. With a **stylus** there is no right button to reach the other state
 * with, so each button becomes a **3-cycle** and a single tap can reach every
 * state — left goes `UNKNOWN → YES → NO → UNKNOWN`, right goes
 * `UNKNOWN → NO → YES → UNKNOWN`.
 *
 * That asymmetry is the whole reason for the two deliberate `switch`
 * fallthroughs in upstream's `interpret_move`; without knowing about stylus
 * mode it reads as a bug and invites "fixing". TypeScript forbids the
 * transliteration anyway (`noFallthroughCasesInSwitch`), and the explicit table
 * is clearer than the C.
 *
 * Returns `null` when the button does nothing here.
 */
export function nextLineState(
  button: number,
  old: number,
  stylus: boolean,
): LineState | null {
  switch (button) {
    case LEFT_BUTTON:
      if (old === LINE_UNKNOWN) return LINE_YES;
      if (old === LINE_YES) return stylus ? LINE_NO : LINE_UNKNOWN;
      return LINE_UNKNOWN; // old === LINE_NO
    case MIDDLE_BUTTON:
      return LINE_UNKNOWN;
    case RIGHT_BUTTON:
      if (old === LINE_UNKNOWN) return LINE_NO;
      if (old === LINE_NO) return stylus ? LINE_YES : LINE_UNKNOWN;
      return LINE_UNKNOWN; // old === LINE_YES
    default:
      return null;
  }
}

/**
 * Extend a click along any run of edges whose continuation is forced, so a
 * player tracing a corridor does not have to click every segment of it.
 *
 * Walks outwards from both ends of the clicked edge. At each dot, an edge is a
 * *candidate* continuation unless the preference excludes it: under
 * {@link AF_FIXED} every other edge at the dot counts (so the walk follows the
 * grid's own shape only), while under {@link AF_ADAPTIVE} edges the player has
 * already marked NO are skipped, so the walk also follows the corridor the
 * player has carved — except when the click itself is a NO, where excluding
 * NO edges would be self-defeating. The walk continues only while exactly one
 * candidate exists and it currently matches the clicked edge's old state.
 *
 * Accumulating into a `Set` replaces upstream's `goto autofollow_done`, whose
 * label sits at the end of the *inner* loop and therefore breaks only that
 * loop, contradicting its own comment about needing to terminate both. The
 * difference is immaterial to the resulting board — tracing a closed loop from
 * the second end merely revisits the same edges, and ops are absolute sets — so
 * this is a tidy-up, not a behaviour change. `loopy.test.ts` pins the
 * closed-loop case specifically.
 */
export function autofollowEdges(
  state: LoopyState,
  ui: Pick<LoopyUi, "autofollow">,
  clicked: GridEdge,
): Set<number> {
  const edges = new Set<number>([clicked.index]);
  const clickedState = state.lines[clicked.index];

  for (const start of [clicked.dot1, clicked.dot2]) {
    let dot: GridDot = start;
    let eThis: GridEdge = clicked;

    for (;;) {
      let eNext: GridEdge | null = null;
      let nFound = 0;
      for (let j = 0; j < dot.order; j++) {
        const candidate = dot.edges[j];
        if (candidate === eThis) continue;
        if (
          ui.autofollow === AF_FIXED ||
          clickedState === LINE_NO ||
          state.lines[candidate.index] !== LINE_NO
        ) {
          eNext = candidate;
          nFound++;
        }
      }

      if (nFound !== 1 || eNext === null) break;
      if (state.lines[eNext.index] !== clickedState) break;
      // Came all the way round a loop back to where we started.
      if (eNext === clicked) return edges;

      dot = eNext.dot1 !== dot ? eNext.dot1 : eNext.dot2;
      eThis = eNext;
      edges.add(eThis.index);
    }
  }
  return edges;
}

/**
 * The one "set this edge" implementation: what pressing `button` on `e` does,
 * autofollow included. The pointer arm and the keyboard arm of
 * {@link interpretMove} differ only in where `e` comes from, which is what
 * makes a keyboard selection the *same* move as the click on that edge rather
 * than a parallel path that agrees with it today (the Slide rule — see
 * docs/games/input.md § "Giving a drag game a keyboard").
 */
function setEdge(
  state: LoopyState,
  ui: LoopyUi,
  e: GridEdge,
  button: number,
  stylus: boolean,
): LoopyMove | null {
  const newLine = nextLineState(button, state.lines[e.index], stylus);
  if (newLine === null) return null;

  const edges =
    ui.autofollow === AF_OFF
      ? new Set<number>([e.index])
      : autofollowEdges(state, ui, e);

  return {
    kind: "set",
    ops: [...edges].map((edge) => ({ edge, state: newLine })),
  };
}

/** The edge nearest a pointer position, or `null` off the grid. */
function edgeAt(g: Grid, tileSize: number, p: Point): GridEdge | null {
  // Screen coordinates to grid coordinates. `Math.trunc`, not `Math.floor`:
  // this mirrors C's integer division, which rounds towards zero, and grid
  // coordinates are genuinely negative for several tilings (and for any click
  // in the border), where the two disagree.
  const gx = Math.trunc(((p.x - border(tileSize)) * g.tileSize) / tileSize) + g.lowestX;
  const gy = Math.trunc(((p.y - border(tileSize)) * g.tileSize) / tileSize) + g.lowestY;
  return gridNearestEdge(g, gx, gy);
}

/** The pointer button a select key stands for: Enter is the left button, Space
 * the right, Backspace/Delete the middle. The keyboard has all three, so it
 * mirrors the mouse directly; the stylus's three-state cycle is a *touch*
 * affordance, for a finger with no second button. */
function buttonForKey(button: number): number | null {
  if (button === CURSOR_SELECT) return LEFT_BUTTON;
  if (button === CURSOR_SELECT2) return RIGHT_BUTTON;
  if (isEraseKey(button)) return MIDDLE_BUTTON;
  return null;
}

function interpretMove(
  state: LoopyState,
  ui: LoopyUi,
  ds: LoopyDrawState,
  p: Point,
  rawButton: number,
): LoopyMove | null | UiUpdate {
  const g = state.grid;
  const stylus = (rawButton & MOD_STYLUS) !== 0;
  const shift = (rawButton & MOD_SHFT) !== 0;
  const button = stripModifiers(rawButton);
  const cursor = ui.cursor;

  if (isMouseDown(button)) {
    // A pointer press takes the board over: the cursor goes away, and a click
    // that sets nothing still has to repaint if it hid one.
    const hadCursor = cursor.visible;
    cursor.visible = false;
    const e = edgeAt(g, ds.tileSize, p);
    const move = e === null ? null : setEdge(state, ui, e, button, stylus);
    if (move !== null) return move;
    return hadCursor ? UI_UPDATE : null;
  }

  if (isCursorMove(button)) {
    const dot = g.dots[cursor.dot];
    if (shift) {
      // Travel: walk to the far end of the edge that best continues this way,
      // touching nothing. One dot per press, so the player can stop anywhere.
      const e = edgesByDirection(dot, button)?.[0];
      if (e === undefined) return null;
      moveCursorAlong(cursor, dot, e);
      return UI_UPDATE;
    }
    // Pick an edge: the nearest in this direction, or — on a repeat of the
    // same arrow — the next one round (`cursor.ts` on why the repeat matters).
    const e = nextEdgeFor(cursor, dot, button);
    if (e === null) return null;
    cursor.edge = e.index;
    cursor.arrow = button;
    cursor.visible = true;
    return UI_UPDATE;
  }

  const asButton = buttonForKey(button);
  if (asButton !== null) {
    const revealed = !cursor.visible;
    cursor.visible = true;
    if (cursor.edge < 0) return revealed ? UI_UPDATE : null; // nothing chosen yet
    const e = g.edges[cursor.edge];
    const move = setEdge(state, ui, e, asButton, false);
    if (move === null) return revealed ? UI_UPDATE : null;
    // Drawing a line carries the cursor to the edge's far end, so tracing a
    // loop is one Enter per edge; anything else leaves it where it is, so the
    // same key again undoes the mark just made. The drawn edge stays chosen,
    // which is what makes Enter-Enter a clean undraw too.
    if (move.ops[0].state === LINE_YES) moveCursorAlong(cursor, g.dots[cursor.dot], e);
    return move;
  }

  if (isCancelKey(button)) {
    if (!cursor.visible) return null;
    cursor.visible = false;
    return UI_UPDATE;
  }

  return null;
}

/** Carry the cursor over `e` to its far dot, keeping `e` chosen (it is incident
 * to the new dot too) and forgetting which arrow chose it, so the next arrow
 * press ranks afresh from the new dot rather than continuing an old cycle. */
function moveCursorAlong(cursor: LoopyCursor, from: GridDot, e: GridEdge): void {
  cursor.dot = farDot(e, from).index;
  cursor.edge = e.index;
  cursor.arrow = 0;
  cursor.visible = true;
}

function executeMove(state: LoopyState, move: LoopyMove): LoopyState {
  // Both arms carry the same op list and differ only in whether the fill counts
  // as a cheat, so nothing below would notice an unknown kind — hence the
  // up-front check rather than a `default` on a dispatch that does not exist.
  if (move.kind !== "set" && move.kind !== "solve") {
    return assertNever(move, "loopy: executeMove");
  }

  const next = cloneState(state);
  for (const op of move.ops) {
    if (op.edge < 0 || op.edge >= next.grid.numEdges) {
      throw new Error(`loopy: move names edge ${op.edge}, out of range`);
    }
    next.lines[op.edge] = op.state;
  }
  if (move.kind === "solve") next.cheated = true;
  // `solved` is sticky, as upstream: it is only ever set, never cleared, so
  // undoing past the winning move leaves the game recorded as having been won.
  if (checkCompletion(next)) next.completed = true;
  return next;
}

/** Fill in the solution. Solves from the **initial** state, not the player's —
 * a partly-filled board with a mistake on it would otherwise poison the run. */
function solve(orig: LoopyState, _curr: LoopyState): SolveResult<LoopyMove> {
  const ss = solveGame(orig, DIFF_MAX);
  const ops: LoopyOp[] = [];
  for (let i = 0; i < ss.state.lines.length; i++) {
    const line = ss.state.lines[i];
    if (line !== LINE_UNKNOWN) ops.push({ edge: i, state: line as LineState });
  }
  // Upstream returns the solver's best effort whatever its verdict — an
  // ambiguous or incomplete result still fills in everything it did prove,
  // which is more useful to a stuck player than an error message.
  return { ok: true, move: { kind: "solve", ops } };
}

/** Loopy's difficulty contract (`engine/difficulty.ts`). Its generator gates
 * every clue removal on `"solved"` specifically: an `"ambiguous"` verdict means
 * the solver only got there by trying a loop closure, which is not a deduction
 * a player could be expected to make. `solveGame` is used directly rather than
 * `gameHasUniqueSoln`, which throws on a contradiction because the generator
 * only ever asks it about boards derived from a real loop — a probe has no such
 * guarantee, and a contradiction is a verdict here, not a porting bug. */
const difficulty: DifficultyContract<LoopyParams> = {
  tiers: LOOPY_DIFFS.map((d) => d.title),
  tierOf: (p) => p.diff,
  withTier: (p, tier) => ({ ...p, diff: tier }),
  solveAtCap: (p, desc, cap) => {
    const ss = solveGame(newState(p, desc), cap);
    if (ss.status === "mistake") return "impossible";
    return ss.status === "solved" ? "solved" : "unsolved";
  },
};

export const loopyGame: Game<
  LoopyParams,
  LoopyState,
  LoopyMove,
  LoopyUi,
  LoopyDrawState
> = {
  id: "loopy",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  // True in the sense the interface means it — Loopy *has* a text format — but
  // it only covers the square tiling, so `textFormat` returns `undefined` for
  // the other seventeen (upstream's `game_can_format_as_text_now(params)`).
  canFormatAsText: true,
  // Loopy genuinely reads the stylus bit; see `nextLineState`.
  wantsStylusModifier: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig,

  // The type-summary formatter for a custom (non-preset) game keys off the
  // same config names the C's `game_configure` used, and the worker adapter
  // supplies only `width`/`height` on its own. Values must be the numeric
  // choice indices, not their rendered names — the formatter does the lookup.
  describeParams: (p) => ({
    width: p.w,
    height: p.h,
    "grid-type": p.type,
    difficulty: p.diff,
  }),

  newDesc,
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  // The midend upgrades this to "solved-with-help" itself when Solve was used.
  status: (s) => (s.completed ? "solved" : "ongoing"),
  solve,
  difficulty,
  textFormat,
  prefs,

  colours,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize,
  newDrawState,
  redraw: (
    dr: GameDrawing,
    ds: LoopyDrawState,
    prev: LoopyState | null,
    s: LoopyState,
    dir: number,
    ui: LoopyUi,
    animTime: number,
    flashTime: number,
  ) => redraw(dr, ds, prev, s, dir, ui, animTime, flashTime),
  flashLength: (a, b) => winFlash(a, b, FLASH_TIME),
};

registerGame(loopyGame);
