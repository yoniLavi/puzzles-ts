/**
 * Light Up (Akari) — native TS port of `lightup.c`. Place bulbs on open
 * squares so every open square is lit, no bulb shines on another, and
 * every numbered black square has exactly that many adjacent bulbs.
 *
 * Left-click toggles a bulb; right-click toggles the player's "no bulb
 * here" impossible-mark (each placing clears the other). Keyboard: arrow
 * cursor, Enter/select for a bulb, `i`/select2 for a mark. Clue numbers
 * turn red when provably wrong; bulbs turn red when they light each
 * other. Check & Save additionally flags bulbs/marks contradicting the
 * unique solution.
 */

import { assertNever, rejectMove } from "../../engine/assert-never.ts";
import type { DifficultyContract } from "../../engine/difficulty.ts";
import { winFlash } from "../../engine/flash.ts";
import type {
  HintResult,
  HintStep,
  HintTrackVerdict,
  SolveResult,
} from "../../engine/game.ts";
import { type Game, UI_UPDATE, type UiUpdate } from "../../engine/game.ts";
import {
  ALREADY_SOLVED,
  FIX_MISTAKES_FIRST,
  NO_DEDUCTION_LEFT_TRIAL_AND_ERROR,
} from "../../engine/hint-refusal.ts";
import { dimensionParamConfig, parseConfigInt } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  newCursor,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import { SYMMETRY_CHOICES } from "../../engine/symmetric-blacks.ts";
import type { Color, ConfigValues, Point, Size } from "../../engine/types.ts";
import { newLightupDesc, puzzleIsGood } from "./generator.ts";
import {
  colors,
  computeSize,
  FLASH_TIME,
  fromCoord,
  type LightupDrawState,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import {
  deduceHintPlan,
  dosolve,
  F_SOLVE_ALLOWRECURSE,
  F_SOLVE_DISCOUNTSETS,
  type HintCell,
  type LightupFiring,
  solveUnique,
} from "./solver.ts";
import {
  cloneState,
  decodeParams,
  defaultParams,
  encodeParams,
  F_BLACK,
  F_IMPOSSIBLE,
  F_LIGHT,
  gridCorrect,
  idx,
  type LightupMove,
  type LightupOp,
  type LightupParams,
  type LightupState,
  type LightupUi,
  newState,
  presets,
  setLight,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A cell Check & Save flags: a bulb the unique solution doesn't have
 * (`"light"`), or an impossible-mark sitting on a solution bulb
 * (`"mark"`). */
export interface LightupMistake {
  x: number;
  y: number;
  kind: "light" | "mark";
}

const KEY_I_LOWER = "i".charCodeAt(0);
const KEY_I_UPPER = "I".charCodeAt(0);

function newUi(_state: LightupState): LightupUi {
  return { cursor: newCursor(), drawBlobsWhenLit: true };
}

function changedState(
  ui: LightupUi,
  _old: LightupState | null,
  next: LightupState,
): void {
  if (next.completed) ui.cursor.visible = false;
}

function interpretMove(
  state: LightupState,
  ui: LightupUi,
  ds: LightupDrawState,
  p: Point,
  rawButton: number,
): LightupMove | null | UiUpdate {
  const button = stripModifiers(rawButton);
  const { w, h } = state;

  let action: "light" | "impossible" | null = null;
  let cx = -1;
  let cy = -1;
  /** What an ineffective pointer action returns: hiding a visible cursor
   * is itself a UI change (upstream's `nullret = empty`). */
  let nullret: null | UiUpdate = null;

  if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
    if (ui.cursor.visible) nullret = UI_UPDATE;
    ui.cursor.visible = false;
    const ts = ds.tilesize;
    cx = fromCoord(p.x, ts);
    cy = fromCoord(p.y, ts);
    action = button === LEFT_BUTTON ? "light" : "impossible";
  } else if (
    button === CURSOR_SELECT ||
    button === CURSOR_SELECT2 ||
    button === KEY_I_LOWER ||
    button === KEY_I_UPPER
  ) {
    if (ui.cursor.visible) {
      // Cursor-effect operations only apply to a visible cursor.
      cx = ui.cursor.x;
      cy = ui.cursor.y;
      action = button === CURSOR_SELECT ? "light" : "impossible";
    } else {
      ui.cursor.visible = true;
      return UI_UPDATE;
    }
  } else if (isCursorMove(button)) {
    // Upstream `move_cursor`: move (clamped), reveal if hidden; a
    // clamped-edge no-op with a visible cursor is no effect.
    const pos = gridCursorMove(button, ui.cursor.x, ui.cursor.y, w, h);
    if (pos) {
      ui.cursor.x = pos.x;
      ui.cursor.y = pos.y;
    }
    if (!ui.cursor.visible) {
      ui.cursor.visible = true;
      return UI_UPDATE;
    }
    return pos ? UI_UPDATE : null;
  } else {
    return null;
  }

  if (action) {
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) return nullret;
    const flags = state.flags[idx(cx, cy, w)];
    if (flags & F_BLACK) return nullret;
    if (action === "light" && flags & F_IMPOSSIBLE) return nullret;
    if (action === "impossible" && flags & F_LIGHT) return nullret;
    return { ops: [{ kind: action, x: cx, y: cy }] };
  }
  return nullret;
}

