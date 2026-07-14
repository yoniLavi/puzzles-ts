/**
 * Towers (Skyscrapers) — native TS port of `towers.c`. Fill a `w × w` grid so
 * every row and column holds each height `1..w` once, and so each outside clue
 * equals the number of towers visible from that edge (a taller tower hides
 * every shorter one behind it). Left-click / cursor select highlights a cell
 * for a real entry; right-click / select2 highlights it for a pencil mark; a
 * digit enters (or pencil-toggles) that height; a click or shift/ctrl-cursor
 * on an outside clue strikes it through. Rule violations highlight live; Check
 * & Save additionally flags cells that contradict the unique solution.
 */

import type {
  Colour,
  ConfigValues,
  GameStatus,
  KeyLabel,
  Point,
  Size,
} from "../../../puzzle/types.ts";
import {
  adaptiveMarkAllMove,
  candidateHint,
  cleanObviousText,
  emitObviousCleanStep,
  firstUnreflectedPlaceIndex,
  keepCandidateHintTrack,
  lazyPopulate,
  nakedSingle,
  nextPlace,
  populateText,
  refreshCandidateHintStep,
  regionDuplicateMarks,
} from "../../engine/candidate-hint.ts";
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
  hiddenSingleLine,
  rowColRegions,
  singlePlacementReason,
} from "../../engine/latin-hint.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  isCursorMove,
  LEFT_BUTTON,
  MOD_CTRL,
  MOD_SHFT,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { parseConfigInt } from "../../engine/params.ts";
import { registerGame } from "../../engine/registry.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import type { RandomState } from "../../random/index.ts";
import { newTowersDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  coord,
  FLASH_TIME,
  fromCoord,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
  type TowersDrawState,
  type TowersHint,
  x3d,
  y3d,
} from "./render.ts";
import {
  DIFF_AMBIGUOUS,
  DIFF_IMPOSSIBLE,
  type HintOp,
  type HintReason,
  recordTowersDeductions,
  solveTowers,
} from "./solver.ts";
import {
  checkErrors,
  cloneState,
  clueIndex,
  cluePos,
  DIFF_EXTREME,
  DIFF_UNREASONABLE,
  decodeParams,
  defaultParams,
  diffFromLevel,
  diffName,
  diffToLevel,
  encodeParams,
  isClue,
  lineCells,
  newState,
  newUi,
  status,
  type TowersMove,
  type TowersParams,
  type TowersState,
  type TowersUi,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A player marking that contradicts the unique solution:
 * - `"cell"` — a filled-in tower whose height is wrong;
 * - `"note"` — an empty cell whose (non-empty) pencil notes have crossed out
 *   the cell's solution height (a note is a first-class marking — striking the
 *   correct candidate is a mistake exactly as a wrong tower is). */
export interface TowersMistake {
  kind: "cell" | "note";
  x: number;
  y: number;
}

const PRESETS: TowersParams[] = [
  { w: 4, diff: "easy" },
  { w: 5, diff: "easy" },
  { w: 5, diff: "hard" },
  { w: 6, diff: "easy" },
  { w: 6, diff: "hard" },
  { w: 6, diff: "extreme" },
  { w: 6, diff: "unreasonable" },
];

function presets(): PresetMenu<TowersParams> {
  return {
    title: "Towers",
    submenu: PRESETS.map((p) => ({
      title: `${p.w}x${p.w} ${diffName(p.diff)}`,
      params: p,
    })),
  };
}

function inGrid(w: number, x: number, y: number): boolean {
  return x >= 0 && x < w && y >= 0 && y < w;
}

/** Move the keyboard cursor (clamped); reveal it on first press. Mirrors
 * `move_cursor`: the position moves even on the reveal press. */
function moveCursor(button: number, ui: TowersUi, w: number): UiUpdate | null {
  const ox = ui.hx;
  const oy = ui.hy;
  if (button === CURSOR_UP) ui.hy = Math.max(ui.hy - 1, 0);
  else if (button === CURSOR_DOWN) ui.hy = Math.min(ui.hy + 1, w - 1);
  else if (button === CURSOR_LEFT) ui.hx = Math.max(ui.hx - 1, 0);
  else if (button === CURSOR_RIGHT) ui.hx = Math.min(ui.hx + 1, w - 1);
  if (!ui.hshow) {
    ui.hshow = true;
    return UI_UPDATE;
  }
  return ui.hx !== ox || ui.hy !== oy ? UI_UPDATE : null;
}

