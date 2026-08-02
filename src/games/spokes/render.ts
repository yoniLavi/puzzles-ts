/**
 * Spokes rendering — port of `game_redraw` from `puzzles/unreleased/spokes.c`.
 *
 * Each cell holds one hub: a filled circle carrying a small dot for every
 * spoke that could exist, the clue digit in the middle, and a thick line out
 * to each connected neighbour. A hub whose clue is satisfied greys out
 * ({@link COL_SATISFIED}); one whose group can draw no further line while the
 * board is still in pieces gets a red rim; the hub being dragged from (or to)
 * turns green.
 *
 * **The corner protocol is the one subtle thing here.** A diagonal line runs
 * through the point where four cells meet, and each of those cells draws its
 * own half clipped to itself — so a cell repainting on its own would erase the
 * neighbour's half. Upstream's answer, kept verbatim: a cell repaint clears a
 * plus-shape that leaves its four {@link CORNER}-sized corners untouched, and
 * a second pass redraws just the 2·`CORNER` box around each grid corner
 * whenever the diagonal through it changed (or a repainted cell invalidated
 * it). That is also why the keyboard cursor stays a **blitter** rather than
 * folding into the per-cell cache key as the playbook's default suggests: at
 * its diagonal offsets the cursor overlaps exactly the corner squares a cell
 * repaint deliberately does *not* clear, so a key-folded cursor could not be
 * erased reliably.
 */

