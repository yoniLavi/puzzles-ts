/**
 * Galaxies (Tentai Show / Spiral Galaxies) — native TS port. The
 * goal-4 game from `AGENTS.md`: the cell↔dot aid is a follow-up
 * change once this port ships at owner-confirmed parity.
 *
 * Idiomatic rendering of `puzzles/galaxies.c` (deleted when this
 * change reaches catalog-seam wiring): immutable state at the public
 * boundary, discriminated `GalaxiesMove` of `E`/`U`/`M`/`A` ops, GC
 * not dup/free, the lazy local `Dsf` leaf, and `random.ts` for
 * `random_upto`. Logic mirrors the C reference; not a control-flow
 * transliteration.
 */
import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import { mkhighlightBackground } from "../../engine/colour-mkhighlight.ts";
import { parseLeadingInt } from "../../engine/params.ts";
import {
  type Game,
  registerGame,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/index.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  LEFT_BUTTON,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
} from "../../engine/pointer.ts";
import type { RandomState } from "../../random/index.ts";
import { newGameDesc } from "./generator.ts";
import {
  COL_ARROW,
  COL_BACKGROUND,
  COL_BLACKBG,
  COL_BLACKDOT,
  COL_CURSOR,
  COL_EDGE,
  COL_GRID,
  COL_WHITEBG,
  COL_WHITEDOT,
  type GalaxiesDrawState,
  NCOLOURS,
  newDrawState,
  redraw,
  setTileSize,
} from "./render.ts";
import { clearForSolve, GalaxiesDiff, solverState } from "./solver.ts";
import {
  addAssoc,
  blankGame,
  checkComplete,
  cloneState,
  decodeGame,
  F_DOT,
  F_DOT_HOLD,
  F_EDGE_SET,
  F_TILE_ASSOC,
  type GalaxiesState,
  idx,
  inGrid,
  inUi,
  isVerticalEdge,
  rebuildDots,
  removeAssoc,
  SpaceType,
  spaceOppositeDot,
  spaceTypeAt,
  tileOpposite,
} from "./state.ts";

const PREFERRED_TILE_SIZE = 32;
const FLASH_TIME = 0.15;

// --- types -----------------------------------------------------------

export interface GalaxiesParams {
  w: number;
  h: number;
  diff: GalaxiesDiff;
}

export type GalaxiesOp =
  | { kind: "edge"; x: number; y: number }
  | { kind: "unassoc"; x: number; y: number }
  | { kind: "hold"; x: number; y: number }
  | { kind: "assoc"; x: number; y: number; ax: number; ay: number };

export interface GalaxiesMove {
  ops: GalaxiesOp[];
  /** True ⇒ executeMove applies ops without the mirror-opposite
   * semantics, matching the C "S;…" solve-mode prefix. */
  solving: boolean;
}

export interface GalaxiesUi {
  dragging: boolean;
  /** Pixel coords of the drag pointer (for the dragged-arrow render). */
  dx: number;
  dy: number;
  /** Grid coords of the dot we're dragging from. */
  dotx: number;
  doty: number;
  /** Grid coords of the drag's source square. */
  srcx: number;
  srcy: number;
  /** Keyboard cursor grid coords. */
  curX: number;
  curY: number;
  curVisible: boolean;
}

export type { GalaxiesDrawState, GalaxiesState };
export { GalaxiesDiff };

// --- params ---------------------------------------------------------

const DIFFCHARS = "nu";

function decodeParams(s: string): GalaxiesParams {
  const a = parseLeadingInt(s, 0);
  const w = a.value;
  let h = w;
  let i = a.next;
  if (s[i] === "x") {
    const b = parseLeadingInt(s, i + 1);
    h = b.value;
    i = b.next;
  }
  let diff: GalaxiesDiff = GalaxiesDiff.Normal;
  if (s[i] === "d") {
    i++;
    const c = s[i];
    const idxd = DIFFCHARS.indexOf(c ?? "");
    if (idxd >= 0) diff = idxd as GalaxiesDiff;
  }
  return { w, h, diff };
}