function executeMove(state: LightupState, move: LightupMove): LightupState {
  // A move is an op list, not a union, so there is no discriminant to narrow to
  // `never`: check the one field the dispatch reads (see `rejectMove`).
  if (!Array.isArray(move.ops)) rejectMove(move, "lightup: executeMove");

  const next = cloneState(state);
  const { w, h } = next;
  for (const op of move.ops) {
    if (op.x < 0 || op.y < 0 || op.x >= w || op.y >= h)
      throw new Error("Light Up move out of bounds");
    const i = idx(op.x, op.y, w);
    const flags = next.flags[i];
    if (flags & F_BLACK) throw new Error("Light Up move targets a black square");
    // Bulb and impossible-mark are mutually exclusive; each is a toggle.
    if (op.kind === "light") {
      next.flags[i] &= ~F_IMPOSSIBLE;
      setLight(next, op.x, op.y, !(flags & F_LIGHT));
    } else if (op.kind === "impossible") {
      setLight(next, op.x, op.y, false);
      next.flags[i] ^= F_IMPOSSIBLE;
    } else {
      // `op` is one interface with a two-value `kind`, not a union of shapes,
      // so it is `op.kind` that narrows to `never` here. The offending op goes
      // in the context instead.
      assertNever(op.kind, `lightup: executeMove op at (${op.x},${op.y})`);
    }
  }
  if (move.solve) next.cheated = true;
  if (gridCorrect(next)) next.completed = true;
  return next;
}

function solve(orig: LightupState, curr: LightupState): SolveResult<LightupMove> {
  // We don't care about uniqueness here; if the player typed an ambiguous
  // desc, any solution will do.
  const sflags = F_SOLVE_ALLOWRECURSE | F_SOLVE_DISCOUNTSETS;

  // Try solving from where we are now (for a non-unique puzzle this may
  // produce a different answer than from scratch)...
  let solved = cloneState(curr);
  if (dosolve(solved, sflags) <= 0) {
    // ... then from the clean puzzle.
    solved = cloneState(orig);
    if (dosolve(solved, sflags) <= 0) {
      return { ok: false, error: "Unable to find a solution to this puzzle." };
    }
  }

  const ops: LightupOp[] = [];
  for (let x = 0; x < curr.w; x++) {
    for (let y = 0; y < curr.h; y++) {
      const i = idx(x, y, curr.w);
      if ((curr.flags[i] & F_LIGHT) !== (solved.flags[i] & F_LIGHT)) {
        ops.push({ kind: "light", x, y });
      } else if ((curr.flags[i] & F_IMPOSSIBLE) !== (solved.flags[i] & F_IMPOSSIBLE)) {
        ops.push({ kind: "impossible", x, y });
      }
    }
  }
  return { ok: true, move: { solve: true, ops } };
}

function findMistakes(state: LightupState): readonly LightupMistake[] {
  const solution = solveUnique(state);
  if (!solution) return [];
  const out: LightupMistake[] = [];
  for (let y = 0; y < state.h; y++) {
    for (let x = 0; x < state.w; x++) {
      const i = idx(x, y, state.w);
      if (state.flags[i] & F_BLACK) continue;
      if (state.flags[i] & F_LIGHT && !(solution.flags[i] & F_LIGHT)) {
        out.push({ x, y, kind: "light" });
      } else if (state.flags[i] & F_IMPOSSIBLE && solution.flags[i] & F_LIGHT) {
        // A mark asserts "no bulb here"; it is provably wrong only when
        // the solution puts a bulb on that very square.
        out.push({ x, y, kind: "mark" });
      }
    }
  }
  return out;
}

