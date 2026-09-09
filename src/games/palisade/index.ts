/**
 * Palisade — native TS port of `palisade.c` (Nikoli's "Five Cells").
 * Numeric clues count the walls around a cell; the player draws walls
 * so the grid divides into connected regions of exactly `k` cells, each
 * clue equal to its cell's wall count.
 *
 * Edges are three-valued (wall / no-wall-mark / unknown) and shared
 * between two cells, so each edit records both sides; input picks the
 * edge nearest the click (left toggles wall, right toggles no-wall mark)
 * and there is a half-grid keyboard cursor.
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
import type { Color, ConfigValues, Point, Size } from "../../engine/types.ts";
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

// Edge states for the click toggle cycle.

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
    ds.tilesize,
  );
  if (r === null) return null;
  return r === "ui" ? UI_UPDATE : { type: "edges", edits: r };
}

// --- flash -----------------------------------------------------------------

// Palisade's flash rule *is* the collection's — `winFlash` adopted it rather
// than the reverse (`unify-cross-game-vocabulary`). What Palisade still does
// differently is upstream of the flash: `executeMove` recomputes `completed`
// every move instead of latching it, so breaking and re-solving a board is a
// genuine unsolved→solved transition and the celebration fires again.
function flashLength(
  oldState: PalisadeState,
  newState_: PalisadeState,
  _dir: number,
  _ui: PalisadeUi,
): number {
  return winFlash(oldState, newState_, FLASH_TIME);
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

/** How many *further* sides a clue leaves open once the edge to its
 * neighbor is known open: its `clue` walls then all sit on its other three
 * sides, so `3 - clue` sides still lead into the same region. Clamped at
 * zero because `k === 1` admits a clue of 4, for which the premise is
 * vacuous rather than negative. */
function otherOpenSides(clue: number): string {
  const n = Math.max(0, 3 - clue);
  return n === 0 ? "no other side" : n === 1 ? "1 other side" : `${n} other sides`;
}

/** Narrate one leg of a deduction, phrased as advice (the move has *not*
 * been applied yet: "must be a wall" / "can't be a wall", never "is a
 * wall" / "has none"). `leg`/`groupSize` describe the firing this edge
 * belongs to: a multi-edge deduction (`equivalentEdges` pair,
 * `numberExhausted` sweep) narrates the coupling on its first leg and a
 * short continuation on the rest. The referenced cells/edges are
 * highlighted alongside (see `buildStep`), so "both highlighted edges"
 * and "the same region" have a visible referent. */
function explain(
  fe: ForcedEdge,
  clues: Int8Array,
  w: number,
  k: number,
  leg: number,
  groupSize: number,
): string {
  const c = clues[fe.y * w + fe.x];

  // Continuation legs of a multi-edge firing: short and kind-specific
  // (the first leg already gave the full reason, still on screen).
  if (leg > 0) {
    return fe.kind === "wall"
      ? "…and this edge must be a wall too."
      : "…and this edge can't be a wall either.";
  }

  const multi = groupSize > 1;
  switch (fe.rule) {
    // Upstream's `solver_connected_clues_versus_region_size`, whose bound
    // the narration has to *show* rather than assert: if the shared edge
    // were open, each clue's walls would all sit on its other three sides,
    // leaving `3 - clue` sides leading further into the same region. Two
    // orthogonally adjacent cells share no common orthogonal neighbor, so
    // those two sets are disjoint and the region holds at least
    // `2 + (3 - c) + (3 - d) = 8 - c - d` cells.
    case "cluesVersusRegionSize": {
      const j = (fe.y + DY[fe.dir]) * w + (fe.x + DX[fe.dir]);
      const d = clues[j];
      // Two 3s are the case where the bound is *exact* rather than a
      // minimum: each keeps one side open and it has to be the shared one,
      // so the region would be those two cells and nothing else. `8-3-3`
      // never exceeds `k`, so the general arm below cannot reach this.
      if (c === 3 && d === 3) {
        return `Two 3s each keep just one side open, and it has to be the one they share, so their region would be exactly 2 cells. Regions here hold ${k}, so the edge between them must be a wall.`;
      }
      const counts =
        c === d
          ? `These clues each leave ${otherOpenSides(c)} open`
          : `Clue ${c} leaves ${otherOpenSides(c)} open and clue ${d} leaves ${otherOpenSides(d)} open`;
      return `${counts}, so a shared region would need at least ${8 - c - d} cells. Regions here hold ${k}, so the edge between them must be a wall.`;
    }
    case "numberExhausted":
      if (multi) {
        return fe.kind === "wall"
          ? `Clue ${c} reaches its count only if every remaining edge is a wall, so draw them all.`
          : `Clue ${c} already has all its walls, so its remaining edges can't be walls. Clear them.`;
      }
      return fe.kind === "wall"
        ? `Clue ${c} needs all its remaining edges to be walls, so this one must be a wall.`
        : `Clue ${c} already has all its walls, so this edge can't be one.`;
    // Both region-size rules carry their evidence cells, so the narration
    // states the sizes it is comparing rather than "the target size".
    case "notTooBig": {
      const joined = fe.cells?.length;
      return joined === undefined
        ? `Joining these two regions would leave more than the ${k} cells a region holds, so this edge must be a wall.`
        : `Joining these two regions would make ${joined} cells, but a region here holds ${k}, so this edge must be a wall.`;
    }
    case "notTooSmall": {
      const size = fe.cells?.length;
      return size === undefined
        ? `This region is short of its ${k} cells and has just one way left to grow, so this edge can't be a wall.`
        : `This region has ${size} of its ${k} cells and just one way left to grow, so this edge can't be a wall.`;
    }
    case "noDanglingEdges":
      return "A wall can't stop in mid-air at this corner, so this edge must be a wall.";
    case "equivalentEdges":
      // The crux: both highlighted edges border the same connected region,
      // so the clue cell is either inside all of it (both edges open) or
      // walled off from all of it (both walled), and it can't do one of
      // each. That coupling is what makes the clue's count force the
      // edges; an earlier narration omitted it and read as a non-sequitur.
      if (multi) {
        return fe.kind === "wall"
          ? `Both edges border the same region, so they share a fate: both walls or both open. Leaving both open would leave clue ${c} short of walls, so both must be walls.`
          : `Both edges border the same region, so they share a fate: both walls or both open. Walling both would exceed clue ${c}, so neither can be a wall.`;
      }
      // Rare post-dedup singleton (the partner edge was already shown).
      return fe.kind === "wall"
        ? `This edge borders a region clue ${c} can't fully open, so it must be a wall.`
        : `This edge borders a region clue ${c} can't wall off, so it can't be a wall.`;
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
  if (m.type !== "edges" || step.move.type !== "edges") return "off";
  const hl = step.highlights as PalisadeHint | undefined;
  if (!hl) return "off";
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

  newDesc: (p, rng) => newDesc(p, rng),
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

  colors: (defaultBackground: Color): Color[] => colors(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: PalisadeParams, ts: number): Size => computeSize(p, ts),
  setTileSize: (ds, ts) => {
    ds.tilesize = ts;
  },
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(palisadeGame);
