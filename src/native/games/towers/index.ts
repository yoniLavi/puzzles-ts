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
  Point,
  Size,
} from "../../../puzzle/types.ts";
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

  if (button === 77 || button === 109) return { type: "pencilAll" }; // 'M' / 'm'

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
      if (state.grid[i] !== soln[i]) out.push({ kind: "cell", x: i % w, y: (i / w) | 0 });
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

const POPULATE_TEXT =
  "Start by pencilling in every candidate height in each empty cell, so the eliminations below have something to cross out.";

/** Narrate *why* a firing is forced, per the technique that fired — leading
 * with the spotted indication, then the reasoning, then a necessity-voice
 * conclusion (hint-authoring §2). `n` is the placed height for a placement. */
function narrate(reason: HintReason, n: number): string {
  switch (reason.kind) {
    case "facing":
      return `These two clues face each other along this line and add up to one more than the grid, which pins the tallest tower to a single cell — height ${n} can only sit here.`;
    case "lineFull":
      return `Clue ${reason.clueVal} already sees an increasing run one tower short of its count along this line, so the cell nearest the clue must hold the tallest remaining tower — the shorter heights can't sit there.`;
    case "lowerBound":
      return `Clue ${reason.clueVal} can see only ${reason.clueVal} towers along this line, so a tower of height ${reason.height} would block the view too early this close to the clue — it can't go here.`;
    case "arrangement":
      return `Trying every way clue ${reason.clueVal} can show exactly ${reason.clueVal} towers along this line, none of them puts this height here — so it must be ruled out.`;
    case "dup":
      return `A ${reason.n} now sits in this row and column, so a ${reason.n} can't go in any cell they pass through — strike it from these notes.`;
    case "single":
      return `Every other height has been ruled out in this cell, so it must be a ${n}.`;
    case "set":
      return "These cells between them must use up a fixed set of heights, leaving no room for this candidate among them — so it can't go here.";
    case "forcing":
      return "Following the chain of two-candidate cells from here, this height forces a contradiction further along the line — so it can't go here.";
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
      return [cluePos(reason.clue, w), cluePos(reason.clue2, w), ...lineCells(reason.clue, w)];
    case "lineFull":
    case "lowerBound":
    case "arrangement":
      return [cluePos(reason.clue, w), ...lineCells(reason.clue, w)];
    default:
      return [];
  }
}

/** True iff some empty cell carries no pencil notes — i.e. the board needs a
 * fill-all populate before the eliminations have anything to cross out. */
function anyEmptyLacksNotes(state: TowersState): boolean {
  for (let i = 0; i < state.w * state.w; i++) {
    if (state.grid[i] === 0 && state.pencil[i] === 0) return true;
  }
  return false;
}

/** A naked single in the working notes: the first empty cell whose pencil set
 * has exactly one candidate. On a mistake-free board that lone candidate is the
 * solution, so placing it is sound — and it is the move a human makes next, so
 * the hint surfaces it ahead of any further elimination (suggestion 2). */
function nakedSingle(
  wGrid: Uint8Array,
  wPen: Int32Array,
  w: number,
): { x: number; y: number; n: number } | null {
  for (let i = 0; i < w * w; i++) {
    if (wGrid[i] !== 0 || wPen[i] === 0) continue;
    // Exactly one bit set?
    if ((wPen[i] & (wPen[i] - 1)) !== 0) continue;
    let n = 0;
    for (let v = 1; v <= w; v++) {
      if (wPen[i] & (1 << v)) {
        n = v;
        break;
      }
    }
    if (n > 0) return { x: i % w, y: (i / w) | 0, n };
  }
  return null;
}

/** Index of the first recorded placement whose cell is *not yet* on the working
 * grid. Every op before it is valid against the current working grid (placements
 * before it — e.g. a facing-clue placement we have already applied — are already
 * reflected), so a strike there can be surfaced now; a strike after it would
 * depend on a placement we haven't made. */