// --- hint --------------------------------------------------------------------
//
// The hint plan is the deductive solver's own script, run from the
// player's position (bulbs and impossible-marks honored as constraints)
// with the recorder on. One firing = one (possibly multi-cell) step, and
// an elimination step's move is the game's own impossible-mark, so
// following the plan leaves on the board exactly the trail the solver
// reasons over — a later "every other way to light this square is crossed
// out" narration is then *visible*.

/** Highlight payload for a Light Up hint step. `targets` get the blue
 * `COL_HINT` fill (highlight only — the narration says which mark to
 * place); `area` is the deduction's evidence, shaded light-blue when the
 * square is dark and ringed green when it is lit (the fill would hide the
 * "already lit" premise); `dark` is the unlit square the deduction is
 * about (violet ring); `clue` is the driving clue, whose digit recolors. */
export interface LightupHint {
  kind: "light" | "impossible";
  targets: HintCell[];
  area: HintCell[];
  dark?: HintCell;
  clue?: HintCell;
}

const sameCell = (a: HintCell, b: HintCell): boolean => a.x === b.x && a.y === b.y;

function buildHighlights(f: LightupFiring): LightupHint {
  const notTarget = (c: HintCell): boolean => !f.cells.some((t) => sameCell(t, c));
  switch (f.reason.kind) {
    case "forcedLight": {
      const dark = f.reason.dark;
      const isTargetItself = f.cells.some((t) => sameCell(t, dark));
      return {
        kind: f.kind,
        targets: f.cells,
        area: f.reason.corridor.filter((c) => notTarget(c) && !sameCell(c, dark)),
        dark: isTargetItself ? undefined : dark,
      };
    }
    case "clueSatisfied":
      // The placed bulbs are the premise; they are lit, so the renderer
      // rings them. The clue itself is cued by its recolored digit.
      return {
        kind: f.kind,
        targets: f.cells,
        area: f.reason.bulbs,
        clue: f.reason.clue,
      };
    case "clueSaturated":
      // The premise is just the clue's count against its free neighbors,
      // and the free neighbors are all targets — no separate evidence.
      return { kind: f.kind, targets: f.cells, area: [], clue: f.reason.clue };
    case "discountUnlit": {
      const dark = f.reason.dark;
      return {
        kind: f.kind,
        targets: f.cells,
        area: f.reason.set.filter((c) => notTarget(c) && !sameCell(c, dark)),
        dark,
      };
    }
    case "discountClue":
      return {
        kind: f.kind,
        targets: f.cells,
        area: f.reason.set.filter(notTarget),
        clue: f.reason.clue,
      };
  }
}

/** Narrate *why* the firing's marks are forced (§2 of the hint guide:
 * lead with the indication, conclude in the necessity voice).
 *
 * **`hl` is the frame the player is looking at**, so a branch can tell whether
 * a second mark is even on the board before deciding how much to say. Where
 * one is, "this square" is never left bare (`disambiguate-hint-deixis`).
 * Lightup is the game where the tie could *not* be positional and the
 * measurement is why: across 133 discount firings the driving clue was
 * adjacent to the target **0 times** and collinear with it **0 times**, and the
 * ringed dark square was collinear with it 0 times. What `discountSet` does
 * guarantee is the *reach* relation — the target is a square that rules out
 * every member of the set, by lighting it or by filling a clue beside it —
 * so that is what the sentence names. */
