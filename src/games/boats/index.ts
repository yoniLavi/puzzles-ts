/**
 * Boats — native TS port of `unreleased/boats.c` (Lennard Sprong, 2012).
 *
 * *Battleships*: locate a known fleet in the grid. The numbers on the right and
 * bottom count the occupied cells of each row and column, a few boat segments
 * are given with their orientation, and no two boats touch — not even
 * diagonally. A boat is crossed off the list at the bottom once it is completely
 * surrounded by water.
 *
 * **Input is a line-fill drag.** A left-click cycles a square empty → boat →
 * water → empty; a right-click toggles water; and a press-and-drag fills a run
 * along whichever axis the pointer moved further, previewing as it goes and
 * committing on release. A keyboard cursor with Enter (boat) and Space (water)
 * does the same one square at a time, and Ctrl/Shift with an arrow fills a line
 * as the cursor moves.
 *
 * Unresolved segments are the interesting part of the model: the player only
 * ever says "there is *something* here", and `adjustShips` turns that into the
 * right shape — end cap, center or single — as soon as the neighbors decide it.
 *
 * Layout: [`state.ts`](./state.ts) (params, cell model, codecs, moves/ui),
 * [`validate.ts`](./validate.ts) (the shared status passes),
 * [`solver.ts`](./solver.ts) (the four deduction tiers + `findMistakes`),
 * [`generator.ts`](./generator.ts) (solver-gated generation + `validateParams`),
 * [`hint-solver.ts`](./hint-solver.ts) and [`hint-text.ts`](./hint-text.ts)
 * (the explained hint), [`render.ts`](./render.ts).
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
import { dimensionParamConfig, parseConfigInt } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  isEraseKey,
  isMouseDown,
  isMouseDrag,
  isMouseRelease,
  LEFT_BUTTON,
  MIDDLE_BUTTON,
  MOD_CTRL,
  MOD_SHFT,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { ConfigValues, GameStatus, Point } from "../../engine/types.ts";
import { newBoatsDesc, validateParams } from "./generator.ts";
import { type BoatsFiring, type BoatsSquare, deduceBoatsPlan } from "./hint-solver.ts";
import { say } from "./hint-text.ts";
import {
  type BoatsDrawState,
  colors,
  computeSize,
  FLASH_TIME,
  fromCoord,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import { type BoatsMistake, findMistakes, solveBoats, solveToGrid } from "./solver.ts";
import {
  type BoatsFill,
  type BoatsFillFrom,
  type BoatsMove,
  type BoatsParams,
  type BoatsState,
  type BoatsUi,
  boardOf,
  DIFF_NAMES,
  decodeFleet,
  decodeParams,
  defaultFleet,
  defaultParams,
  EMPTY,
  encodeFleet,
  encodeParams,
  fillChangesAnything,
  fillOf,
  newState,
  newUi,
  PRESETS,
  presetParams,
  presetTitle,
  SHIP_VAGUE,
  STATUS_COMPLETE,
  textFormat,
  validateDesc,
  WATER,
} from "./state.ts";
import { adjustShips, validateFullState } from "./validate.ts";

function presets(): PresetMenu<BoatsParams> {
  return {
    title: "Boats",
    submenu: PRESETS.map((_, i) => {
      const p = presetParams(i);
      return { title: presetTitle(p), params: p };
    }),
  };
}

// --- input -----------------------------------------------------------------

/** Left-click cycles empty → boat → water → empty. */
function leftCycle(from: BoatsFill): BoatsFill {
  return from === "B" ? "W" : from === "-" ? "B" : "-";
}

