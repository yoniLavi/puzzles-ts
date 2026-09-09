/**
 * Undead — native TS port of `undead.c` ("Haunted Mirror Mazes"). Place a Ghost,
 * Vampire, or Zombie in every monster cell so the edge sighting clues (counting
 * monsters visible along the mirror-bouncing sightlines: vampires before a
 * reflection, ghosts after one, zombies always) and the monster totals all hold.
 *
 * Left-click / cursor select highlights a monster cell for a real entry;
 * right-click toggles pencil mode (sticky, a fork divergence); G/V/Z (or 1/2/3,
 * or a click on the matching count block) place a monster; E/0/Backspace clear;
 * clicking an edge clue strikes it through ("done"); `M` fills all pencil marks.
 * Live errors recolor the counts and clues; Check & Save additionally flags
 * cells that contradict the unique solution.
 */

import { assertNever } from "../../engine/assert-never.ts";
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
import { commonHintRefusal, DEDUCTION_EXHAUSTED } from "../../engine/hint-refusal.ts";
import { clearKey } from "../../engine/key-labels.ts";
import {
  noOpEntryResult,
  pressNoteTakingCell,
  releaseHighlightAfterEntry,
} from "../../engine/note-taking-cell.ts";
import {
  pencilKeepHighlightPref,
  stickyPencilPref,
} from "../../engine/pencil-prefs.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  DELETE,
  isCursorMove,
  isEraseKey,
  LEFT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import type { RandomState } from "../../engine/random/index.ts";