function narrate(f: LightupFiring, hl: LightupHint): string {
  const many = f.cells.length > 1;
  switch (f.reason.kind) {
    case "forcedLight": {
      const dark = f.reason.dark;
      if (f.cells.some((t) => sameCell(t, dark))) {
        // The corridor is on the board as evidence — dark members shaded,
        // already-lit members ringed — so name it rather than leaving the
        // frame's second mark unmentioned. A corridor of just this square
        // shows no second mark, and then the bare deictic is right.
        return hl.area.length === 0
          ? "This square is still dark, and every square that could light it along its row and column is crossed out or already lit. Only its own bulb can light it — so this square must hold a bulb."
          : "This square is still dark, and the other squares that could light it are marked: shaded where they are crossed out, ringed where they are already lit. None of them can hold a bulb, so only its own can light it — this square must hold a bulb.";
      }
      return "The ringed square is still dark, and every square that could light it is crossed out or already lit — except this one. So this square must hold a bulb.";
    }
    case "clueSatisfied": {
      const { n } = f.reason;
      if (n === 0) {
        return many
          ? "The highlighted clue is 0: no bulb may sit beside it. So its free neighbours must all be crossed out."
          : "The highlighted clue is 0: no bulb may sit beside it. So its free neighbour must be crossed out.";
      }
      const bulbs = n === 1 ? "its bulb (ringed)" : `all ${n} of its bulbs (ringed)`;
      return many
        ? `The highlighted clue already has ${bulbs}. No more may sit beside it — so its remaining free neighbours must all be crossed out.`
        : `The highlighted clue already has ${bulbs}. No more may sit beside it — so its remaining free neighbour must be crossed out.`;
    }
    case "clueSaturated": {
      const { need } = f.reason;
      if (need === 1) {
        return "The highlighted clue still needs 1 more bulb and has exactly 1 free neighbour left — so that neighbour must be a bulb.";
      }
      return `The highlighted clue still needs ${need} more bulbs and has exactly ${need} free neighbours left — so every one of them must be a bulb.`;
    }
    case "discountUnlit": {
      // "A bulb *here*" was the reported shape: three marks in view (blue
      // target, shaded set, violet-ringed dark square) and the vaguest of all
      // deictics for the one being acted on.
      //
      // Writing the tie found two further defects in the old sentence, both
      // from *measuring* the set rather than assuming its shape. It said the
      // premise "one of them must hold a bulb" nowhere, so its conclusion did
      // not follow from its own words; and it said "only the shaded squares"
      // can light the ringed square when **the ringed square is itself a
      // member of the set** in over half of all firings (`litCells(…, true)`
      // includes the source, and a dark square may light itself) — where it is,
      // it is ringed rather than shaded, so the sentence excluded a candidate
      // the deduction counts.
      const dark = f.reason.dark;
      const shaded = hl.area.length === 1 ? "the shaded square" : "the shaded squares";
      const holders = f.reason.set.some((c) => sameCell(c, dark))
        ? `${shaded} or the ringed square itself`
        : shaded;
      return `The ringed dark square still has to be lit, and only ${holders} could hold the bulb that lights it — so one of them must. This square reaches every one of them: a bulb here would leave each of them lit, or beside a clue already full. So this square must be crossed out.`;
    }
    case "discountClue":
      return "To give the highlighted clue its bulbs, at least one of the shaded squares must hold one. This square reaches every one of them: a bulb here would leave each of them lit, or beside a clue already full. So this square must be crossed out.";
  }
}

function buildStep(f: LightupFiring): HintStep<LightupMove, LightupHint> {
  // One value, read by both the sentence and the frame — a narration can only
  // be held to "say which mark you mean" if it is given the marks.
  const highlights = buildHighlights(f);
  return {
    move: { ops: f.cells.map((c) => ({ kind: f.kind, x: c.x, y: c.y })) },
    explanation: narrate(f, highlights),
    highlights,
  };
}

function hint(state: LightupState): HintResult<LightupMove, LightupHint> {
  if (state.completed) return { ok: false, error: ALREADY_SOLVED };
  if (findMistakes(state).length > 0) {
    return {
      ok: false,
      error: FIX_MISTAKES_FIRST,
    };
  }
  const plan = deduceHintPlan(state);
  if (plan.length === 0) {
    // Only reachable on an Unreasonable board (Easy/Tricky boards are
    // deduction-complete by generation): refuse honestly at the guess point.
    return {
      ok: false,
      error: NO_DEDUCTION_LEFT_TRIAL_AND_ERROR,
    };
  }
  return { ok: true, steps: plan.map(buildStep) };
}

/** Does the cell already carry the step's mark? (`state` is pre-move: a
 * toggle op on such a cell would *remove* the mark — off-plan.) */
function hasMark(
  state: LightupState,
  cell: { x: number; y: number },
  kind: "light" | "impossible",
): boolean {
  const flags = state.flags[idx(cell.x, cell.y, state.w)];
  return kind === "light" ? !!(flags & F_LIGHT) : !!(flags & F_IMPOSSIBLE);
}

/** A player move that places the step's mark on a subset of its cells is
 * on track (shrink the step in place); covering the last cell completes
 * it; anything else drops the plan to recompute. `state` is pre-move. */