function interpretMove(
  state: BoatsState,
  ui: BoatsUi,
  ds: BoatsDrawState,
  point: Point,
  rawButton: number,
): BoatsMove | null | UiUpdate {
  const { w, h } = state.params;
  const ts = ds.tilesize;
  const button = stripModifiers(rawButton);

  let gx = fromCoord(point.x, ts);
  let gy = fromCoord(point.y, ts);
  // Players usually want to fill a whole line, so the click target on the far
  // edges reaches into the number row/column (upstream does the same).
  if (gx === w) gx = w - 1;
  if (gy === h) gy = h - 1;

  if (isMouseDown(button) && gx >= 0 && gy >= 0 && gx < w && gy < h) {
    let from: BoatsFillFrom = fillOf(state.grid[gy * w + gx]);
    let to: BoatsFill = "-";

    if (button === LEFT_BUTTON) {
      to = leftCycle(from);
      // Clearing to water applies to the whole dragged line regardless of
      // what each square currently holds.
      if (to === "W") from = "*";
    }
    if (button === RIGHT_BUTTON) to = from === "-" ? "W" : "-";
    if (button === MIDDLE_BUTTON) from = "*";

    ui.dragFrom = from;
    ui.dragTo = to;
    ui.dragOk = true;
    ui.dsx = ui.dex = gx;
    ui.dsy = ui.dey = gy;
    ui.cursor.visible = false;
    return UI_UPDATE;
  }

  if ((isMouseDrag(button) || isMouseRelease(button)) && ui.dragTo !== "") {
    if (gx < 0 || gy < 0 || gx >= w || gy >= h) {
      ui.dragOk = false;
    } else {
      // A drag is limited to one row or column: whichever coordinate has moved
      // less snaps back to the drag's start.
      if (Math.abs(gx - ui.dsx) < Math.abs(gy - ui.dsy)) gx = ui.dsx;
      else gy = ui.dsy;

      ui.dex = gx;
      ui.dey = gy;
      ui.dragOk = true;
    }

    if (isMouseRelease(button) && ui.dragOk) {
      const from = ui.dragFrom as BoatsFillFrom;
      const to = ui.dragTo as BoatsFill;
      const x0 = Math.min(ui.dsx, ui.dex);
      const x1 = Math.max(ui.dsx, ui.dex);
      const y0 = Math.min(ui.dsy, ui.dey);
      const y1 = Math.max(ui.dsy, ui.dey);
      ui.dragOk = false;

      if (fillChangesAnything(state, x0, y0, x1, y1, from, to))
        return { kind: "fill", x0, y0, x1, y1, from, to };
    }
    return UI_UPDATE;
  }

  if (isCursorMove(button)) {
    const fromX = ui.cursor.x;
    const fromY = ui.cursor.y;
    const moved = gridCursorMove(button, ui.cursor.x, ui.cursor.y, w, h);
    if (moved) {
      ui.cursor.x = moved.x;
      ui.cursor.y = moved.y;
    }
    ui.cursor.visible = true;

    // Hold Ctrl (boats), Shift (water) or both (clear) to fill as you move.
    if (rawButton & (MOD_CTRL | MOD_SHFT)) {
      const to: BoatsFill =
        rawButton & MOD_CTRL ? (rawButton & MOD_SHFT ? "-" : "B") : "W";
      const from: BoatsFillFrom = to === "-" ? "*" : "-";
      const x0 = Math.min(fromX, ui.cursor.x);
      const x1 = Math.max(fromX, ui.cursor.x);
      const y0 = Math.min(fromY, ui.cursor.y);
      const y1 = Math.max(fromY, ui.cursor.y);

      if (fillChangesAnything(state, x0, y0, x1, y1, from, to))
        return { kind: "fill", x0, y0, x1, y1, from, to };
    }

    return UI_UPDATE;
  }

  if (
    ui.cursor.visible &&
    (button === CURSOR_SELECT || button === CURSOR_SELECT2 || isEraseKey(button))
  ) {
    const x = ui.cursor.x;
    const y = ui.cursor.y;
    const from = fillOf(state.grid[y * w + x]);
    let to: BoatsFill = "-";
    if (button === CURSOR_SELECT && from === "-") to = "B";
    if (button === CURSOR_SELECT2 && from === "-") to = "W";

    if (fillChangesAnything(state, x, y, x, y, from, to))
      return { kind: "fill", x0: x, y0: y, x1: x, y1: y, from, to };
  }

  return null;
}

// --- moves -----------------------------------------------------------------

