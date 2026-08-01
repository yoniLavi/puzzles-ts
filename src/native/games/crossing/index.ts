/**
 * Crossing — native TS port of `unreleased/crossing.c` (Lennard Sprong, 2013).
 *
 * Nansuke / Number Skeleton: fill every open cell of a walled grid with a digit
 * `1`–`9` so that each number in the list below the board appears **exactly
 * once** among the grid's horizontal and vertical runs. Solo-style input —
 * left-click or the cursor keys select a cell for a real entry, right-click or
 * Enter switches to pencil marks, a digit key enters, Backspace clears. A run
 * that is full but reads as no listed number is framed in red live; Check &
 * Save additionally flags any entry (or note) contradicting the unique answer.
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
  type CandidateMoveAdapter,
  candidateHint,
  keepCandidateHintTrack,
  refreshCandidateHintStep,
} from "../../engine/candidate-hint.ts";
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
import { dimensionParamConfig } from "../../engine/params.ts";
import { stickyPencilPref } from "../../engine/pencil-prefs.ts";
import {
  CURSOR_DOWN,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import { newCrossingDesc } from "./generator.ts";
import {
  type CrossingFiring,
  deduceCrossingPlan,
  narrateCrossing,
} from "./hint-solver.ts";
import {
  type CrossingDrawState,
  type CrossingHint,
  colours,
  computeSize,
  FLASH_TIME,
  fromCoord,
  newDrawState,
  numberAtPoint,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import { type CrossingMistake, findCrossingMistakes, solveCrossing } from "./solver.ts";
import {
  atCrossing,
  type CrossingDirection,
  type CrossingMove,
  type CrossingParams,
  type CrossingPuzzle,
  type CrossingState,
  type CrossingUi,
  cloneState,
  crossingPresets,
  decodeParams,
  defaultParams,
  encodeParams,
  newState,
  newUi,
  nextInRun,
  placedRuns,
  runForNumber,
  snapDirection,
  status,
  textFormat,
  validateBoard,
  validateDesc,
  validateParams,
} from "./state.ts";

const CLEAR = 8; // Backspace
const KEY_ZERO = 48;

function presets(): PresetMenu<CrossingParams> {
  return {
    title: "Crossing",
    submenu: crossingPresets.map((p) => ({
      title: `${p.w}x${p.h}${p.sym ? " symmetric" : ""}`,
      params: { ...p },
    })),
  };
}

/** The digit a key enters, `null` for "clear", or `undefined` for "not an entry
 * key". Upstream binds `1`–`9`, Backspace, `0` and the secondary select. */
function keyDigit(button: number): number | null | undefined {
  if (button >= 49 && button <= 57) return button - 48; // '1'-'9'
  if (button === CURSOR_SELECT2 || button === CLEAR || button === KEY_ZERO) return null;
  return undefined;
}

/** Would writing listed number `l` into run `r` change anything? It fits, so
 * every filled cell already agrees — only an empty cell makes it a real move
 * (playbook §1: suppress no-ops locally rather than comparing states). */
function placementChanges(state: CrossingState, r: number, l: number): boolean {
  void l;
  return state.puzzle.runs[r].cells.some((i) => state.grid[i] === 0);
}