function firstUnreflectedPlaceIndex(
  ops: HintOp[],
  wGrid: Uint8Array,
  w: number,
): number {
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].kind === "place" && wGrid[ops[i].y * w + ops[i].x] === 0) return i;
  }
  return ops.length;
}

/** The next clue-deduction strike firing (one firing = one step) whose marks
 * are still live in the working notes, considering only eliminations valid
 * against the current grid (those before the solver's first placement). `dup`
 * strikes are excluded — those are placement bookkeeping, handled at placement
 * time, not a deduction to teach. */
function nextClueStrike(
  ops: HintOp[],
  wGrid: Uint8Array,
  wPen: Int32Array,
  w: number,
): { marks: { x: number; y: number; n: number }[]; reason: HintReason } | null {
  const lim = firstUnreflectedPlaceIndex(ops, wGrid, w);
  let i = 0;
  while (i < lim) {
    const g = ops[i].group;
    const group: HintOp[] = [];
    while (i < lim && ops[i].group === g) group.push(ops[i++]);
    const reason = group[0].reason;
    if (reason.kind === "dup") continue;
    const marks = group
      .filter(
        (op) =>
          op.kind === "elim" &&
          wGrid[op.y * w + op.x] === 0 &&
          (wPen[op.y * w + op.x] & (1 << op.n)) !== 0,
      )
      .map((op) => ({ x: op.x, y: op.y, n: op.n }));
    if (marks.length > 0) return { marks, reason };
  }
  return null;
}

/** The next forced placement the recording solver makes whose cell is still
 * empty — a facing-clue placement, or a cube collapse the working notes didn't
 * already surface as a naked single. */
