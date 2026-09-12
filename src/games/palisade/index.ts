/**
 * Palisade — native TS port of `palisade.c` (Nikoli's "Five Cells").
 * Numeric clues count the walls around a cell; the player draws walls
 * so the grid divides into connected regions of exactly `k` cells, each
 * clue equal to its cell's wall count.
 *
 * Input picks the edge nearest the click (left toggles wall, right toggles
 * no-wall mark), and there is a half-grid keyboard cursor.
 */

import {
  BORDER,
  BORDER_MASK,
  DISABLED,
  DX,
  DY,
  FLIP,
  interpretBorderGridInput,
} from "../../engine/border-grid.ts";
import { winFlash } from "../../engine/flash.ts";
import {
  type Game,
  type HintResult,
  type HintStep,
  type HintTrackVerdict,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { commonHintRefusal, DEDUCTION_EXHAUSTED } from "../../engine/hint-refusal.ts";
import { newCursor, stripModifiers } from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { ConfigValues, Point } from "../../engine/types.ts";
import { say } from "./hint-text.ts";
import {
  colors,
  computeSize,
  FLASH_TIME,
  newDrawState,
  type PalisadeDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
} from "./render.ts";
import {
  deduceForcedEdges,
  type ForcedEdge,
  newDesc,
  solveToBorders,
} from "./solver.ts";
import {
  decodeParams,
  defaultParams,
  encodeParams,
  executeMove,
  newState,
  type PalisadeHint,
  type PalisadeMistake,
  type PalisadeMove,
  type PalisadeParams,
  type PalisadeState,
  type PalisadeUi,
  paramConfig,
  presets,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

function newUi(_state: PalisadeState): PalisadeUi {
  return { cursor: newCursor(1, 1) };
}

function paramsOf(state: PalisadeState): PalisadeParams {
  return { w: state.w, h: state.h, k: state.k };
}

// --- input -----------------------------------------------------------------

function interpretMove(
  state: PalisadeState,
  ui: PalisadeUi,
  ds: PalisadeDrawState,
  p: Point,
  rawButton: number,
): PalisadeMove | null | UiUpdate {
  const r = interpretBorderGridInput(
    state,
    ui,
    p,
    stripModifiers(rawButton),
    ds.tileSize,
  );
  if (r === null) return null;
  return r === "ui" ? UI_UPDATE : { type: "edges", edits: r };
}

// --- mistakes --------------------------------------------------------------

function findMistakes(state: PalisadeState): readonly PalisadeMistake[] {
  const sol = solveToBorders(paramsOf(state), state.clues);
  if (!sol) return [];
  const { w, h, borders } = state;
  const out: PalisadeMistake[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      for (let dir = 0; dir < 4; dir++) {
        const b = BORDER(dir);
        const solWall = sol[i] & b;
        if (borders[i] & b && !solWall) out.push({ x, y, dir });
        else if (borders[i] & DISABLED(b) && solWall) out.push({ x, y, dir });
      }
    }
  }
  return out;
}

// --- hint ------------------------------------------------------------------

/** Narrate one leg of a deduction. A multi-edge firing (`equivalentEdges`
 * pair, `numberExhausted` sweep) narrates the coupling on its first leg and a
 * short continuation on the rest. The words, and why each reads as it does,
 * are [`hint-text.ts`](./hint-text.ts)'s. */
function explain(
  fe: ForcedEdge,
  clues: Int8Array,
  w: number,
  k: number,
  leg: number,
  groupSize: number,
): string {
  if (leg > 0) return say.continuation(fe.kind);
  const c = clues[fe.y * w + fe.x];
  const multi = groupSize > 1;
  switch (fe.rule) {
    case "cluesVersusRegionSize": {
      // The clue on the other side of the edge.
      const d = clues[(fe.y + DY[fe.dir]) * w + (fe.x + DX[fe.dir])];
      return say.cluesVersusRegionSize(c, d, k);
    }
    case "numberExhausted":
      return say.numberExhausted(c, fe.kind, multi);
    case "notTooBig":
      return say.notTooBig(fe.cells?.length, k);
    case "notTooSmall":
      return say.notTooSmall(fe.cells?.length, k);
    case "noDanglingEdges":
      return say.noDanglingEdges;
    case "equivalentEdges":
      return say.equivalentEdges(c, fe.kind, multi);
  }
}

/** Translate one leg of a firing into a narrated, highlighted hint step:
 * the two-sided `edges` edit that sets this edge, the firing's still-to-do
 * edges as sibling highlights, the referenced cells (a clue pair or the
 * region), and `continuesPrevious` on every leg past the first — so a
 * multi-edge deduction reads and plays as one journey. */
function buildStep(
  group: ForcedEdge[],
  leg: number,
  clues: Int8Array,
  w: number,
  k: number,
): HintStep<PalisadeMove, PalisadeHint> {
  const fe = group[leg];
  const { x, y, dir, kind } = fe;
  const hx = x + DX[dir];
  const hy = y + DY[dir];
  const bit = kind === "wall" ? BORDER(dir) : DISABLED(BORDER(dir));
  const flip = kind === "wall" ? BORDER(FLIP(dir)) : DISABLED(BORDER(FLIP(dir)));
  // Siblings = the firing's edges not yet acted on, so leg 0 shows the
  // whole set and the orange siblings drop off as the legs complete.
  const siblings = group.slice(leg + 1);
  return {
    move: {
      type: "edges",
      edits: [
        { x, y, flag: bit },
        { x: hx, y: hy, flag: flip },
      ],
    },
    explanation: explain(fe, clues, w, k, leg, group.length),
    ...(leg > 0 ? { continuesPrevious: true } : {}),
    highlights: {
      x,
      y,
      dir,
      kind,
      cells: fe.cells?.map((i) => ({ x: i % w, y: Math.floor(i / w) })),
      edges: siblings.length
        ? siblings.map((s) => ({ x: s.x, y: s.y, dir: s.dir }))
        : undefined,
    },
  };
}

/** Compute the next deductions as a hint plan, seeded from the player's
 * current borders and no-wall marks. Refuses on a solved board or one
 * carrying a mistake, so a hint is never built on a wrong wall. Edges
 * forced by one firing (the `equivalentEdges` pair, a `numberExhausted`
 * sweep) form one multi-leg journey; distinct firings stay separate
 * hints. */
function hint(state: PalisadeState): HintResult<PalisadeMove, PalisadeHint> {
  const refusal = commonHintRefusal(state.completed, findMistakes(state).length);
  if (refusal) return refusal;
  const forced = deduceForcedEdges(paramsOf(state), state.clues, state.borders);
  if (forced.length === 0) return { ok: false, error: DEDUCTION_EXHAUSTED };

  // Split the flat, discovery-ordered list into contiguous runs of one
  // firing (a firing's surviving edges stay contiguous after dedup), and
  // emit one journey per run.
  const steps: HintStep<PalisadeMove, PalisadeHint>[] = [];
  for (let g = 0; g < forced.length; ) {
    let end = g + 1;
    while (end < forced.length && forced[end].group === forced[g].group) end++;
    const groupEdges = forced.slice(g, end);
    for (let leg = 0; leg < groupEdges.length; leg++) {
      steps.push(buildStep(groupEdges, leg, state.clues, state.w, state.k));
    }
    g = end;
  }
  return { ok: true, steps };
}

/** The player's move completes the step iff its edit on the hinted cell
 * toggles the hinted bit *on*. Side-agnostic (the shared edge is always
 * recorded on the hinted cell's `dir` side) and button-checked (a
 * wrong-button click sets the other bit → `"off"`). */
function hintKeepTrack(
  m: PalisadeMove,
  step: HintStep<PalisadeMove>,
  state: PalisadeState,
): HintTrackVerdict {
  if (m.type !== "edges") return "off";
  const hl = step.highlights as PalisadeHint;
  const i = hl.y * state.w + hl.x;
  const bit = hl.kind === "wall" ? BORDER(hl.dir) : DISABLED(BORDER(hl.dir));
  for (const e of m.edits) {
    if (e.x === hl.x && e.y === hl.y) {
      return (state.borders[i] ^ e.flag) & bit ? "completed" : "off";
    }
  }
  return "off";
}

// --- Game object -----------------------------------------------------------

export const palisadeGame: Game<
  PalisadeParams,
  PalisadeState,
  PalisadeMove,
  PalisadeUi,
  PalisadeDrawState,
  PalisadeMistake
> = {
  id: "palisade",
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
  describeParams: (p): ConfigValues => ({
    width: String(p.w),
    height: String(p.h),
    "region-size": String(p.k),
  }),

  newDesc,
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve(orig, _curr) {
    const sol = solveToBorders(paramsOf(orig), orig.clues);
    if (!sol) return { ok: false, error: "Sorry, I can't solve this puzzle" };
    const full = Array.from(sol, (b) => (b & BORDER_MASK) | DISABLED(~b & BORDER_MASK));
    return { ok: true, move: { type: "solve", borders: full } };
  },

  findMistakes,
  hint,
  hintKeepTrack,

  textFormat,
  statusbarText: (s) => `Region size: ${s.k}`,

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize: (ds, ts) => {
    ds.tileSize = ts;
  },
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength: (a, b) => winFlash(a, b, FLASH_TIME),
};

registerGame(palisadeGame);