function interpretMove(
  state: CrossingState,
  ui: CrossingUi,
  ds: CrossingDrawState | null,
  point: Point,
  rawButton: number,
): CrossingMove | null | UiUpdate {
  const { w, h, walls } = state.puzzle;
  const ts = ds?.tilesize || PREFERRED_TILE_SIZE;
  const button = stripModifiers(rawButton);

  const gx = fromCoord(point.x, ts);
  const gy = fromCoord(point.y, ts);
  const onBoard = gx >= 0 && gx < w && gy >= 0 && gy < h;

  // --- the clue list (fork): pick a number up, or place it straight away ----
  if (!onBoard && button === LEFT_BUTTON) {
    const l = numberAtPoint(ts, w, h, state.puzzle.numbers, point.x, point.y);
    if (l >= 0) {
      // With a cell selected, clicking a number that fits its run writes it in
      // at once — the whole point of the aid.
      if (ui.cshow && !ui.cpencil) {
        const placed = placedRuns(state.puzzle, state.grid);
        const run = runForNumber(
          state.puzzle,
          state.grid,
          placed,
          ui.cx,
          ui.cy,
          l,
          ui.dir,
        );
        if (run >= 0 && placementChanges(state, run, l)) {
          ui.heldNumber = null;
          return { kind: "place", run, number: l };
        }
      }
      // Otherwise hold it (clicking the held one again puts it back).
      ui.heldNumber = ui.heldNumber === l ? null : l;
      return UI_UPDATE;
    }
  }

  if (onBoard) {
    const i = gy * w + gx;
    const editable = !walls[i];
    const filled = state.grid[i] !== 0;

    if (button === LEFT_BUTTON && ui.heldNumber !== null && editable) {
      // A number is held: clicking a run that can take it drops it in.
      const held = ui.heldNumber;
      const placed = placedRuns(state.puzzle, state.grid);
      const run = runForNumber(state.puzzle, state.grid, placed, gx, gy, held, ui.dir);
      if (run >= 0 && placementChanges(state, run, held)) {
        ui.heldNumber = null;
        ui.cx = gx;
        ui.cy = gy;
        // Leave the cell selected so typing carries on from where the clue
        // landed; without this the next keystroke is silently ignored.
        ui.cshow = true;
        ui.ckey = false;
        return { kind: "place", run, number: held };
      }
      // Clicking anywhere it cannot go puts it back down and selects normally.
      ui.heldNumber = null;
    }

    if (button === LEFT_BUTTON) {
      // Sticky pencil mode (fork): a left-click only moves the highlight and
      // keeps the current mode; upstream (sticky off) reverts to a real entry.
      if (
        ui.cshow &&
        ui.cx === gx &&
        ui.cy === gy &&
        (ui.pencilSticky || !ui.cpencil)
      ) {
        // Crossword convention (fork): clicking the selected cell again flips
        // between filling across and down — but only where there is something
        // to flip, so everywhere else it still deselects, exactly as upstream.
        if (!ui.cpencil && editable && atCrossing(state.puzzle, gx, gy)) {
          ui.dir = ui.dir === "across" ? "down" : "across";
        } else {
          ui.cshow = false;
        }
      } else {
        ui.cx = gx;
        ui.cy = gy;
        ui.cshow = true;
        ui.dir = snapDirection(state.puzzle, gx, gy, ui.dir);
        if (!ui.pencilSticky) ui.cpencil = false;
      }
      // A wall takes nothing, and (in pencil mode) neither does a filled cell —
      // highlighting one would just suggest an edit that can't happen.
      if (!editable || (ui.cpencil && filled)) ui.cshow = false;
      ui.ckey = false;
      return UI_UPDATE;
    }

    if (button === RIGHT_BUTTON) {
      if (ui.pencilSticky) {
        // Toggle the persistent pencil mode (CapsLock-style), and only move the
        // highlight onto a cell that can actually take a mark.
        ui.cpencil = !ui.cpencil;
        if (editable && !filled) {
          ui.cx = gx;
          ui.cy = gy;
          ui.cshow = true;
          ui.dir = snapDirection(state.puzzle, gx, gy, ui.dir);
        }
      } else {
        // Upstream: select this cell for pencil marks (or deselect a repeat).
        if (!ui.cshow || !ui.cpencil || ui.cx !== gx || ui.cy !== gy) {
          ui.cx = gx;
          ui.cy = gy;
          ui.cpencil = true;
          ui.cshow = true;
        } else {
          ui.cshow = false;
        }
        if (filled || !editable) ui.cshow = false;
      }
      ui.ckey = false;
      return UI_UPDATE;
    }
  }

  if (isCursorMove(button)) {
    // The arrow used states the axis the player is working along.
    const axis: CrossingDirection =
      button === CURSOR_UP || button === CURSOR_DOWN ? "down" : "across";
    const moved = gridCursorMove(button, ui.cx, ui.cy, w, h);
    if (moved) {
      ui.cx = moved.x;
      ui.cy = moved.y;
    }
    ui.dir = snapDirection(state.puzzle, ui.cx, ui.cy, axis);
    ui.cshow = ui.ckey = true;
    return UI_UPDATE;
  }

  if (ui.cshow && button === CURSOR_SELECT) {
    ui.cpencil = !ui.cpencil;
    ui.ckey = true;
    return UI_UPDATE;
  }

  const digit = ui.cshow ? keyDigit(button) : undefined;
  if (digit !== undefined) {
    ui.heldNumber = null;
    const i = ui.cy * w + ui.cx;
    // Suppress no-op moves locally rather than comparing states (playbook §1).
    if (walls[i]) return null;
    if (ui.cpencil && state.grid[i] !== 0) return null; // notes can't touch a filled cell
    if (!ui.cpencil && state.grid[i] === (digit ?? 0)) return null;
    if (ui.cpencil && digit === null && state.marks[i] === 0) return null;

    const move: CrossingMove = ui.cpencil
      ? { kind: "pencil", x: ui.cx, y: ui.cy, digit }
      : { kind: "set", x: ui.cx, y: ui.cy, digit };

    // Auto-advance (fork, default on): entering a digit steps the selection to
    // the next cell of the run being filled, so a whole number can be typed
    // straight in. The game's own documentation asks for exactly this —
    // "inputting a complete number requires selecting each cell and typing a
    // digit one by one … could be enhanced by automatic cursor movement".
    const advanced =
      ui.autoAdvance && !ui.cpencil && digit !== null
        ? nextInRun(state.puzzle, ui.cx, ui.cy, ui.dir)
        : null;
    if (advanced) {
      ui.cx = advanced.x;
      ui.cy = advanced.y;
      // Keep the selection up so the next digit lands where it is shown; a
      // mouse-driven entry would otherwise dismiss it (upstream, below).
      ui.cshow = true;
    } else if (!ui.ckey && !ui.cpencil) {
      // Upstream: a mouse-driven ink entry hides the selection again; the
      // keyboard cursor and pencil mode both persist.
      ui.cshow = false;
    }
    return move;
  }

  return null;
}