function interpretMove(
  state: TowersState,
  ui: TowersUi,
  ds: TowersDrawState | null,
  p: Point,
  rawButton: number,
): TowersMove | null | UiUpdate {
  const w = state.w;
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const shiftOrCtrl = (rawButton & (MOD_SHFT | MOD_CTRL)) !== 0;
  const button = stripModifiers(rawButton);

  let tx = fromCoord(p.x, ts);
  let ty = fromCoord(p.y, ts);

  if (ui.threeD) {
    // A click may land on a tower protruding up-left from a neighbouring cell;
    // check the tops of nearby towers and retarget if so.
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx >= -1; dx--) {
        const cx = tx + dx;
        const cy = ty + dy;
        if (!inGrid(w, cx, cy)) continue;
        const height = state.grid[cy * w + cx];
        const bx = coord(cx, ts);
        const by = coord(cy, ts);
        const ox = bx + x3d(height, w, ts);
        const oy = by - y3d(height, w, ts);
        if (
          // on the top face?
          (p.x - ox >= 0 && p.x - ox < ts && p.y - oy >= 0 && p.y - oy < ts) ||
          // in the triangle between the top-left corners?
          (ox > bx &&
            p.x >= bx &&
            p.x <= ox &&
            p.y <= by &&
            (by - p.y) * (ox - bx) <= (by - oy) * (p.x - bx)) ||
          // in the triangle between the bottom-right corners?
          (ox > bx &&
            p.x >= bx + ts &&
            p.x <= ox + ts &&
            p.y >= oy + ts &&
            (by - p.y + ts) * (ox - bx) >= (by - oy) * (p.x - bx - ts))
        ) {
          tx = cx;
          ty = cy;
        }
      }
    }
  }

  if (inGrid(w, tx, ty)) {
    if (button === LEFT_BUTTON) {
      // Sticky pencil mode: a left-click keeps the current pencil/real mode
      // (it only moves the highlight); the mode is toggled by right-click.
      // Non-sticky (upstream): a left-click always reverts to real entry.
      if (
        tx === ui.hx &&
        ty === ui.hy &&
        ui.hshow &&
        (ui.pencilSticky || !ui.hpencil)
      ) {
        ui.hshow = false;
      } else {
        ui.hx = tx;
        ui.hy = ty;
        ui.hshow = !state.immutable[ty * w + tx];
        if (!ui.pencilSticky) ui.hpencil = false;
      }
      ui.hcursor = false;
      return UI_UPDATE;
    }
    if (button === RIGHT_BUTTON) {
      if (ui.pencilSticky) {
        // Toggle the persistent pencil mode (CapsLock-style). Only move the
        // highlight onto an *empty* cell — a filled/given cell can't take a
        // pencil mark, so selecting it would just be confusing.
        ui.hpencil = !ui.hpencil;
        if (state.grid[ty * w + tx] === 0) {
          ui.hx = tx;
          ui.hy = ty;
          ui.hshow = true;
        }
      } else if (state.grid[ty * w + tx] === 0) {
        if (tx === ui.hx && ty === ui.hy && ui.hshow && ui.hpencil) {
          ui.hshow = false;
        } else {
          ui.hpencil = true;
          ui.hx = tx;
          ui.hy = ty;
          ui.hshow = true;
        }
      } else {
        ui.hshow = false;
      }
      ui.hcursor = false;
      return UI_UPDATE;
    }
  } else if (button === LEFT_BUTTON) {
    if (isClue(state, tx, ty)) {
      return { type: "clueDone", index: clueIndex(tx, ty, w) };
    }
  }

  if (isCursorMove(button)) {
    if (shiftOrCtrl) {
      let cx = ui.hx;
      let cy = ui.hy;
      if (button === CURSOR_LEFT) cx = -1;
      else if (button === CURSOR_RIGHT) cx = w;
      else if (button === CURSOR_UP) cy = -1;
      else if (button === CURSOR_DOWN) cy = w;
      if (isClue(state, cx, cy))
        return { type: "clueDone", index: clueIndex(cx, cy, w) };
      return null;
    }
    ui.hcursor = true;
    return moveCursor(button, ui, w);
  }

  if (ui.hshow && button === CURSOR_SELECT) {
    ui.hpencil = !ui.hpencil;
    ui.hcursor = true;
    return UI_UPDATE;
  }

  const isDigit = button >= 48 && button <= 57 && button - 48 <= w;
  const isClear = button === CURSOR_SELECT2 || button === 8 || button === 127;
  if (ui.hshow && (isDigit || isClear)) {
    const n = isClear ? 0 : button - 48;
    const i = ui.hy * w + ui.hx;

    // Can't pencil-mark a filled square; can't touch an immutable one.
    if (ui.hpencil && state.grid[i]) return null;
    if (state.immutable[i]) return null;

    // No-op: setting a square to what it already holds (and no pencil marks).
    if ((!ui.hpencil || n === 0) && state.grid[i] === n && state.pencil[i] === 0) {
      if (!ui.hcursor) {
        ui.hshow = false;
        return UI_UPDATE;
      }
      return null;
    }

    const pencil = ui.hpencil && n > 0;
    if (!ui.hcursor && !(ui.hpencil && ui.pencilKeepHighlight)) ui.hshow = false;
    // Auto-pencil applies only to a real placement, not a pencil toggle.
    return pencil
      ? { type: "set", x: ui.hx, y: ui.hy, n, pencil }
      : { type: "set", x: ui.hx, y: ui.hy, n, pencil, autoElim: ui.autoPencil };
  }

  // 'M' / 'm': fill all pencil marks, then (on a fully-noted board) clean the
  // obvious row/column candidates — the basic-region opening, in one press.
  if (button === 77 || button === 109)
    return adaptiveMarkAllMove<TowersMove>(state.grid, state.pencil, w, (x, y) =>
      rowColRegions(x, y, w),
    );

  return null;
}

