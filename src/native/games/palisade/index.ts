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
import type { Colour, ConfigValues, Point, Size } from "../../../puzzle/types.ts";
import {
  type Game,
  type HintResult,
  type HintStep,
  type HintTrackVerdict,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { dimensionParamConfig, parseConfigInt } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  cursorDelta,
  LEFT_BUTTON,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import {
  colours,
  computeSize,
  FLASH_TIME,
  fromCoord,
  margin,
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
  BORDER,
  BORDER_MASK,
  DISABLED,
  DX,
  DY,
  decodeParams,
  defaultParams,
  encodeParams,
  executeMove,
  FLIP,
  newState,
  outOfBounds,
  type PalisadeHint,
  type PalisadeMistake,
  type PalisadeMove,
  type PalisadeParams,
  type PalisadeState,
  type PalisadeUi,
  presets,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

// Edge states for the click toggle cycle.
const MAYBE = 0;
const YES = 1;
const NO = 2;

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(Math.max(v, lo), hi);

function newUi(_state: PalisadeState): PalisadeUi {
  return { x: 1, y: 1, show: false };
}

function paramsOf(state: PalisadeState): PalisadeParams {
  return { w: state.w, h: state.h, k: state.k };
}

// --- input -----------------------------------------------------------------

function interpretMove(
  state: PalisadeState,
  ui: PalisadeUi,
  ds: PalisadeDrawState | null,
  p: Point,
  rawButton: number,
): PalisadeMove | null | UiUpdate {
  const { w, h, borders } = state;
  const button = stripModifiers(rawButton);
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;

  if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
    const gx = fromCoord(p.x, ts);
    const gy = fromCoord(p.y, ts);
    if (outOfBounds(gx, gy, w, h)) return null;

    // Find the edge of cell (gx,gy) closest to the click.
    let possible = BORDER_MASK;
    let px = (p.x - margin(ts)) % ts;
    let py = (p.y - margin(ts)) % ts;
    possible &= ~(2 * px < ts ? BORDER(1) : BORDER(3)); // R : L
    possible &= ~(2 * py < ts ? BORDER(2) : BORDER(0)); // D : U
    px = Math.min(px, ts - px);
    py = Math.min(py, ts - py);
    possible &= ~(px < py ? BORDER(0) | BORDER(2) : BORDER(3) | BORDER(1));

    let dir = 0;
    for (; dir < 4 && BORDER(dir) !== possible; dir++);
    if (dir === 4) return null; // not exactly one edge

    ui.x = clamp(2 * gx + 1 + DX[dir], 1, 2 * w - 1);
    ui.y = clamp(2 * gy + 1 + DY[dir], 1, 2 * h - 1);

    const hx = gx + DX[dir];
    const hy = gy + DY[dir];
    if (outOfBounds(hx, hy, w, h)) return null;

    ui.show = false;

    const i = gy * w + gx;
    const cur =
      borders[i] & BORDER(dir) ? YES : borders[i] & DISABLED(BORDER(dir)) ? NO : MAYBE;
    const next =
      button === LEFT_BUTTON ? (cur === YES ? MAYBE : YES) : cur === NO ? MAYBE : NO;

    let gdiff = 0;
    if ((cur === YES) !== (next === YES)) gdiff |= BORDER(dir);
    if ((cur === NO) !== (next === NO)) gdiff |= DISABLED(BORDER(dir));
    if (gdiff === 0) return null;

    const hdiff =
      ((gdiff >> dir) << FLIP(dir)) | ((gdiff >> (dir + 4)) << (FLIP(dir) + 4));
    return {
      type: "edges",
      edits: [
        { x: gx, y: gy, flag: gdiff },
        { x: hx, y: hy, flag: hdiff },
      ],
    };
  }

  const d = cursorDelta(button);
  if (d) {
    ui.show = true;
    ui.x = clamp(ui.x + d.dx, 1, 2 * w - 1);
    ui.y = clamp(ui.y + d.dy, 1, 2 * h - 1);
    return UI_UPDATE;
  }

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    const px = ui.x % 2;
    const py = ui.y % 2;
    const gx = Math.floor(ui.x / 2);
    const gy = Math.floor(ui.y / 2);
    const dir = px === 0 ? 3 : 0; // left : up
    const hx = gx + DX[dir];
    const hy = gy + DY[dir];
    const i = gy * w + gx;

    if (!ui.show) {
      ui.show = true;
      return UI_UPDATE;
    }
    if (px === py) return null; // a corner or centre: no edge

    const sel2 = button === CURSOR_SELECT2 ? 1 : 0;
    const key =
      sel2 |
      (((borders[i] & BORDER(dir)) >> dir) << 1) |
      (((borders[i] & DISABLED(BORDER(dir))) >> dir) >> 2);

    // key: MAYBE_LEFT=0, MAYBE_RIGHT=1, ON_LEFT=2, ON_RIGHT=3, OFF_LEFT=4, OFF_RIGHT=5
    if (key === 0 || key === 2 || key === 3) {
      return {
        type: "edges",
        edits: [
          { x: gx, y: gy, flag: BORDER(dir) },
          { x: hx, y: hy, flag: BORDER(FLIP(dir)) },
        ],
      };
    }
    return {
      type: "edges",
      edits: [
        { x: gx, y: gy, flag: DISABLED(BORDER(dir)) },
        { x: hx, y: hy, flag: DISABLED(BORDER(FLIP(dir))) },
      ],
    };
  }

  return null;
}