function executeMove(state: BoatsState, move: BoatsMove): BoatsState {
  const b = boardOf(state);
  const { w, grid } = b;

  if (move.kind === "fill") {
    const { x0, x1, y0, y1, from, to } = move;
    const fill = to === "B" ? SHIP_VAGUE : to === "W" ? WATER : EMPTY;
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const i = y * w + x;
        if (state.gridClues[i] !== EMPTY) continue; // a given square is fixed
        if (from !== "*" && fillOf(grid[i]) !== from) continue;
        grid[i] = fill;
      }
    }
  } else if (move.kind === "solve") {
    if (move.grid.length !== grid.length)
      throw new Error("boats: solve move has the wrong grid size");
    grid.set(move.grid);
  } else {
    return assertNever(move, "boats: executeMove");
  }

  // Resolve every segment's shape from its neighbors, then see whether that
  // finished the puzzle.
  adjustShips(b);
  const completed = validateFullState(b) === STATUS_COMPLETE;

  return {
    ...state,
    grid,
    completed,
    // A solve that did not actually finish the grid is not cheating.
    cheated: move.kind === "solve" ? completed : state.cheated,
  };
}

function solve(orig: BoatsState): SolveResult<BoatsMove> {
  const result = solveToGrid(orig);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, move: { kind: "solve", grid: Array.from(result.grid) } };
}

function status(s: BoatsState): GameStatus {
  return s.completed ? "solved" : "ongoing";
}

// --- hint (a second projection of the deduction engine) ---------------------

/**
 * What a Boats hint step marks on the board. `targets` are the squares to
 * decide — drawn in `COL_HINT` in the shape of the action each one is (a boat
 * mark for a segment, a water mark for water), because a single color standing
 * for two different actions reads as one action (docs/games/hints.md § "Echo
 * the move's shape in the hint color"). `evidence` is the area the deduction
 * reasons over, shaded `COL_HINT_CELL`.
 */
export interface BoatsHint {
  targets: BoatsSquare[];
  evidence: Point[];
}

/** Which sentence a firing speaks, and with what values: the counts of boat
 * and water squares it decides. The words are [`hint-text.ts`](./hint-text.ts)'s. */
function narrate(f: BoatsFiring): string {
  const t = f.technique;
  const ships = f.squares.filter((s) => s.ship).length;
  const waters = f.squares.length - ships;

  switch (t.kind) {
    case "givenClue":
      return say.givenClue(t, ships, waters);
    case "neverTouch":
      return say.neverTouch(waters);
    case "lineSatisfied":
      return say.lineSatisfied(t);
    case "lineForced":
      return say.lineForced(t, ships);
    case "allWaterPlaced":
      return say.allWaterPlaced;
    case "centerForced":
      return say.centerForced(t);
    case "isolated":
      return say.isolated;
    case "mustExtend":
      return say.mustExtend;
    case "centerCount":
      return say.centerCount(t);
    case "growTooLong":
      return say.growTooLong(t);
    case "mustGrow":
      return say.mustGrow(t);
    case "runTooShort":
      return say.runTooShort(t);
    case "onlyRunsLeft":
      return say.onlyRunsLeft(t);
    case "sharedDiagonal":
      return say.sharedDiagonal(t);
    case "refuted":
      return say.refuted(t);
  }
}

/**
 * The moves one firing asks for, in reading order with boats before water.
 *
 * A `fill` move is a rectangle with `from: "-"`, so it sets every *still-empty*
 * square in its span — which makes a whole-line deduction one move rather than
 * eight. The span is therefore only widened when every square in it is either a
 * target or already decided **on the board as this firing fired**; anything else
 * would quietly decide a square the step never claimed.
 */