function executeMove(state: CrossingState, move: CrossingMove): CrossingState {
  const { w, h, walls } = state.puzzle;
  const next = cloneState(state);

  if (move.kind === "solve") {
    for (let i = 0; i < w * h; i++) {
      if (!walls[i]) next.grid[i] = move.grid[i];
    }
    next.completed = validateBoard(next.puzzle, next.grid).status === "valid";
    // Solved with help: the win flash must not fire (playbook §3.6).
    next.cheated = true;
    return next;
  }

  if (move.kind === "place") {
    const run = state.puzzle.runs[move.run];
    const num = state.puzzle.numbers[move.number];
    if (!run || num === undefined || num.length !== run.cells.length)
      throw new Error("crossing: cannot place that number in that run");
    for (let k = 0; k < run.cells.length; k++)
      next.grid[run.cells[k]] = num.charCodeAt(k) - 48;
    if (validateBoard(next.puzzle, next.grid).status === "valid") next.completed = true;
    return next;
  }

  if (move.kind === "pencilStrike") {
    // Only ever removes, so replaying it is idempotent (unlike a `pencil`
    // toggle) and a partly-followed strike stays safe to re-apply.
    for (const { x, y, n } of move.marks) {
      const j = y * w + x;
      if (walls[j]) throw new Error("crossing: cannot edit a wall");
      next.marks[j] &= ~(1 << (n - 1));
    }
    return next;
  }

  const i = move.y * w + move.x;
  if (move.x < 0 || move.x >= w || move.y < 0 || move.y >= h)
    throw new Error("crossing: move out of range");
  if (walls[i]) throw new Error("crossing: cannot edit a wall");

  if (move.kind === "set") {
    next.grid[i] = move.digit ?? 0;
  } else {
    next.marks[i] = move.digit === null ? 0 : next.marks[i] ^ (1 << (move.digit - 1));
  }

  if (validateBoard(next.puzzle, next.grid).status === "valid") next.completed = true;
  return next;
}

/** Fork addition (upstream's `game_changed_state` is empty): drop a pencil
 * selection that an undo/redo/solve has just filled in, since it can no longer
 * take a mark. */
function changedState(
  ui: CrossingUi,
  _old: CrossingState | null,
  next: CrossingState,
): void {
  const w = next.puzzle.w;
  if (ui.cshow && ui.cpencil && next.grid[ui.cy * w + ui.cx] !== 0) ui.cshow = false;
}

function solve(orig: CrossingState): SolveResult<CrossingMove> {
  const result = solveCrossing(orig.puzzle);
  // Upstream fills whatever it deduced and leaves the rest blank; reporting the
  // failure is both more honest and the collection's convention.
  if (result.status !== "valid")
    return { ok: false, error: "Solver could not find a unique solution." };
  return { ok: true, move: { kind: "solve", grid: Array.from(result.grid) } };
}

// --- hint (add-crossing-hint) -----------------------------------------------

/**
 * How Crossing's `Move` union reads as the shared candidate shapes. Crossing
 * discriminates on `kind`, not `type`, and stores candidate `n` in bit `n − 1`
 * — so the shared mechanics take the dialect as a parameter rather than the
 * game renaming its moves (which would break every saved move log).
 */