function nextPlace(
  ops: HintOp[],
  wGrid: Uint8Array,
  w: number,
): { x: number; y: number; n: number; reason: HintReason } | null {
  for (const op of ops) {
    if (op.kind === "place" && wGrid[op.y * w + op.x] === 0) {
      return { x: op.x, y: op.y, n: op.n, reason: op.reason };
    }
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
): void {
  steps.push({
    move: { type: "set", x, y, n, pencil: false, autoElim: autoClean },
    explanation: narrate(reason, n),
    highlights: { area: reasonArea(reason, w), targets: [{ x, y }], marks: [] },
  });
  wGrid[y * w + x] = n;
  wPen[y * w + x] = 0;

  const dupMarks: { x: number; y: number; n: number }[] = [];
  for (let k = 0; k < w; k++) {
    if (k !== x && wPen[y * w + k] & (1 << n)) dupMarks.push({ x: k, y, n });
    if (k !== y && wPen[k * w + x] & (1 << n)) dupMarks.push({ x, y: k, n });
  }
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

/** Build the hint plan by walking a working copy of the board the way a person
 * solves it: populate notes if needed, then repeatedly take the most natural
 * next move — a naked single first, else the next clue elimination, else a
 * forced placement. `autoClean` (the auto-pencil preference) decides whether a
 * placement's trivial row/column note eliminations are silent or taught. */
function buildSteps(
  state: TowersState,
  autoClean: boolean,
): HintStep<TowersMove, TowersHint>[] {
  const w = state.w;
  const steps: HintStep<TowersMove, TowersHint>[] = [];
  const wGrid = Uint8Array.from(state.grid);
  const wPen = Int32Array.from(state.pencil);
  const maxdiff = Math.min(diffToLevel(state.diff), DIFF_EXTREME);

  if (anyEmptyLacksNotes(state)) {
    const all = (1 << (w + 1)) - (1 << 1);
    for (let i = 0; i < w * w; i++) if (!wGrid[i]) wPen[i] = all;
    steps.push({
      move: { type: "pencilAll" },
      explanation: POPULATE_TEXT,
      highlights: { area: [], targets: [], marks: [] },
    });
  }

  let ops = recordTowersDeductions(w, state.clues, wGrid, maxdiff);
  const budget = stepBudget("towers hint plan");
  const cap = w * w * w * 4 + 4;
  for (let guard = 0; guard < cap; guard++) {
    budget.tick();
    let filled = true;
    for (let i = 0; i < w * w; i++) if (!wGrid[i]) filled = false;
    if (filled) break;

    // 1. A naked single — the next move a human makes.
    const ns = nakedSingle(wGrid, wPen, w);
    if (ns) {
      emitPlacement(steps, wGrid, wPen, w, ns.x, ns.y, ns.n, { kind: "single" }, autoClean);
      ops = recordTowersDeductions(w, state.clues, wGrid, maxdiff);
      continue;
    }

    // 2. The next clue elimination (the deduction worth teaching).
    const strike = nextClueStrike(ops, wGrid, wPen, w);
    if (strike) {
      steps.push({
        move: { type: "pencilStrike", marks: strike.marks },
        explanation: narrate(strike.reason, 0),
        highlights: {
          area: reasonArea(strike.reason, w),
          targets: strike.marks.map((m) => ({ x: m.x, y: m.y })),
          marks: strike.marks,
        },
      });
      for (const m of strike.marks) wPen[m.y * w + m.x] &= ~(1 << m.n);
      continue;
    }

    // 3. A forced placement (facing clue, or a cube collapse the notes lag).
    const place = nextPlace(ops, wGrid, w);
    if (place) {
      emitPlacement(
        steps,
        wGrid,
        wPen,
        w,
        place.x,
        place.y,
        place.n,
        place.reason,
        autoClean,
      );
      ops = recordTowersDeductions(w, state.clues, wGrid, maxdiff);
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
  if (state.completed) return { ok: false, error: "This board is already solved." };
  if (findMistakes(state).length > 0) {
    return {
      ok: false,
      error:
        "Fix the highlighted mistakes first — a hint can't deduce from a wrong board.",
    };
  }
  // Auto-pencil (default on) folds the trivial row/column eliminations into each
  // placement; off, they are taught as explicit strikes. The hint with no ui
  // (tests / harness) takes the default.
  const autoClean = ui?.autoPencil ?? true;
  const steps = buildSteps(state, autoClean);
  if (steps.length === 0) {
    return { ok: false, error: "No further move can be deduced from this position." };
  }
  return { ok: true, steps };
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
  const sm = step.move;
  if (sm.type === "pencilAll") return m.type === "pencilAll" ? "completed" : "off";
  if (sm.type === "set") {
    return m.type === "set" &&
      !m.pencil &&
      m.x === sm.x &&
      m.y === sm.y &&
      m.n === sm.n
      ? "completed"
      : "off";
  }
  if (sm.type === "pencilStrike") {
    // The player strikes a candidate with a pencil toggle (`set { pencil }`).
    if (m.type !== "set" || !m.pencil) return "off";
    const hit = sm.marks.findIndex((k) => k.x === m.x && k.y === m.y && k.n === m.n);
    if (hit < 0) return "off"; // touched a non-target candidate
    // The toggle must have *cleared* it (the post-move state has the bit off);
    // re-adding a candidate is off-plan.
    if (state.pencil[m.y * state.w + m.x] & (1 << m.n)) return "off";
    const remaining = sm.marks.filter((_, j) => j !== hit);
    if (remaining.length === 0) return "completed";
    // Shrink the step in place so a later auto-hint strikes only the rest.
    step.move = { type: "pencilStrike", marks: remaining };
    if (step.highlights) {
      step.highlights = {
        ...step.highlights,
        targets: remaining.map((k) => ({ x: k.x, y: k.y })),
        marks: remaining,
      };
    }
    return "onTrack";
  }
  return "off";
}

function flashLength(
  from: TowersState,
  to: TowersState,
  _dir: number,
  _ui: TowersUi,
): number {
  if (!from.completed && to.completed && !from.cheated && !to.cheated)
    return FLASH_TIME;
  return 0;
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
  findMistakes,
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
