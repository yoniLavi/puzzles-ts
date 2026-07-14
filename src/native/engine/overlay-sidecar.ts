/**
 * The render sidecar for a per-cell overlay — playbook §3.2's "every overlay
 * that doesn't live in the tile value MUST be in the diff key" rule, as a type
 * instead of a per-game discipline.
 *
 * An overlay is painted *on top of* a cell, so it can't live in the cell's
 * packed tile value; a game that forgets to also compare it in the cache-miss
 * branch ships an overlay that never repaints. Both overlays this engine has
 * hit that class: the hint overlay (guarded cross-game by
 * `hint-overlay.test.ts`) and the mistake overlay (Towers' Check & Save
 * highlighted nothing because `ds.wrong` was missing from the diff key). Five
 * games hand-wrote the same two-array dance — repack per frame, stale-compare,
 * commit after draw — once per overlay before it was hoisted here.
 *
 * Usage in a game's `redraw`, one instance per overlay:
 *   - pack once per frame — `ds.hint.pack(step?.highlights, index, markBits)`
 *     for the hint's highlight object, `ds.wrong.packCells(mistakes, index)`
 *     for the `findMistakes` cell list, or `clear()` + `add()` for a game whose
 *     overlay has its own topology (Galaxies' four wall bits per tile);
 *   - `ds.<overlay>.stale(i)` as one clause of the per-cell cache-miss test;
 *   - `ds.<overlay>.packed[i]` handed to the cell painter;
 *   - `ds.<overlay>.commit(i)` after the cell is drawn.
 */

/** Bit 0: the cell the deduction acts on (`COL_HINT`). */
export const HINT_TARGET = 1;
/** Bit 1: the evidence area (`COL_HINT_CELL` shade). */
export const HINT_AREA = 2;
/** Bits 2+: candidate `n` struck, in the candidate games' encoding. A game
 * with a different mark payload (Undead's monster bitmask) passes its own
 * `markBits` to {@link OverlaySidecar.pack} instead. */
export const hintMarkBit = (n: number): number => 1 << (2 + n);

/** The word a listed cell gets from {@link OverlaySidecar.packCells} — the
 * mistake overlay is a plain "flagged or not", so one bit is the payload. */
export const OVERLAY_FLAG = 1;

interface Cell {
  readonly x: number;
  readonly y: number;
}

/** The highlight shape `pack` consumes — structurally satisfied by every
 * candidate game's hint type (and by anything with cells and marks). */
export interface PackableHighlights<Mark extends Cell> {
  readonly area?: readonly Cell[];
  readonly targets?: readonly Cell[];
  readonly marks?: readonly Mark[];
}

export class OverlaySidecar {
  /** Per-cell packed overlay for the frame being drawn. */
  readonly packed: Int32Array;
  /** What the canvas currently shows per cell (-1 = never drawn, so the
   * first frame always misses). */
  private readonly drawn: Int32Array;

  constructor(cells: number) {
    this.packed = new Int32Array(cells);
    this.drawn = new Int32Array(cells).fill(-1);
  }

  /** Start a frame's overlay from nothing. The pack entry points below call
   * it; a game packing its own topology calls it, then {@link add}. */
  clear(): void {
    this.packed.fill(0);
  }

  /** OR `bits` into cell `i`'s overlay word for this frame. */
  add(i: number, bits: number): void {
    this.packed[i] |= bits;
  }

  /** Repack this frame's overlay from the displayed step's highlights (or
   * clear it when no hint is displayed). `index` maps board coordinates to
   * the game's cell indexing (stride, border ring, …); `markBits` encodes
   * one mark's payload into the packed word. */
  pack<Mark extends Cell>(
    hl: PackableHighlights<Mark> | undefined,
    index: (x: number, y: number) => number,
    markBits: (mark: Mark) => number,
  ): void {
    this.clear();
    if (!hl) return;
    for (const a of hl.area ?? []) this.add(index(a.x, a.y), HINT_AREA);
    for (const t of hl.targets ?? []) this.add(index(t.x, t.y), HINT_TARGET);
    for (const m of hl.marks ?? []) this.add(index(m.x, m.y), markBits(m));
  }

  /** Repack this frame's overlay from a plain cell list — the `findMistakes`
   * shape. Every listed cell gets {@link OVERLAY_FLAG}, everything else
   * clears (so the overlay's *removal* repaints too). */
  packCells(cells: readonly Cell[] | undefined, index: (x: number, y: number) => number): void {
    this.clear();
    for (const c of cells ?? []) this.add(index(c.x, c.y), OVERLAY_FLAG);
  }

  /** True when cell `i` carries any overlay this frame. */
  at(i: number): boolean {
    return this.packed[i] !== 0;
  }

  /** True when cell `i`'s drawn overlay differs from this frame's — one
   * clause of the game's cache-miss test. */
  stale(i: number): boolean {
    return this.packed[i] !== this.drawn[i];
  }

  /** Record that cell `i` now shows this frame's overlay. */
  commit(i: number): void {
    this.drawn[i] = this.packed[i];
  }
}