function executeMove(state: TowersState, move: TowersMove): TowersState {
  const w = state.w;
  const next = cloneState(state);

  switch (move.type) {
    case "set": {
      const i = move.y * w + move.x;
      if (state.immutable[i]) throw new Error("towers: move into an immutable cell");
      if (move.pencil && move.n > 0) {
        next.pencil[i] ^= 1 << move.n;
      } else {
        next.grid[i] = move.n;
        next.pencil[i] = 0;
        // Auto-pencil: striking the placed height from the rest of its row and
        // column keeps the player's notes tidy without manual cleanup.
        if (move.autoElim && move.n > 0) {
          const bit = ~(1 << move.n);
          for (let k = 0; k < w; k++) {
            if (k !== move.x) next.pencil[move.y * w + k] &= bit;
            if (k !== move.y) next.pencil[k * w + move.x] &= bit;
          }
        }
        if (!next.completed && !checkErrors(next)) next.completed = true;
      }
      return next;
    }
    case "clueDone": {
      next.cluesDone[move.index] = next.cluesDone[move.index] ? 0 : 1;
      return next;
    }
    case "pencilAll": {
      const all = (1 << (w + 1)) - (1 << 1);
      for (let i = 0; i < w * w; i++) if (!next.grid[i]) next.pencil[i] = all;
      return next;
    }
    case "pencilStrike": {
      // Clear each named candidate bit; clearing an absent bit is a no-op, so
      // the move is idempotent (a re-applied hint never re-adds a candidate).
      for (const { x, y, n } of move.marks) next.pencil[y * w + x] &= ~(1 << n);
      return next;
    }
    case "solve": {
      for (let i = 0; i < w * w; i++) {
        next.grid[i] = move.grid[i];
        next.pencil[i] = 0;
      }
      next.completed = true;
      next.cheated = true;
      return next;
    }
  }
}

function changedState(
  ui: TowersUi,
  _old: TowersState | null,
  newSt: TowersState,
): void {
  const w = newSt.w;
  if (ui.hshow && ui.hpencil && !ui.hcursor && newSt.grid[ui.hy * w + ui.hx] !== 0) {
    ui.hshow = false;
  }
}

function gridFromSoln(soln: Uint8Array): number[] {
  return Array.from(soln, (v) => v);
}

