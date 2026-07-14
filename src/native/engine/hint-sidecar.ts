/**
 * The hint-overlay render sidecar — playbook §3.2's "every overlay that
 * doesn't live in the tile value MUST be in the diff key" rule, as a type
 * instead of a per-game discipline.
 *
 * A hint overlay is painted *on top of* a cell, so it can't live in the
 * cell's packed tile value; a game that forgets to also compare it in the
 * cache-miss branch ships an overlay that never repaints (the class the
 * cross-game `hint-overlay.test.ts` guards). Five games hand-wrote the
 * same two-array dance (`hintPacked`/`drawnHint`, repack per frame,
 * stale-compare, commit after draw) before it was hoisted here.
 *
 * Usage in a game's `redraw`:
 *   - `ds.hint.pack(step?.highlights, (x, y) => …, (m) => …)` once per frame;
 *   - `ds.hint.stale(i)` as one clause of the per-cell cache-miss test;
 *   - `ds.hint.packed[i]` handed to the cell painter;
 *   - `ds.hint.commit(i)` after the cell is drawn.
 */

/** Bit 0: the cell the deduction acts on (`COL_HINT`). */
export const HINT_TARGET = 1;
/** Bit 1: the evidence area (`COL_HINT_CELL` shade). */
export const HINT_AREA = 2;
/** Bits 2+: candidate `n` struck, in the candidate games' encoding. A game
 * with a different mark payload (Undead's monster bitmask) passes its own
 * `markBits` to {@link HintSidecar.pack} instead. */
export const hintMarkBit = (n: number): number => 1 << (2 + n);

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

export class HintSidecar {
  /** Per-cell packed overlay for the frame being drawn. */
  readonly packed: Int32Array;
  /** What the canvas currently shows per cell (-1 = never drawn, so the
   * first frame always misses). */
  private readonly drawn: Int32Array;

  constructor(cells: number) {
    this.packed = new Int32Array(cells);
    this.drawn = new Int32Array(cells).fill(-1);
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
    this.packed.fill(0);
    if (!hl) return;
    for (const a of hl.area ?? []) this.packed[index(a.x, a.y)] |= HINT_AREA;
    for (const t of hl.targets ?? []) this.packed[index(t.x, t.y)] |= HINT_TARGET;
    for (const m of hl.marks ?? []) this.packed[index(m.x, m.y)] |= markBits(m);
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