const crossingCandidateMoves: CandidateMoveAdapter<CrossingMove> = {
  read: (m) => {
    if (m.kind === "set" && m.digit !== null)
      return { type: "set", x: m.x, y: m.y, n: m.digit, pencil: false };
    if (m.kind === "pencil" && m.digit !== null)
      return { type: "set", x: m.x, y: m.y, n: m.digit, pencil: true };
    if (m.kind === "pencilStrike") return { type: "pencilStrike", marks: [...m.marks] };
    return null; // `place`, `solve`, and the two "clear this" moves are off-plan
  },
  strike: (marks) => ({ kind: "pencilStrike", marks }),
  bit: (n) => 1 << (n - 1),
};

const cellAt = (puzzle: CrossingPuzzle, i: number): { x: number; y: number } => ({
  x: i % puzzle.w,
  y: Math.floor(i / puzzle.w),
});

/** The move a firing asks for, in the game's own vocabulary — a whole number
 * into a run, one digit, or a rule-out (design D3). */
function hintMove(puzzle: CrossingPuzzle, f: CrossingFiring): CrossingMove {
  switch (f.technique) {
    case "onlyNumber":
      return { kind: "place", run: f.run, number: f.number };
    case "sharedDigit":
    case "crossRuns":
      return { ...cellAt(puzzle, f.cell), kind: "set", digit: f.digit };
    case "noteStrike":
      return {
        kind: "pencilStrike",
        marks: f.digits.map((n) => ({ ...cellAt(puzzle, f.cell), n })),
      };
  }
}

/**
 * What the hint draws. The evidence for every technique is "which listed
 * numbers still fit this run", and that set lives in the **clue list**, not on
 * the board — so the premise the narration cites is only visible if the panel
 * is part of the highlight (design D2). Hence `numbers` beside the usual
 * area/targets/marks.
 */
function hintHighlights(puzzle: CrossingPuzzle, f: CrossingFiring): CrossingHint {
  const runCells = (r: number): { x: number; y: number }[] =>
    puzzle.runs[r].cells.map((i) => cellAt(puzzle, i));
  switch (f.technique) {
    case "onlyNumber":
      return {
        area: runCells(f.run),
        // Only the squares the move actually writes into; the ones already
        // filled are the premise, and stay part of the shaded area.
        targets: f.fill.map((i) => cellAt(puzzle, i)),
        marks: [],
        numbers: f.fitting,
        numberTarget: f.number,
      };
    case "sharedDigit":
      return {
        area: runCells(f.run),
        targets: [cellAt(puzzle, f.cell)],
        marks: [],
        numbers: f.fitting,
        numberTarget: null,
      };
    case "crossRuns":
      return {
        area: [...runCells(f.acrossRun), ...runCells(f.downRun)],
        targets: [cellAt(puzzle, f.cell)],
        marks: [],
        numbers: f.fitting,
        numberTarget: null,
      };
    case "noteStrike":
      return {
        area: runCells(f.run),
        targets: [cellAt(puzzle, f.cell)],
        marks: f.digits.map((n) => ({ ...cellAt(puzzle, f.cell), n })),
        numbers: f.fitting,
        numberTarget: null,
      };
  }
}

/** One firing is one step — a whole run filled by one deduction is one hint,
 * not one per square (quality-bar rule 2), which is exactly what the `place`
 * move buys. */
function buildSteps(state: CrossingState): HintStep<CrossingMove, CrossingHint>[] {
  const { puzzle } = state;
  return deduceCrossingPlan(state).firings.map((f) => ({
    move: hintMove(puzzle, f),
    explanation: narrateCrossing(puzzle, f),
    highlights: hintHighlights(puzzle, f),
  }));
}

function hint(state: CrossingState): HintResult<CrossingMove, CrossingHint> {
  return candidateHint(state, undefined, findCrossingMistakes, buildSteps);
}

/**
 * Classify a player move against the displayed step. `state` is the **pre-move**
 * board (hint-authoring §5.5a).
 *
 * The whole-run step is the one shape the shared helper cannot read, and it
 * needs care: a player who types the number in digit by digit — which
 * auto-advance makes the natural way to do it — is following the hint just as
 * much as one who clicks the clue, so each correct digit is `onTrack` until the
 * run's last empty square completes it.
 */
function hintKeepTrack(
  m: CrossingMove,
  step: HintStep<CrossingMove, CrossingHint>,
  state: CrossingState,
): HintTrackVerdict {
  const sm = step.move;
  if (sm.kind === "place") {
    if (m.kind === "place")
      return m.run === sm.run && m.number === sm.number ? "completed" : "off";
    if (m.kind !== "set" || m.digit === null) return "off";
    const run = state.puzzle.runs[sm.run];
    const num = state.puzzle.numbers[sm.number];
    const k = run.cells.indexOf(m.y * state.puzzle.w + m.x);
    if (k < 0 || m.digit !== num.charCodeAt(k) - 48) return "off";
    const empty = run.cells.filter((i) => state.grid[i] === 0).length;
    return empty <= 1 ? "completed" : "onTrack";
  }
  return keepCandidateHintTrack(
    m,
    step,
    state.marks,
    state.puzzle.w,
    crossingCandidateMoves,
  );
}