function encodeParams(p: GalaxiesParams, full: boolean): string {
  let out = `${p.w}x${p.h}`;
  if (full) out += `d${DIFFCHARS[p.diff] ?? "n"}`;
  return out;
}

function validateParams(p: GalaxiesParams): string | null {
  if (p.w < 3 || p.h < 3) return "Width and height must both be at least 3";
  if (p.w > 100 || p.h > 100) {
    return "Width times height must not be unreasonably large";
  }
  if (p.diff !== GalaxiesDiff.Normal && p.diff !== GalaxiesDiff.Unreasonable) {
    return "Difficulty must be Normal or Unreasonable";
  }
  return null;
}

// --- interaction helpers -------------------------------------------

/** Edge-rounded grid coord from a pixel coord. Mirrors
 * `coord_round_to_edge` plus the (2 * FROMCOORD + 0.5)
 * grid-rounding in upstream's `interpret_move`. */
function coordRoundToEdge(
  px: number,
  py: number,
  tileSize: number,
  border: number,
): { x: number; y: number } {
  const fx = (px - border) / tileSize;
  const fy = (py - border) / tileSize;
  const xs = Math.floor(fx) + 0.5;
  const ys = Math.floor(fy) + 0.5;
  const xv = Math.floor(fx + 0.5);
  const yv = Math.floor(fy + 0.5);
  const ddx = Math.abs(fx - xs);
  const ddy = Math.abs(fy - ys);
  if (ddx > ddy) {
    return { x: 2 * xv, y: 1 + 2 * Math.floor(ys) };
  }
  return { x: 1 + 2 * Math.floor(xs), y: 2 * yv };
}

/** Grid-round for arrow drag: 2 * (pixel / tileSize) + 0.5 → nearest
 * grid coord. Used for nearest-dot detection and drop targets. */
function gridRoundDouble(
  px: number,
  py: number,
  tileSize: number,
  border: number,
): { x: number; y: number } {
  const fx = (px - border) / tileSize;
  const fy = (py - border) / tileSize;
  return {
    x: Math.floor(2 * fx + 0.5),
    y: Math.floor(2 * fy + 0.5),
  };
}

function edgePlacementLegal(s: GalaxiesState, x: number, y: number): boolean {
  if (spaceTypeAt(x, y) !== SpaceType.Edge) return false;
  // The line mustn't intersect a dot.
  const flagsHere = s.flags[idx(s, x, y)];
  const v1 = s.flags[idx(s, x & ~1, y & ~1)];
  const v2 = s.flags[idx(s, (x + 1) & ~1, (y + 1) & ~1)];
  return !((flagsHere | v1 | v2) & F_DOT);
}

/** Coordinate of the screen pixel centre of a grid cell, in the
 * tile-size convention used here. */
function scoord(c: number, tileSize: number, border: number): number {
  return (c * tileSize) / 2 + border;
}

// --- move logic -----------------------------------------------------

/** Mirrors `add_assoc_with_opposite` + the `ok_to_add` precheck.
 * Adds (tile, dot) and (opp, dot) atomically; no-ops if illegal. */
function addAssocWithOpposite(
  s: GalaxiesState,
  tx: number,
  ty: number,
  dx: number,
  dy: number,
): void {
  const opp = spaceOppositeDot(s, tx, ty, dx, dy);
  if (!opp) return;
  if (spaceTypeAt(tx, ty) !== SpaceType.Tile) return;
  const oi = idx(s, opp.x, opp.y);
  if (s.flags[idx(s, tx, ty)] & F_DOT) return;
  if (s.flags[oi] & F_DOT) return;
  const cols = checkComplete(s, true).colours;
  if (!cols) return;
  if (cols[((ty - 1) >> 1) * s.w + ((tx - 1) >> 1)]) return;
  if (cols[((opp.y - 1) >> 1) * s.w + ((opp.x - 1) >> 1)]) return;
  // Mirror upstream: drop the OLD opposite associations first.
  removeAssocWithOpposite(s, tx, ty);
  addAssoc(s, tx, ty, dx, dy);
  removeAssocWithOpposite(s, opp.x, opp.y);
  addAssoc(s, opp.x, opp.y, dx, dy);
}