function solve(
  orig: TowersState,
  _curr: TowersState,
  aux?: string,
): SolveResult<TowersMove> {
  const w = orig.w;
  if (aux) {
    const grid: number[] = [];
    for (let i = 0; i < w * w; i++) grid[i] = Number(aux[i + 1]);
    return { ok: true, move: { type: "solve", grid } };
  }
  const soln = Uint8Array.from(orig.immutable);
  const ret = solveTowers(w, orig.clues, soln, DIFF_UNREASONABLE);
  if (ret === DIFF_IMPOSSIBLE)
    return { ok: false, error: "No solution exists for this puzzle" };
  if (ret === DIFF_AMBIGUOUS)
    return { ok: false, error: "Multiple solutions exist for this puzzle" };
  return { ok: true, move: { type: "solve", grid: gridFromSoln(soln) } };
}

function findMistakes(state: TowersState): readonly TowersMistake[] {
  const w = state.w;
  // The solution is derived from the placed givens/entries only — never from
  // the player's notes (a note can be wrong; that is what we are checking).
  const soln = Uint8Array.from(state.immutable);
  const ret = solveTowers(w, state.clues, soln, DIFF_UNREASONABLE);
  if (ret === DIFF_IMPOSSIBLE || ret === DIFF_AMBIGUOUS) return [];
  const out: TowersMistake[] = [];
  for (let i = 0; i < w * w; i++) {
    if (state.immutable[i]) continue; // givens are always correct
    if (state.grid[i]) {
      // A filled cell whose height contradicts the unique solution.
      if (state.grid[i] !== soln[i])
        out.push({ kind: "cell", x: i % w, y: (i / w) | 0 });
    } else if (state.pencil[i] !== 0 && !(state.pencil[i] & (1 << soln[i]))) {
      // An empty cell whose non-empty notes have crossed out the correct
      // height. (Notes carrying extra, non-solution candidates are fine — that
      // is ordinary mid-solve state.)
      out.push({ kind: "note", x: i % w, y: (i / w) | 0 });
    }
  }
  return out;
}

// --- hint ------------------------------------------------------------------

const POPULATE_TEXT = populateText("height");

const CLEAN_OBVIOUS_TEXT = cleanObviousText("height", "standing", "row or column");

/** Narrate *why* a firing is forced, per the technique that fired — leading
 * with the spotted indication, then the reasoning, then a necessity-voice
 * conclusion (hint-authoring §2). `n` is the placed height for a placement;
 * `continues` (a journey continuation leg) gets a terser line that doesn't
 * restate the premise the journey's first leg already gave. */
function narrate(reason: HintReason, n: number, continues = false): string {
  switch (reason.kind) {
    case "fullLine":
      return continues
        ? `Continuing up the line — height ${n} can only sit here.`
        : `Clue ${reason.clueVal} sees every tower in this line, so the heights must climb 1, 2, … straight up from the clue — height ${n} can only sit here.`;
    case "tallestNearest":
      return `Clue 1 sees just one tower, so the tallest must stand right next to the clue and hide the rest behind it — height ${n} can only sit here.`;
    case "facing":
      return `These two clues face each other along this line and add up to one more than the grid, which pins the tallest tower to a single cell — height ${n} can only sit here.`;
    case "lineFull":
      return `Clue ${reason.clueVal} already sees all but one of its towers deeper in the line, so the cell nearest the clue must be tall enough to keep everything between it and them hidden — too tall for the shortest heights, so we must cross out the ${n}.`;
    case "lowerBound":
      return `Clue ${reason.clueVal} sees exactly ${reason.clueVal} towers along this line, so a tower of height ${n} this close to the clue would hide too many towers behind it — we must cross out the ${n}.`;
    case "arrangement":
      return `Trying every way clue ${reason.clueVal} can show exactly ${reason.clueVal} towers along this line, none of them puts a tower of height ${n} here — so we must cross out the ${n}.`;
    case "dup":
      return `A tower of height ${reason.n} now sits in this row and column, so we must cross out the ${reason.n} from every other cell they pass through.`;
    case "single":
      return `Every other height has been ruled out in this cell, so it can only be ${n}.`;
    case "hiddenSingle":
      return `In this ${reason.line === "row" ? "row" : "column"}, height ${n} can go in only this cell — every other cell in the ${reason.line === "row" ? "row" : "column"} has ruled it out — so it must be ${n}.`;
    case "forcedSingle":
      return `Working through this cell's row and column together, only height ${n} can still go here — so it must be ${n}.`;
    case "set":
      return `Another group of cells already accounts for a fixed set of heights that includes ${n}, so we must cross out the ${n} here.`;
    case "forcing":
      return `Following a chain of two-candidate cells, placing height ${n} here would force a contradiction further along the line — so we must cross out the ${n}.`;
  }
}