function legMoves(f: BoatsFiring, w: number, squares: BoatsSquare[]): BoatsMove[] {
  const out: BoatsMove[] = [];
  const fill = (x0: number, y0: number, x1: number, y1: number, ship: boolean) =>
    ({ kind: "fill", x0, y0, x1, y1, from: "-", to: ship ? "B" : "W" }) as BoatsMove;

  for (const ship of [true, false]) {
    const group = squares.filter((s) => s.ship === ship);
    if (group.length === 0) continue;

    const x0 = Math.min(...group.map((s) => s.x));
    const x1 = Math.max(...group.map((s) => s.x));
    const y0 = Math.min(...group.map((s) => s.y));
    const y1 = Math.max(...group.map((s) => s.y));

    let spanIsOurs = x0 === x1 || y0 === y1;
    for (let x = x0; spanIsOurs && x <= x1; x++)
      for (let y = y0; spanIsOurs && y <= y1; y++) {
        if (f.grid[y * w + x] !== EMPTY) continue; // untouched by a `from: "-"` fill
        if (!group.some((s) => s.x === x && s.y === y)) spanIsOurs = false;
      }

    if (spanIsOurs) out.push(fill(x0, y0, x1, y1, ship));
    else for (const s of group) out.push(fill(s.x, s.y, s.x, s.y, ship));
  }
  return out;
}

/**
 * One firing is **one journey**: a deduction that forces several squares is a
 * single hint whose continuation legs are flagged `continuesPrevious`, so the
 * midend keeps it displayed across the legs and auto-play walks them as one
 * (docs/games/hints.md § "Group one firing into one step"). The narration
 * rides on the opening leg; the rest carry the same highlight so the picture
 * never shrinks mid-journey.
 */
function stepsFor(f: BoatsFiring, w: number): HintStep<BoatsMove, BoatsHint>[] {
  // The never-touch water a placement drags along is part of *this* step — it
  // is the rule doing its work, not a further deduction — so it is highlighted
  // and moved with the firing, and never narrated separately.
  const targets = [...f.squares, ...f.consequences];
  const highlights: BoatsHint = { targets, evidence: f.evidence };
  const explanation = narrate(f);

  return legMoves(f, w, targets).map((move, i) => ({
    move,
    explanation,
    highlights,
    continuesPrevious: i > 0,
  }));
}

function hint(state: BoatsState): HintResult<BoatsMove, BoatsHint> {
  // `findMistakes` is a re-solve, so this also catches the placement that breaks
  // no rule *yet* but appears in no solution — deducing onward from a doomed
  // board would produce confident nonsense (docs/games/hints.md § "Refusal
  // couples to the mistake overlay").
  const refusal = commonHintRefusal(state.completed, findMistakes(state).length);
  if (refusal) return refusal;

  const plan = deduceBoatsPlan(state);
  const steps = plan.firings.flatMap((f) => stepsFor(f, state.params.w));
  if (steps.length === 0) return { ok: false, error: DEDUCTION_EXHAUSTED };
  return { ok: true, steps };
}

/**
 * A move completes the step when every square **this leg** asks for ends up as
 * asked.
 *
 * The judgment is per *leg*, not per journey, and that distinction is
 * load-bearing: the midend advances the plan on `"completed"` and holds the
 * same step on `"onTrack"`, so a journey whose legs could only complete
 * together would stall on its first leg for ever (and `executeHint` would
 * re-apply that leg on every tick). A leg's own squares are the journey's
 * targets that fall inside its move's rectangle and match its fill, so the
 * split needs nothing stored beyond `step.move`.
 *
 * No shrink-in-place is needed on `"onTrack"` (contrast Filling): a Boats fill
 * carries `from: "-"`, so re-applying a partly-done leg touches only what is
 * still empty.
 */
function hintKeepTrack(
  m: BoatsMove,
  step: HintStep<BoatsMove, BoatsHint>,
  state: BoatsState,
): HintTrackVerdict {
  if (m.kind !== "fill" || step.move.kind !== "fill") return "off";
  const hl = step.highlights;
  if (!hl) return "off";

  const leg = step.move;
  const legTargets = hl.targets.filter(
    (t) =>
      t.x >= leg.x0 &&
      t.x <= leg.x1 &&
      t.y >= leg.y0 &&
      t.y <= leg.y1 &&
      t.ship === (leg.to === "B"),
  );
  if (legTargets.length === 0) return "off";

  const { w } = state.params;
  const after = executeMove(state, m);
  let done = 0;
  for (const t of legTargets) {
    const i = t.y * w + t.x;
    const want: BoatsFill = t.ship ? "B" : "W";
    if (fillOf(after.grid[i]) === want) {
      done++;
      continue;
    }
    // Touched one of this leg's squares and set it to something else.
    if (fillOf(after.grid[i]) !== fillOf(state.grid[i])) return "off";
  }

  if (done === legTargets.length) return "completed";
  return done > 0 ? "onTrack" : "off";
}