function removeAssocWithOpposite(s: GalaxiesState, tx: number, ty: number): void {
  const ti = idx(s, tx, ty);
  if (!(s.flags[ti] & F_TILE_ASSOC)) return;
  const opp = tileOpposite(s, tx, ty);
  removeAssoc(s, tx, ty);
  if (opp && (opp.x !== tx || opp.y !== ty)) {
    removeAssoc(s, opp.x, opp.y);
  }
}

function applyOp(s: GalaxiesState, op: GalaxiesOp, solving: boolean): void {
  if (op.kind === "edge") {
    if (!inUi(s, op.x, op.y) || spaceTypeAt(op.x, op.y) !== SpaceType.Edge) {
      throw new Error(`Galaxies: invalid edge move at (${op.x},${op.y})`);
    }
    s.flags[idx(s, op.x, op.y)] ^= F_EDGE_SET;
  } else if (op.kind === "unassoc") {
    if (
      !inUi(s, op.x, op.y) ||
      spaceTypeAt(op.x, op.y) !== SpaceType.Tile ||
      !(s.flags[idx(s, op.x, op.y)] & F_TILE_ASSOC)
    ) {
      throw new Error(`Galaxies: invalid unassoc at (${op.x},${op.y})`);
    }
    if (solving) {
      removeAssoc(s, op.x, op.y);
    } else {
      removeAssocWithOpposite(s, op.x, op.y);
    }
  } else if (op.kind === "hold") {
    const i = idx(s, op.x, op.y);
    if (!(s.flags[i] & F_DOT)) {
      throw new Error(`Galaxies: invalid hold at (${op.x},${op.y})`);
    }
    s.flags[i] ^= F_DOT_HOLD;
  } else if (op.kind === "assoc") {
    if (
      !inUi(s, op.x, op.y) ||
      !inUi(s, op.ax, op.ay) ||
      !(s.flags[idx(s, op.ax, op.ay)] & F_DOT)
    ) {
      throw new Error(
        `Galaxies: invalid assoc at (${op.x},${op.y}) → (${op.ax},${op.ay})`,
      );
    }
    if (s.flags[idx(s, op.ax, op.ay)] & F_DOT_HOLD) {
      throw new Error("Galaxies: cannot add to a held dot");
    }
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const tx = op.x + dx;
        const ty = op.y + dy;
        if (!inGrid(s, tx, ty)) continue;
        if (spaceTypeAt(tx, ty) !== SpaceType.Tile) continue;
        const ti = idx(s, tx, ty);
        if (s.flags[ti] & F_TILE_ASSOC) {
          const di = idx(s, s.dotx[ti], s.doty[ti]);
          if (s.flags[di] & F_DOT_HOLD) continue;
        }
        if (solving) {
          addAssoc(s, tx, ty, op.ax, op.ay);
        } else {
          addAssocWithOpposite(s, tx, ty, op.ax, op.ay);
        }
      }
    }
  }
}

function executeMove(s: GalaxiesState, move: GalaxiesMove): GalaxiesState {
  const next = cloneState(s);
  for (const op of move.ops) applyOp(next, op, move.solving);
  if (move.solving) next.usedSolve = true;
  if (checkComplete(next, false).complete) next.completed = true;
  // Difficulty is constant over the lifetime of the puzzle (it
  // depends only on the dot layout). Preserve the cached value
  // through executeMove so the statusbar avoids re-running the
  // solver after every move.
  return next;
}

// --- interpretMove --------------------------------------------------

