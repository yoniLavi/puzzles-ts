/**
 * Shared hint helpers for the Latin-square family (Towers, Unequal, Keen, and
 * future Solo / Undead). The generic `latin.ts` solver records *every* forced
 * single placement (its `elim`) under one reason — `{ kind: "single" }` — but
 * `elim` fires on three slice kinds: a *cell* slice (a genuine **naked** single,
 * the cell's own candidates collapsed to one) and a *row* / *column* slice (a
 * **hidden** single — a digit that fits only one cell of that line, while the cell
 * itself still shows several candidates).
 *
 * Narrating a hidden single as "every other number has been ruled out in this
 * cell" is wrong — the player is looking at a cell that still visibly holds
 * several candidates. So a hint must re-derive *which* kind it is from the working
 * board and narrate + shade accordingly (a naked single shades the cell alone; a
 * hidden single names and shades its whole row/column). This module is that
 * re-derivation, shared so every Latin game tells the truth the same way.
 */

import { joinNums } from "./candidate-hint.ts";

/** A forced single placement, classified against the working board:
 * - `naked` — the cell's own candidates are exactly `{n}`;
 * - `hidden` — a row/column no other empty cell of which can still take `n`;
 * - `forced` — neither (the working notes still show other candidates that deeper
 *   set/forcing deductions, not yet reflected as note strikes, have ruled out). */
export type SinglePlacement =
  | { kind: "naked" }
  | { kind: "hidden"; line: "row" | "col"; index: number }
  | { kind: "forced" };

/** A region the {@link classifyPlacementInRegions} classifier reasons over: its
 * member cell indices (`y * w + x`). A game tags each region with whatever it
 * needs to name it (a `line`/`index` for a row/column, a `kind` for a sub-block
 * or diagonal) and reads that tag back off the returned `region`. */
export interface ClassifyRegion {
  cells: ArrayLike<number>;
}

/** Whether the forced placement of digit `n` at `cell` is a *naked* single (the
 * cell's notes are exactly `{n}`), a *hidden* single in one of `regions` (no other
 * empty cell of that region still notes `n`), or otherwise *forced* (the notes lag
 * a deeper deduction). The generic core of "re-derive the why" (hint-authoring
 * §9.3a) for any candidate-elimination game: the Latin row/column games pass
 * `[row, column]`; Solo passes `[row, column, block, diag0, diag1]`. Regions are
 * tested in order, so the first match wins (callers list them in narration
 * preference order). */
export function classifyPlacementInRegions<R extends ClassifyRegion>(
  grid: ArrayLike<number>,
  pencil: ArrayLike<number>,
  cell: number,
  n: number,
  regions: readonly R[],
): { kind: "naked" } | { kind: "hidden"; region: R } | { kind: "forced" } {
  if (pencil[cell] === 1 << n) return { kind: "naked" };
  const bit = 1 << n;
  for (const region of regions) {
    let hidden = true;
    for (let i = 0; i < region.cells.length; i++) {
      const j = region.cells[i];
      if (j === cell) continue;
      if (grid[j] === 0 && pencil[j] & bit) {
        hidden = false;
        break;
      }
    }
    if (hidden) return { kind: "hidden", region };
  }
  return { kind: "forced" };
}

/** A row/column region tagged for narration: the cells of the line plus whether it
 * is a `row` (`index` = its y) or `col` (`index` = its x). */
export interface RowColRegion {
  cells: number[];
  line: "row" | "col";
  index: number;
}

/** The two uniqueness regions of cell `(x, y)` in a plain Latin square: its row
 * and its column, in narration-preference order (row first). The `regionsOf`
 * provider for Towers / Unequal / Keen — those games' *only* uniqueness regions (a
 * Keen cage is an arithmetic constraint, not a uniqueness region). The single
 * source of truth shared by the placement classifier, the basic-region strike and
 * the placement dup-cull, so they can never disagree about a cell's regions. */
export function rowColRegions(x: number, y: number, w: number): RowColRegion[] {
  const row: number[] = [];
  const col: number[] = [];
  for (let k = 0; k < w; k++) {
    row.push(y * w + k);
    col.push(k * w + x);
  }
  return [
    { cells: row, line: "row", index: y },
    { cells: col, line: "col", index: x },
  ];
}

/**
 * Classify the forced placement of digit `n` at `(x, y)` on the working board
 * (`grid`: 0 = empty; `pencil`: bit `1 << d` = candidate `d`) as a naked / hidden
 * (row or column) / forced single — the row/column specialisation of
 * {@link classifyPlacementInRegions}. A genuine naked or hidden single is the
 * common case; `forced` is the residue where the visible notes lag behind the
 * deduction that forced the cell, so a hint must narrate it honestly rather than
 * claim the cell's candidates are down to one.
 */