import { registerGame } from "../../engine/registry.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import type {
  Color,
  ConfigValues,
  GameStatus,
  KeyLabel,
  Point,
  Size,
} from "../../engine/types.ts";
import { newUndeadDesc } from "./generator.ts";
import {
  colors,
  computeSize,
  countBlockAt,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
  type UndeadDrawState,
  type UndeadHint,
} from "./render.ts";
import {
  EASY_MAX_ARC_PASSES,
  findUndeadSolution,
  type HintOp,
  RUNG_ARC,
  RUNG_COUNTING,
  RUNG_FORCING,
  type Rung,
  recordUndeadDeductions,
  solveDeductive,
  type UndeadReason,
} from "./solver.ts";
import {
  cloneState,
  clueIndex,
  DIFF_EASY,
  DIFF_NORMAL,
  decodeParams,
  defaultParams,
  diffFromLevel,
  diffName,
  diffToLevel,
  encodeParams,
  isClue,
  MON_GHOST,
  MON_NONE,
  MON_VAMPIRE,
  MON_ZOMBIE,
  newState,
  newUi,
  PRESETS,
  paramConfig,
  recomputeErrors,
  status,
  textFormat,
  type UndeadMove,
  type UndeadParams,
  type UndeadState,
  type UndeadUi,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A player marking that contradicts the unique solution:
 * - `"cell"` — a placed monster that is wrong;
 * - `"note"` — an empty cell whose non-empty pencil notes have crossed out the
 *   cell's solution monster.
 * `x`/`y` are the interior grid coordinates (1-based), matching `redraw`. */
export interface UndeadMistake {
  kind: "cell" | "note";
  x: number;
  y: number;
}

// Keyboard codes used in interpretMove.
const KEY_G = 71;
const KEY_g = 103;
const KEY_V = 86;
const KEY_v = 118;
const KEY_Z = 90;
const KEY_z = 122;
const KEY_E = 69;
const KEY_e = 101;
const KEY_A = 65;
const KEY_a = 97;
const KEY_M = 77;
const KEY_m = 109;
const KEY_1 = 49;
const KEY_2 = 50;
const KEY_3 = 51;
const KEY_0 = 48;

function presets(): PresetMenu<UndeadParams> {
  return {
    title: "Undead",
    submenu: PRESETS.map((p) => ({
      title: `${p.w}x${p.h} ${diffName(p.diff)}`,
      params: p,
    })),
  };
}

function interpretMove(
  state: UndeadState,
  ui: UndeadUi,
  ds: UndeadDrawState,
  point: Point,
  rawButton: number,
): UndeadMove | null | UiUpdate {
  const common = state.common;
  const w = common.w;
  const h = common.h;
  const stride = w + 2;
  const ts = ds.tilesize;
  const b = Math.floor(ts / 4);
  const button = stripModifiers(rawButton);
  const gx = Math.trunc((point.x - b - 1) / ts);
  const gy = Math.trunc((point.y - b - 2) / ts) - 1;

  // A left-click on a count block (place/remove by clicking the tally).
  let cc = -1;
  if (button === LEFT_BUTTON && ds) cc = countBlockAt(ds, point.x, point.y);

  // Pictures/letters toggle.
  if (button === KEY_A || button === KEY_a) {
    ui.ascii = !ui.ascii;
    return UI_UPDATE;
  }

  // Fill all pencil marks — additively, and only when some undecided cell has
  // none, so a press on an already-noted board is a true no-op rather than an
  // undo entry that changes nothing.
  if (button === KEY_M || button === KEY_m) {
    for (let i = 0; i < common.numTotal; i++) {
      if (state.guess[i] === MON_NONE && state.pencil[i] === 0) {
        return { type: "markAll" };
      }
    }
    return null;
  }

  const xinfo = common.xinfo;

  // Real-entry mode: highlight shown, not penciling.
  if (ui.cursor.visible && !ui.pencilMode) {
    const xi = xinfo[ui.cursor.x + ui.cursor.y * stride];
    if (xi >= 0 && !common.fixed[xi]) {
      let ccLocal = cc;
      // Already there → treat as a delete. `DELETE` is being used as a
      // sentinel value here, not as a button the frontend sent.
      if (ccLocal >= 0 && state.guess[xi] === 1 << ccLocal) ccLocal = DELETE;
      const place = (monster: number): UndeadMove | null | UiUpdate => {
        if (state.guess[xi] === monster) return noOpEntryResult(ui);
        releaseHighlightAfterEntry(ui);
        return { type: "set", cell: xi, monster };
      };
      if (button === KEY_G || button === KEY_g || button === KEY_1 || ccLocal === 0)
        return place(MON_GHOST);
      if (button === KEY_V || button === KEY_v || button === KEY_2 || ccLocal === 1)
        return place(MON_VAMPIRE);
      if (button === KEY_Z || button === KEY_z || button === KEY_3 || ccLocal === 2)
        return place(MON_ZOMBIE);
      if (
        button === KEY_E ||
        button === KEY_e ||
        button === CURSOR_SELECT2 ||
        button === KEY_0 ||
        isEraseKey(button) ||
        ccLocal === DELETE
      ) {
        if (state.guess[xi] === MON_NONE && state.pencil[xi] === 0)
          return noOpEntryResult(ui);
        releaseHighlightAfterEntry(ui);
        return { type: "clear", cell: xi };
      }
    }
  }

  // Keyboard cursor movement.
  if (isCursorMove(button)) {
    if (ui.cursor.x === 0 && ui.cursor.y === 0) {
      ui.cursor.x = 1;
      ui.cursor.y = 1;
    } else if (button === CURSOR_UP) ui.cursor.y -= ui.cursor.y > 1 ? 1 : 0;
    else if (button === CURSOR_DOWN) ui.cursor.y += ui.cursor.y < h ? 1 : 0;
    else if (button === CURSOR_RIGHT) ui.cursor.x += ui.cursor.x < w ? 1 : 0;
    else if (button === CURSOR_LEFT) ui.cursor.x -= ui.cursor.x > 1 ? 1 : 0;
    ui.cursor.visible = true;
    ui.cursorFromKeyboard = true;
    return UI_UPDATE;
  }

  // Select toggles pencil mode.
  if (ui.cursor.visible && button === CURSOR_SELECT) {
    ui.pencilMode = !ui.pencilMode;
    ui.cursorFromKeyboard = true;
    return UI_UPDATE;
  }

  // Pencil-entry mode.
  if (ui.cursor.visible && ui.pencilMode) {
    const xi = xinfo[ui.cursor.x + ui.cursor.y * stride];
    if (xi >= 0 && !common.fixed[xi]) {
      let move: UndeadMove | null = null;
      if (button === KEY_G || button === KEY_g || button === KEY_1 || cc === 0)
        move = { type: "pencil", cell: xi, monster: MON_GHOST };
      else if (button === KEY_V || button === KEY_v || button === KEY_2 || cc === 1)
        move = { type: "pencil", cell: xi, monster: MON_VAMPIRE };
      else if (button === KEY_Z || button === KEY_z || button === KEY_3 || cc === 2)
        move = { type: "pencil", cell: xi, monster: MON_ZOMBIE };
      else if (
        button === KEY_E ||
        button === KEY_e ||
        button === CURSOR_SELECT2 ||
        button === KEY_0 ||
        isEraseKey(button)
      ) {
        if (state.pencil[xi] === 0) return noOpEntryResult(ui);
        move = { type: "clear", cell: xi };
      }
      if (move) {
        // Undead used to clear `pencilMode` here as well as hiding the
        // highlight, which contradicted its own sticky-pencil preference —
        // whose label promises the mode "stays on until right-clicked again"
        // and which is on by default. One mouse-driven pencil mark turned it
        // off. The shared rule keeps the mode.
        releaseHighlightAfterEntry(ui);
        return move;
      }
    }
  }

  // Grid clicks (selection / mode). Undead's highlight is in the 1-based
  // interior coordinates the clue border leaves, and `xinfo` maps those to a
  // monster index — `-1` for a square that is not part of the puzzle at all.
  if (gx >= 1 && gx <= w && gy >= 1 && gy <= h) {
    const xi = xinfo[gx + gy * stride];
    const playable = xi >= 0 && !common.fixed[xi];
    const press = pressNoteTakingCell(ui, button, gx, gy, {
      canEnter: playable,
      canMark: playable && state.guess[xi] === MON_NONE,
    });
    return press !== null ? UI_UPDATE : null;
  }

  if (button === LEFT_BUTTON && isClue(w, h, gx, gy)) {
    return { type: "hintDone", clue: clueIndex(w, h, gx, gy) };
  }

  return null;
}

function executeMove(state: UndeadState, move: UndeadMove): UndeadState {
  const next = cloneState(state);
  const common = next.common;
  let solver = false;

  switch (move.type) {
    case "set":
      next.guess[move.cell] = move.monster;
      break;
    case "clear":
      next.guess[move.cell] = MON_NONE;
      next.pencil[move.cell] = 0;
      break;
    case "pencil":
      next.pencil[move.cell] ^= move.monster;
      break;
    case "pencilStrike":
      // Idempotent clear (AND-NOT), so a replayed/kept hint plan never re-adds a
      // candidate. Notes are meaningful only while the cell is undecided.
      for (const { cell, monster } of move.marks) next.pencil[cell] &= ~monster;
      break;
    case "markAll":
      // Additive — fill only note-less empty cells, never reset a narrowed one:
      // `candidate-hint.ts`'s `adaptiveMarkAll` § "The additive rule, stated once".
      // "Empty" is `guess[i] === MON_NONE` here, and the mask is the three monsters.
      for (let i = 0; i < common.numTotal; i++) {
        if (next.guess[i] === MON_NONE && next.pencil[i] === 0) next.pencil[i] = 7;
      }
      break;
    case "hintDone":
      next.hintsDone[move.clue] ^= 1;
      break;
    case "solve":
      for (let i = 0; i < common.numTotal; i++) next.guess[i] = move.placements[i];
      solver = true;
      break;
    default:
      return assertNever(move, "undead: executeMove");
  }

  const correct = recomputeErrors(next);
  if (correct && !solver) next.completed = true;
  if (solver) {
    next.completed = true;
    next.cheated = true;
  }
  return next;
}

function changedState(
  ui: UndeadUi,
  _old: UndeadState | null,
  newSt: UndeadState,
): void {
  if (ui.cursor.visible && ui.pencilMode && !ui.cursorFromKeyboard) {
    const stride = newSt.common.w + 2;
    const xi = newSt.common.xinfo[ui.cursor.x + ui.cursor.y * stride];
    if (xi >= 0) {
      const g = newSt.guess[xi];
      if (g === MON_GHOST || g === MON_VAMPIRE || g === MON_ZOMBIE)
        ui.cursor.visible = false;
    }
  }
}

function solve(
  orig: UndeadState,
  _curr: UndeadState,
  aux?: string,
): SolveResult<UndeadMove> {
  const numTotal = orig.common.numTotal;
  if (aux) {
    const placements: number[] = [];
    for (let i = 0; i < numTotal; i++) {
      const c = aux[i + 1];
      placements[i] = c === "G" ? MON_GHOST : c === "V" ? MON_VAMPIRE : MON_ZOMBIE;
    }
    return { ok: true, move: { type: "solve", placements } };
  }
  const sol = findUndeadSolution(orig);
  if (!sol.ok) return { ok: false, error: sol.error };
  return { ok: true, move: { type: "solve", placements: Array.from(sol.guess) } };
}

function findMistakes(state: UndeadState): readonly UndeadMistake[] {
  const common = state.common;
  const sol = findUndeadSolution(state);
  if (!sol.ok) return [];

  // Monster index → interior grid coords.
  const stride = common.w + 2;
  const cellXY: { x: number; y: number }[] = [];
  for (let y = 1; y <= common.h; y++) {
    for (let x = 1; x <= common.w; x++) {
      const xi = common.xinfo[x + y * stride];
      if (xi >= 0) cellXY[xi] = { x, y };
    }
  }

  const out: UndeadMistake[] = [];
  for (let i = 0; i < common.numTotal; i++) {
    if (common.fixed[i]) continue;
    const at = cellXY[i];
    if (!at) continue;
    const g = state.guess[i];
    if (g === MON_GHOST || g === MON_VAMPIRE || g === MON_ZOMBIE) {
      if (g !== sol.guess[i]) out.push({ kind: "cell", x: at.x, y: at.y });
    } else if (state.pencil[i] !== 0 && !(state.pencil[i] & sol.guess[i])) {
      out.push({ kind: "note", x: at.x, y: at.y });
    }
  }
  return out;
}

// --- hint ------------------------------------------------------------------

const POPULATE_TEXT =
  "Start by penciling every monster into each empty cell, so the eliminations that follow have something to cross out.";

const isSingleton = (v: number): boolean =>
  v === MON_GHOST || v === MON_VAMPIRE || v === MON_ZOMBIE;

/** Singular monster name for a single bit. */
function monsterName(bit: number): string {
  return bit === MON_GHOST ? "ghost" : bit === MON_VAMPIRE ? "vampire" : "zombie";
}

/** Human list of the monsters in a bitmask: "ghost", "ghost or vampire",
 * "ghost, vampire or zombie". */
function joinMonsters(bits: number): string {
  const names: string[] = [];
  for (const b of [MON_GHOST, MON_VAMPIRE, MON_ZOMBIE])
    if (bits & b) names.push(monsterName(b));
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/** Monster index → interior (1-based) grid coordinates, matching `redraw`/
 * `findMistakes`. */
function monsterCellXY(common: UndeadState["common"]): { x: number; y: number }[] {
  const stride = common.w + 2;
  const out: { x: number; y: number }[] = [];
  for (let y = 1; y <= common.h; y++) {
    for (let x = 1; x <= common.w; x++) {
      const xi = common.xinfo[x + y * stride];
      if (xi >= 0) out[xi] = { x, y };
    }
  }
  return out;
}

/** A sightline path's traced cells (mirrors and monster cells) as interior
 * coordinates, shaded as the evidence area (§5.2). */
function pathCells(
  common: UndeadState["common"],
  p: number,
): { x: number; y: number }[] {
  const path = common.paths[p];
  const stride = common.w + 2;
  const cells: { x: number; y: number }[] = [];
  for (let i = 0; i < path.length; i++) {
    const cell = path.xy[i];
    cells.push({ x: cell % stride, y: Math.trunc(cell / stride) });
  }
  return cells;
}

/** Narrate *why* a firing is forced — leading with the spotted indication, then
 * the reasoning, then a necessity-voice conclusion (docs/games/hints.md § "Writing the narration"). `bits`
 * is the struck candidate mask (an elimination) or the single placed monster (a
 * placement); `continues` gets a terser continuation-leg line. */
function narrate(
  common: UndeadState["common"],
  reason: UndeadReason,
  bits: number,
  continues: boolean,
): string {
  const list = joinMonsters(bits);
  switch (reason.kind) {
    case "sightline": {
      if (continues)
        return `The same sightline rules the ${list} out of this cell too.`;
      const path = common.paths[reason.path];
      const a = path.sightingsStart;
      const b = path.sightingsEnd;
      return `Trace this sightline: a vampire shows before its first mirror, a ghost only after one, a zombie anywhere along it. No arrangement that shows exactly ${a} from one end and ${b} from the other leaves room for the ${list} in this cell, so we must cross out the ${list}.`;
    }
    case "total": {
      const name = monsterName(reason.monster);
      return `Every ${name} is already placed, so no undecided cell can be one; we must cross out the ${name} here.`;
    }
    case "onlyCells": {
      const name = monsterName(reason.monster);
      return `The only cells that can still hold a ${name} are exactly enough for the ${name}s still to place, so this one can only be a ${name}.`;
    }
    case "single":
      return `Only the ${list} is left uncrossed in this cell, so it can only be a ${list}.`;
  }
}

/** The evidence area to shade: a sightline shades its whole bounce path; the
 * other deductions have no clean local area (the struck/placed cell carries it). */
function reasonArea(
  common: UndeadState["common"],
  reason: UndeadReason,
): { x: number; y: number }[] {
  return reason.kind === "sightline" ? pathCells(common, reason.path) : [];
}

/** True iff some empty cell carries no notes — the board needs a fill-all
 * populate before eliminations have anything to cross out. */
function anyEmptyLacksNotes(
  wGuess: Uint8Array,
  wPen: Uint8Array,
  numTotal: number,
): boolean {
  for (let i = 0; i < numTotal; i++)
    if (wGuess[i] === MON_NONE && wPen[i] === 0) return true;
  return false;
}

/** A naked single in the player's working notes: the first empty cell whose
 * notes have collapsed to one monster. On a mistake-free board that lone note is
 * the solution, so placing it is sound — and it is the move a person makes next,
 * so the hint surfaces it ahead of any elimination (§9.3). */
function nakedSingle(
  wGuess: Uint8Array,
  wPen: Uint8Array,
  numTotal: number,
): { cell: number; monster: number } | null {
  for (let i = 0; i < numTotal; i++) {
    if (wGuess[i] !== MON_NONE) continue;
    if (isSingleton(wPen[i])) return { cell: i, monster: wPen[i] };
  }
  return null;
}

/** The next recorded forced placement (counting's "only these cells" dual) whose
 * cell is still empty — needs no notes, so it is placed before the populate. */
function nextPlaceOp(ops: HintOp[], wGuess: Uint8Array): HintOp | null {
  for (const op of ops) {
    if (op.kind === "place" && wGuess[op.cell] === MON_NONE) return op;
  }
  return null;
}

/** The next live elimination firing: the first still-applicable `elim` op, with
 * its whole firing's live ops gathered (one firing = one journey). "Live" treats
 * a not-yet-populated empty cell as carrying every note (populate will add them),
 * so the firing surfaces before the markAll step that fills its cells. */
function nextFiring(
  ops: HintOp[],
  wGuess: Uint8Array,
  wPen: Uint8Array,
): { ops: HintOp[]; reason: UndeadReason } | null {
  const effPen = (cell: number): number =>
    wPen[cell] || (wGuess[cell] === MON_NONE ? MON_NONE : 0);
  const live = (op: HintOp): boolean =>
    op.kind === "elim" &&
    wGuess[op.cell] === MON_NONE &&
    (effPen(op.cell) & op.monster) !== 0;
  for (let i = 0; i < ops.length; i++) {
    if (!live(ops[i])) continue;
    const g = ops[i].group;
    return { ops: ops.filter((o) => o.group === g && live(o)), reason: ops[i].reason };
  }
  return null;
}

/** Push a placement step, advancing the working grid. */
function emitPlace(
  steps: HintStep<UndeadMove, UndeadHint>[],
  xyOf: { x: number; y: number }[],
  common: UndeadState["common"],
  cell: number,
  monster: number,
  reason: UndeadReason,
): void {
  steps.push({
    move: { type: "set", cell, monster },
    explanation: narrate(common, reason, monster, false),
    highlights: { area: reasonArea(common, reason), targets: [xyOf[cell]], marks: [] },
  });
}

/** Push the steps for one elimination firing. A `total` firing is one step
 * (strike one monster across every cell); a `forcing` firing is one cell; a
 * `sightline` firing splits **by cell** into a `continuesPrevious` journey (§9.3
 * region pattern — the shaded sightline stays constant, each leg names one cell). */
function emitFiring(
  steps: HintStep<UndeadMove, UndeadHint>[],
  firing: { ops: HintOp[]; reason: UndeadReason },
  xyOf: { x: number; y: number }[],
  common: UndeadState["common"],
): void {
  const { ops, reason } = firing;
  const markOf = (op: HintOp) => ({
    x: xyOf[op.cell].x,
    y: xyOf[op.cell].y,
    monster: op.monster,
  });

  if (reason.kind === "sightline") {
    // Group the firing's ops by cell, preserving first-seen order.
    const byCell = new Map<number, HintOp[]>();
    for (const op of ops) {
      const arr = byCell.get(op.cell);
      if (arr) arr.push(op);
      else byCell.set(op.cell, [op]);
    }
    const area = reasonArea(common, reason);
    let leg = 0;
    for (const [cell, cellOps] of byCell) {
      let bits = 0;
      for (const op of cellOps) bits |= op.monster;
      steps.push({
        move: {
          type: "pencilStrike",
          marks: cellOps.map((op) => ({ cell, monster: op.monster })),
        },
        explanation: narrate(common, reason, bits, leg > 0),
        highlights: { area, targets: [xyOf[cell]], marks: cellOps.map(markOf) },
        continuesPrevious: leg > 0,
      });
      leg++;
    }
    return;
  }

  // total / forcing — one step. (`total` names one monster across many cells;
  // `forcing` is one cell, one candidate.)
  const monster = reason.kind === "total" ? reason.monster : ops[0].monster;
  steps.push({
    move: {
      type: "pencilStrike",
      marks: ops.map((op) => ({ cell: op.cell, monster: op.monster })),
    },
    explanation: narrate(common, reason, monster, false),
    highlights: {
      area: [],
      targets: ops.map((op) => xyOf[op.cell]),
      marks: ops.map(markOf),
    },
  });
}

/** Build the deductive hint plan by walking a working copy of the board the way
 * a person solves it: a naked single first, else a forced placement, else the
 * next elimination firing (populating notes lazily, only when an elimination
 * first needs something to cross out). The working candidate state is re-derived
 * from the **placed grid only** (`recordUndeadDeductions`), never the player's
 * notes (§9.1); the notes decide which already-valid elimination to surface and
 * what is done. **No solution-walk / guess** — the strengthened deductive ladder
 * always has a real deduction to narrate (D3). */
function buildSteps(state: UndeadState): HintStep<UndeadMove, UndeadHint>[] {
  const common = state.common;
  const numTotal = common.numTotal;
  const xyOf = monsterCellXY(common);
  const steps: HintStep<UndeadMove, UndeadHint>[] = [];
  const wGuess = state.guess.slice();
  const wPen = state.pencil.slice();

  let populated = !anyEmptyLacksNotes(wGuess, wPen, numTotal);
  const ensurePopulated = (): void => {
    if (populated) return;
    // Mirrors the additive `markAll` above: a cell the player has already
    // narrowed keeps its notes, so the plan never strikes a candidate that is
    // no longer on their board.
    for (let i = 0; i < numTotal; i++) {
      if (wGuess[i] === MON_NONE && wPen[i] === 0) wPen[i] = MON_NONE;
    }
    steps.push({
      move: { type: "markAll" },
      explanation: POPULATE_TEXT,
      highlights: { area: [], targets: [], marks: [] },
    });
    populated = true;
  };

  let ops = recordUndeadDeductions(common, wGuess);
  const budget = stepBudget("undead hint plan");
  const cap = numTotal * 8 + 8;
  for (let guard = 0; guard < cap; guard++) {
    budget.tick();
    let allPlaced = true;
    for (let i = 0; i < numTotal; i++) if (!isSingleton(wGuess[i])) allPlaced = false;
    if (allPlaced) break;

    // 1. A naked single — the next move a person makes (needs notes).
    const ns = nakedSingle(wGuess, wPen, numTotal);
    if (ns) {
      emitPlace(steps, xyOf, common, ns.cell, ns.monster, { kind: "single" });
      wGuess[ns.cell] = ns.monster;
      wPen[ns.cell] = 0;
      ops = recordUndeadDeductions(common, wGuess);
      continue;
    }

    // 2. A forced placement (counting's "only these cells" dual) — needs no notes.
    const place = nextPlaceOp(ops, wGuess);
    if (place) {
      emitPlace(steps, xyOf, common, place.cell, place.monster, place.reason);
      wGuess[place.cell] = place.monster;
      wPen[place.cell] = 0;
      ops = recordUndeadDeductions(common, wGuess);
      continue;
    }

    // 3. The next elimination firing (the deduction worth teaching). Populate
    //    lazily, the moment a strike first needs notes to cross out.
    const firing = nextFiring(ops, wGuess, wPen);
    if (firing) {
      ensurePopulated();
      emitFiring(steps, firing, xyOf, common);
      for (const op of firing.ops) wPen[op.cell] &= ~op.monster;
      continue;
    }

    break; // stuck (only on a board that needs a guess — not a shipped tier)
  }

  return steps;
}

function hint(
  state: UndeadState,
  _aux?: string,
  _ui?: UndeadUi,
): HintResult<UndeadMove, UndeadHint> {
  const refusal = commonHintRefusal(state.completed, findMistakes(state).length);
  if (refusal) return refusal;
  // Undead has no trivial (non-teachable) elimination to fold away, so it takes
  // no auto-pencil pref and ignores `ui` (design D4).
  const steps = buildSteps(state);
  if (steps.length === 0) {
    return { ok: false, error: DEDUCTION_EXHAUSTED };
  }
  return { ok: true, steps };
}

/** Re-derive the displayed step's highlights for a shrunk `pencilStrike`. */
function strikeHighlights(
  xyOf: { x: number; y: number }[],
  prev: UndeadHint | undefined,
  marks: { cell: number; monster: number }[],
): UndeadHint {
  return {
    area: prev?.area ?? [],
    targets: marks.map((k) => xyOf[k.cell]),
    marks: marks.map((k) => ({
      x: xyOf[k.cell].x,
      y: xyOf[k.cell].y,
      monster: k.monster,
    })),
  };
}

/** Classify a player move against the displayed hint step (PRE-move state, §3). */
function hintKeepTrack(
  m: UndeadMove,
  step: HintStep<UndeadMove, UndeadHint>,
  state: UndeadState,
): HintTrackVerdict {
  const sm = step.move;
  if (sm.type === "markAll") return m.type === "markAll" ? "completed" : "off";
  if (sm.type === "set") {
    return m.type === "set" && m.cell === sm.cell && m.monster === sm.monster
      ? "completed"
      : "off";
  }
  if (sm.type === "pencilStrike") {
    // The player strikes a candidate with a `pencil` toggle.
    if (m.type !== "pencil") return "off";
    const hit = sm.marks.findIndex((k) => k.cell === m.cell && k.monster === m.monster);
    if (hit < 0) return "off"; // a non-target candidate
    // PRE-move: a toggle clears the candidate iff it is present now; an absent
    // candidate would be *re-added* — off-plan.
    if (!(state.pencil[m.cell] & m.monster)) return "off";
    const remaining = sm.marks.filter((_, j) => j !== hit);
    if (remaining.length === 0) return "completed";
    step.move = { type: "pencilStrike", marks: remaining };
    step.highlights = strikeHighlights(
      monsterCellXY(state.common),
      step.highlights,
      remaining,
    );
    return "onTrack";
  }
  return "off";
}

/** Re-validate a stored step against the current board before (re-)display (the
 * engine's "never show a stale step" guarantee, §7.3). */
function refreshHintStep(
  step: HintStep<UndeadMove, UndeadHint>,
  state: UndeadState,
): HintStep<UndeadMove, UndeadHint> | null {
  const m = step.move;
  if (m.type === "pencilStrike") {
    const live = m.marks.filter(
      ({ cell, monster }) =>
        state.guess[cell] === MON_NONE && (state.pencil[cell] & monster) !== 0,
    );
    if (live.length === 0) return null;
    if (live.length === m.marks.length) return step;
    return {
      ...step,
      move: { type: "pencilStrike", marks: live },
      highlights: strikeHighlights(monsterCellXY(state.common), step.highlights, live),
    };
  }
  if (m.type === "set") {
    return state.guess[m.cell] !== MON_NONE ? null : step;
  }
  if (m.type === "markAll") {
    for (let i = 0; i < state.common.numTotal; i++) {
      if (state.guess[i] === MON_NONE && state.pencil[i] === 0) return step;
    }
    return null;
  }
  return step;
}

function flashLength(from: UndeadState, to: UndeadState): number {
  return winFlash(from, to, FLASH_TIME);
}

/** Undead's difficulty contract (`engine/difficulty.ts`).
 *
 * **Its cap is a technique rung, not a difficulty number** — this fork replaced
 * upstream's "how much brute force does it need?" grading with a deductive
 * ladder (arc-consistency → exact counting → depth-1 forcing) so that every
 * shipped tier is pure-deduction solvable (`docs/games/solver-and-generator.md § "Guess-free generation"). So the tier
 * maps to a `Rung` and the question `solveAtCap` asks is the generator's own:
 * does the ladder, capped there, narrow every cell to a singleton?
 *
 * The generator additionally requires the *exact* rung for the tier. That is a
 * tier-acceptance rule, not solvability, and it belongs to the generator —
 * `solvableAtExactlyTier` is the shared expression of the same idea.
 *
 * **Easy is a rung *and* a bound, and this cap must carry both**
 * (`assert-that-tiers-bind`, 2026-09-08). Undead's Easy is arc-consistency
 * within {@link EASY_MAX_ARC_PASSES} passes; a board needing more passes is a
 * Normal board even though it never leaves the arc rung. This function ran the
 * arc rung *unbounded* at `DIFF_EASY`, so every Normal board answered "solved"
 * at cap Easy — and the collection's difficulty guards, which grade through this
 * contract rather than through the generator, read an Easy that was not
 * Undead's. The generator was right the whole time; the instrument was wide, and
 * nothing compared the two spellings until a guard did. */
const difficulty: DifficultyContract<UndeadParams> = {
  tierOf: (p) => diffToLevel(p.diff),
  withTier: (p, tier) => ({ ...p, diff: diffFromLevel(tier) }),
  solveAtCap: (p, desc, cap) => {
    const common = newState(p, desc).common;
    const maxRung: Rung =
      cap === DIFF_EASY ? RUNG_ARC : cap === DIFF_NORMAL ? RUNG_COUNTING : RUNG_FORCING;
    const start = new Uint8Array(common.numTotal).fill(MON_NONE);
    const grade = solveDeductive(common, start, maxRung);
    if (grade.inconsistent) return "impossible";
    if (cap === DIFF_EASY && grade.arcPasses > EASY_MAX_ARC_PASSES) return "unsolved";
    return grade.solved ? "solved" : "unsolved";
  },
};

export const undeadGame: Game<
  UndeadParams,
  UndeadState,
  UndeadMove,
  UndeadUi,
  UndeadDrawState,
  UndeadMistake
> = {
  id: "undead",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  canMarkAll: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig,
  // Keys match the `undead` config template in augmentation.ts
  // ("{width}x{height} {difficulty:Easy|Normal|Tricky}").
  describeParams: (p): ConfigValues => ({
    width: String(p.w),
    height: String(p.h),
    difficulty: diffToLevel(p.diff),
  }),

  newDesc: (p, rng: RandomState) => newUndeadDesc(p, rng),
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status: (s): GameStatus => status(s),

  solve,
  difficulty,
  hint,
  hintKeepTrack,
  refreshHintStep,
  findMistakes,
  // Upstream's four explicit keys: the three monsters plus clear.
  requestKeys: (): KeyLabel[] => [
    { button: KEY_G, label: "Ghost" },
    { button: KEY_V, label: "Vampire" },
    { button: KEY_Z, label: "Zombie" },
    clearKey,
  ],
  textFormat,

  prefs: [
    stickyPencilPref<UndeadUi>(),
    pencilKeepHighlightPref<UndeadUi>(),
    {
      kw: "monsters",
      name: "Monster representation",
      type: "choices",
      choices: ["Pictures", "Letters"],
      get: (ui) => (ui.ascii ? 1 : 0),
      set: (ui, v) => {
        ui.ascii = v === 1;
      },
    },
    {
      kw: "count-style",
      name: "Monster count display",
      type: "choices",
      choices: ["Total", "Remaining", "Placed/Total", "Left/Total"],
      get: (ui) => ui.countStyle,
      set: (ui, v) => {
        ui.countStyle = v;
      },
    },
  ],

  colors: (defaultBackground: Color): Color[] => colors(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: UndeadParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(undeadGame);