import { BLUE, PURPLE } from "../../engine/colours.ts";
import { drawRectCorners } from "../../engine/draw.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { OverlaySidecar } from "../../engine/overlay-sidecar.ts";
import {
  ERROR,
  GRID_DARK,
  HELD,
  HINT_ACTION,
  HINT_EVIDENCE,
  INK,
  PAPER,
} from "../../engine/palette.ts";
import { spokesSatisfied } from "../../engine/palette-games.ts";
import type { Colour, Point, Size } from "../../engine/types.ts";
import type { SpokesHint } from "./index.ts";
import { SpokesScratch, spokesFindIsolated, spokesSolverRecount } from "./solver.ts";
import {
  DIR_BOTLEFT,
  DIR_BOTRIGHT,
  getSpoke,
  SPOKE_DIRS,
  SPOKE_EMPTY,
  SPOKE_HIDDEN,
  SPOKE_LINE,
  SPOKE_MARKED,
  type SpokesMistake,
  type SpokesMove,
  type SpokesParams,
  type SpokesState,
  type SpokesUi,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 72;

export const FLASH_FRAME = 0.12;
export const FLASH_TIME = FLASH_FRAME * 5;

/** Half-width of the box around a grid corner that the diagonal pass owns.
 * A cell repaint leaves squares of this size in its four corners alone. */
const CORNER = 8;

/** Below this tile size the corner pass is skipped, exactly as upstream — the
 * box would be a large fraction of a cell and would eat the spoke dots. */
const MIN_CORNER_TILESIZE = 24;

/** Width of the `COL_HINT_CELL` evidence ring outside the hub rim. */
const HINT_RING_WIDTH = 5;

const SQRTHALF = Math.SQRT1_2;

// --- palette (index-for-index with the upstream COL_* enum) ------------------

export const COL_BACKGROUND = 0;
export const COL_BORDER = 1;
export const COL_HOLDING = 2;
export const COL_LINE = 3;
export const COL_MARK = 4;
/** Upstream's white; here it survives only as the completion-flash colour —
 * see {@link COL_SATISFIED} for why it no longer fills a finished hub. */
export const COL_DONE = 5;
export const COL_ERROR = 6;
export const COL_CURSOR = 7;
/**
 * Fill for a hub that already has as many spokes as its clue asks for — the
 * "stop thinking about this one" cue, the same fork aid Bridges greys a
 * satisfied island with.
 *
 * Upstream nominally has this cue already (it fills such a hub with pure white)
 * but it is invisible in practice: against a near-white light-mode background
 * it is barely a shade, and in dark mode `puzzle-view.ts` hands the game *pure
 * white* as its background, so the "highlight" is exactly the background. A
 * clear step down from the background reads in both modes, since the dark-mode
 * adaptation inverts grey lightness about the real background.
 */
export const COL_SATISFIED = 8;
/** The forced spoke(s) of the displayed hint — drawn like a line, at hint
 * colour, so the player sees *which* spoke to act on without the move being
 * performed for them (playbook §5.1). Every leg of one firing shares it. */
export const COL_HINT = 9;
/** A ring around each evidence hub the hint reasons over (a light blue, the
 * cross-game "shade the evidence" colour — playbook §5.2). */
export const COL_HINT_CELL = 10;

/** How far {@link COL_SATISFIED} steps away from the background. Large enough
 * to read at a glance across a board, small enough to keep the black clue digit
 * and the spoke dots legible on top of it. */

/**
 * Upstream takes the frontend background as-is (no `game_mkhighlight`) and
 * hard-codes the rest. Deliberately *not* luminance-adjusted for dark mode:
 * `puzzle-view.ts` passes pure white as the background there and adapts the
 * whole returned palette itself, so a second adaptation here would fight the
 * layer that owns the concern (playbook §3.3).
 */
export function colours(defaultBackground: Colour): Colour[] {
  const out: Colour[] = [];
  out[COL_BACKGROUND] = defaultBackground;
  out[COL_BORDER] = GRID_DARK;
  out[COL_HOLDING] = HELD;
  out[COL_LINE] = INK;
  out[COL_MARK] = BLUE;
  out[COL_DONE] = PAPER;
  out[COL_ERROR] = ERROR;
  out[COL_CURSOR] = PURPLE;
  out[COL_SATISFIED] = spokesSatisfied(defaultBackground);
  out[COL_HINT] = HINT_ACTION;
  out[COL_HINT_CELL] = HINT_EVIDENCE;
  return out;
}

// --- geometry ---------------------------------------------------------------

/** Spokes has no border at all: the board is exactly `w × h` tiles, and a hub
 * sits at the centre of its tile. */
export function computeSize(p: SpokesParams, ts: number): Size {
  return { w: p.w * ts, h: p.h * ts };
}

/** Centre pixel of cell coordinate `v` along one axis (upstream `TOCOORD`). */
export function toCoord(v: number, ts: number): number {
  return v * ts + ((ts / 2) | 0);
}

// --- draw state -------------------------------------------------------------

export interface SpokesDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  h: number;
  /** Recount scratch, so the renderer can colour hubs by line/mark counts and
   * by whether their group is closed off. */
  scratch: SpokesScratch;
  /** Last-drawn packed hub per cell (−1 = never drawn). */
  spokes: Int32Array;
  /** Last-drawn colour hash per cell (−1 = never drawn). */
  colors: Int32Array;
  /** Last-drawn diagonal through each grid corner (−1 = never drawn, 0 = no
   * diagonal, else the direction, plus {@link CORNER_WRONG} when flagged). */
  corners: Int8Array;
  /** Check-&-Save mistake overlay: bit `d` set ⇒ spoke `d` of this cell is
   * flagged. Its own sidecar so it repaints a cell nothing else changed
   * (playbook §3.2). */
  wrong: OverlaySidecar;
  /** Hint overlay, per cell: bits `0..7` ⇒ spoke `d` is a hint *line*
   * (`COL_HINT`, "draw this"), {@link HINT_RING} ⇒ ring this hub as evidence
   * (`COL_HINT_CELL`), bits `9..16` (see {@link hintMarkBit}) ⇒ spoke `d` is a
   * hint *mark* (a `COL_HINT` rim dot, "rule this out"). Its own sidecar for the
   * same reason as {@link wrong} (playbook §3.2). */
  hint: OverlaySidecar;
  /** Blitter holding the pixels under the keyboard cursor, and where. */
  cursorBlitter: unknown;
  cursorSaved: boolean;
  cursorX: number;
  cursorY: number;
  cursorRadius: number;
  cursorSize: number;
}

/** OR'd into a corner's cache value when its diagonal is a flagged mistake. */
const CORNER_WRONG = 4;
/** OR'd into a corner's cache value when its diagonal is a hint *line*. */
const CORNER_HINT = 8;
/** Hint sidecar bit that rings a hub as evidence (`COL_HINT_CELL`); bits
 * `0..7` are the hint-line spokes, so this sits above them. */
