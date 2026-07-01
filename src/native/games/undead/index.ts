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
 * Live errors recolour the counts and clues; Check & Save additionally flags
 * cells that contradict the unique solution.
 */

import type {
  Colour,
  ConfigValues,
  GameStatus,
  KeyLabel,
  Point,
  Size,
} from "../../../puzzle/types.ts";
import { clearKey } from "../../engine/key-labels.ts";
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
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import { registerGame } from "../../engine/registry.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import type { RandomState } from "../../random/index.ts";
import { newUndeadDesc } from "./generator.ts";
import {
  colours,
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
import { findUndeadSolution, type HintOp, recordUndeadDeductions, type UndeadReason } from "./solver.ts";
import {
  cloneState,
  clueIndex,
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
const KEY_BACKSPACE = 8;

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
  ds: UndeadDrawState | null,
  point: Point,
  rawButton: number,
): UndeadMove | null | UiUpdate {
  const common = state.common;
  const w = common.w;
  const h = common.h;
  const stride = w + 2;
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
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

  // Fill all pencil marks.
  if (button === KEY_M || button === KEY_m) return { type: "markAll" };

  const xinfo = common.xinfo;

  // Real-entry mode: highlight shown, not pencilling.
  if (ui.hshow && !ui.hpencil) {
    const xi = xinfo[ui.hx + ui.hy * stride];
    if (xi >= 0 && !common.fixed[xi]) {
      let ccLocal = cc;
      if (ccLocal >= 0 && state.guess[xi] === 1 << ccLocal) ccLocal = 127; // already there → delete
      const place = (monster: number): UndeadMove | null | UiUpdate => {
        if (!ui.hcursor) ui.hshow = false;
        if (state.guess[xi] === monster) return ui.hcursor ? null : UI_UPDATE;
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
        button === KEY_BACKSPACE ||
        ccLocal === 127
      ) {
        if (!ui.hcursor) ui.hshow = false;
        if (state.guess[xi] === MON_NONE && state.pencils[xi] === 0)
          return ui.hcursor ? null : UI_UPDATE;
        return { type: "clear", cell: xi };
      }
    }
  }

  // Keyboard cursor movement.
  if (isCursorMove(button)) {
    if (ui.hx === 0 && ui.hy === 0) {
      ui.hx = 1;
      ui.hy = 1;
    } else if (button === CURSOR_UP) ui.hy -= ui.hy > 1 ? 1 : 0;
    else if (button === CURSOR_DOWN) ui.hy += ui.hy < h ? 1 : 0;
    else if (button === CURSOR_RIGHT) ui.hx += ui.hx < w ? 1 : 0;
    else if (button === CURSOR_LEFT) ui.hx -= ui.hx > 1 ? 1 : 0;
    ui.hshow = true;
    ui.hcursor = true;
    return UI_UPDATE;
  }

  // Select toggles pencil mode.
  if (ui.hshow && button === CURSOR_SELECT) {
    ui.hpencil = !ui.hpencil;
    ui.hcursor = true;
    return UI_UPDATE;
  }

  // Pencil-entry mode.
  if (ui.hshow && ui.hpencil) {
    const xi = xinfo[ui.hx + ui.hy * stride];
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
        button === KEY_BACKSPACE
      ) {
        if (state.pencils[xi] === 0) return ui.hcursor ? null : UI_UPDATE;
        move = { type: "clear", cell: xi };
      }
      if (move) {
        if (!ui.hcursor && !(ui.hpencil && ui.pencilKeepHighlight)) {
          ui.hpencil = false;
          ui.hshow = false;
        }
        return move;
      }
    }
  }

  // Grid clicks (selection / mode), with the fork sticky-pencil behaviour.
  if (gx >= 1 && gx <= w && gy >= 1 && gy <= h) {
    const xi = xinfo[gx + gy * stride];
    if (xi >= 0 && !common.fixed[xi]) {
      const g = state.guess[xi];
      if (button === LEFT_BUTTON) {
        if (gx === ui.hx && gy === ui.hy && ui.hshow && (ui.pencilSticky || !ui.hpencil)) {
          ui.hshow = false;
        } else {
          ui.hx = gx;
          ui.hy = gy;
          ui.hshow = true;
          if (!ui.pencilSticky) ui.hpencil = false;
        }
        ui.hcursor = false;
        return UI_UPDATE;
      }
      if (button === RIGHT_BUTTON) {
        if (ui.pencilSticky) {
          ui.hpencil = !ui.hpencil;
          if (g === MON_NONE) {
            ui.hx = gx;
            ui.hy = gy;
            ui.hshow = true;
          }
          ui.hcursor = false;
          return UI_UPDATE;
        }
        // Non-sticky (upstream): right-click an empty cell enters pencil mode.
        if (!ui.hpencil && g === MON_NONE) {
          ui.hshow = true;
          ui.hpencil = true;
          ui.hcursor = false;
          ui.hx = gx;
          ui.hy = gy;
          return UI_UPDATE;
        }
        if (gx === ui.hx && gy === ui.hy && ui.hshow) {
          ui.hshow = false;
          ui.hpencil = false;
          ui.hcursor = false;
          return UI_UPDATE;
        }
        if (g === MON_NONE) {
          ui.hshow = true;
          ui.hpencil = true;
          ui.hcursor = false;
          ui.hx = gx;
          ui.hy = gy;
          return UI_UPDATE;
        }
      }
    }
    return null;
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
      next.pencils[move.cell] = 0;
      break;
    case "pencil":
      next.pencils[move.cell] ^= move.monster;
      break;
    case "pencilStrike":
      // Idempotent clear (AND-NOT), so a replayed/kept hint plan never re-adds a
      // candidate. Notes are meaningful only while the cell is undecided.
      for (const { cell, monster } of move.marks) next.pencils[cell] &= ~monster;
      break;
    case "markAll":
      for (let i = 0; i < common.numTotal; i++) {
        if (next.guess[i] === MON_NONE) next.pencils[i] = 7;
      }
      break;
    case "hintDone":
      next.hintsDone[move.clue] ^= 1;
      break;
    case "solve":
      for (let i = 0; i < common.numTotal; i++) next.guess[i] = move.placements[i];
      solver = true;
      break;
  }

  const correct = recomputeErrors(next);
  if (correct && !solver) next.solved = true;
  if (solver) {
    next.solved = true;
    next.cheated = true;
  }
  return next;
}

