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
import { BLUE, ORANGE } from "../../engine/colours.ts";
import { drawRectCorners } from "../../engine/draw.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import {
  HINT_AREA,
  HINT_TARGET,
  OverlaySidecar,
} from "../../engine/overlay-sidecar.ts";
import {
  ERROR,
  GRID_MID,
  HINT_ACTION,
  HINT_EVIDENCE,
  INK,
  playerEntryColour,
} from "../../engine/palette.ts";
import type { SubsetsHintHighlights } from "./index.ts";
import { candidateCells, candidateSets, subsetsValidate } from "./solver.ts";
import {
  ADJTHAN,
  ALL_BITS,
  CELL_HEIGHT,
  CELL_WIDTH,
  F_ADJ_DOWN,
  F_ADJ_UP,
  type SubsetsMistake,
  type SubsetsMove,
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
// Hint / reference-aid legend (add-subsets-hint): the slot the current step
// decides gets a bold COL_HINT frame; a highlighted neighbour cell (across a
// horseshoe) or highlighted tally set is COL_HINT_CELL; and the cells a
// spotlit set can still go in (a hidden single's one home, or the player-clicked
// reference-aid set) get a COL_HINT_SPOT frame.
export const COL_HINT = 9;
export const COL_HINT_CELL = 10;
export const COL_HINT_SPOT = 11;
// The cell where a *placed* set already sits (reference aid #3) — distinct from
// the green "could still go here" spotlight.
export const COL_HINT_PLACED = 12;

/** Sidecar bit: a cell a spotlit set can still be placed in. */
const HINT_SPOT = 4;
/** Sidecar bit: the cell a clicked *placed* set already sits in. */
const HINT_PLACED = 8;

export function colours(defaultBackground: Colour): Colour[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const out: Colour[] = [];
  out[COL_OUTERBG] = defaultBackground;
  out[COL_INNERBG] = background;
  out[COL_GRID] = GRID_MID;
  out[COL_HIGHLIGHT] = highlight;
  out[COL_LOWLIGHT] = lowlight;
  out[COL_FIXED] = INK;
  out[COL_GUESS] = playerEntryColour(background);
  out[COL_ERROR] = ERROR;
  out[COL_CURSOR] = BLUE;
  out[COL_HINT] = HINT_ACTION;
  out[COL_HINT_CELL] = HINT_EVIDENCE;
  out[COL_HINT_SPOT] = HINT_ACTION;
  out[COL_HINT_PLACED] = ORANGE;
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
  /** Hint overlay: `HINT_TARGET | HINT_AREA` per cell, plus the target slot
   * index packed in bits 4+ (`(slot + 1) << 4`, 0 = no target slot). */
  hint: OverlaySidecar;
  /** Set-values the hint highlights in the tally band (1 = highlighted),
   * indexed by set-value; compared against {@link SubsetsDrawState.oldHintSets}
   * in the tally cache-miss test. */
  hintSets: Uint8Array;
  oldHintSets: Uint8Array;
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
    hint: new OverlaySidecar(s),
    hintSets: new Uint8Array(s),
    oldHintSets: new Uint8Array(s),
  };
}

/** Bit offset for the target slot index within the hint sidecar's packed word
 * (`HINT_TARGET`/`HINT_AREA` occupy bits 0–1). */
const HINT_SLOT_SHIFT = 4;

export function setTileSize(ds: SubsetsDrawState, ts: number): void {
  ds.tilesize = ts;
}