function interpretMove(
  s: GalaxiesState,
  ui: GalaxiesUi,
  ds: GalaxiesDrawState | null,
  p: Point,
  button: number,
): GalaxiesMove | null | UiUpdate {
  const tile = ds?.tileSize ?? PREFERRED_TILE_SIZE;
  const border = tile;
  const x = p.x;
  const y = p.y;

  // --- LEFT_BUTTON: edge toggle (or, on touch, start drag from a
  // nearby dot/associated-tile if there isn't a sensible edge nearby).
  if (button === LEFT_BUTTON) {
    const e = coordRoundToEdge(x, y, tile, border);
    ui.curVisible = false;
    if (!inUi(s, e.x, e.y)) return null;
    if (!edgePlacementLegal(s, e.x, e.y)) return null;
    return {
      ops: [{ kind: "edge", x: e.x, y: e.y }],
      solving: false,
    };
  }

  if (button === RIGHT_BUTTON) {
    ui.curVisible = false;
    // Nearest grid vertex/edge/tile coordinate (using 2*FROMCOORD+0.5
    // rounding to land on integer subcell coordinates).
    const g = gridRoundDouble(x, y, tile, border);
    let dotX = -1;
    let dotY = -1;
    // Search a 3x3 ring around the rounded coord for a dot.
    for (let dy1 = g.y - 1; dy1 <= g.y + 1 && dotX < 0; dy1++) {
      for (let dx1 = g.x - 1; dx1 <= g.x + 1 && dotX < 0; dx1++) {
        if (dx1 < 0 || dy1 < 0 || dx1 >= s.sx || dy1 >= s.sy) continue;
        const sx1 = scoord(dx1 - 1, tile, border);
        const sx2 = scoord(dx1 + 1, tile, border);
        const sy1 = scoord(dy1 - 1, tile, border);
        const sy2 = scoord(dy1 + 1, tile, border);
        if (
          x >= sx1 &&
          x < sx2 &&
          y >= sy1 &&
          y < sy2 &&
          s.flags[idx(s, dx1, dy1)] & F_DOT
        ) {
          dotX = dx1;
          dotY = dy1;
          ui.srcx = dx1;
          ui.srcy = dy1;
        }
      }
    }
    if (dotX < 0) {
      // Pick the nearest tile and grab its existing arrow (if any).
      const tx = 2 * Math.floor((x - border + tile) / tile) - 1;
      const ty = 2 * Math.floor((y - border + tile) / tile) - 1;
      if (tx >= 0 && tx < s.sx && ty >= 0 && ty < s.sy) {
        const ti = idx(s, tx, ty);
        if (s.flags[ti] & F_TILE_ASSOC) {
          dotX = s.dotx[ti];
          dotY = s.doty[ti];
          ui.srcx = tx;
          ui.srcy = ty;
        }
      }
    }
    if (dotX < 0) return null;
    ui.dragging = true;
    ui.dx = x;
    ui.dy = y;
    ui.dotx = dotX;
    ui.doty = dotY;
    return UI_UPDATE;
  }

  if (button === RIGHT_DRAG && ui.dragging) {
    ui.dx = x;
    ui.dy = y;
    return UI_UPDATE;
  }

  if (button === RIGHT_RELEASE && ui.dragging) {
    const px = 2 * Math.floor((x - border + tile) / tile) - 1;
    const py = 2 * Math.floor((y - border + tile) / tile) - 1;
    return dropDrag(s, ui, px, py);
  }

  if (
    button === CURSOR_UP ||
    button === CURSOR_DOWN ||
    button === CURSOR_LEFT ||
    button === CURSOR_RIGHT
  ) {
    const dx = button === CURSOR_LEFT ? -1 : button === CURSOR_RIGHT ? 1 : 0;
    const dy = button === CURSOR_UP ? -1 : button === CURSOR_DOWN ? 1 : 0;
    let nx = ui.curX + dx;
    let ny = ui.curY + dy;
    if (nx < 1) nx = 1;
    if (ny < 1) ny = 1;
    if (nx > s.sx - 2) nx = s.sx - 2;
    if (ny > s.sy - 2) ny = s.sy - 2;
    const changed = nx !== ui.curX || ny !== ui.curY || !ui.curVisible;
    ui.curX = nx;
    ui.curY = ny;
    ui.curVisible = true;
    if (ui.dragging) {
      ui.dx = scoord(ui.curX, tile, border);
      ui.dy = scoord(ui.curY, tile, border);
    }
    return changed ? UI_UPDATE : null;
  }

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    if (!ui.curVisible) {
      ui.curVisible = true;
      return UI_UPDATE;
    }
    const cx = ui.curX;
    const cy = ui.curY;
    if (ui.dragging) {
      return dropDrag(s, ui, cx, cy);
    }
    const ci = idx(s, cx, cy);
    if (s.flags[ci] & F_DOT) {
      ui.dragging = true;
      ui.dx = scoord(cx, tile, border);
      ui.dy = scoord(cy, tile, border);
      ui.dotx = cx;
      ui.doty = cy;
      ui.srcx = cx;
      ui.srcy = cy;
      return UI_UPDATE;
    }
    if (s.flags[ci] & F_TILE_ASSOC) {
      ui.dragging = true;
      ui.dx = scoord(cx, tile, border);
      ui.dy = scoord(cy, tile, border);
      ui.dotx = s.dotx[ci];
      ui.doty = s.doty[ci];
      ui.srcx = cx;
      ui.srcy = cy;
      return UI_UPDATE;
    }
    if (spaceTypeAt(cx, cy) === SpaceType.Edge && edgePlacementLegal(s, cx, cy)) {
      return { ops: [{ kind: "edge", x: cx, y: cy }], solving: false };
    }
  }

  return null;
}