const HINT_RING = 1 << 8;
/** Hint sidecar bit for spoke `d` as a *mark* to rule out (a `COL_HINT` rim
 * dot). These sit above {@link HINT_RING}, disjoint from the line bits `0..7`. */
const hintMarkBit = (d: number): number => 1 << (9 + d);

export function newDrawState(state: SpokesState): SpokesDrawState {
  const n = state.w * state.h;
  return {
    started: false,
    tilesize: 0,
    w: state.w,
    h: state.h,
    scratch: new SpokesScratch(n),
    spokes: new Int32Array(n).fill(-1),
    colors: new Int32Array(n).fill(-1),
    corners: new Int8Array(n).fill(-1),
    wrong: new OverlaySidecar(n),
    hint: new OverlaySidecar(n),
    cursorBlitter: null,
    cursorSaved: false,
    cursorX: -1,
    cursorY: -1,
    cursorRadius: -1,
    cursorSize: -1,
  };
}

export function setTileSize(ds: SpokesDrawState, ts: number): void {
  if (ds.tilesize !== ts) {
    // The blitter is sized from the tile size, so a resize retires it; the
    // next frame allocates a fresh one (only `redraw` has the `GameDrawing`).
    ds.cursorBlitter = null;
    ds.cursorSaved = false;
  }
  ds.tilesize = ts;
  ds.cursorRadius = (ts * 0.2) | 0;
  ds.cursorSize = ds.cursorRadius * 2 + 1;
}

// --- helpers ----------------------------------------------------------------

/** Unit vector along a spoke direction, for placing the spoke dots. */
function spokeUnit(d: number): Point {
  const { dx, dy } = SPOKE_DIRS[d];
  const diagonal = dx !== 0 && dy !== 0;
  return { x: diagonal ? dx * SQRTHALF : dx, y: diagonal ? dy * SQRTHALF : dy };
}

/** The hub itself: rim, one dot per placeable spoke, then the inner fill. */
function drawHub(
  dr: GameDrawing,
  tx: number,
  ty: number,
  radius: number,
  thick: number,
  hub: number,
  wrongBits: number,
  border: number,
  fill: number,
): void {
  const edge = radius - thick;
  const pr = radius / 4;

  dr.drawCircle({ x: tx, y: ty }, radius, border, border);

  for (let d = 0; d < 8; d++) {
    const spoke = getSpoke(hub, d);
    if (spoke === SPOKE_HIDDEN) continue;
    const unit = spokeUnit(d);
    const px = tx + edge * unit.x;
    const py = ty + edge * unit.y;
    dr.drawCircle({ x: px, y: py }, pr + thick, border, border);
    const dotWrong = (wrongBits & (1 << d)) !== 0;
    const c = spoke === SPOKE_MARKED ? (dotWrong ? COL_ERROR : COL_MARK) : fill;
    dr.drawCircle({ x: px, y: py }, pr, c, c);
  }

  dr.drawCircle({ x: tx, y: ty }, edge, fill, fill);
}