/** The deduction's evidence area to shade: a Towers clue technique shows the
 * driving clue cell(s) *and* the whole line of sight they reason along, so the
 * player can see exactly which clue the hint is about; the generic Latin
 * techniques have no clean local area (the struck notes carry the premise). */
function reasonArea(reason: HintReason, w: number): { x: number; y: number }[] {
  switch (reason.kind) {
    case "facing":
      // A facing pair names two clues at opposite ends of the same line.
      return [
        cluePos(reason.clue, w),
        cluePos(reason.clue2, w),
        ...lineCells(reason.clue, w),
      ];
    case "fullLine":
    case "tallestNearest":
    case "lineFull":
    case "lowerBound":
    case "arrangement":
      return [cluePos(reason.clue, w), ...lineCells(reason.clue, w)];
    case "hiddenSingle":
      return hiddenSingleLine(reason.line, reason.index, w);
    default:
      return [];
  }
}

/** The next clue-deduction strike whose marks are still live in the working
 * notes, considering only eliminations valid against the current grid (those
 * before the solver's first placement). `dup` strikes are excluded — those are
 * placement bookkeeping, handled at placement time, not a deduction to teach.
 *
 * One returned strike groups only the marks of a single firing that share the
 * **same struck height** — because the narration names that height ("a tower of
 * height 5 can't go here"). A firing that rules out *several* heights (a clue's
 * lower-bound rule can strike both 4 and 5 along its line) would otherwise be
 * shown as one step crossing out 4 *and* 5 while the text mentions only one,
 * which reads as a bug. The remaining heights of the same firing come back on
 * the next call and are emitted as continuation legs of one journey (the caller
 * links them by `group`). */
function nextClueStrike(
  ops: HintOp[],
  wGrid: Uint8Array,
  wPen: Int32Array,
  w: number,
): {
  marks: { x: number; y: number; n: number }[];
  reason: HintReason;
  group: number;
} | null {
  const lim = firstUnreflectedPlaceIndex(ops, wGrid, w);
  const liveAt = (op: HintOp) =>
    op.kind === "elim" &&
    wGrid[op.y * w + op.x] === 0 &&
    (wPen[op.y * w + op.x] & (1 << op.n)) !== 0;
  let i = 0;
  while (i < lim) {
    const g = ops[i].group;
    const group: HintOp[] = [];
    while (i < lim && ops[i].group === g) group.push(ops[i++]);
    // The firing's still-live, teachable (non-dup) eliminations.
    const live = group.filter((op) => liveAt(op) && op.reason.kind !== "dup");
    if (live.length === 0) continue;
    // Narrate one height at a time: take the first live elim's height and
    // collect every same-height mark of this firing.
    const height = live[0].n;
    const same = live.filter((op) => op.n === height);
    return {
      marks: same.map((op) => ({ x: op.x, y: op.y, n: op.n })),
      reason: same[0].reason,
      group: g,
    };
  }
  return null;
}

/** Emit a placement step and apply it to the working board, striking the placed
 * height from the rest of its row and column. With auto-pencil on (`autoClean`)
 * that cleanup is silent (the placement's own `autoElim` does it on the real
 * board); with it off the cleanup becomes an explicit `pencilStrike` journey
 * continuation, so the player is taught the eliminations they must make by hand. */
