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

/** A forced single placement, classified against the working board:
 * - `naked` — the cell's own candidates are exactly `{n}`;
 * - `hidden` — a row/column no other empty cell of which can still take `n`;
 * - `forced` — neither (the working notes still show other candidates that deeper
 *   set/forcing deductions, not yet reflected as note strikes, have ruled out). */
export type SinglePlacement =
  | { kind: "naked" }
  | { kind: "hidden"; line: "row" | "col"; index: number }
  | { kind: "forced" };

/**
 * Classify the forced placement of digit `n` at `(x, y)` on the working board
 * (`grid`: 0 = empty; `pencil`: bit `1 << d` = candidate `d`). A genuine naked or
 * hidden single is the common case; `forced` is the residue where the visible
 * notes lag behind the deduction that forced the cell, so a hint must narrate it
 * honestly rather than claim the cell's candidates are down to one.
 */
export function classifyPlacement(
  grid: ArrayLike<number>,
  pencil: ArrayLike<number>,
  x: number,
  y: number,
  n: number,
  w: number,
): SinglePlacement {
  if (pencil[y * w + x] === 1 << n) return { kind: "naked" };
  let row = true;
  for (let k = 0; k < w; k++) {
    if (k === x) continue;
    const j = y * w + k;
    if (grid[j] === 0 && pencil[j] & (1 << n)) {
      row = false;
      break;
    }
  }
  if (row) return { kind: "hidden", line: "row", index: y };
  let col = true;
  for (let k = 0; k < w; k++) {
    if (k === y) continue;
    const j = k * w + x;
    if (grid[j] === 0 && pencil[j] & (1 << n)) {
      col = false;
      break;
    }
  }
  if (col) return { kind: "hidden", line: "col", index: x };
  return { kind: "forced" };
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