// --- redraw -----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: SpokesDrawState | null,
  _prev: SpokesState | null,
  state: SpokesState,
  _dir: number,
  ui: SpokesUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<SpokesMove, SpokesHint>,
  mistakes?: readonly SpokesMistake[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { w, h } = state;

  // Lift the cursor before anything else redraws under it.
  if (ds.cursorSaved && ds.cursorBlitter) {
    const origin = { x: ds.cursorX - ds.cursorRadius, y: ds.cursorY - ds.cursorRadius };
    dr.blitterLoad(ds.cursorBlitter, origin);
    dr.drawUpdate({ ...origin, w: ds.cursorSize, h: ds.cursorSize });
    ds.cursorSaved = false;
  }

  if (!ds.started) {
    // The engine paints no pixels of its own (playbook §3.2).
    dr.drawRect({ x: 0, y: 0, w: w * ts, h: h * ts }, COL_BACKGROUND);
    dr.drawUpdate({ x: 0, y: 0, w: w * ts, h: h * ts });
    ds.started = true;
  }

  const flash = flashTime > 0 && (Math.floor(flashTime / FLASH_FRAME) & 1) === 1;
  const cshow = ui.cshow && flashTime <= 0;
  const cx = ((ui.cx + 1) / 3) | 0;
  const cy = ((ui.cy + 1) / 3) | 0;
  const cdx = ((ui.cx + 1) % 3) - 1;
  const cdy = ((ui.cy + 1) % 3) - 1;

  const thick = ts <= 80 ? 2 : 4;
  const radius = ts / 3.5;

  // The renderer's counts use the diagonal-aware `full` recount: a hub facing
  // a drawn diagonal has one fewer placeable spoke than its own word admits,
  // and that is what decides whether it reads as over-marked.
  spokesSolverRecount(state, ds.scratch, true);
  spokesFindIsolated(state, ds.scratch);
  const connected = ds.scratch.dsf.size(0) === w * h;

  // Mistake overlay: flag both ends of each offending spoke, so both cells
  // repaint and both halves of the line come out red.
  ds.wrong.clear();
  for (const m of mistakes ?? []) {
    ds.wrong.add(m.index, 1 << m.dir);
    const nx = (m.index % w) + SPOKE_DIRS[m.dir].dx;
    const ny = ((m.index / w) | 0) + SPOKE_DIRS[m.dir].dy;
    if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
      ds.wrong.add(ny * w + nx, 1 << (m.dir ^ 4));
    }
  }

  // Hint overlay: flag both ends of each forced spoke (so both cells repaint
  // and both halves of the COL_HINT line come out), and ring each evidence hub.
  ds.hint.clear();
  const hl = hint?.highlights;
  if (hl) {
    for (const sp of hl.spokes) {
      const bit = (d: number): number =>
        sp.state === SPOKE_LINE ? 1 << d : hintMarkBit(d);
      ds.hint.add(sp.index, bit(sp.dir));
      const nx = (sp.index % w) + SPOKE_DIRS[sp.dir].dx;
      const ny = ((sp.index / w) | 0) + SPOKE_DIRS[sp.dir].dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        ds.hint.add(ny * w + nx, bit(sp.dir ^ 4));
      }
    }
    for (const e of hl.evidence) ds.hint.add(e, HINT_RING);
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;

      if (!state.spokes[i]) {
        // A hole: blank the tile once, then leave it alone.
        if (ds.spokes[i] !== 0) {
          dr.clip({ x: x * ts, y: y * ts, w: ts, h: ts });
          dr.drawRect({ x: x * ts, y: y * ts, w: ts, h: ts }, COL_BACKGROUND);
          dr.drawUpdate({ x: x * ts, y: y * ts, w: ts, h: ts });
          dr.unclip();
          ds.spokes[i] = 0;
          ds.colors[i] = 0;
        }
        ds.wrong.commit(i);
        ds.hint.commit(i);
        continue;
      }

      const tx = toCoord(x, ts);
      const ty = toCoord(y, ts);
      const lines = ds.scratch.lines[i];

      const fill =
        ui.markSatisfied && lines === state.numbers[i] ? COL_SATISFIED : COL_BACKGROUND;
      const border = flash
        ? COL_DONE
        : i === ui.dragStart || i === ui.dragEnd
          ? COL_HOLDING
          : !connected && !ds.scratch.open[ds.scratch.dsf.canonify(i)]
            ? COL_ERROR
            : COL_BORDER;
      const txt =
        lines > state.numbers[i] ||
        ds.scratch.marked[i] > ds.scratch.nodes[i] - state.numbers[i]
          ? COL_ERROR
          : cshow && cx === x && cy === y
            ? COL_CURSOR
            : COL_LINE;

      const colour = (fill << 10) | (border << 5) | txt;
      if (
        ds.spokes[i] === state.spokes[i] &&
        ds.colors[i] === colour &&
        !ds.wrong.stale(i) &&
        !ds.hint.stale(i)
      ) {
        continue;
      }

      const wrongBits = ds.wrong.packed[i];
      const hintBits = ds.hint.packed[i];

      dr.clip({ x: x * ts, y: y * ts, w: ts, h: ts });
      // Clear a plus-shape, leaving the four corners for the diagonal pass.
      dr.drawRect(
        { x: x * ts + CORNER, y: y * ts, w: ts - 2 * CORNER, h: ts },
        COL_BACKGROUND,
      );
      dr.drawRect(
        { x: x * ts, y: y * ts + CORNER, w: ts, h: ts - 2 * CORNER },
        COL_BACKGROUND,
      );
      dr.drawUpdate({ x: x * ts, y: y * ts, w: ts, h: ts });

      for (let d = 0; d < 8; d++) {
        if (getSpoke(state.spokes[i], d) !== SPOKE_LINE) continue;
        const tx2 = tx + SPOKE_DIRS[d].dx * ts;
        const ty2 = ty + SPOKE_DIRS[d].dy * ts;
        const col = wrongBits & (1 << d) ? COL_ERROR : COL_LINE;
        // Both ends of an edge must draw the identical segment in the
        // identical direction, or rounding leaves a seam at the midpoint.
        if (d < 4) {
          dr.drawLine({ x: tx2, y: ty2 }, { x: tx, y: ty }, col, thick);
        } else {
          dr.drawLine({ x: tx, y: ty }, { x: tx2, y: ty2 }, col, thick);
        }
      }

      // Hint spokes: draw each forced spoke like a line in COL_HINT, but only
      // where it is still EMPTY — a leg the player has followed is now a real
      // black line and must not be re-tinted (playbook §5.1). Diagonals are
      // completed across the corner by the diagonal pass, same as real lines.
      for (let d = 0; d < 8; d++) {
        if (!(hintBits & (1 << d))) continue;
        if (getSpoke(state.spokes[i], d) !== SPOKE_EMPTY) continue;
        const tx2 = tx + SPOKE_DIRS[d].dx * ts;
        const ty2 = ty + SPOKE_DIRS[d].dy * ts;
        if (d < 4) {
          dr.drawLine({ x: tx2, y: ty2 }, { x: tx, y: ty }, COL_HINT, thick);
        } else {
          dr.drawLine({ x: tx, y: ty }, { x: tx2, y: ty2 }, COL_HINT, thick);
        }
      }

      // Evidence ring: a light-blue annulus just outside the hub rim.
      if (hintBits & HINT_RING) {
        dr.drawCircle(
          { x: tx, y: ty },
          radius + HINT_RING_WIDTH,
          COL_HINT_CELL,
          COL_HINT_CELL,
        );
      }

      drawHub(dr, tx, ty, radius, thick, state.spokes[i], wrongBits, border, fill);

      // Hint marks: recolour the rim dot of each still-empty spoke the hint
      // would *rule out* (drawn on top of the hub's own faint placeable dot),
      // so a "rule this out" reads as a mark, not as a line to draw.
      const edge = radius - thick;
      const pr = radius / 4;
      for (let d = 0; d < 8; d++) {
        if (!(hintBits & hintMarkBit(d))) continue;
        if (getSpoke(state.spokes[i], d) !== SPOKE_EMPTY) continue;
        const unit = spokeUnit(d);
        dr.drawCircle(
          { x: tx + edge * unit.x, y: ty + edge * unit.y },
          pr,
          COL_HINT,
          COL_HINT,
        );
      }

      dr.drawText(
        { x: tx, y: ty },
        {
          align: "center",
          baseline: "mathematical",
          fontType: "fixed",
          size: (ts / 2.5) | 0,
        },
        txt,
        String(state.numbers[i]),
      );

      // A repainted cell cleared its share of any diagonal that runs into one
      // of its corners, so that corner has to be redrawn.
      if (x < w - 1 && y < h - 1 && ds.corners[i] === DIR_BOTRIGHT) ds.corners[i] = -1;
      if (x > 0 && y < h - 1 && ds.corners[i - 1] === DIR_BOTLEFT)
        ds.corners[i - 1] = -1;
      if (x < w - 1 && y > 0 && ds.corners[i - w] === DIR_BOTLEFT)
        ds.corners[i - w] = -1;
      if (x > 0 && y > 0 && ds.corners[i - (w + 1)] === DIR_BOTRIGHT)
        ds.corners[i - (w + 1)] = -1;

      ds.spokes[i] = state.spokes[i];
      ds.colors[i] = colour;
      ds.wrong.commit(i);
      ds.hint.commit(i);
      dr.unclip();
    }
  }

  if (ts >= MIN_CORNER_TILESIZE) drawCorners(dr, ds, state, thick);

  if (cshow) {
    ds.cursorX = cx * ts + ((ts / 2) | 0) + ((cdx * (ts * 0.4) * SQRTHALF) | 0);
    ds.cursorY = cy * ts + ((ts / 2) | 0) + ((cdy * (ts * 0.4) * SQRTHALF) | 0);

    if (!ds.cursorBlitter) {
      ds.cursorBlitter = dr.blitterNew({ w: ds.cursorSize, h: ds.cursorSize });
    }
    const origin = { x: ds.cursorX - ds.cursorRadius, y: ds.cursorY - ds.cursorRadius };
    dr.blitterSave(ds.cursorBlitter, origin);
    ds.cursorSaved = true;

    drawRectCorners(dr, ds.cursorX, ds.cursorY, ds.cursorRadius - 1, COL_CURSOR);
    dr.drawUpdate({ ...origin, w: ds.cursorSize, h: ds.cursorSize });
  }
}