function dropDrag(
  s: GalaxiesState,
  ui: GalaxiesUi,
  px: number,
  py: number,
): GalaxiesMove | null | UiUpdate {
  ui.dragging = false;
  if (px === ui.srcx && py === ui.srcy) return UI_UPDATE;
  const ops: GalaxiesOp[] = [];
  if (
    (ui.srcx !== ui.dotx || ui.srcy !== ui.doty) &&
    s.flags[idx(s, ui.srcx, ui.srcy)] & F_TILE_ASSOC
  ) {
    ops.push({ kind: "unassoc", x: ui.srcx, y: ui.srcy });
  }
  if (inUi(s, px, py)) {
    // ok_to_add_assoc_with_opposite via addAssocWithOpposite path will
    // simply no-op if illegal; here we conservatively still emit the
    // assoc — executeMove guards it.
    if (spaceTypeAt(px, py) === SpaceType.Tile && !(s.flags[idx(s, px, py)] & F_DOT)) {
      ops.push({ kind: "assoc", x: px, y: py, ax: ui.dotx, ay: ui.doty });
    }
  }
  if (ops.length === 0) return UI_UPDATE;
  return { ops, solving: false };
}

// --- solve --------------------------------------------------------

function diffSolveMoves(curr: GalaxiesState, solved: GalaxiesState): GalaxiesMove {
  const ops: GalaxiesOp[] = [];
  // Tiles: curr's associations get cleared (the solved diff strips
  // F_TILE_ASSOC and only differentiates on edges and tiles whose
  // assoc state changed). Mirroring the C: it nukes assoc on tosolve
  // first, so for every assoc'd tile in curr that's now unassoc'd in
  // solved, emit a U.
  for (let y = 1; y < curr.sy - 1; y += 2) {
    for (let x = 1; x < curr.sx - 1; x += 2) {
      const i = idx(curr, x, y);
      const a = (curr.flags[i] & F_TILE_ASSOC) !== 0;
      const b = (solved.flags[i] & F_TILE_ASSOC) !== 0;
      if (a && !b) ops.push({ kind: "unassoc", x, y });
      else if (a && b) {
        if (curr.dotx[i] !== solved.dotx[i] || curr.doty[i] !== solved.doty[i]) {
          ops.push({
            kind: "assoc",
            x,
            y,
            ax: solved.dotx[i],
            ay: solved.doty[i],
          });
        }
      } else if (!a && b) {
        ops.push({
          kind: "assoc",
          x,
          y,
          ax: solved.dotx[i],
          ay: solved.doty[i],
        });
      }
    }
  }
  // Edges:
  for (let y = 0; y < curr.sy; y++) {
    for (let x = 0; x < curr.sx; x++) {
      if (spaceTypeAt(x, y) !== SpaceType.Edge) continue;
      const i = idx(curr, x, y);
      const a = (curr.flags[i] & F_EDGE_SET) !== 0;
      const b = (solved.flags[i] & F_EDGE_SET) !== 0;
      if (a !== b) ops.push({ kind: "edge", x, y });
    }
  }
  return { ops, solving: true };
}

