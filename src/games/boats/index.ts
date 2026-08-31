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
 * right shape — end cap, centre or single — as soon as the neighbours decide it.
 *
 * Layout: [`state.ts`](./state.ts) (params, cell model, codecs, moves/ui),
 * [`validate.ts`](./validate.ts) (the shared status passes),
 * [`solver.ts`](./solver.ts) (the four deduction tiers + `findMistakes`),
 * [`generator.ts`](./generator.ts) (solver-gated generation + `validateParams`),
 * [`render.ts`](./render.ts).
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
import type {
  Colour,
  ConfigValues,
  GameStatus,
  Point,
  Size,
} from "../../engine/types.ts";
import { newBoatsDesc, validateParams } from "./generator.ts";
import {
  type BoatsBreach,
  type BoatsFiring,
  type BoatsLine,
  type BoatsSquare,
  deduceBoatsPlan,
} from "./hint-solver.ts";
import {
  type BoatsDrawState,
  colours,
  computeSize,
  FLASH_TIME,
  fromCoord,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import {
  type BoatsMistake,
  findBoatsMistakes,
  solveBoats,
  solveToGrid,
} from "./solver.ts";
import {
  type BoatsBoard,
  type BoatsFill,
  type BoatsFillFrom,
  type BoatsMove,
  type BoatsParams,
  type BoatsState,
  type BoatsUi,
  cloneState,
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
  SHIP_BOTTOM,
  SHIP_LEFT,
  SHIP_SINGLE,
  SHIP_TOP,
  SHIP_VAGUE,
  STATUS_COMPLETE,
  textFormat,
  validateDesc,
  WATER,
} from "./state.ts";
import { adjustShips, validateState } from "./validate.ts";

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

  if (isMouseDown(button)) {
    if (gx >= 0 && gy >= 0 && gx < w && gy < h) {
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
  const { w } = state.params;
  const next = cloneState(state);

  if (move.kind === "fill") {
    // Bounds and both fill values are loop-invariant: read them once rather
    // than re-reading the move on every cell of the rectangle.
    const { x0, x1, y0, y1, from, to } = move;
    const fill = to === "B" ? SHIP_VAGUE : to === "W" ? WATER : EMPTY;
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const i = y * w + x;
        if (state.gridClues[i] !== EMPTY) continue; // a given square is fixed
        if (from !== "*" && fillOf(next.grid[i]) !== from) continue;
        next.grid[i] = fill;
      }
    }
  } else if (move.kind === "solve") {
    if (move.grid.length !== w * state.params.h)
      throw new Error("boats: solve move has the wrong grid size");
    next.grid.set(move.grid);
  } else {
    return assertNever(move, "boats: executeMove");
  }

  // Resolve every segment's shape from its neighbours, then see whether that
  // finished the puzzle.
  const board = {
    w,
    h: state.params.h,
    fleet: state.params.fleet,
    fleetData: state.params.fleetData,
    gridClues: next.gridClues,
    borderClues: next.borderClues,
    grid: next.grid,
  };
  adjustShips(board);
  const completed = validateState(board) === STATUS_COMPLETE;

  return {
    ...next,
    completed,
    // A solve that did not actually finish the grid is not cheating.
    cheated: move.kind === "solve" ? completed : next.cheated,
  };
}

function solve(orig: BoatsState): SolveResult<BoatsMove> {
  const result = solveToGrid(orig.params, orig.gridClues, orig.borderClues);
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
 * mark for a segment, a water mark for water), because a single colour standing
 * for two different actions reads as one action (docs/games/hints.md § "Echo the move's shape in the hint colour").
 * `evidence` is the area the deduction reasons over, shaded `COL_HINT_CELL`.
 */
export interface BoatsHint {
  targets: BoatsSquare[];
  evidence: { x: number; y: number }[];
}

const plural = (n: number): string => (n === 1 ? "" : "s");

/** A line as the player reads it: 1-based, counting from the top / the left. */
function lineName(line: BoatsLine): string {
  return `${line.horizontal ? "Row" : "Column"} ${line.index + 1}`;
}

/**
 * A hidden occupancy number the deduction recovered is not a number the player
 * can see, so a narration citing it says where it came from first (§2.8: name a
 * board element by what the player can see or count). Only reachable with
 * "Remove numbers" on.
 */