function changedState(ui: UndeadUi, _old: UndeadState | null, newSt: UndeadState): void {
  if (ui.hshow && ui.hpencil && !ui.hcursor) {
    const stride = newSt.common.w + 2;
    const xi = newSt.common.xinfo[ui.hx + ui.hy * stride];
    if (xi >= 0) {
      const g = newSt.guess[xi];
      if (g === MON_GHOST || g === MON_VAMPIRE || g === MON_ZOMBIE) ui.hshow = false;
    }
  }
}

function solve(orig: UndeadState, _curr: UndeadState, aux?: string): SolveResult<UndeadMove> {
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
    } else if (state.pencils[i] !== 0 && !(state.pencils[i] & sol.guess[i])) {
      out.push({ kind: "note", x: at.x, y: at.y });
    }
  }
  return out;
}

// --- hint ------------------------------------------------------------------

const POPULATE_TEXT =
  "Start by pencilling every monster into each empty cell, so the eliminations that follow have something to cross out.";

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
  for (const b of [MON_GHOST, MON_VAMPIRE, MON_ZOMBIE]) if (bits & b) names.push(monsterName(b));
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
function pathCells(common: UndeadState["common"], p: number): { x: number; y: number }[] {
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
 * the reasoning, then a necessity-voice conclusion (hint-authoring §2). `bits`
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
      if (continues) return `The same sightline rules the ${list} out of this cell too.`;
      const path = common.paths[reason.path];
      const a = path.sightingsStart;
      const b = path.sightingsEnd;
      return `Trace this sightline: a vampire shows before its first mirror, a ghost only after one, a zombie anywhere along it. No arrangement that shows exactly ${a} from one end and ${b} from the other leaves room for the ${list} in this cell — so we must cross out the ${list}.`;
    }
    case "total": {
      const name = monsterName(reason.monster);
      return `Every ${name} is already placed, so no undecided cell can be one — we must cross out the ${name} here.`;
    }
    case "onlyCells": {
      const name = monsterName(reason.monster);
      return `The only cells that can still hold a ${name} are exactly enough for the ${name}s still to place — so this one can only be a ${name}.`;
    }
    case "forcing": {
      const name = monsterName(reason.monster);
      return `If this cell were a ${name}, the sightline clues and monster counts could no longer all be met — so we must cross out the ${name}.`;
    }
    case "single":
      return `Only the ${list} is left uncrossed in this cell — so it can only be a ${list}.`;
  }
}