/** Validate-at-display (§7.3): a whole-run step is resolved once the run is
 * full, and shrinks its targets to the squares still to write; everything else
 * is the shared behaviour. */
function refreshHintStep(
  step: HintStep<CrossingMove, CrossingHint>,
  state: CrossingState,
): HintStep<CrossingMove, CrossingHint> | null {
  const m = step.move;
  if (m.kind === "place") {
    const cells = state.puzzle.runs[m.run].cells;
    const empty = cells.filter((i) => state.grid[i] === 0);
    if (empty.length === 0) return null;
    if (!step.highlights || empty.length === cells.length) return step;
    return {
      ...step,
      highlights: {
        ...step.highlights,
        targets: empty.map((i) => cellAt(state.puzzle, i)),
      },
    };
  }
  return refreshCandidateHintStep(
    step,
    state.grid,
    state.marks,
    state.puzzle.w,
    crossingCandidateMoves,
  );
}

function flashLength(from: CrossingState, to: CrossingState): number {
  return !from.completed && to.completed && !from.cheated && !to.cheated
    ? FLASH_TIME
    : 0;
}

export const crossingGame: Game<
  CrossingParams,
  CrossingState,
  CrossingMove,
  CrossingUi,
  CrossingDrawState,
  CrossingMistake
> = {
  id: "crossing",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  // Upstream's REQUIRE_RBUTTON: pencil mode has no other pointer affordance.
  needsRightButton: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  describeParams: (p): ConfigValues => ({
    width: String(p.w),
    height: String(p.h),
    "symmetric-walls": p.sym ? 1 : 0,
  }),
  paramConfig: [
    ...dimensionParamConfig<CrossingParams>(),
    {
      kw: "symmetric-walls",
      name: "Symmetric walls",
      type: "boolean",
      get: (p) => p.sym,
      set: (p, v) => {
        p.sym = v;
      },
    },
  ],

  newDesc: (p, rng) => newCrossingDesc(p, rng),
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status: (s): GameStatus => status(s),

  solve,
  findMistakes: findCrossingMistakes,
  hint,
  hintKeepTrack,
  refreshHintStep,
  /**
   * Selecting a square, moving the cursor or picking a clue up puts a displayed
   * hint away — **unless the player is working inside the squares the hint is
   * about** (owner-directed).
   *
   * The flag is needed at all because Crossing's hint *suppresses* the
   * selection's run wash, so the two never mean "washed square" at once: without
   * it a click did nothing visible, and there was no way out of hint mode
   * (Subsets shipped the same bug for the same reason). The exception is what
   * keeps following a hint by hand workable — clicking into a hinted run to type
   * its number in must not delete the explanation of what to type. The cursor
   * stays visible on those squares because `render.ts` switches to a dark corner
   * cue wherever the hint owns the background.
   *
   * Everything a firing is about — the run(s) it reasons over and the squares it
   * acts on — is already in `area`/`targets`, so this is exactly "am I inside
   * the highlight?".
   */
  uiUpdateClearsHint(step, _state, ui) {
    const hl = step.highlights as CrossingHint | undefined;
    if (!hl || !ui.cshow) return true; // nothing shown, or nothing selected
    const here = (cs: readonly { x: number; y: number }[]): boolean =>
      cs.some((c) => c.x === ui.cx && c.y === ui.cy);
    return !(here(hl.area) || here(hl.targets));
  },
  requestKeys: (): KeyLabel[] => digitKeys(9),
  textFormat,

  prefs: [
    {
      kw: "fit-highlight",
      name: "Colour the clue list by where each number could go from the selected cell",
      type: "boolean",
      get: (ui) => ui.fitHighlight,
      set: (ui, v) => {
        ui.fitHighlight = v;
      },
    },
    {
      kw: "highlight-runs",
      name: "Highlight the across and down numbers running through the selected cell",
      type: "boolean",
      get: (ui) => ui.highlightRuns,
      set: (ui, v) => {
        ui.highlightRuns = v;
      },
    },
    {
      kw: "auto-advance",
      name: "Entering a digit moves the selection along the number being filled",
      type: "boolean",
      get: (ui) => ui.autoAdvance,
      set: (ui, v) => {
        ui.autoAdvance = v;
      },
    },
    stickyPencilPref<CrossingUi>(),
  ],

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: CrossingParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(crossingGame);
