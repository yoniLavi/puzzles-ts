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
 * **Mouse only.** Upstream gives Loopy no keyboard cursor and no drag, so
 * `gridNearestEdge` is the entire input path: left cycles an edge towards YES,
 * right towards NO, middle clears. Loopy does genuinely read `MOD_STYLUS`, and
 * `wantsStylusModifier` is set for it — see {@link nextLineState}.
 *
 * The port is split across `params.ts`, `state.ts`, `dlines.ts`, `solver.ts`,
 * `generator.ts`, `grid-build.ts` and `render.ts`; this file is the `Game` glue
 * plus input handling.
 */
import type { Point } from "../../../puzzle/types.ts";
import type {
  Game,
  GameDrawing,
  GamePref,
  SolveResult,
  UiUpdate,
} from "../../engine/game.ts";
import type { GridDot, GridEdge } from "../../engine/grid.ts";
import { gridNearestEdge } from "../../engine/grid.ts";
import {
  LEFT_BUTTON,
  MIDDLE_BUTTON,
  MOD_STYLUS,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import { newDesc } from "./generator.ts";
import {
  DIFF_MAX,
  decodeParams,
  defaultParams,
  encodeParams,
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
}

function newUi(_state: LoopyState): LoopyUi {
  // Upstream also consults `LOOPY_FAINT_LINES` / `LOOPY_AUTOFOLLOW` environment
  // variables here (`legacy_prefs_override`), a pre-preferences-dialog relic
  // with no meaning in a browser. Dropped; the prefs below are the whole story.
  return { drawFaintLines: true, autofollow: AF_OFF };
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
  ui: LoopyUi,
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

function interpretMove(
  state: LoopyState,
  ui: LoopyUi,
  ds: LoopyDrawState | null,
  p: Point,
  rawButton: number,
): LoopyMove | null | UiUpdate {
  const g = state.grid;
  const tileSize = ds?.tileSize ?? PREFERRED_TILE_SIZE;
  const stylus = (rawButton & MOD_STYLUS) !== 0;
  const button = stripModifiers(rawButton);

  // Screen coordinates to grid coordinates. `Math.trunc`, not `Math.floor`:
  // this mirrors C's integer division, which rounds towards zero, and grid
  // coordinates are genuinely negative for several tilings (and for any click
  // in the border), where the two disagree.
  const gx = Math.trunc(((p.x - border(tileSize)) * g.tileSize) / tileSize) + g.lowestX;
  const gy = Math.trunc(((p.y - border(tileSize)) * g.tileSize) / tileSize) + g.lowestY;

  const e = gridNearestEdge(g, gx, gy);
  if (e === null) return null;

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

function executeMove(state: LoopyState, move: LoopyMove): LoopyState {
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
  if (checkCompletion(next)) next.solved = true;
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
  status: (s) => (s.solved ? "solved" : "ongoing"),
  solve,
  textFormat,
  prefs,

  colours,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize,
  newDrawState,
  redraw: (
    dr: GameDrawing,
    ds: LoopyDrawState | null,
    prev: LoopyState | null,
    s: LoopyState,
    dir: number,
    ui: LoopyUi,
    animTime: number,
    flashTime: number,
  ) => redraw(dr, ds, prev, s, dir, ui, animTime, flashTime),
  flashLength: (a, b) =>
    !a.solved && b.solved && !a.cheated && !b.cheated ? FLASH_TIME : 0,
};

registerGame(loopyGame);