/** The evidence area to shade: a sightline shades its whole bounce path; the
 * other deductions have no clean local area (the struck/placed cell carries it). */
function reasonArea(common: UndeadState["common"], reason: UndeadReason): { x: number; y: number }[] {
  return reason.kind === "sightline" ? pathCells(common, reason.path) : [];
}

/** True iff some empty cell carries no notes — the board needs a fill-all
 * populate before eliminations have anything to cross out. */
function anyEmptyLacksNotes(wGuess: Uint8Array, wPen: Uint8Array, numTotal: number): boolean {
  for (let i = 0; i < numTotal; i++) if (wGuess[i] === MON_NONE && wPen[i] === 0) return true;
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
    op.kind === "elim" && wGuess[op.cell] === MON_NONE && (effPen(op.cell) & op.monster) !== 0;
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
  const markOf = (op: HintOp) => ({ x: xyOf[op.cell].x, y: xyOf[op.cell].y, monster: op.monster });

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
        move: { type: "pencilStrike", marks: cellOps.map((op) => ({ cell, monster: op.monster })) },
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
    move: { type: "pencilStrike", marks: ops.map((op) => ({ cell: op.cell, monster: op.monster })) },
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
  const wPen = state.pencils.slice();

  let populated = !anyEmptyLacksNotes(wGuess, wPen, numTotal);
  const ensurePopulated = (): void => {
    if (populated) return;
    for (let i = 0; i < numTotal; i++) if (wGuess[i] === MON_NONE) wPen[i] = MON_NONE;
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
  if (state.solved) return { ok: false, error: "This board is already solved." };
  if (findMistakes(state).length > 0) {
    return {
      ok: false,
      error: "Fix the highlighted mistakes first — a hint can't deduce from a wrong board.",
    };
  }
  // Undead has no trivial (non-teachable) elimination to fold away, so it takes
  // no auto-pencil pref and ignores `ui` (design D4).
  const steps = buildSteps(state);
  if (steps.length === 0) {
    return { ok: false, error: "No further move can be deduced from this position." };
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
    marks: marks.map((k) => ({ x: xyOf[k.cell].x, y: xyOf[k.cell].y, monster: k.monster })),
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
    return m.type === "set" && m.cell === sm.cell && m.monster === sm.monster ? "completed" : "off";
  }
  if (sm.type === "pencilStrike") {
    // The player strikes a candidate with a `pencil` toggle.
    if (m.type !== "pencil") return "off";
    const hit = sm.marks.findIndex((k) => k.cell === m.cell && k.monster === m.monster);
    if (hit < 0) return "off"; // a non-target candidate
    // PRE-move: a toggle clears the candidate iff it is present now; an absent
    // candidate would be *re-added* — off-plan.
    if (!(state.pencils[m.cell] & m.monster)) return "off";
    const remaining = sm.marks.filter((_, j) => j !== hit);
    if (remaining.length === 0) return "completed";
    step.move = { type: "pencilStrike", marks: remaining };
    step.highlights = strikeHighlights(monsterCellXY(state.common), step.highlights, remaining);
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
      ({ cell, monster }) => state.guess[cell] === MON_NONE && (state.pencils[cell] & monster) !== 0,
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
      if (state.guess[i] === MON_NONE && state.pencils[i] === 0) return step;
    }
    return null;
  }
  return step;
}

function flashLength(from: UndeadState, to: UndeadState): number {
  if (!from.solved && to.solved && !from.cheated && !to.cheated) return FLASH_TIME;
  return 0;
}

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
  paramConfig: [
    ...dimensionParamConfig<UndeadParams>(),
    {
      kw: "difficulty",
      name: "Difficulty",
      type: "choices",
      choices: ["Easy", "Normal", "Tricky"],
      get: (p) => diffToLevel(p.diff),
      set: (p, v) => {
        p.diff = diffFromLevel(v);
      },
    },
  ],
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

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: UndeadParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(undeadGame);
