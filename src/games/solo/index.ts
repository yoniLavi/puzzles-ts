/**
 * Solo (Sudoku) — native TS port of `solo.c`. Fill a `cr × cr` grid (`cr = c·r`)
 * with digits `1..cr` so every row, column and sub-block holds each digit once;
 * variants add irregular (jigsaw) blocks, two main diagonals (X), and digit-sum
 * cages (killer). Left-click / cursor-select highlights a cell for a real entry;
 * right-click / select2 highlights it for a pencil mark (or toggles sticky
 * pencil mode); a digit enters (or pencil-toggles) that value; backspace/space
 * clears. Duplicate digits and over-full cages highlight live; Check & Save
 * additionally flags cells that contradict the unique solution.
 */

import { assertNever } from "../../engine/assert-never.ts";
import {
  adaptiveMarkAllMove,
  candidateHint,
  emitObviousCleanStep,
  keepCandidateHintTrack,
  lazyPopulate,
  nakedSingle,
  nextPlace,
  nextStrike,
  refreshCandidateHintStep,
  regionDuplicateMarks,
} from "../../engine/candidate-hint.ts";
import type { DifficultyContract } from "../../engine/difficulty.ts";
import { winFlash } from "../../engine/flash.ts";
import {
  type Game,
  type HintResult,
  type HintStep,
  type HintTrackVerdict,
  type PresetMenu,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { digitKeys } from "../../engine/key-labels.ts";
import {
  classifyPlacementInRegions,
  forcingChainArea,
} from "../../engine/latin-hint.ts";
import {
  noOpEntryResult,
  pressNoteTakingCell,
  releaseHighlightAfterEntry,
} from "../../engine/note-taking-cell.ts";
import type { OrderedCell } from "../../engine/overlay-sidecar.ts";
import { parseConfigInt } from "../../engine/params.ts";
import {
  autoPencilPref,
  pencilKeepHighlightPref,
  stickyPencilPref,
} from "../../engine/pencil-prefs.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  digitOf,
  isCursorMove,
  isEraseKey,
  moveCursor,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import type { ConfigValues, KeyLabel, Point, Size } from "../../engine/types.ts";
import { newSoloDesc } from "./generator.ts";
import { say } from "./hint-text.ts";
import {
  colors,
  computeSize,
  FLASH_TIME,
  fromCoord,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type SoloDrawState,
  type SoloHint,
  setTileSize,
} from "./render.ts";
import {
  type HintOp,
  recordSoloDeductions,
  type SoloReason,
  type SoloRegion,
  solveSolo,
} from "./solver.ts";
import {
  checkValid,
  cloneState,
  DIFF_AMBIGUOUS,
  DIFF_BLOCK,
  DIFF_EXTREME,
  DIFF_IMPOSSIBLE,
  DIFF_INTERSECT,
  DIFF_KINTERSECT,
  DIFF_KMINMAX,
  DIFF_NAMES,
  DIFF_RECURSIVE,
  DIFF_SET,
  DIFF_SIMPLE,
  decodeParams,
  defaultParams,
  diag0,
  diag1,
  encodeParams,
  newState,
  newUi,
  onDiag0,
  onDiag1,
  type SoloMistake,
  type SoloMove,
  type SoloParams,
  type SoloState,
  type SoloUi,
  SYMM_NONE,
  SYMM_ROT2,
  status as soloStatus,
  validateDesc,
  validateParams,
} from "./state.ts";

/** Upstream's `game_presets`, with its non-`SLOW_SYSTEM` entries always shown. */
function presets(): PresetMenu<SoloParams> {
  // The title is derived from the params, so the menu names a tier exactly as
  // the Custom dialog does. The shape is upstream's: size (or jigsaw), then the
  // tier, then the X marker; a Killer preset is named for its mode, which is
  // what distinguishes it from the plain preset at the same tier.
  const P = (
    c: number,
    r: number,
    symm: number,
    diff: number,
    kdiff: number,
    xtype: boolean,
    killer: boolean,
  ): PresetMenu<SoloParams> => {
    const size = r === 1 ? `${c} Jigsaw` : `${c}x${r}`;
    const title = killer
      ? `${size} Killer`
      : `${size} ${DIFF_NAMES[diff]}${xtype ? " X" : ""}`;
    return { title, params: { c, r, symm, diff, kdiff, xtype, killer } };
  };
  const K = DIFF_KMINMAX;
  const submenu = [
    P(2, 2, SYMM_ROT2, DIFF_BLOCK, K, false, false),
    P(2, 3, SYMM_ROT2, DIFF_SIMPLE, K, false, false),
    P(3, 3, SYMM_ROT2, DIFF_BLOCK, K, false, false),
    P(3, 3, SYMM_ROT2, DIFF_SIMPLE, K, false, false),
    P(3, 3, SYMM_ROT2, DIFF_SIMPLE, K, true, false),
    P(3, 3, SYMM_ROT2, DIFF_INTERSECT, K, false, false),
    P(3, 3, SYMM_ROT2, DIFF_SET, K, false, false),
    P(3, 3, SYMM_ROT2, DIFF_SET, K, true, false),
    P(3, 3, SYMM_ROT2, DIFF_EXTREME, K, false, false),
    P(3, 3, SYMM_ROT2, DIFF_RECURSIVE, K, false, false),
    P(3, 3, SYMM_NONE, DIFF_BLOCK, DIFF_KINTERSECT, false, true),
    P(9, 1, SYMM_ROT2, DIFF_SIMPLE, K, false, false),
    P(9, 1, SYMM_ROT2, DIFF_SIMPLE, K, true, false),
    P(9, 1, SYMM_ROT2, DIFF_SET, K, false, false),
    P(3, 4, SYMM_ROT2, DIFF_SIMPLE, K, false, false),
    P(4, 4, SYMM_ROT2, DIFF_SIMPLE, K, false, false),
  ];
  return { title: "Solo", submenu };
}

function inGrid(cr: number, x: number, y: number): boolean {
  return x >= 0 && x < cr && y >= 0 && y < cr;
}

function interpretMove(
  state: SoloState,
  ui: SoloUi,
  ds: SoloDrawState,
  p: Point,
  rawButton: number,
): SoloMove | null | UiUpdate {
  const cr = state.cr;
  const ts = ds.tileSize;
  const button = stripModifiers(rawButton);

  const tx = fromCoord(p.x, ts);
  const ty = fromCoord(p.y, ts);

  if (
    inGrid(cr, tx, ty) &&
    pressNoteTakingCell(ui, button, tx, ty, {
      canEnter: !state.immutable[ty * cr + tx],
      canMark: state.grid[ty * cr + tx] === 0,
    })
  ) {
    return UI_UPDATE;
  }

  if (isCursorMove(button)) {
    ui.cursorFromKeyboard = true;
    return moveCursor(ui.cursor, button, cr, cr) ? UI_UPDATE : null;
  }

  if (ui.cursor.visible && button === CURSOR_SELECT) {
    ui.pencilMode = !ui.pencilMode;
    ui.cursorFromKeyboard = true;
    return UI_UPDATE;
  }

  // A digit key (1..9 then a..z / A..Z for orders > 9), or a clear.
  let n = -1;
  const digit = digitOf(button);
  if (digit !== null && digit <= cr) n = digit;
  else if (button >= 97 && button <= 122 && button - 97 + 10 <= cr)
    n = button - 97 + 10;
  else if (button >= 65 && button <= 90 && button - 65 + 10 <= cr) n = button - 65 + 10;
  else if (button === CURSOR_SELECT2 || isEraseKey(button)) n = 0;

  if (ui.cursor.visible && n >= 0) {
    const i = ui.cursor.y * cr + ui.cursor.x;

    // Can't overwrite a given (reachable only via the cursor).
    if (state.immutable[i]) return null;
    // Can't pencil-mark a filled square (reachable only via the cursor).
    if (ui.pencilMode && state.grid[i]) return null;

    // No-op: re-entering the value the cell already holds (or clearing an empty
    // cell) with no pencil marks to wipe.
    if ((!ui.pencilMode || n === 0) && state.grid[i] === n && state.pencil[i] === 0)
      return noOpEntryResult(ui);

    const pencil = ui.pencilMode && n > 0;
    releaseHighlightAfterEntry(ui);
    return pencil
      ? { type: "set", x: ui.cursor.x, y: ui.cursor.y, n, pencil }
      : {
          type: "set",
          x: ui.cursor.x,
          y: ui.cursor.y,
          n,
          pencil,
          autoElim: ui.autoPencil,
        };
  }

  // 'M' / 'm': fill all pencil marks, then (on a fully-noted board) clean the
  // obvious candidates already placed in each cell's row, column, block or (X)
  // diagonal — the basic-region opening, in one press.
  if (button === 77 || button === 109)
    return adaptiveMarkAllMove<SoloMove>(state.grid, state.pencil, cr, (x, y) =>
      regionsOf(state, x, y),
    );

  return null;
}

/** Strike digit `n` from the pencil marks of every cell sharing a row, column,
 * block (or diagonal when xtype) with `(x, y)` — auto-pencil cleanup on a real
 * placement. */
function autoEliminate(state: SoloState, x: number, y: number, n: number): void {
  const cell = y * state.cr + x;
  for (const { cells } of regionsOf(state, x, y))
    for (const c of cells) if (c !== cell) state.pencil[c] &= ~(1 << n);
}

function executeMove(state: SoloState, move: SoloMove): SoloState {
  const cr = state.cr;
  const next = cloneState(state);

  switch (move.type) {
    case "set": {
      const i = move.y * cr + move.x;
      if (move.pencil && move.n > 0) {
        next.pencil[i] ^= 1 << move.n;
      } else {
        next.grid[i] = move.n;
        next.pencil[i] = 0;
        if (move.autoElim && move.n > 0) autoEliminate(next, move.x, move.y, move.n);
        if (!next.completed && isComplete(next)) next.completed = true;
      }
      return next;
    }
    case "pencilAll": {
      // Bits 1..cr set (digit n ⇒ bit 1<<n).
      const all = ((1 << (cr + 1)) - (1 << 1)) | 0;
      // Additive — fill only note-less empty cells, never reset a narrowed one:
      // `candidate-hint.ts`'s `adaptiveMarkAll` § "The additive rule, stated once".
      for (let i = 0; i < cr * cr; i++) {
        if (!next.grid[i] && next.pencil[i] === 0) next.pencil[i] = all;
      }
      return next;
    }
    case "pencilStrike": {
      for (const { x, y, n } of move.marks) next.pencil[y * cr + x] &= ~(1 << n);
      return next;
    }
    case "solve": {
      for (let i = 0; i < cr * cr; i++) {
        next.grid[i] = move.grid[i];
        next.pencil[i] = 0;
      }
      next.completed = true;
      next.cheated = true;
      return next;
    }
    default:
      return assertNever(move, "solo: executeMove");
  }
}

/** `check_valid` over the working grid (every region complete, cages sum). */
function isComplete(state: SoloState): boolean {
  return checkValid(state.cr, state.blocks, state.killerData, state.xtype, state.grid);
}

function solve(orig: SoloState, _curr: SoloState, aux?: string): SolveResult<SoloMove> {
  const cr = orig.cr;
  if (aux) {
    // aux is `encodeSolveMove`'s "S<n>,<n>,…", comma-separated because a cell
    // reaches 16 at 4x4; it is not upstream's one-character-per-cell form. A
    // malformed aux falls through to re-deriving the answer from the givens.
    const grid = aux.slice(1).split(",").map(Number);
    if (
      grid.length === cr * cr &&
      grid.every((v) => Number.isInteger(v) && v >= 1 && v <= cr)
    )
      return { ok: true, move: { type: "solve", grid } };
  }
  const { diff, grid } = solveSolo(givensOnly(orig), DIFF_RECURSIVE, DIFF_KINTERSECT);
  if (diff === DIFF_IMPOSSIBLE)
    return { ok: false, error: "No solution exists for this puzzle" };
  if (diff === DIFF_AMBIGUOUS)
    return { ok: false, error: "Multiple solutions exist for this puzzle" };
  return { ok: true, move: { type: "solve", grid: Array.from(grid) } };
}

/** A copy of `state` with every non-given cell cleared (so the solver works
 * from the puzzle's fixed clues, never the player's entries/notes). */
function givensOnly(state: SoloState): SoloState {
  const s = cloneState(state);
  for (let i = 0; i < s.cr * s.cr; i++) {
    if (!s.immutable[i]) s.grid[i] = 0;
    s.pencil[i] = 0;
  }
  return s;
}

function findMistakes(state: SoloState): readonly SoloMistake[] {
  const cr = state.cr;
  // The solution is derived from the givens (+ cage clues) only — never from the
  // player's notes (a note can be wrong; that is what we are checking).
  const { diff, grid: soln } = solveSolo(
    givensOnly(state),
    DIFF_RECURSIVE,
    DIFF_KINTERSECT,
  );
  if (diff === DIFF_IMPOSSIBLE || diff === DIFF_AMBIGUOUS) return [];
  const out: SoloMistake[] = [];
  for (let i = 0; i < cr * cr; i++) {
    if (state.immutable[i]) continue;
    if (state.grid[i]) {
      if (state.grid[i] !== soln[i])
        out.push({ kind: "cell", x: i % cr, y: (i / cr) | 0 });
    } else if (state.pencil[i] !== 0 && !(state.pencil[i] & (1 << soln[i]))) {
      out.push({ kind: "note", x: i % cr, y: (i / cr) | 0 });
    }
  }
  return out;
}

// --- hint ------------------------------------------------------------------

/** The cells of `region`, as indices in order along it. */
function cellsOf(region: SoloRegion, state: SoloState): number[] {
  const cr = state.cr;
  const line = (cell: (k: number) => number): number[] =>
    Array.from({ length: cr }, (_, k) => cell(k));
  switch (region.kind) {
    case "row":
      return line((k) => region.index * cr + k);
    case "col":
      return line((k) => k * cr + region.index);
    case "block":
      return state.blocks.blocks[region.index];
    case "diag0":
      return line((k) => diag0(k, cr));
    case "diag1":
      return line((k) => diag1(k, cr));
  }
}

/** A region's cells as points — for evidence shading. */
function regionCells(region: SoloRegion, state: SoloState): Point[] {
  const cr = state.cr;
  return cellsOf(region, state).map((c) => ({ x: c % cr, y: (c / cr) | 0 }));
}

/** The uniqueness regions of cell `(x, y)`, in narration-preference order (row,
 * column, sub-block, then the X diagonals it lies on), each with its
 * `SoloRegion` tag for naming. The single source of truth for "this cell's
 * uniqueness regions", shared by auto-pencil, the placement classifier
 * ({@link soloPlacementReason}), the basic-region strike and the placement
 * dup-cull, so they can never disagree. */
function regionsOf(
  state: SoloState,
  x: number,
  y: number,
): { cells: number[]; region: SoloRegion }[] {
  const cr = state.cr;
  const cell = y * cr + x;
  const regions: SoloRegion[] = [
    { kind: "row", index: y },
    { kind: "col", index: x },
    { kind: "block", index: state.blocks.whichblock[cell] },
  ];
  if (state.xtype && onDiag0(cell, cr)) regions.push({ kind: "diag0" });
  if (state.xtype && onDiag1(cell, cr)) regions.push({ kind: "diag1" });
  return regions.map((region) => ({ cells: cellsOf(region, state), region }));
}

/** Re-derive *why* a generic-`single` placement is forced, from the working board
 * (the recorded `place` carries a bare `single`, conflating naked and hidden
 * singles): a naked single (the cell's notes collapsed to one), a hidden single
 * in a row/column/sub-block/diagonal, or a forced single (the notes lag a deeper
 * deduction). */
function soloPlacementReason(
  wGrid: Int8Array,
  wPen: Int32Array,
  x: number,
  y: number,
  n: number,
  state: SoloState,
): SoloReason {
  const cell = y * state.cr + x;
  const c = classifyPlacementInRegions(wGrid, wPen, cell, n, regionsOf(state, x, y));
  if (c.kind === "naked") return { kind: "single" };
  if (c.kind === "hidden") return { kind: "hiddenSingle", n, region: c.region.region };
  return { kind: "forcedSingle", n };
}

/** Narrate *why* a firing is forced (docs/games/hints.md § "Writing the narration"): indication → reasoning →
 * necessity-voice conclusion. `ns` is the struck value list (a placement passes
 * its single digit). */
function narrate(reason: SoloReason, ns: number[]): string {
  switch (reason.kind) {
    case "single":
      return say.single(ns[0]);
    case "hiddenSingle":
      return say.hiddenSingle(reason.region, reason.n);
    case "forcedSingle":
      return say.forcedSingle(reason.n);
    case "dup":
      return say.dup(reason.n);
    case "intersect":
      return say.intersect(reason.confined, reason.target, reason.n);
    case "set":
      return say.set(reason.region, ns);
    case "forcing":
      return say.forcing(reason, ns[0], reason.shares, reason.lastShares);
    case "cageSingle":
      return say.cageSingle(ns[0]);
    case "cageIntersect":
      return say.cageIntersect(reason.clue, ns[0]);
    case "cageMinMax":
      return say.cageMinMax(reason.clue, ns);
    case "cageSums":
      return say.cageSums(reason.clue, ns);
  }
}

/** The deduction's evidence cells to shade `COL_HINT_CELL`. */
function reasonArea(reason: SoloReason, state: SoloState): OrderedCell[] {
  switch (reason.kind) {
    case "intersect":
      return regionCells(reason.confined, state);
    case "set":
      return reason.region ? regionCells(reason.region, state) : [];
    case "cageSingle":
    case "cageIntersect":
    case "cageMinMax":
    case "cageSums":
      return reason.cells;
    // A forcing chain names the cells it ran through, **numbered**, so the
    // narration can cite them and the player can walk it.
    case "forcing":
      return forcingChainArea(reason);
    default:
      return [];
  }
}

/** A placement's evidence cells: a hidden single shades the whole region it
 * reasons over; a killer placement shades its cage; a naked single needs none. */
function placementArea(reason: SoloReason, state: SoloState): Point[] {
  if (reason.kind === "hiddenSingle") return regionCells(reason.region, state);
  if (reason.kind === "cageSingle" || reason.kind === "cageIntersect")
    return reason.cells;
  return [];
}

/** Emit one firing's strikes as a journey. A digit-confined firing (`intersect`)
 * is one multi-cell step (it crosses a single digit from several cells); every
 * other firing (cage pruning, a region subset) is split by cell — one leg each
 * narrating "this cell" — so a multi-digit strike never shows a single value
 * crossed in the wrong place (docs/games/hints.md § "Solve the way a human does"). */
function emitStrikeJourney(
  steps: HintStep<SoloMove, SoloHint>[],
  wPen: Int32Array,
  state: SoloState,
  groupOps: HintOp[],
): void {
  const cr = state.cr;
  const reason = groupOps[0].reason;
  const apply = (marks: { x: number; y: number; n: number }[]): void => {
    for (const m of marks) wPen[m.y * cr + m.x] &= ~(1 << m.n);
  };

  if (reason.kind === "intersect") {
    const marks = groupOps.map((op) => ({ x: op.x, y: op.y, n: op.n }));
    steps.push({
      move: { type: "pencilStrike", marks },
      explanation: narrate(reason, [reason.n]),
      highlights: {
        area: reasonArea(reason, state),
        targets: marks.map((m) => ({ x: m.x, y: m.y })),
        marks,
      },
    });
    apply(marks);
    return;
  }

  const byCell = new Map<number, HintOp[]>();
  for (const op of groupOps) {
    const key = op.y * cr + op.x;
    const arr = byCell.get(key);
    if (arr) arr.push(op);
    else byCell.set(key, [op]);
  }
  let first = true;
  for (const [key, cellOps] of byCell) {
    const x = key % cr;
    const y = (key / cr) | 0;
    const marks = cellOps.map((op) => ({ x, y, n: op.n }));
    const values = marks.map((m) => m.n).sort((a, b) => a - b);
    steps.push({
      move: { type: "pencilStrike", marks },
      explanation: narrate(reason, values),
      highlights: { area: reasonArea(reason, state), targets: [{ x, y }], marks },
      continuesPrevious: !first,
    });
    apply(marks);
    first = false;
  }
}

/** Emit a placement step and apply it, striking the placed value from the rest of
 * its row, column, sub-block and (X) diagonal. With auto-pencil on (`autoClean`)
 * that cleanup is silent (the move's own `autoElim` does it); with it off it
 * becomes an explicit `pencilStrike` journey continuation. */
function emitPlacement(
  steps: HintStep<SoloMove, SoloHint>[],
  wGrid: Int8Array,
  wPen: Int32Array,
  state: SoloState,
  x: number,
  y: number,
  n: number,
  reason: SoloReason,
  autoClean: boolean,
): void {
  const cr = state.cr;
  steps.push({
    move: { type: "set", x, y, n, pencil: false, autoElim: autoClean },
    explanation: narrate(reason, [n]),
    highlights: { area: placementArea(reason, state), targets: [{ x, y }], marks: [] },
  });
  wGrid[y * cr + x] = n;
  wPen[y * cr + x] = 0;

  // The row/column/block/diagonal copies the placement rules out.
  const dupMarks = regionDuplicateMarks(
    wGrid,
    wPen,
    x,
    y,
    n,
    cr,
    regionsOf(state, x, y),
  );
  for (const m of dupMarks) wPen[m.y * cr + m.x] &= ~(1 << n);

  if (!autoClean && dupMarks.length > 0) {
    steps.push({
      move: { type: "pencilStrike", marks: dupMarks },
      explanation: narrate({ kind: "dup", n, px: x, py: y }, []),
      highlights: {
        area: [{ x, y }],
        targets: dupMarks.map((m) => ({ x: m.x, y: m.y })),
        marks: dupMarks,
      },
      continuesPrevious: true,
    });
  }
}

/** Build the hint plan by walking a working copy the way a person solves it: a
 * naked single first; else (after a lazy populate) the basic-region cull a placed
 * value forces; else the next deductive elimination; else a forced placement. */
function buildSteps(
  state: SoloState,
  autoClean: boolean,
): HintStep<SoloMove, SoloHint>[] {
  const cr = state.cr;
  const steps: HintStep<SoloMove, SoloHint>[] = [];
  const wGrid = Int8Array.from(state.grid);
  const wPen = Int32Array.from(state.pencil);
  const maxdiff = Math.min(state.params.diff, DIFF_EXTREME);
  const maxkdiff = state.params.kdiff;
  const recOps = (): HintOp[] =>
    recordSoloDeductions({ ...state, grid: wGrid }, maxdiff, maxkdiff);

  const pop = lazyPopulate<SoloMove, SoloHint>(
    state,
    wGrid,
    wPen,
    cr,
    steps,
    say.populate,
  );
  // The obvious-candidate cleanup is emitted once, right after notes first exist
  // (just populated, or already present on a pre-noted board) — see step 3.
  let cleaned = false;

  let ops = recOps();
  const budget = stepBudget("solo hint plan");
  const cap = cr * cr * cr * 4 + 4;
  for (let guard = 0; guard < cap; guard++) {
    budget.tick();
    if (!wGrid.includes(0)) break;

    // 1. A naked single — the next move a human makes.
    const ns = nakedSingle(wGrid, wPen, cr);
    if (ns) {
      emitPlacement(
        steps,
        wGrid,
        wPen,
        state,
        ns.x,
        ns.y,
        ns.n,
        { kind: "single" },
        autoClean,
      );
      ops = recOps();
      continue;
    }

    // 2. Pencil in the notes (once) before any elimination needs them.
    if (!pop.done()) {
      pop.ensure();
      continue;
    }

    // 3. Once notes exist (just populated, or already present), bulk-clear the
    // obvious candidates in one step — the adaptive Mark-all second press — then
    // the walk goes straight to the real techniques (later placements keep notes
    // clean via `emitPlacement`).
    if (!cleaned) {
      cleaned = true;
      if (
        emitObviousCleanStep(
          steps,
          wGrid,
          wPen,
          cr,
          (x, y) => regionsOf(state, x, y),
          say.cleanObvious,
        )
      ) {
        continue;
      }
    }

    // 4. The next deductive elimination (the technique worth teaching).
    const cs = nextStrike(ops, wGrid, wPen, cr);
    if (cs) {
      emitStrikeJourney(steps, wPen, state, cs);
      continue;
    }

    // 5. A forced placement (a cube collapse the notes lag) — re-derive *why*
    // (naked vs hidden single) from the working board for the generic singles;
    // a killer placement keeps its recorded cage reason.
    const pl = nextPlace(ops, wGrid, cr);
    if (pl) {
      const reason =
        pl.reason.kind === "single"
          ? soloPlacementReason(wGrid, wPen, pl.x, pl.y, pl.n, state)
          : pl.reason;
      emitPlacement(steps, wGrid, wPen, state, pl.x, pl.y, pl.n, reason, autoClean);
      ops = recOps();
      continue;
    }

    break; // stuck (e.g. an Unreasonable board now needing a guess)
  }

  return steps;
}

function hint(
  state: SoloState,
  _aux?: string,
  ui?: SoloUi,
): HintResult<SoloMove, SoloHint> {
  return candidateHint(state, ui, findMistakes, buildSteps);
}

/** Classify a player move against the displayed hint step (shared
 * candidate-elimination keep-track; `SoloHint` is structurally
 * `CandidateHighlights`). */
function hintKeepTrack(
  m: SoloMove,
  step: HintStep<SoloMove, SoloHint>,
  state: SoloState,
): HintTrackVerdict {
  return keepCandidateHintTrack(m, step, state.pencil, state.cr);
}

/** Re-validate a stored hint step against the current board before (re-)display
 * (shared "never show a stale step" guarantee). */
function refreshHintStep(
  step: HintStep<SoloMove, SoloHint>,
  state: SoloState,
): HintStep<SoloMove, SoloHint> | null {
  return refreshCandidateHintStep(step, state.grid, state.pencil, state.cr);
}

/** Solo's difficulty contract (`engine/difficulty.ts`). `solveSolo` reports the
 * difficulty reached or `DIFF_IMPOSSIBLE` / `DIFF_AMBIGUOUS`. Its `DIFF_*`
 * family has eight members and only six are tiers — `DIFF_AMBIGUOUS` and
 * `DIFF_IMPOSSIBLE` are verdicts — which is the clearest case in the collection
 * for declaring the tier list rather than counting constants. The killer cap is
 * left at its default: the tier being varied is the ordinary deduction ladder. */
const difficulty: DifficultyContract<SoloParams> = {
  tierOf: (p) => p.diff,
  withTier: (p, tier) => ({ ...p, diff: tier }),
  solveAtCap: (p, desc, cap) => {
    const { diff } = solveSolo(givensOnly(newState(p, desc)), cap, DIFF_KINTERSECT);
    if (diff === DIFF_IMPOSSIBLE) return "impossible";
    return diff === DIFF_AMBIGUOUS ? "unsolved" : "solved";
  },
};

export const soloGame: Game<
  SoloParams,
  SoloState,
  SoloMove,
  SoloUi,
  SoloDrawState,
  SoloMistake
> = {
  id: "solo",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: false,
  canMarkAll: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  // Keys match the custom `solo` describeConfig in augmentation.ts. Upstream's
  // `custom_params` reads columns and rows, then folds jigsaw (`c *= r; r = 1`),
  // so the `jigsaw` item MUST come after the column/row items: the midend
  // applies `set`s in array order and jigsaw's setter reads the new `c`/`r`. A
  // jigsaw board is stored `r === 1, c === order`; unchecking jigsaw leaves c/r
  // as they are, as upstream does.
  paramConfig: [
    {
      kw: "columns-of-sub-blocks",
      name: "Columns of sub-blocks",
      type: "string",
      get: (p) => String(p.c),
      set: (p, v) => {
        p.c = parseConfigInt(v);
      },
    },
    {
      kw: "rows-of-sub-blocks",
      name: "Rows of sub-blocks",
      type: "string",
      get: (p) => String(p.r),
      set: (p, v) => {
        p.r = parseConfigInt(v);
      },
    },
    {
      kw: "x",
      name: '"X" (require every number in each main diagonal)',
      type: "boolean",
      get: (p) => p.xtype,
      set: (p, v) => {
        p.xtype = v;
      },
    },
    {
      kw: "jigsaw",
      name: "Jigsaw (irregularly shaped sub-blocks)",
      type: "boolean",
      get: (p) => p.r === 1,
      set: (p, v) => {
        if (v) {
          p.c *= p.r;
          p.r = 1;
        }
      },
    },
    {
      kw: "killer",
      name: "Killer (digit sums)",
      type: "boolean",
      get: (p) => p.killer,
      set: (p, v) => {
        p.killer = v;
      },
    },
    {
      kw: "symmetry",
      name: "Symmetry",
      type: "choices",
      choices: [
        "None",
        "2-way rotation",
        "4-way rotation",
        "2-way mirror",
        "2-way diagonal mirror",
        "4-way mirror",
        "4-way diagonal mirror",
        "8-way mirror",
      ],
      get: (p) => p.symm,
      set: (p, v) => {
        p.symm = v;
      },
    },
    {
      kw: "difficulty",
      name: "Difficulty",
      type: "choices",
      choices: [...DIFF_NAMES],
      get: (p) => p.diff,
      set: (p, v) => {
        p.diff = v;
      },
    },
  ],
  describeParams: (p): ConfigValues => ({
    "columns-of-sub-blocks": p.c,
    "rows-of-sub-blocks": p.r,
    jigsaw: p.r === 1,
    killer: p.killer,
    x: p.xtype,
    difficulty: p.diff,
    symmetry: p.symm,
  }),

  newDesc: newSoloDesc,
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status: soloStatus,

  solve,
  difficulty,
  hint,
  hintKeepTrack,
  refreshHintStep,
  findMistakes,
  requestKeys: (p): KeyLabel[] => digitKeys(p.c * p.r),

  prefs: [
    autoPencilPref<SoloUi>(
      "When you place a number, remove it from pencil marks in its row, column and block",
    ),
    stickyPencilPref<SoloUi>(),
    pencilKeepHighlightPref<SoloUi>(),
  ],

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: SoloParams, ts: number): Size => computeSize(p.c * p.r, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength: (from, to) => winFlash(from, to, FLASH_TIME),
};

registerGame(soloGame);
