/**
 * Subsets rendering — port of `game_redraw` in `puzzles/unreleased/subsets.c`.
 *
 * Each cell is a `CELL_WIDTH × CELL_HEIGHT` block of letter slots on a grey
 * backing: a slot is a bevel-highlight square when its letter is decided
 * (known or cleared) and an inner-background square while unknown, with the
 * letter drawn black for a given and green for a player mark. Horseshoe
 * arrows sit in the gaps between cell blocks (red when their relation is
 * violated), a violated missing-arrow edge shows a red cross, and the band
 * below the grid tallies every set-value with a colour for its placement
 * count (red = duplicated, lowlight = placed once, black = unplaced). All
 * error verdicts are live (recomputed from the committed state each frame,
 * as upstream). On a fresh win the slots blink to the inner background on
 * alternate 0.12 s flash frames; there is no move animation.
 *
 * Divergence from the C: the keyboard cursor's corner marks are drawn
 * through the per-cell diff (the cursor slot is part of the cache key)
 * instead of upstream's save/restore blitter — same pixels, no blitter
 * plumbing (display concern, outside byte-parity scope).
 *
 * `findMistakes` duplicates get an inset red frame via an `OverlaySidecar`
 * (playbook §3.2); violated edges are already red live, exactly as the C
 * shows them.
 */
import type { Colour, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { OverlaySidecar } from "../../engine/overlay-sidecar.ts";
import { subsetsValidate } from "./solver.ts";
import {
  ADJTHAN,
  ALL_BITS,
  CELL_HEIGHT,
  CELL_WIDTH,
  F_ADJ_DOWN,
  F_ADJ_UP,
  type SubsetsMistake,
  type SubsetsParams,
  type SubsetsState,
  type SubsetsUi,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 36;
const FLASH_FRAME = 0.12;
export const FLASH_TIME = FLASH_FRAME * 5;

// --- palette (upstream COL_* enum, index-for-index) -------------------------

export const COL_OUTERBG = 0;
export const COL_INNERBG = 1;
export const COL_GRID = 2;
export const COL_HIGHLIGHT = 3;
export const COL_LOWLIGHT = 4;
export const COL_FIXED = 5;
export const COL_GUESS = 6;
export const COL_ERROR = 7;
export const COL_CURSOR = 8;

export function colours(defaultBackground: Colour): Colour[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const out: Colour[] = [];
  out[COL_OUTERBG] = defaultBackground;
  out[COL_INNERBG] = background;
  out[COL_GRID] = [0.5, 0.5, 0.5];
  out[COL_HIGHLIGHT] = highlight;
  out[COL_LOWLIGHT] = lowlight;
  out[COL_FIXED] = [0, 0, 0];
  out[COL_GUESS] = [0, 0.5, 0];
  out[COL_ERROR] = [1, 0, 0];
  out[COL_CURSOR] = [0, 0, 1];
  return out;
}

// --- geometry ---------------------------------------------------------------

export function computeSize(p: SubsetsParams, ts: number): Size {
  return {
    w: p.w * (CELL_WIDTH + 1) * ts,
    // The extra (ch+1)-tile band below the grid holds the set tally.
    h: p.h * (CELL_HEIGHT + 1) * ts + ts * (CELL_HEIGHT + 1),
  };
}

// --- draw state -------------------------------------------------------------

export interface SubsetsDrawState {
  started: boolean;
  tilesize: number;
  /** Packed known/mask/flash/cursor-slot per cell (-1 = never drawn). */
  cellCache: Int32Array;
  /** Error-flag bits currently drawn per cell (upstream `oldflags`). */
  oldFlags: Uint8Array;
  /** Tally counts currently drawn per set-value (upstream `oldcounts`). */
  oldCounts: Int32Array;
  mistakes: OverlaySidecar;
}

export function newDrawState(state: SubsetsState): SubsetsDrawState {
  const s = state.w * state.h;
  return {
    started: false,
    tilesize: 0,
    cellCache: new Int32Array(s).fill(-1),
    oldFlags: new Uint8Array(s),
    oldCounts: new Int32Array(s),
    mistakes: new OverlaySidecar(s),
  };
}

export function setTileSize(ds: SubsetsDrawState, ts: number): void {
  ds.tilesize = ts;
}

// --- helpers ----------------------------------------------------------------

/** Upstream misc.c `draw_rect_corners`: four corner brackets around
 * (cx, cy) at radius r. */
function drawRectCorners(
  dr: GameDrawing,
  cx: number,
  cy: number,
  r: number,
  colour: number,
): void {
  const hr = Math.floor(r / 2);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const px = cx + sx * r;
      const py = cy + sy * r;
      dr.drawLine({ x: px, y: py }, { x: px, y: cy + sy * hr }, colour, 1);
      dr.drawLine({ x: px, y: py }, { x: cx + sx * hr, y: py }, colour, 1);
    }
  }
}