function lineIntro(line: BoatsLine): string {
  return line.deduced
    ? `${lineName(line)}'s hidden number can only be ${line.clue}. `
    : "";
}

/** The consequence clause of a refutation — the rule the rejected trial broke,
 * read off the validator's own rejection (docs/games/hints.md § "Read the reason off the validator"). */
function breachClause(breach: BoatsBreach): string {
  switch (breach.kind) {
    case "collision":
      return "two boats would end up touching corner to corner";
    case "count":
      return `${lineName(breach.line).toLowerCase()} could no longer reach its ${breach.line.clue}`;
    case "fleet":
      return "it would complete a boat the fleet has no room for";
    case "fleetTotal":
      return breach.tooMany
        ? "there would be more boat squares than the whole fleet has"
        : "too little open water would be left to fit the rest of the fleet";
    case "clue":
      return "a given segment's own shape would be contradicted";
    case "unfinishable":
      return "the rest of the fleet could no longer be placed legally";
  }
}

/**
 * Narrate *why* the firing is forced: indication → reasoning → conclusion in
 * the necessity voice (docs/games/hints.md § "Writing the narration"). The never-touch water a placement
 * drags along is deliberately **not** narrated — it is a rule of the game, shown
 * by the highlight rather than restated every step (§2.9, owner decision
 * 2026-07-28).
 */