function solveGalaxies(
  orig: GalaxiesState,
  curr: GalaxiesState,
): SolveResult<GalaxiesMove> {
  // Try solving from the current state first.
  let attempt = cloneState(curr);
  let diff = solverState(attempt, GalaxiesDiff.Unreasonable);
  if (
    diff === GalaxiesDiff.Unfinished ||
    diff === GalaxiesDiff.Impossible ||
    diff === GalaxiesDiff.Ambiguous
  ) {
    attempt = cloneState(orig);
    clearForSolve(attempt);
    diff = solverState(attempt, GalaxiesDiff.Unreasonable);
    if (
      diff === GalaxiesDiff.Unfinished ||
      diff === GalaxiesDiff.Impossible ||
      diff === GalaxiesDiff.Ambiguous
    ) {
      return { ok: false, error: "Solver could not find a solution" };
    }
  }
  // Strip associations from the solved state — the C does the same,
  // so the move applied to the player's current state ends with only
  // edges placed (associations the player set are removed by U ops).
  for (let i = 0; i < attempt.sx * attempt.sy; i++) {
    if (attempt.flags[i] & F_TILE_ASSOC) {
      attempt.flags[i] &= ~F_TILE_ASSOC;
      attempt.dotx[i] = 0;
      attempt.doty[i] = 0;
    }
  }
  return { ok: true, move: diffSolveMoves(curr, attempt) };
}

// --- text format and statusbar -------------------------------------

function textFormat(s: GalaxiesState): string {
  const out: string[] = [];
  for (let y = 0; y < s.sy; y++) {
    for (let x = 0; x < s.sx; x++) {
      const f = s.flags[idx(s, x, y)];
      if (f & F_DOT) {
        out.push("o");
        continue;
      }
      const t = spaceTypeAt(x, y);
      if (t === SpaceType.Tile) {
        if (f & F_TILE_ASSOC) {
          const di = idx(s, s.dotx[idx(s, x, y)], s.doty[idx(s, x, y)]);
          out.push(s.flags[di] & 8 /* F_DOT_BLACK */ ? "B" : "W");
        } else {
          out.push(" ");
        }
      } else if (t === SpaceType.Vertex) {
        out.push("+");
      } else {
        if (f & F_EDGE_SET) out.push(isVerticalEdge(x) ? "|" : "-");
        else out.push(" ");
      }
    }
    out.push("\n");
  }
  return out.join("");
}

const DIFF_NAMES = ["Normal", "Unreasonable", "Impossible", "Ambiguous", "Unfinished"];

function statusbarText(s: GalaxiesState, _ui: GalaxiesUi): string {
  // Compute current-puzzle difficulty if not cached. (Cheap on
  // small boards; deferred so we don't pay it for boards a player
  // is mid-edit on.)
  let cd = s.cdiff;
  if (cd === -1) {
    const probe = cloneState(s);
    clearForSolve(probe);
    cd = solverState(probe, GalaxiesDiff.Unreasonable);
    s.cdiff = cd;
  }
  const diffWord = DIFF_NAMES[cd] ?? "Unknown";
  if (s.completed) {
    return s.usedSolve
      ? `Auto-solved. Difficulty ${diffWord}.`
      : `COMPLETED! Difficulty ${diffWord}.`;
  }
  return `Difficulty ${diffWord}.`;
}

// --- the Game object -----------------------------------------------

export const galaxiesGame: Game<
  GalaxiesParams,
  GalaxiesState,
  GalaxiesMove,
  GalaxiesUi,
  GalaxiesDrawState