function emitPlacement(
  steps: HintStep<TowersMove, TowersHint>[],
  wGrid: Uint8Array,
  wPen: Int32Array,
  w: number,
  x: number,
  y: number,
  n: number,
  reason: HintReason,
  autoClean: boolean,
  continues = false,
): void {
  steps.push({
    move: { type: "set", x, y, n, pencil: false, autoElim: autoClean },
    explanation: narrate(reason, n, continues),
    highlights: { area: reasonArea(reason, w), targets: [{ x, y }], marks: [] },
    continuesPrevious: continues,
  });
  wGrid[y * w + x] = n;
  wPen[y * w + x] = 0;

  const dupMarks = regionDuplicateMarks(
    wGrid,
    wPen,
    x,
    y,
    n,
    w,
    rowColRegions(x, y, w),
  );
  for (const m of dupMarks) wPen[m.y * w + m.x] &= ~(1 << n);

  if (!autoClean && dupMarks.length > 0) {
    steps.push({
      move: { type: "pencilStrike", marks: dupMarks },
      explanation: narrate({ kind: "dup", n, px: x, py: y }, 0),
      highlights: {
        area: [],
        targets: dupMarks.map((m) => ({ x: m.x, y: m.y })),
        marks: dupMarks,
      },
      continuesPrevious: true,
    });
  }
}

/** An extreme clue that forces (part of) a line outright — the cleanest
 * deduction on the board, so the planner surfaces it before anything else:
 *   - clue == w: the line sees every tower, so it must climb `1..w` from the
 *     clue (cell nearest = 1, farthest = w) — returns every still-empty cell
 *     with its forced height, to be placed as one ordered journey;
 *   - clue == 1: the line sees only the tallest, so height w must stand next to
 *     the clue — returns that single cell.
 * The board is mistake-free when the planner runs (`hint` refuses otherwise), so
 * any already-filled cell in such a line is guaranteed to match. Returns the
 * first applicable clue (full lines preferred), or `null`. */
function nextExtremeClueLine(
  clues: Int32Array,
  wGrid: Uint8Array,
  w: number,
): { reason: HintReason; cells: { x: number; y: number; n: number }[] } | null {
  for (let c = 0; c < 4 * w; c++) {
    if (clues[c] !== w) continue;
    const line = lineCells(c, w);
    const cells: { x: number; y: number; n: number }[] = [];
    for (let i = 0; i < w; i++) {
      if (wGrid[line[i].y * w + line[i].x] === 0)
        cells.push({ x: line[i].x, y: line[i].y, n: i + 1 });
    }
    if (cells.length > 0)
      return { reason: { kind: "fullLine", clue: c, clueVal: w }, cells };
  }
  for (let c = 0; c < 4 * w; c++) {
    if (clues[c] !== 1) continue;
    const cell = lineCells(c, w)[0];
    if (wGrid[cell.y * w + cell.x] === 0)
      return {
        reason: { kind: "tallestNearest", clue: c, clueVal: 1 },
        cells: [{ x: cell.x, y: cell.y, n: w }],
      };
  }
  return null;
}

/** Build the hint plan by walking a working copy of the board the way a person
 * solves it: a naked single first, else a forced extreme-clue line, else the
 * next clue elimination, else a forced placement (populating notes lazily, after
 * the note-free forced placements and before the first elimination needs them).
 * `autoClean` (the auto-pencil preference) decides whether a placement's trivial
 * row/column note eliminations are silent or taught. */