// --- helpers ----------------------------------------------------------------

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
  hint?: HintStep<SubsetsMove, SubsetsHintHighlights>,
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

  // Hint + reference-aid overlay: the current step's target slot (bold frame),
  // highlighted neighbour cells (light frame), spotlit placement cells, and
  // highlighted tally sets — repacked each frame so a dropped hint repaints too.
  ds.hint.clear();
  ds.hintSets.fill(0);
  const hl = hint?.highlights;
  if (hl && hint) {
    const slot = hint.move.kind === "set" ? hint.move.bit : -1;
    ds.hint.add(
      hl.target.y * w + hl.target.x,
      HINT_TARGET | ((slot + 1) << HINT_SLOT_SHIFT),
    );
    for (const e of hl.cells) ds.hint.add(e.y * w + e.x, HINT_AREA);
    for (const c of hl.spotlight) ds.hint.add(c.y * w + c.x, HINT_SPOT);
    for (const v of hl.sets) if (v >= 0 && v < w * h) ds.hintSets[v] = 1;
  } else if (
    ui.highlightSet !== null &&
    ui.highlightSet >= 0 &&
    ui.highlightSet < w * h
  ) {
    // Reference aid, set→cells: a clicked tally set lights up every cell it can
    // still go in (green). If the set is already placed, its home cell is lit a
    // distinct colour instead — where it *is*, not where it could go (#3).
    ds.hintSets[ui.highlightSet] = 1;
    for (const i of candidateCells(state, ui.highlightSet)) {
      const placed = state.known[i] === state.mask[i];
      ds.hint.add(i, placed ? HINT_PLACED : HINT_SPOT);
    }
  } else if (
    ui.highlightCell !== null &&
    ui.highlightCell >= 0 &&
    ui.highlightCell < w * h
  ) {
    // Reference aid, cell→sets (#1): a focused cell lights up, and every set it
    // could still hold is tinted in the tally.
    ds.hint.add(ui.highlightCell, HINT_SPOT);
    for (const v of candidateSets(state, ui.highlightCell)) ds.hintSets[v] = 1;
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
      if (
        !firstDraw &&
        ds.cellCache[i] === packed &&
        !ds.mistakes.stale(i) &&
        !ds.hint.stale(i)
      )
        continue;

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

      // Reference-aid inspect icon: a badge in the margin *above* the block —
      // outside it, so it reads as belonging to the whole cell, not one slot.
      // Clicking it (a touch-sized strip along the block's top edge, index.ts
      // `iconHit`) lights this cell's still-possible sets in the tally; it fills
      // green while this cell is focused. Player focus is suppressed while a
      // hint is displayed, so `hl` gates the lit state.
      const iconR = Math.max(3, Math.floor(ts * 0.16));
      const iconY = Math.floor((y * (ch + 1) + 0.5) * ts) - Math.floor(ts * 0.28);
      {
        const icx = Math.floor((x * (cw + 1) + 0.5) * ts) + Math.floor(ts * 0.22);
        const active = !hl && ui.highlightCell === i;
        // Clear the badge's patch of margin, then draw the ring / green disc.
        dr.drawRect(
          {
            x: icx - iconR - 1,
            y: iconY - iconR - 1,
            w: 2 * iconR + 3,
            h: 2 * iconR + 3,
          },
          COL_OUTERBG,
        );
        dr.drawCircle(
          { x: icx, y: iconY },
          iconR,
          active ? COL_HINT_SPOT : COL_LOWLIGHT,
          active ? COL_HINT_SPOT : COL_OUTERBG,
        );
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

      const hintBits = ds.hint.packed[i];
      if (hintBits & (HINT_AREA | HINT_SPOT | HINT_PLACED)) {
        // Evidence frame: the "highlighted cell" a hint points at (light), a
        // spotlit placement a set could go in / a focused cell (green), or the
        // home of a clicked placed set (amber, #3).
        const colour =
          hintBits & HINT_PLACED
            ? COL_HINT_PLACED
            : hintBits & HINT_SPOT
              ? COL_HINT_SPOT
              : COL_HINT_CELL;
        const bx = Math.floor((x * (cw + 1) + 0.5) * ts);
        const by = Math.floor((y * (ch + 1) + 0.5) * ts);
        const bw = ts * cw - 1;
        const t = Math.max(1, Math.floor(ts / 10));
        dr.drawRect({ x: bx, y: by, w: bw, h: t }, colour);
        dr.drawRect({ x: bx, y: by, w: t, h: bw }, colour);
        dr.drawRect({ x: bx, y: by + bw - t, w: bw, h: t }, colour);
        dr.drawRect({ x: bx + bw - t, y: by, w: t, h: bw }, colour);
      }
      if (hintBits & HINT_TARGET) {
        // The slot the current step decides: a bold frame around that one slot
        // square (the interior is left clear — the hint shows *where*, the
        // player marks it).
        const targetSlot = (hintBits >> HINT_SLOT_SHIFT) - 1;
        if (targetSlot >= 0 && targetSlot < cw * ch) {
          const scx = targetSlot % cw;
          const scy = Math.floor(targetSlot / cw);
          const tx = Math.floor((x * (cw + 1) + scx + 0.5) * ts);
          const ty = Math.floor((y * (ch + 1) + scy + 0.5) * ts);
          const sw = ts - 1;
          const t = Math.max(2, Math.floor(ts / 8));
          dr.drawRect({ x: tx, y: ty, w: sw, h: t }, COL_HINT);
          dr.drawRect({ x: tx, y: ty, w: t, h: sw }, COL_HINT);
          dr.drawRect({ x: tx, y: ty + sw - t, w: sw, h: t }, COL_HINT);
          dr.drawRect({ x: tx + sw - t, y: ty, w: t, h: sw }, COL_HINT);
        }
      }

      const ux = Math.floor((x * (cw + 1) + 0.5) * ts);
      const uy = Math.floor((y * (ch + 1) + 0.5) * ts);
      // Extend the update region up to cover the inspect badge above the block.
      const topPad = uy - (iconY - iconR - 1);
      dr.drawUpdate({ x: ux, y: uy - topPad, w: ts * cw, h: ts * ch + topPad });

      ds.cellCache[i] = packed;
      ds.mistakes.commit(i);
      ds.hint.commit(i);
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
      const hinted = ds.hintSets[cn];
      if (
        !firstDraw &&
        counts[cn] === ds.oldCounts[cn] &&
        hinted === ds.oldHintSets[cn]
      )
        continue;

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
        // "The highlighted set": a hint tints the tally entry it points at.
        hinted ? COL_HINT_CELL : COL_OUTERBG,
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
      ds.oldHintSets[cn] = hinted;
    }
  }

  ds.started = true;
}