// --- flash -----------------------------------------------------------------

function flashLength(
  oldState: PalisadeState,
  newState_: PalisadeState,
  _dir: number,
  _ui: PalisadeUi,
): number {
  // Flash whenever a *player* move brings the board into a solved state —
  // including a fresh manual completion after a prior Solve (the
  // owner-requested behaviour). The Solve command itself must not flash;
  // it's the move where `cheated` flips false→true, so suppress exactly
  // that transition. (`completed` is recomputed every move — see
  // `executeMove` — so re-breaking and re-solving is a real transition.)
  const becameSolved = newState_.completed && !oldState.completed;
  const thisMoveWasSolve = newState_.cheated && !oldState.cheated;
  if (becameSolved && !thisMoveWasSolve) return FLASH_TIME;
  return 0;
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

/** Narrate one leg of a deduction, phrased as advice (the move has *not*
 * been applied yet — "must be a wall" / "can't be a wall", never "is a
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
    case "cluesVersusRegionSize": {
      const j = (fe.y + DY[fe.dir]) * w + (fe.x + DX[fe.dir]);
      return `Clues ${c} and ${clues[j]} can't share a region, so the edge between them must be a wall.`;
    }
    case "numberExhausted":
      if (multi) {
        return fe.kind === "wall"
          ? `Clue ${c} reaches its count only if every remaining edge is a wall — draw them all.`
          : `Clue ${c} already has all its walls, so its remaining edges can't be walls — clear them.`;
      }
      return fe.kind === "wall"
        ? `Clue ${c} needs all its remaining edges to be walls, so this one must be a wall.`
        : `Clue ${c} already has all its walls, so this edge can't be one.`;
    case "notTooBig":
      return "Joining these regions would exceed the target size, so this edge must be a wall.";
    case "notTooSmall":
      return "This region is too small and can only grow this way, so this edge can't be a wall.";
    case "noDanglingEdges":
      return "A wall can't stop in mid-air at this corner, so this edge must be a wall.";
    case "equivalentEdges":
      // The crux: both highlighted edges border the same connected region,
      // so the clue cell is either inside all of it (both edges open) or
      // walled off from all of it (both walled) — it can't do one of each.
      // That coupling is what makes the clue's count force the edges; the
      // earlier narration omitted it and read as a non-sequitur.
      if (multi) {
        return fe.kind === "wall"
          ? `Both edges border the same region, so they share a fate: both walls or both open. Leaving both open would leave clue ${c} short of walls — so both must be walls.`
          : `Both edges border the same region, so they share a fate: both walls or both open. Walling both would exceed clue ${c} — so neither can be a wall.`;
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
    explanation: explain(fe, clues, w, leg, group.length),
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
  if (state.completed) return { ok: false, error: "This board is already solved." };
  if (findMistakes(state).length > 0)
    return {
      ok: false,
      error: "There's a mistake on the board — fix it before asking for a hint.",
    };
  const forced = deduceForcedEdges(paramsOf(state), state.clues, state.borders);
  if (forced.length === 0)
    return { ok: false, error: "I can't find a deduction from here." };

  // Split the flat, discovery-ordered list into contiguous runs of one
  // firing (a firing's surviving edges stay contiguous after dedup), and
  // emit one journey per run.
  const steps: HintStep<PalisadeMove, PalisadeHint>[] = [];
  for (let g = 0; g < forced.length; ) {
    let end = g + 1;
    while (end < forced.length && forced[end].group === forced[g].group) end++;
    const groupEdges = forced.slice(g, end);
    for (let leg = 0; leg < groupEdges.length; leg++) {
      steps.push(buildStep(groupEdges, leg, state.clues, state.w));
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
  paramConfig: [
    ...dimensionParamConfig<PalisadeParams>(),
    {
      kw: "region-size",
      name: "Region size",
      type: "string",
      get: (p) => String(p.k),
      set: (p, v) => {
        p.k = parseConfigInt(v);
      },
    },
  ],
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

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
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