function narrate(f: BoatsFiring): string {
  const t = f.technique;
  const ships = f.squares.filter((s) => s.ship).length;
  const waters = f.squares.length - ships;

  switch (t.kind) {
    case "givenClue": {
      const side =
        t.shape === SHIP_TOP
          ? { on: "top", into: "below it", behind: "above it" }
          : t.shape === SHIP_BOTTOM
            ? { on: "bottom", into: "above it", behind: "below it" }
            : t.shape === SHIP_LEFT
              ? { on: "left", into: "to its right", behind: "to its left" }
              : { on: "right", into: "to its left", behind: "to its right" };
      if (t.shape === SHIP_SINGLE)
        return "This given segment is a whole one-square boat, so all four squares beside it must be water.";
      if (ships === 0)
        return `This segment is a boat's ${side.on} end, so nothing can sit ${side.behind} — that square must be water.`;
      if (waters === 0)
        return `This segment is a boat's ${side.on} end, so its boat must continue into the square ${side.into}.`;
      return `This segment is a boat's ${side.on} end, so its boat must continue ${side.into} — and the square ${side.behind} must be water.`;
    }

    case "neverTouch":
      return `Boats never touch, not even at a corner — so the square${plural(waters)} diagonally beside this segment must be water.`;

    case "lineSatisfied":
      // Read at both extremes (§2.7): "shows the 0 ships its number allows" is
      // nonsense, and a 0 line is the common case worth its own sentence.
      return t.line.clue === 0
        ? `${lineIntro(t.line)}${lineName(t.line)}'s number is 0, so every square in it must be water.`
        : `${lineIntro(t.line)}${lineName(t.line)} already shows the ${t.line.clue} ship${plural(t.line.clue)} its number allows, so every remaining square in it must be water.`;

    case "lineForced":
      return ships === 1
        ? `${lineIntro(t.line)}${lineName(t.line)} still needs one more ship and has just one free square left, so that square must hold a boat segment.`
        : `${lineIntro(t.line)}${lineName(t.line)} still needs ${ships} more ships and has only ${ships} free squares left, so every one of them must hold a boat segment.`;

    case "allWaterPlaced":
      return "Every square of water the puzzle has room for is already marked, so every square still free must hold a boat segment.";

    case "centreForced":
      return t.vertical
        ? "This middle segment has water beside it, so its boat can't lie across — it must run up and down through here."
        : "This middle segment has water above or below it, so its boat must lie across — through the squares either side.";

    case "isolated":
      return "Every 1-boat is already placed, and this square is walled in by water on all four sides — so it must be water.";

    case "mustExtend":
      return "With every 1-boat already placed, this segment can't stand alone — and water blocks three sides, so its boat must continue here.";

    case "centreCount": {
      const room = t.line.clue;
      const lie = t.vertical ? "lying across" : "standing up through";
      return `${lineIntro(t.line)}${lineName(t.line)} has ${room === 0 ? "no room for another ship" : "room for only one more ship"}, but a boat ${lie} this middle segment needs two — so it can't go that way.`;
    }

    case "growTooLong":
      return t.largest === 0
        ? "Every boat in the fleet has been found, so any square still free must be water."
        : `Filling this square would make a boat of ${t.joined}, and the largest one still missing is ${t.largest} — so it must be water.`;

    case "mustGrow":
      return `Every ${t.length}-boat is already placed, so this unfinished boat can't stop at ${t.length} — it must continue into this square.`;

    case "runTooShort":
      return `Filling this run would make a boat of ${t.length}, but every ${t.length}-boat is already placed — so the free square must be water.`;

    case "onlyRunsLeft":
      return t.runs === 1
        ? `Only one run can still hold the ${t.size}-boat, so it must go there — and these squares are covered wherever it sits.`
        : `Only ${t.runs} runs can still hold the ${t.runs} remaining ${t.size}-boats, so every one is used — these squares are covered either way.`;

    case "sharedDiagonal": {
      const side = t.line.horizontal ? "above and below" : "either side of";
      return `${lineIntro(t.line)}${lineName(t.line)} can take only ${t.room} more water square${plural(t.room)}, so one of these must be a boat segment — either way, the squares ${side} the middle one must be water.`;
    }

    case "refuted":
      return t.trialShip
        ? `If this square held a boat segment, ${breachClause(t.breach)} — so it must be water.`
        : `If this square were water, ${breachClause(t.breach)} — so it must hold a boat segment.`;
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
 * (docs/games/hints.md § "Group one firing into one step"). The narration rides on the opening leg; the rest carry
 * the same highlight so the picture never shrinks mid-journey.
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
  if (state.completed) return { ok: false, error: "This board is already solved." };

  // A re-solve, so this also catches the placement that breaks no rule *yet*
  // but appears in no solution — deducing onward from a doomed board would
  // produce confident nonsense (docs/games/hints.md § "Refusal couples to the mistake overlay").
  if (findBoatsMistakes(state).length > 0)
    return {
      ok: false,
      error:
        "Fix the highlighted mistakes first — a hint can't deduce from a wrong board.",
    };

  const plan = deduceBoatsPlan(state);
  const steps = plan.firings.flatMap((f) => stepsFor(f, state.params.w));
  if (steps.length === 0)
    return { ok: false, error: "No next move can be deduced from this position." };
  return { ok: true, steps };
}

/**
 * A move completes the step when every square **this leg** asks for ends up as
 * asked.
 *
 * The judgement is per *leg*, not per journey, and that distinction is
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
 * does not have: measured across the twelve presets, 13–17 of every 20 Easy
 * boards are *stuck at the maximum cap* while solving fine at Easy. The
 * workaround every consumer applies is `solveAtAnyTier` — ask each cap in turn
 * and take the first success — and declaring `nonMonotone` here is what points
 * the cross-game guard at that property instead of at monotonicity. See the
 * `boats` spec and `solveAtAnyTier`'s own header for the full measurement.
 *
 * `solveBoats` reports `{ kind: "solved" | "stuck" | "invalid" }`; a fresh board
 * is built from the clues alone, exactly as `solveToGrid` does, so the player's
 * own marks never leak into the verdict.
 */
const difficulty: DifficultyContract<BoatsParams> = {
  tiers: DIFF_NAMES,
  nonMonotone: true,
  tierOf: (p) => p.diff,
  withTier: (p, tier) => ({ ...p, diff: tier }),
  solveAtCap: (p, desc, cap) => {
    const s = newState(p, desc);
    const b: BoatsBoard = {
      w: p.w,
      h: p.h,
      fleet: p.fleet,
      fleetData: p.fleetData,
      gridClues: s.gridClues,
      borderClues: Int32Array.from(s.borderClues),
      grid: new Int8Array(p.w * p.h),
    };
    const result = solveBoats(b, cap);
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
  // Param-dependent: the text grid gives each row one character per column and
  // one for its number, which only works up to 10×10 (upstream
  // `game_can_format_as_text_now`). `textFormat` returns undefined past that.
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

  newDesc: (p, rng) => newBoatsDesc(p, rng),
  validateDesc,
  newState,
  newUi: () => newUi(),

  interpretMove,
  executeMove,
  status,

  solve,
  findMistakes: findBoatsMistakes,
  difficulty,
  hint,
  hintKeepTrack,
  textFormat,

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: BoatsParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(boatsGame);