function hintKeepTrack(
  m: LightupMove,
  step: HintStep<LightupMove, LightupHint>,
  state: LightupState,
): HintTrackVerdict {
  if (m.solve) return "off";
  const hl = step.highlights;
  if (!hl) return "off";
  const remaining = hl.targets.filter((t) => !hasMark(state, t, hl.kind));
  if (remaining.length === 0) return "off";
  for (const op of m.ops) {
    if (op.kind !== hl.kind) return "off";
    // The op must place the mark on a still-pending target; a toggle on a
    // done cell would remove it again.
    if (!remaining.some((t) => sameCell(t, op))) return "off";
  }
  const left = remaining.filter((t) => !m.ops.some((op) => sameCell(op, t)));
  if (left.length === 0) return "completed";
  step.move = { ops: left.map((c) => ({ kind: hl.kind, x: c.x, y: c.y })) };
  step.highlights = { ...hl, targets: left };
  return "onTrack";
}

/** Validate-at-display: drop targets that already carry the step's mark
 * (e.g. after undo/redo shuffles), `null` once every one does. */
function refreshHintStep(
  step: HintStep<LightupMove, LightupHint>,
  state: LightupState,
): HintStep<LightupMove, LightupHint> | null {
  const hl = step.highlights;
  if (!hl) return step;
  const left = hl.targets.filter((t) => !hasMark(state, t, hl.kind));
  if (left.length === 0) return null;
  if (left.length === hl.targets.length) return step;
  return {
    ...step,
    move: { ops: left.map((c) => ({ kind: hl.kind, x: c.x, y: c.y })) },
    highlights: { ...hl, targets: left },
  };
}

function flashLength(
  from: LightupState,
  to: LightupState,
  _dir: number,
  _ui: LightupUi,
): number {
  return winFlash(from, to, FLASH_TIME);
}

/** Light Up's difficulty contract (`engine/difficulty.ts`). `puzzleIsGood` is
 * already exactly this predicate — "is this board solvable by a player working
 * at `difficulty`?" — spelled privately for the generator; the cap reaches the
 * solver as a *flag set* (`flagsFromDifficulty`) rather than as a number, which
 * is the shape no cross-game caller could have guessed. */
const difficulty: DifficultyContract<LightupParams> = {
  tiers: ["Easy", "Tricky", "Unreasonable"],
  tierOf: (p) => p.difficulty,
  withTier: (p, tier) => ({ ...p, difficulty: tier }),
  solveAtCap: (p, desc, cap) =>
    puzzleIsGood(newState(p, desc), cap) ? "solved" : "unsolved",
};

export const lightupGame: Game<
  LightupParams,
  LightupState,
  LightupMove,
  LightupUi,
  LightupDrawState,
  LightupMistake
> = {
  id: "lightup",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,

  describeParams: (p): ConfigValues => ({
    width: String(p.w),
    height: String(p.h),
    "percentage-of-black-squares": String(p.blackpc),
    symmetry: p.symm,
    difficulty: p.difficulty,
  }),
  paramConfig: [
    ...dimensionParamConfig<LightupParams>(),
    {
      kw: "percentage-of-black-squares",
      name: "%age of black squares",
      type: "string",
      get: (p) => String(p.blackpc),
      set: (p, v) => {
        p.blackpc = parseConfigInt(v);
      },
    },
    {
      kw: "symmetry",
      name: "Symmetry",
      type: "choices",
      choices: SYMMETRY_CHOICES,
      get: (p) => p.symm,
      set: (p, v) => {
        p.symm = v;
      },
    },
    {
      kw: "difficulty",
      name: "Difficulty",
      type: "choices",
      choices: ["Easy", "Tricky", "Unreasonable"],
      get: (p) => p.difficulty,
      set: (p, v) => {
        p.difficulty = v;
      },
    },
  ],

  newDesc: (p, rng) => newLightupDesc(p, rng),
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status,

  solve,
  findMistakes,
  difficulty,

  hint,
  hintKeepTrack,
  refreshHintStep,

  textFormat,

  prefs: [
    {
      kw: "show-lit-blobs",
      name: "Draw non-light marks even when lit",
      type: "boolean",
      get: (ui) => ui.drawBlobsWhenLit,
      set: (ui, v) => {
        ui.drawBlobsWhenLit = v;
      },
    },
  ],

  colors: (defaultBackground: Color): Color[] => colors(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: LightupParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(lightupGame);