/**
 * The diagonal pass: redraw the box around each grid corner whose diagonal
 * changed. Each cell's own repaint deliberately leaves its corners alone (see
 * the module header), so this is what keeps a diagonal continuous across the
 * point where four cells meet.
 */
function drawCorners(
  dr: GameDrawing,
  ds: SpokesDrawState,
  state: SpokesState,
  thick: number,
): void {
  const ts = ds.tilesize;
  const { w, h } = state;

  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = y * w + x;
      const diag =
        getSpoke(state.spokes[i], DIR_BOTRIGHT) === SPOKE_LINE
          ? DIR_BOTRIGHT
          : getSpoke(state.spokes[i + 1], DIR_BOTLEFT) === SPOKE_LINE
            ? DIR_BOTLEFT
            : 0;
      const wrong =
        diag === DIR_BOTRIGHT
          ? (ds.wrong.packed[i] & (1 << DIR_BOTRIGHT)) !== 0
          : diag === DIR_BOTLEFT
            ? (ds.wrong.packed[i + 1] & (1 << DIR_BOTLEFT)) !== 0
            : false;
      // A hint diagonal only shows where there is no real line (a hint spoke is
      // EMPTY in the state), so the two are mutually exclusive per corner.
      const hintDiag =
        diag !== 0
          ? 0
          : ds.hint.packed[i] & (1 << DIR_BOTRIGHT)
            ? DIR_BOTRIGHT
            : ds.hint.packed[i + 1] & (1 << DIR_BOTLEFT)
              ? DIR_BOTLEFT
              : 0;
      const key =
        diag !== 0
          ? diag | (wrong ? CORNER_WRONG : 0)
          : hintDiag !== 0
            ? hintDiag | CORNER_HINT
            : 0;

      if (key === ds.corners[i]) continue;

      const bx = (x + 1) * ts;
      const by = (y + 1) * ts;
      dr.clip({ x: bx - CORNER, y: by - CORNER, w: 2 * CORNER, h: 2 * CORNER });
      dr.drawRect(
        { x: bx - CORNER, y: by - CORNER, w: 2 * CORNER, h: 2 * CORNER },
        COL_BACKGROUND,
      );
      dr.drawUpdate({
        x: bx - CORNER,
        y: by - CORNER,
        w: 2 * CORNER,
        h: 2 * CORNER,
      });

      const tx = toCoord(x, ts);
      const ty = toCoord(y, ts);
      const drawn = diag !== 0 ? diag : hintDiag;
      const col = wrong ? COL_ERROR : hintDiag !== 0 ? COL_HINT : COL_LINE;
      if (drawn === DIR_BOTRIGHT) {
        dr.drawLine({ x: tx, y: ty }, { x: tx + ts, y: ty + ts }, col, thick);
      } else if (drawn === DIR_BOTLEFT) {
        dr.drawLine({ x: tx, y: ty + ts }, { x: tx + ts, y: ty }, col, thick);
      }

      dr.unclip();
      ds.corners[i] = key;
    }
  }
}
