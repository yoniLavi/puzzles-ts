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

import type { NoteEncoding } from "./candidate-hint.ts";
import type { ForcingLink } from "./latin.ts";
import type { OrderedCell } from "./overlay-sidecar.ts";

/** Re-exported so a game declaring its own reason union reaches the chain shape
 * from the hint module it already imports (as `latin.ts` does for
 * `DeductionRecord`). */
export type { ForcingLink };

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
  enc?: NoteEncoding,
): { kind: "naked" } | { kind: "hidden"; region: R } | { kind: "forced" } {
  const bit = (enc?.bit ?? ((v: number): number => 1 << v))(n);
  if (pencil[cell] === bit) return { kind: "naked" };
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
 * (row or column) / forced single — the row/column specialization of
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
  enc?: NoteEncoding,
): SinglePlacement {
  const c = classifyPlacementInRegions(
    grid,
    pencil,
    y * w + x,
    n,
    rowColRegions(x, y, w),
    enc,
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
  enc?: NoteEncoding,
): SingleReason {
  const c = classifyPlacement(grid, pencil, x, y, n, w, enc);
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
  | { kind: "forcing"; chain: readonly ForcingLink[]; shares: "row" | "col" };

/**
 * The value vocabulary a game's cells are spoken in — the *only* thing that used
 * to keep a letter-valued Latin game off the shared narration arms below
 * (`add-salad-hint`, design D5). Three games kept private copies of the same six
 * arms; two of those copies differed **solely** in the noun and how a value
 * prints (Group's elements are letters `a`–`z`; Salad's symbols are `A`–`C` or
 * `1`–`3` depending on its mode).
 *
 * `noun` is the singular ("number", "element", "letter"); its plural is
 * `${noun}s`, which is right for every value word in the collection. `value`
 * renders one value.
 *
 * **Who declines, and why** (measured against the arms, not assumed):
 * **Towers** needs the value *qualified* in some arms and bare in others
 * ("height 5 can go in only this cell … so it must be 5"), i.e. two renderers
 * for six arms; **Solo** names a different region set per arm ("row, column
 * **and** block", plus block/diagonal region names in `hiddenSingle`). Both stay
 * on their own `narrate` — one vocabulary can't express a per-arm difference,
 * and forcing it would read worse than the duplication (docs/games/hints.md § "Persist, populate, and the moves"'s
 * standing rule).
 */
export interface LatinVocab {
  /** Singular noun for a cell's value: "number", "element", "letter", … */
  noun: string;
  /** How one value prints. */
  value(n: number): string;
  /** What the game calls a board position. Default "cell"; Salad's board is
   * squares, and mixing the two words inside one game's hints reads as sloppy. */
  cell?: string;
}

const NUMBER_VOCAB: LatinVocab = { noun: "number", value: (n) => String(n) };

/** "a" or "an" for `s` — chosen by how the *word* is pronounced, so a letter
 * value ("an A", "a B") and a digit ("a 6", "an 8") both read correctly. The
 * arms below say "There's already a …", which without this reads "a A" / "a 8"
 * (the latter a pre-existing wart in the digit games' narration). */
function indefinite(s: string): string {
  return /^(?:[aefhilmnorsx]|8|11|18)/i.test(s) ? "an" : "a";
}

/** Narrate a generic Latin reason — the six arms that read *identically* across
 * the row/column Latin games once their value vocabulary is factored out
 * ({@link LatinVocab}): Keen and Unequal (numbers), Group (elements) and Salad
 * (letters or numbers). Shared so a wording improvement to, say, the
 * hidden-single sentence lands in one place instead of drifting between them.
 * `ns` is the value list the arm refers to (the placed value for a single, the
 * struck values for `set` / `forcing`).
 *
 * `vocab` defaults to plain numbers, so the two original callers are unchanged.
 * Each game still owns its game-specific arms (Keen's cage*, Unequal's
 * greater/lesser/adjacent*, Salad's border/count/sync, Group's associativity)
 * and delegates only the generic ones here. */
export function narrateLatinReason(
  reason: GenericLatinReason,
  ns: number[],
  vocab: LatinVocab = NUMBER_VOCAB,
): string {
  const { noun } = vocab;
  const v = vocab.value;
  const cell = vocab.cell ?? "cell";
  const cells = `${cell}s`;
  // `joinWith(xs.map(String))` is exactly `joinNums(xs)`, so the digit games'
  // lists are byte-identical to before.
  const list = (xs: number[]): string => joinWith(xs.map(v));
  switch (reason.kind) {
    case "single":
      return `Every other ${noun} has been ruled out in this ${cell}, so it can only be ${v(ns[0])}.`;
    case "hiddenSingle":
      return `In this ${reason.line === "row" ? "row" : "column"}, ${v(reason.n)} can go in only this ${cell}, since every other ${cell} in the ${reason.line === "row" ? "row" : "column"} rules it out, so it must be ${v(reason.n)}.`;
    case "forcedSingle":
      return `Working through this ${cell}'s row and column together, only ${v(reason.n)} can still go here, so it must be ${v(reason.n)}.`;
    case "dup": {
      const d = v(reason.n);
      return `There's already ${indefinite(d)} ${d} in this row and column, so we must cross out the ${d} from the other ${cells} they pass through.`;
    }
    case "set":
      return `Another group of ${cells} already accounts for ${list(ns)} between them, so we must cross out ${list(ns)} here.`;
    case "forcing":
      return narrateForcingChain(
        reason,
        ns[0],
        vocab,
        reason.shares === "row" ? "row" : "column",
      );
  }
}

/** Sentence-initial form of a vocabulary's cell word. */
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A forcing chain's cells as **ordered** evidence, so the board shows which
 * consequence fell when and the narration can cite them by number
 * (`walk-tactic-hint-chains`). Shaded like any other evidence area; the ordinal
 * is what makes the shading a chain rather than a heap.
 *
 * Shared by every game whose forcing reason comes from `latin.ts`, so the
 * numbering can never disagree with the sentence between games.
 */
export function forcingChainArea(reason: {
  chain: readonly ForcingLink[];
}): OrderedCell[] {
  return reason.chain.map((c, i) => ({ x: c.x, y: c.y, order: i + 1 }));
}

/**
 * Narrate a forcing chain as the argument it actually is
 * (`walk-tactic-hint-chains`). It replaces *"Following a chain of two-candidate
 * cells, placing 5 here would force a contradiction further along"*, which named
 * no contradiction, pointed at no cell and showed no chain — a claim the player
 * could only check by redoing the deduction.
 *
 * **The case split is the load-bearing part.** A forcing chain does not refute a
 * hypothesis; it concludes from *both* branches of one, and a walk that narrates
 * only the chain has a final leg that does not follow from its own premises (the
 * Palisade lesson, `docs/games/hints.md` § "Writing the narration"):
 *
 * - the origin (chain cell 1) has exactly two candidates, the struck value and
 *   one other;
 * - **if it is the struck value**, the conclusion cell loses that value by plain
 *   uniqueness — the two share the line `reason.shares` names;
 * - **if it is the other**, each link forces the next (every chain cell has just
 *   two candidates left, so losing one leaves one), until the last link is
 *   driven *to* the struck value — and it too lines up with the conclusion cell,
 *   because it is a row/column neighbor of it by construction.
 *
 * The links between are numbered on the board rather than recited here; reciting
 * them would put the chain back in the reader's head, which is the thing the
 * marks exist to prevent. What the sentence must supply is the **rule** that
 * propagates it, since that is the technique the player is being taught and it
 * is nowhere on the board.
 *
 * **Exported, because Towers and Solo keep their own `narrate`.** They decline
 * {@link narrateLatinReason} for a reason that does not apply to this arm — they
 * need a value qualified in *some* arms and bare in others, and a different
 * region set per arm — and neither is at issue here: "two heights left" already
 * contextualizes the bare numbers, and `region` is a parameter. A chain sentence
 * that drifted between six games would be six chances to say something the
 * board does not show.
 *
 * `region` is what the conclusion shares with the origin — a row or column
 * everywhere except Solo, which also reasons over blocks and diagonals.
 *
 * **The deixis tie is the numbering itself.** Two cell-marks on screen normally
 * make a bare "this cell" ambiguous (`disambiguate-hint-deixis`), and this frame
 * shows several — but every chain cell is *numbered* and the conclusion is not,
 * so "cell 1"/"cell 5" and "this cell" pick out different things by the presence
 * or absence of a label rather than by a color. See `docs/games/hints.md` §
 * "The fix is never the color".
 */
export function narrateForcingChain(
  reason: { chain: readonly ForcingLink[] },
  struck: number,
  vocab: LatinVocab,
  region: string,
): string {
  const v = vocab.value;
  const cell = vocab.cell ?? "cell";
  const last = reason.chain.length;
  const other = v(reason.chain[0].n);
  const s = v(struck);
  return `${cap(cell)} 1 is ${s} or ${other}, and every numbered ${cell} has just two ${vocab.noun}s left, so each forces the next. If ${cell} 1 is ${s}, this ${cell}'s ${region} already has it; if ${other}, ${cell} ${last} is driven to ${s}, in line with this ${cell}. Either way, cross out ${s} here.`;
}

/** {@link joinNums} over already-rendered values: `["A","B"]` → "A and B". */
export function joinWith(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