export function classifyPlacement(
  grid: ArrayLike<number>,
  pencil: ArrayLike<number>,
  x: number,
  y: number,
  n: number,
  w: number,
): SinglePlacement {
  const c = classifyPlacementInRegions(
    grid,
    pencil,
    y * w + x,
    n,
    rowColRegions(x, y, w),
  );
  if (c.kind === "hidden")
    return { kind: "hidden", line: c.region.line, index: c.region.index };
  return c;
}

/** The reason a forced single placement carries — shared across the Latin family
 * (every game's `HintReason` union includes these three `kind`s: `single` from the
 * generic `LatinReason`, plus the game-local `hiddenSingle` / `forcedSingle`). */
export type SingleReason =
  | { kind: "single" }
  | { kind: "hiddenSingle"; n: number; line: "row" | "col"; index: number }
  | { kind: "forcedSingle"; n: number };

/** Re-derive *why* a generic-`single` placement is forced, from the working board:
 * a naked single (the cell's candidates collapsed to one), a hidden single (the
 * digit fits only one cell of a row/column), or a forced single (deeper combined
 * deductions the notes don't yet reflect). The recording solver records all three
 * under one `single` reason; this tells them apart so the narration is truthful. */
export function singlePlacementReason(
  grid: ArrayLike<number>,
  pencil: ArrayLike<number>,
  x: number,
  y: number,
  n: number,
  w: number,
): SingleReason {
  const c = classifyPlacement(grid, pencil, x, y, n, w);
  switch (c.kind) {
    case "naked":
      return { kind: "single" };
    case "hidden":
      return { kind: "hiddenSingle", n, line: c.line, index: c.index };
    case "forced":
      return { kind: "forcedSingle", n };
  }
}

/** The cells of a hidden single's line — the whole row (`line: "row"`, `index` =
 * its y) or column (`line: "col"`, `index` = its x) — to shade as evidence. */
export function hiddenSingleLine(
  line: "row" | "col",
  index: number,
  w: number,
): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  if (line === "row") for (let k = 0; k < w; k++) cells.push({ x: k, y: index });
  else for (let k = 0; k < w; k++) cells.push({ x: index, y: k });
  return cells;
}

/** The generic Latin reasons whose narration is shared verbatim by the *row/column*
 * games (Keen, Unequal): a {@link SingleReason} (naked / hidden / forced single)
 * plus the generic `dup` / `set` / `forcing` eliminations from `LatinReason`. The
 * `dup` reason may carry extra fields (`px`/`py`) — only `n` is read here. */
export type GenericLatinReason =
  | SingleReason
  | { kind: "dup"; n: number }
  | { kind: "set" }
  | { kind: "forcing" };

/** Narrate a generic Latin reason — the six arms that read *identically* across
 * the row/column Latin games (Keen, Unequal). Shared so a wording improvement to,
 * say, the hidden-single sentence lands in one place instead of drifting between
 * those games. `ns` is the value list the arm refers to (the placed value for a
 * single, the struck values for `set` / `forcing`).
 *
 * Scope is deliberately the **row/column** games only: Solo's generic arms diverge
 * (its single/dup/set name "row, column **and block**" and its `hiddenSingle` names
 * a block/diagonal region), and Towers narrates the whole family in "height"
 * vocabulary with a single value, not an `ns` list — both keep their own `narrate`
 * (see `docs/porting/hint-authoring.md` §9.2). Each row/column game still owns its
 * game-specific arms (Keen's cage*, Unequal's greater/lesser/adjacent*) and
 * delegates only the generic ones here. */
export function narrateLatinReason(reason: GenericLatinReason, ns: number[]): string {
  switch (reason.kind) {
    case "single":
      return `Every other number has been ruled out in this cell, so it can only be ${ns[0]}.`;
    case "hiddenSingle":
      return `In this ${reason.line === "row" ? "row" : "column"}, ${reason.n} can go in only this cell — every other cell in the ${reason.line === "row" ? "row" : "column"} has ruled it out — so it must be ${reason.n}.`;
    case "forcedSingle":
      return `Working through this cell's row and column together, only ${reason.n} can still go here — so it must be ${reason.n}.`;
    case "dup":
      return `There's already a ${reason.n} in this row and column, so we must cross out the ${reason.n} from the other cells they pass through.`;
    case "set":
      return `Another group of cells already accounts for a fixed set of numbers that includes ${joinNums(ns)}, so we must cross out ${joinNums(ns)} here.`;
    case "forcing":
      return `Following a chain of two-candidate cells, placing ${ns[0]} here would force a contradiction further along — so we must cross out ${joinNums(ns)}.`;
  }
}