function buildSteps(
  state: TowersState,
  autoClean: boolean,
): HintStep<TowersMove, TowersHint>[] {
  const w = state.w;
  const steps: HintStep<TowersMove, TowersHint>[] = [];
  const wGrid = Uint8Array.from(state.grid);
  const wPen = Int32Array.from(state.pencil);
  const maxdiff = Math.min(diffToLevel(state.diff), DIFF_EXTREME);

  // Populate notes lazily: the forced placements below (extreme-clue lines,
  // facing pairs) need no notes, so an empty board opens straight on them rather
  // than on a "pencil everything in" step. We only fill notes the moment an
  // elimination actually needs something to cross out.
  const pop = lazyPopulate<TowersMove, TowersHint>(
    state,
    wGrid,
    wPen,
    w,
    steps,
    POPULATE_TEXT,
  );
  // The obvious-candidate cleanup is emitted once, right after notes first exist
  // (just populated, or already present on a pre-noted board) — see step 3.
  let cleaned = false;

  let ops = recordTowersDeductions(w, state.clues, wGrid, maxdiff);
  const budget = stepBudget("towers hint plan");
  const cap = w * w * w * 4 + 4;
  // The firing whose strike the previous step emitted, so a same-firing strike
  // of a *different* height continues the journey rather than reading as a new,
  // unrelated hint. `-1` = no strike pending (a placement resets it, since a new
  // `ops` recording restarts group numbering).
  let lastStrikeGroup = -1;
  for (let guard = 0; guard < cap; guard++) {
    budget.tick();
    let filled = true;
    for (let i = 0; i < w * w; i++) if (!wGrid[i]) filled = false;
    if (filled) break;

    // 1. A naked single — the next move a human makes. (On an unpopulated board
    //    there are no notes, so none fire here and we fall through to the
    //    note-free extreme-clue lines.)
    const ns = nakedSingle(wGrid, wPen, w);
    if (ns) {
      emitPlacement(
        steps,
        wGrid,
        wPen,
        w,
        ns.x,
        ns.y,
        ns.n,
        { kind: "single" },
        autoClean,
      );
      ops = recordTowersDeductions(w, state.clues, wGrid, maxdiff);
      lastStrikeGroup = -1;
      continue;
    }

    // 2. An extreme clue forcing (part of) a line outright — the cleanest move
    //    that needs no notes, so an empty board opens on it. clue == w fills the
    //    whole line 1..w in order as one journey; clue == 1 places the tallest
    //    tower next to the clue.
    const forced = nextExtremeClueLine(state.clues, wGrid, w);
    if (forced) {
      forced.cells.forEach((c, j) => {
        emitPlacement(
          steps,
          wGrid,
          wPen,
          w,
          c.x,
          c.y,
          c.n,
          forced.reason,
          autoClean,
          j > 0,
        );
      });
      ops = recordTowersDeductions(w, state.clues, wGrid, maxdiff);
      lastStrikeGroup = -1;
      continue;
    }

    // 3. The extreme-clue lines are done — pencil in the notes now (once), so
    //    the eliminations below have something to cross out and are taught
    //    rather than skipped in favour of bare placements.
    if (!pop.done()) {
      pop.ensure();
      lastStrikeGroup = -1;
      continue;
    }

    // 3a. Once notes exist (just populated, or already present), bulk-clear the
    //     obvious candidates in one step — the adaptive Mark-all second press —
    //     so the walk teaches the real deductions, not the trivial row/column
    //     culls one placement at a time.
    if (!cleaned) {
      cleaned = true;
      if (
        emitObviousCleanStep(
          steps,
          wGrid,
          wPen,
          w,
          (x, y) => rowColRegions(x, y, w),
          CLEAN_OBVIOUS_TEXT,
        )
      ) {
        lastStrikeGroup = -1;
        continue;
      }
    }

    // 4. The next clue elimination (the deduction worth teaching). One firing
    //    that rules out several heights is emitted as one journey: the first
    //    height unflagged, each further height a `continuesPrevious` leg.
    const strike = nextClueStrike(ops, wGrid, wPen, w);
    if (strike) {
      steps.push({
        move: { type: "pencilStrike", marks: strike.marks },
        explanation: narrate(strike.reason, strike.marks[0].n),
        highlights: {
          area: reasonArea(strike.reason, w),
          targets: strike.marks.map((m) => ({ x: m.x, y: m.y })),
          marks: strike.marks,
        },
        continuesPrevious: strike.group === lastStrikeGroup,
      });
      for (const m of strike.marks) wPen[m.y * w + m.x] &= ~(1 << m.n);
      lastStrikeGroup = strike.group;
      continue;
    }

    // 5. A forced placement (facing clue, or a cube collapse the notes lag) —
    // re-derive a generic `single`'s *why* (naked vs hidden single) from the
    // working board; the recorded reason conflates the two and would mis-narrate
    // a hidden single. Clue-driven placement reasons are kept as-is.
    const place = nextPlace(ops, wGrid, w);
    if (place) {
      const reason =
        place.reason.kind === "single"
          ? singlePlacementReason(wGrid, wPen, place.x, place.y, place.n, w)
          : place.reason;
      emitPlacement(
        steps,
        wGrid,
        wPen,
        w,
        place.x,
        place.y,
        place.n,
        reason,
        autoClean,
      );
      ops = recordTowersDeductions(w, state.clues, wGrid, maxdiff);
      lastStrikeGroup = -1;
      continue;
    }

    break; // stuck (e.g. an Unreasonable board now needing a guess)
  }

  return steps;
}