> = {
  id: "galaxies",
  wantsStatusbar: true,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  preferredTileSize: PREFERRED_TILE_SIZE,

  defaultParams(): GalaxiesParams {
    return { w: 7, h: 7, diff: GalaxiesDiff.Normal };
  },

  presets() {
    const mk = (w: number, h: number, diff: GalaxiesDiff) => ({
      title: `${w}x${h} ${diff === GalaxiesDiff.Normal ? "Normal" : "Unreasonable"}`,
      params: { w, h, diff },
    });
    return {
      title: "Galaxies",
      submenu: [
        mk(7, 7, GalaxiesDiff.Normal),
        mk(7, 7, GalaxiesDiff.Unreasonable),
        mk(10, 10, GalaxiesDiff.Normal),
        mk(10, 10, GalaxiesDiff.Unreasonable),
        mk(15, 15, GalaxiesDiff.Normal),
        mk(15, 15, GalaxiesDiff.Unreasonable),
      ],
    };
  },

  encodeParams,
  decodeParams,
  validateParams,

  newDesc(p: GalaxiesParams, rng: RandomState) {
    const desc = newGameDesc(p, rng);
    return { desc };
  },

  validateDesc(p, desc): string | null {
    // We can validate by attempting to decode; if it fits, it's valid.
    const dummy = blankGame(p.w, p.h);
    const err = decodeGame(dummy, desc);
    return err;
  },

  newState(p, desc): GalaxiesState {
    const s = blankGame(p.w, p.h);
    const err = decodeGame(s, desc);
    if (err) throw new Error(`Galaxies: ${err}`);
    s.dots = rebuildDots(s);
    return s;
  },

  newUi(_state): GalaxiesUi {
    return {
      dragging: false,
      dx: 0,
      dy: 0,
      dotx: 0,
      doty: 0,
      srcx: 0,
      srcy: 0,
      curX: 1,
      curY: 1,
      curVisible: false,
    };
  },

  newDrawState,
  setTileSize,
  interpretMove,
  executeMove,

  status(s): "ongoing" | "solved" {
    return s.completed ? "solved" : "ongoing";
  },

  solve: solveGalaxies,
  textFormat,
  statusbarText,

  colours(defaultBackground: Colour): Colour[] {
    // Apply upstream's `game_mkhighlight` background adjustment BEFORE
    // Galaxies' palette overrides: if the host background is too close
    // to pure white, shift it away so `COL_WHITEBG` (pure white below)
    // is visibly brighter than the background. Without this step a
    // white-themed host renders `COL_BACKGROUND === COL_WHITEBG` and a
    // closed white region disappears into the page — exactly the bug
    // owner reported on 2026-05-23. Mirrors `misc.c` lines 232-288.
    const bg = mkhighlightBackground([
      defaultBackground[0],
      defaultBackground[1],
      defaultBackground[2],
    ]);
    const ret = new Array<Colour>(NCOLOURS);
    ret[COL_BACKGROUND] = bg;
    ret[COL_WHITEBG] = [1, 1, 1];
    ret[COL_BLACKBG] = [bg[0] * 0.3, bg[1] * 0.3, bg[2] * 0.3];
    ret[COL_WHITEDOT] = [1, 1, 1];
    ret[COL_BLACKDOT] = [0, 0, 0];
    ret[COL_GRID] = [bg[0] * 0.8, bg[1] * 0.8, bg[2] * 0.8];
    ret[COL_EDGE] = [0, 0, 0];
    ret[COL_ARROW] = [0, 0, 0];
    ret[COL_CURSOR] = [Math.min(bg[0] * 1.4, 1), bg[1] * 0.8, bg[2] * 0.8];
    return ret;
  },

  computeSize(p, tileSize): Size {
    return { w: p.w * tileSize + 2 * tileSize, h: p.h * tileSize + 2 * tileSize };
  },

  redraw,

  animLength() {
    return 0;
  },
  flashLength(oldState, newState): number {
    if (!oldState.completed && newState.completed && !newState.usedSolve) {
      return 3 * FLASH_TIME;
    }
    return 0;
  },
};

registerGame(galaxiesGame);