function flashLength(from: BoatsState, to: BoatsState): number {
  return winFlash(from, to, FLASH_TIME);
}

// --- params UI -------------------------------------------------------------

/** The fleet configuration as the Custom dialog and the type-menu summary show
 * it: blank when it is the default pyramid for this fleet size, exactly as
 * upstream's `game_configure` does. */
function fleetConfigString(p: BoatsParams): string {
  const def = defaultFleet(p.fleet);
  const same =
    def.length === p.fleetData.length && def.every((n, i) => n === p.fleetData[i]);
  return same ? "" : encodeFleet(p.fleetData, p.fleet);
}

/**
 * Boats' difficulty contract (`engine/difficulty.ts`) — **the collection's one
 * declared non-monotone solver**, and the reason the guard has a workaround
 * branch at all.
 *
 * `checkDsf`, which runs from Normal upward, counts an unfinished run of length
 * `k` as a completed size-`k` boat, so it can report a contradiction the board
 * does not have and leave most Easy boards *stuck at the maximum cap* while
 * they solve fine at Easy. The workaround every consumer applies is
 * `solveAtAnyTier` — ask each cap in turn and take the first success — and
 * declaring `nonMonotone` here is what points the cross-game guard at that
 * property instead of at monotonicity. `solveAtAnyTier`'s header has the
 * measurement.
 */
const difficulty: DifficultyContract<BoatsParams> = {
  nonMonotone: true,
  tierOf: (p) => p.diff,
  withTier: (p, tier) => ({ ...p, diff: tier }),
  solveAtCap: (p, desc, cap) => {
    const result = solveBoats(boardOf(newState(p, desc)), cap);
    return result.kind === "solved"
      ? "solved"
      : result.kind === "invalid"
        ? "impossible"
        : "unsolved";
  },
};

export const boatsGame: Game<
  BoatsParams,
  BoatsState,
  BoatsMove,
  BoatsUi,
  BoatsDrawState,
  BoatsMistake
> = {
  id: "boats",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  // Param-dependent: `textFormat` returns undefined past 10×10.
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,

  describeParams: (p): ConfigValues => ({
    width: String(p.w),
    height: String(p.h),
    "fleet-size": String(p.fleet),
    difficulty: p.diff,
    "remove-numbers": p.strip ? 1 : 0,
    "fleet-configuration": fleetConfigString(p),
  }),

  paramConfig: [
    ...dimensionParamConfig<BoatsParams>(),
    {
      kw: "fleet-size",
      name: "Fleet size",
      type: "string",
      get: (p) => String(p.fleet),
      set: (p, v) => {
        p.fleet = parseConfigInt(v);
        // Upstream `custom_params` re-reads the fleet list against the new
        // size, so growing the fleet size extends the default pyramid.
        p.fleetData = defaultFleet(p.fleet);
      },
    },
    {
      kw: "fleet-configuration",
      name: "Fleet configuration",
      type: "string",
      get: fleetConfigString,
      set: (p, v) => {
        p.fleetData = v === "" ? defaultFleet(p.fleet) : decodeFleet(v, p.fleet);
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
    {
      kw: "remove-numbers",
      name: "Remove numbers",
      type: "boolean",
      get: (p) => p.strip,
      set: (p, v) => {
        p.strip = v;
      },
    },
  ],

  newDesc: newBoatsDesc,
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve,
  findMistakes,
  difficulty,
  hint,
  hintKeepTrack,
  textFormat,

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(boatsGame);