const CODE_A = "A".charCodeAt(0);

// --- redraw -----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: SubsetsDrawState | null,
  _prev: SubsetsState | null,
  state: SubsetsState,
  _dir: number,
  ui: SubsetsUi,
  _animTime: number,
  flashTime: number,
  _hint?: unknown,
  mistakes?: readonly SubsetsMistake[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { w, h, n } = state;
  const cw = CELL_WIDTH;
  const ch = CELL_HEIGHT;
  const abits = ALL_BITS(n);
  const fontsize = Math.floor((ts * 3) / 4);
  const diameter = Math.floor(ts * 0.7) | 1;
  const radius = Math.floor(diameter / 2);

  const flash = flashTime > 0 && (Math.floor(flashTime / FLASH_FRAME) & 1) === 1;
  const cshow = ui.cshow && flashTime <= 0;
  const firstDraw = !ds.started;

  // Live error verdicts and the tally, recomputed pure from the committed
  // state (upstream recomputes on each state change; this is 16 cells).
  const flags = new Uint8Array(w * h);
  const counts = new Int32Array(w * h);
  subsetsValidate(state, flags, counts);

  // Check & Save overlay: duplicated placements get an inset red frame.
  ds.mistakes.clear();
  for (const m of mistakes ?? []) {
    if (m.kind === "cell") ds.mistakes.add(m.pos, 1);
  }

  if (firstDraw) {
    const size = computeSize({ w, h, n }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_OUTERBG);
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
    // Grey backing behind each cell block; the slot squares drawn one pixel
    // smaller leave it showing as the inner grid lines.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const tx = Math.floor((x * (cw + 1) + 0.5) * ts);
        const ty = Math.floor((y * (ch + 1) + 0.5) * ts);
        dr.drawRect({ x: tx - 1, y: ty - 1, w: ts * cw + 1, h: ts * ch + 1 }, COL_GRID);
        dr.drawUpdate({ x: tx - 1, y: ty - 1, w: ts * cw + 1, h: ts * ch + 1 });
      }
    }
  }

  // The cursor's cell and slot (virtual slot coords -> cell + slot index).
  const curCell = cshow
    ? Math.floor(ui.cy / (ch + 1)) * w + Math.floor(ui.cx / (cw + 1))
    : -1;
  const curSlot = cshow ? (ui.cy % (ch + 1)) * cw + (ui.cx % (cw + 1)) : -1;

  // --- letter slots ---------------------------------------------------------
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const slot = i === curCell ? curSlot : -1;
      const packed =
        (state.known[i] & abits) |
        ((state.mask[i] & abits) << n) |
        (flash ? 1 << (2 * n) : 0) |
        ((slot + 1) << (2 * n + 1));
      if (!firstDraw && ds.cellCache[i] === packed && !ds.mistakes.stale(i)) continue;

      for (let cy = 0; cy < ch; cy++) {
        for (let cx = 0; cx < cw; cx++) {
          const cn = cy * cw + cx;
          if (cn >= n) continue;

          const tx = Math.floor((x * (cw + 1) + cx + 0.5) * ts);
          const ty = Math.floor((y * (ch + 1) + cy + 0.5) * ts);
          const bit = 1 << cn;
          const unknown = (state.known[i] ^ state.mask[i]) & bit;

          dr.drawRect(
            { x: tx, y: ty, w: ts - 1, h: ts - 1 },
            flash || unknown ? COL_INNERBG : COL_HIGHLIGHT,
          );

          if (state.known[i] & bit) {
            dr.drawText(
              { x: tx + Math.floor(ts / 2), y: ty + Math.floor(ts / 2) },
              {
                align: "center",
                baseline: "mathematical",
                fontType: "variable",
                size: fontsize,
              },
              state.immutable[i] & bit ? COL_FIXED : COL_GUESS,
              String.fromCharCode(CODE_A + cn),
            );
          }

          if (slot === cn) {
            // Keyboard cursor: corner brackets at the slot centre
            // (upstream draws these via a blitter; see the header).
            const blr = Math.floor(ts * 0.4);
            drawRectCorners(
              dr,
              tx + Math.floor(ts / 2),
              ty + Math.floor(ts / 2),
              blr - 1,
              COL_CURSOR,
            );
          }
        }
      }

      if (ds.mistakes.packed[i]) {
        // Duplicated placement (Check & Save): inset red frame on the block.
        const bx = Math.floor((x * (cw + 1) + 0.5) * ts);
        const by = Math.floor((y * (ch + 1) + 0.5) * ts);
        const bw = ts * cw - 1;
        const t = Math.floor(ts / 8);
        dr.drawRect({ x: bx, y: by, w: bw, h: t }, COL_ERROR);
        dr.drawRect({ x: bx, y: by, w: t, h: bw }, COL_ERROR);
        dr.drawRect({ x: bx, y: by + bw - t, w: bw, h: t }, COL_ERROR);
        dr.drawRect({ x: bx + bw - t, y: by, w: t, h: bw }, COL_ERROR);
      }

      const ux = Math.floor((x * (cw + 1) + 0.5) * ts);
      const uy = Math.floor((y * (ch + 1) + 0.5) * ts);
      dr.drawUpdate({ x: ux, y: uy, w: ts * cw, h: ts * ch });

      ds.cellCache[i] = packed;
      ds.mistakes.commit(i);
    }
  }

  // --- horseshoe arrows and disjointness crosses ----------------------------
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i1 = y * w + x;
      for (let d = 0; d < 4; d++) {
        const { f, fo, dx, dy } = ADJTHAN[d];
        if (x + dx < 0 || x + dx >= w || y + dy < 0 || y + dy >= h) continue;
        const i2 = i1 + dy * w + dx;

        let tx = Math.floor(
          (x * (cw + 1) + cw * 0.5 + 0.5) * ts + dx * (cw - 0.5) * ts,
        );
        let ty = Math.floor(
          (y * (ch + 1) + ch * 0.5 + 0.5) * ts + dy * (ch - 0.5) * ts,
        );

        dr.clip({
          x: tx - radius - 1,
          y: ty - radius - 1,
          w: diameter + 2,
          h: diameter + 2,
        });

        if (state.clues[i1] & f) {
          if (firstDraw || (flags[i1] & f) !== (ds.oldFlags[i1] & f)) {
            const colour = flags[i1] & f ? COL_ERROR : COL_FIXED;
            dr.drawRect(
              {
                x: tx - radius - 1,
                y: ty - radius - 1,
                w: diameter + 2,
                h: diameter + 2,
              },
              COL_OUTERBG,
            );
            dr.drawCircle({ x: tx, y: ty }, radius, colour, colour);
            dr.drawCircle({ x: tx, y: ty }, radius - 2, COL_OUTERBG, COL_OUTERBG);

            // Open one side of the ring, leaving the horseshoe legs.
            if (f & (F_ADJ_UP | F_ADJ_DOWN)) {
              if (dy > 0) ty -= radius;
              else ty += 1;
              dr.drawRect({ x: tx - radius, y: ty, w: diameter, h: radius }, colour);
              dr.drawRect(
                { x: 2 + tx - radius, y: ty, w: diameter - 4, h: radius },
                COL_OUTERBG,
              );
            } else {
              if (dx > 0) tx -= radius;
              else tx += 1;
              dr.drawRect({ x: tx, y: ty - radius, w: radius, h: diameter }, colour);
              dr.drawRect(
                { x: tx, y: 2 + ty - radius, w: radius, h: diameter - 4 },
                COL_OUTERBG,
              );
            }
            dr.drawUpdate({
              x: tx - radius - 1,
              y: ty - radius - 1,
              w: diameter + 2,
              h: diameter + 2,
            });

            if (colour === COL_ERROR) ds.oldFlags[i1] |= f;
            else ds.oldFlags[i1] &= ~f;
          }
        } else if (i1 < i2 && !(state.clues[i2] & fo)) {
          if (!firstDraw && (flags[i1] & f) === (ds.oldFlags[i1] & f)) {
            // Unchanged; nothing to do.
          } else if (flags[i1] & f) {
            // Violated disjointness: a red cross between the cells.
            dr.drawLine(
              { x: tx - radius, y: ty - radius },
              { x: tx + radius, y: ty + radius },
              COL_ERROR,
              2,
            );
            dr.drawLine(
              { x: tx - radius, y: ty + radius },
              { x: tx + radius, y: ty - radius },
              COL_ERROR,
              2,
            );
            dr.drawUpdate({
              x: tx - radius - 1,
              y: ty - radius - 1,
              w: diameter + 2,
              h: diameter + 2,
            });
            ds.oldFlags[i1] |= f;
          } else {
            dr.drawRect(
              {
                x: tx - radius - 1,
                y: ty - radius - 1,
                w: diameter + 2,
                h: diameter + 2,
              },
              COL_OUTERBG,
            );
            dr.drawUpdate({
              x: tx - radius - 1,
              y: ty - radius - 1,
              w: diameter + 2,
              h: diameter + 2,
            });
            ds.oldFlags[i1] &= ~f;
          }
        }

        dr.unclip();
      }
    }
  }

  // --- the set tally below the grid -----------------------------------------
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cn = x * h + y;
      if (!firstDraw && counts[cn] === ds.oldCounts[cn]) continue;

      const tx = x * (cw + 1) * ts + Math.floor(cw * ts * 0.75);
      const ty = Math.floor(y * 0.75 * ts) + (h + 2) * ch * ts;

      let label = "";
      for (let cx = 0; cx < n; cx++)
        label += cn & (1 << cx) ? String.fromCharCode(CODE_A + cx) : "_";

      const colour =
        counts[cn] > 1 ? COL_ERROR : counts[cn] === 1 ? COL_LOWLIGHT : COL_FIXED;

      dr.drawRect(
        {
          x: tx - ts,
          y: ty - Math.floor(ts * 0.375),
          w: ts * 2,
          h: Math.floor(ts * 0.75),
        },
        COL_OUTERBG,
      );
      dr.drawText(
        { x: tx, y: ty },
        {
          align: "center",
          baseline: "mathematical",
          fontType: "fixed",
          size: Math.floor(ts / 2),
        },
        colour,
        label,
      );
      dr.drawUpdate({
        x: tx - ts,
        y: ty - Math.floor(ts * 0.375),
        w: ts * 2,
        h: Math.floor(ts * 0.75),
      });

      ds.oldCounts[cn] = counts[cn];
    }
  }

  ds.started = true;
}