function hint(
  state: TowersState,
  _aux?: string,
  ui?: TowersUi,
): HintResult<TowersMove, TowersHint> {
  return candidateHint(state, ui, findMistakes, buildSteps);
}

/** Classify a player move against the displayed hint step. A `pencilAll`
 * matches a populate step; a real placement matches a `set` step; a pencil
 * toggle that *clears* one of a strike step's marks shrinks it (`onTrack`) or
 * finishes it (`completed`). Anything else drops the plan. */
function hintKeepTrack(
  m: TowersMove,
  step: HintStep<TowersMove, TowersHint>,
  state: TowersState,
): HintTrackVerdict {
  return keepCandidateHintTrack(m, step, state.pencil, state.w);
}

/** Re-validate a stored hint step against the current board before it is
 * (re-)displayed (shared "never show a stale step" guarantee). */
function refreshHintStep(
  step: HintStep<TowersMove, TowersHint>,
  state: TowersState,
): HintStep<TowersMove, TowersHint> | null {
  return refreshCandidateHintStep(step, state.grid, state.pencil, state.w);
}

function flashLength(
  from: TowersState,
  to: TowersState,
  _dir: number,
  _ui: TowersUi,
): number {
  return winFlash(from, to, FLASH_TIME);
}

export const towersGame: Game<
  TowersParams,
  TowersState,
  TowersMove,
  TowersUi,
  TowersDrawState,
  TowersMistake
> = {
  id: "towers",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  canMarkAll: true, // handles 'M' (pencilAll) in interpretMove

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig: [
    {
      kw: "grid-size",
      name: "Grid size",
      type: "string",
      get: (p) => String(p.w),
      set: (p, v) => {
        p.w = parseConfigInt(v);
      },
    },
    {
      kw: "difficulty",
      name: "Difficulty",
      type: "choices",
      choices: ["Easy", "Hard", "Extreme", "Unreasonable"],
      get: (p) => diffToLevel(p.diff),
      set: (p, v) => {
        p.diff = diffFromLevel(v);
      },
    },
  ],
  // Keys/shape match the `towers` config template in augmentation.ts
  // ("{grid-size}x{grid-size} {difficulty:Easy|Hard|Extreme|Unreasonable}"):
  // `grid-size` is the value, `difficulty` the zero-based label index.
  describeParams: (p): ConfigValues => ({
    "grid-size": String(p.w),
    difficulty: diffToLevel(p.diff),
  }),

  newDesc: (p, rng: RandomState) => newTowersDesc(p, rng),
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status: (s): GameStatus => status(s),

  solve,
  hint,
  hintKeepTrack,
  refreshHintStep,
  findMistakes,
  requestKeys: (p): KeyLabel[] => digitKeys(p.w),
  textFormat,

  prefs: [
    {
      kw: "auto-pencil",
      name: "When you place a tower, remove that number from pencil marks in its row and column",
      type: "boolean",
      get: (ui) => ui.autoPencil,
      set: (ui, v) => {
        ui.autoPencil = v;
      },
    },
    {
      kw: "sticky-pencil-mode",
      name: "Right-click toggles a sticky pencil mode (stays on until right-clicked again)",
      type: "boolean",
      get: (ui) => ui.pencilSticky,
      set: (ui, v) => {
        ui.pencilSticky = v;
      },
    },
    {
      kw: "pencil-keep-highlight",
      name: "Keep mouse highlight after changing a pencil mark",
      type: "boolean",
      get: (ui) => ui.pencilKeepHighlight,
      set: (ui, v) => {
        ui.pencilKeepHighlight = v;
      },
    },
    {
      kw: "appearance",
      name: "Puzzle appearance",
      type: "choices",
      choices: ["2D", "3D"],
      get: (ui) => (ui.threeD ? 1 : 0),
      set: (ui, v) => {
        ui.threeD = v === 1;
      },
    },
  ],

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: TowersParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(towersGame);
