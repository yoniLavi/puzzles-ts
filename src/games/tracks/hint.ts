/**
 * Tracks' explained hint: the narration half of the recording projection in
 * [`solver.ts`](./solver.ts).
 *
 * The deduction end is entirely `solver.ts`'s: the same eight rungs on the
 * same `runDeductionFixpoint`, run one firing at a time with a recorder
 * standing (docs/games/hints.md § "Recording the deduction", the *threaded*
 * shape). This file turns each firing into the sentence and the picture: what
 * the player is shown and what they are taught.
 *
 * **A line is named by its clue, never by an index.** Tracks draws no row or
 * column numbers, so "column 5" is a name the player cannot check against the
 * board (docs/games/hints.md § "Name elements by what the player can see", the
 * Netslide lesson). Every narration that reasons over a line highlights that
 * line's clue digit in the margin and says "this column" / "this row", so the
 * words point at something visible.
 */

import type { HintStep } from "../../engine/game.ts";
import { deduceHintPlan } from "../../engine/hint-plan.ts";
import {
  DEDUCTION_EXHAUSTED,
  PUZZLE_NOT_REASONABLE,
} from "../../engine/hint-refusal.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import { type Axis, say } from "./hint-text.ts";
import { type TracksFiring, type TracksReason, tracksRecordingPass } from "./solver.ts";
import {
  type Board,
  checkCompletion,
  DX,
  DY,
  E_TRACK,
  FLIP,
  inGrid,
  S_NOTRACK,
  S_NOTRACK_SHIFT,
  S_TRACK,
  S_TRACK_SHIFT,
  sECount,
  stateToBoard,
  type TracksMove,
  type TracksOp,
  type TracksState,
} from "./state.ts";

/**
 * A hard cap on how far ahead the plan is computed.
 *
 * A UX bound rather than a correctness one, and Tracks needs it more than most:
 * a 15x15 board is ~600 forced decisions from empty, and a player rarely
 * follows more than a handful before going their own way, at which point the
 * plan is recomputed anyway (Spokes and Bricks bound theirs the same way:
 * `engine/hint-plan.ts`). It also keeps `hint()` cheap enough to be called
 * after every move, which the cross-game resume walk does.
 */
const PLAN_CAP = 24;

// --- highlights -----------------------------------------------------------

/** One side of one square. */
export interface TracksHintEdge {
  x: number;
  y: number;
  dir: number;
}

/**
 * What one step marks, in five roles.
 *
 * The split follows docs/games/hints.md § "The element-type color legend": the
 * squares and edges a step *decides* take the action color, the squares and
 * edges it *reasons from* take the evidence color, and the clue it counts with
 * has its own digit recolored. `targets` and `targetEdges` are separate roles
 * only because Tracks decides two different kinds of thing, not because their
 * fates differ: a firing that forces four edges forces all four the same way,
 * and they are all drawn identically (equivalent moves share a color).
 */
export interface TracksHighlights {
  /** Squares this step decides. `track` is what it decides them to be. */
  targets: { x: number; y: number; track: boolean }[];
  /** Sides this step decides. */
  targetEdges: (TracksHintEdge & { track: boolean })[];
  /** Squares the deduction reasons from. */
  area: { x: number; y: number }[];
  /** Sides the deduction reasons from. */
  areaEdges: TracksHintEdge[];
  /** Clue indices the deduction counts with (`0..w-1` columns, then rows). */
  clues: number[];
}

// --- narration ------------------------------------------------------------

/** Read a line's clue index back into orientation, length and target. */
function lineOf(b: Board, line: number) {
  const isCol = line < b.w;
  return {
    axis: (isCol ? "column" : "row") as Axis,
    /** How many squares the line holds. */
    len: isCol ? b.h : b.w,
    /** How many of them carry track. */
    target: b.numbers[line],
  };
}

/**
 * Which sentence a firing speaks, and with what values: the deduction's half of
 * the narration. The words are [`hint-text.ts`](./hint-text.ts)'s.
 *
 * Seven rungs are represented here and the eighth, `check-single`, is not: it
 * fires on no board this generator produces, so narrating it would be prose
 * nobody can ever read or check (`tracks-ladder.test.ts`'s `unreached` ledger,
 * and `tracks-hint.test.ts` asserts it stays that way).
 */
export function narrate(b: Board, reason: TracksReason): string {
  switch (reason.kind) {
    case "onlyOneSideLeft":
      return say.onlyOneSideLeft(reason.open);
    case "bothSidesLeft":
      return say.bothSidesLeft;
    case "clueFull": {
      const { axis, target } = lineOf(b, reason.line);
      return say.clueFull(axis, target);
    }
    case "clueExact": {
      const { axis, target, len } = lineOf(b, reason.line);
      return say.clueExact(axis, target, len);
    }
    case "wouldCloseLoop":
      return say.wouldCloseLoop;
    case "wouldStrandTrack":
      return say.wouldStrandTrack;
    case "wouldFinishEarly":
      return say.wouldFinishEarly(lineOf(b, reason.unmet).axis);
    case "looseEndsFill": {
      const { axis, target } = lineOf(b, reason.line);
      return say.looseEndsFill(axis, target);
    }
    case "looseEndSpans":
      return say.looseEndSpans(lineOf(b, reason.line).axis);
    case "sharedFate": {
      const { axis } = lineOf(b, reason.line);
      const { dir } = reason;
      if (reason.fills && reason.empties) return say.sharedFateBoth(axis, dir);
      if (reason.fills) return say.sharedFateFills(axis, dir);
      return say.sharedFateEmpties(axis, FLIP(dir));
    }
    case "crossingParity":
      // The track crosses a closed block's border an even number of times, so
      // an odd count so far means the last side must carry it.
      return say.crossingParity(reason.crossings, reason.crossings % 2 === 1);
  }
}

// --- highlights from a firing ---------------------------------------------

function highlightsOf(
  b: Board,
  reason: TracksReason,
  firing: TracksFiring,
): TracksHighlights {
  const { w } = b;
  const { ev } = reason;
  return {
    targets: firing.ops
      .filter((o) => o.kind === "square")
      .map((o) => ({ x: o.x, y: o.y, track: o.track })),
    targetEdges: firing.ops
      .filter((o) => o.kind === "edge")
      .map((o) => ({ x: o.x, y: o.y, dir: o.dir ?? 0, track: o.track })),
    area: ev.cells.map((i) => ({ x: i % w, y: Math.floor(i / w) })),
    areaEdges: ev.edges.map((e) => ({
      x: Math.floor(e / 16) % w,
      y: Math.floor(Math.floor(e / 16) / w),
      dir: e % 16,
    })),
    clues: ev.clues,
  };
}

// --- the plan -------------------------------------------------------------

/**
 * Does the player's board already decide this change? True when the **contrary**
 * move is one the game would refuse them: track on a side of a square they have
 * marked empty (or of the board's rim), track as a third side of a finished
 * piece, or "no track" on a square that already shows a rail. Those are
 * `uiCanFlipEdge` / `uiCanFlipSquare`'s own refusals, read as board facts so the
 * answer does not depend on the op having been applied yet.
 *
 * It reads only facts no firing's own ops can create (an edge block creates no
 * empty square and no rail, and marking a track square creates no rail), which
 * is the condition `showable` is judged under: it runs after the firing lands.
 */
export function evident(b: Board, op: TracksOp): boolean {
  if (op.kind === "square") return op.track && sECount(b, op.x, op.y, E_TRACK) > 0;
  if (op.track) return false;
  const d = op.dir ?? 0;
  const closed = (x: number, y: number): boolean =>
    !inGrid(b, x, y) ||
    (b.sflags[y * b.w + x] & S_NOTRACK) !== 0 ||
    sECount(b, x, y, E_TRACK) === 2;
  return closed(op.x, op.y) || closed(op.x + DX(d), op.y + DY(d));
}

/**
 * A step is worth showing when it has a premise to narrate and tells the player
 * something their board does not already say (docs/games/hints.md § "Show only
 * what the board does not already say").
 *
 * Both halves are needed. Without the board check, a narrated rule that lands
 * on sides the player already closed off, by marking the squares beyond them
 * empty, is shown anyway, wherever the scan order puts it; without the reason
 * check, the plan would narrate `null`. Together, the rules with no reason are
 * the ones the board shows.
 */
function showable(b: Board, f: TracksFiring): boolean {
  return f.reason !== null && !f.ops.every((op) => evident(b, op));
}

/**
 * Deduce the plan from the player's current marks.
 *
 * `deduceHintPlan` supplies no `apply`: the rungs mutate the working board as
 * they detect, so re-applying a firing would be wrong rather than merely
 * redundant (`engine/hint-plan.ts`). The tier cap is the board's own
 * difficulty, not `DIFF_COUNT`: the generator only ever certified the board
 * soluble at that tier, and every rung is monotone in what is already marked,
 * so a correct partial board stays soluble there too. It is also what stops an
 * easiest-tier board being handed a parity argument it never needed.
 */
export function tracksHint(
  state: TracksState,
):
  | { ok: true; steps: HintStep<TracksMove, TracksHighlights>[] }
  | { ok: false; error: string } {
  const board = stateToBoard(state);
  const next = tracksRecordingPass(board, state.diff, stepBudget("tracks hint"));
  const { plan } = deduceHintPlan<Board, TracksFiring, string>({
    board,
    status: (bd) =>
      bd.impossible ? "broken" : checkCompletion(bd, false) ? "done" : "open",
    incomplete: "open",
    next,
    showable,
    planCap: PLAN_CAP,
  });

  // A contradiction on a board `findMistakes` called clean would mean the
  // deduction is unsound, not that the player went wrong, so say the honest
  // thing rather than showing steps derived on the way to it.
  if (board.impossible) return { ok: false, error: PUZZLE_NOT_REASONABLE };
  if (plan.length === 0) return { ok: false, error: DEDUCTION_EXHAUSTED };

  // A firing's reason carries its own evidence, and the narration reads only
  // the board's size and clue numbers, which no firing changes.
  return {
    ok: true,
    steps: plan.map((firing) => {
      // `showable` admits only firings with a premise, so this cannot happen;
      // if it ever does the plan has lost track of what it told the player,
      // and that should reach Sentry rather than render a blank sentence.
      const { reason } = firing;
      if (!reason) throw new Error("tracks hint: a step with no premise was shown");
      return {
        move: { ops: firing.ops },
        explanation: narrate(board, reason),
        highlights: highlightsOf(board, reason, firing),
      };
    }),
  };
}

// --- following the plan ---------------------------------------------------

const sameOp = (a: TracksOp, b: TracksOp): boolean =>
  a.kind === b.kind &&
  a.x === b.x &&
  a.y === b.y &&
  a.track === b.track &&
  a.set === b.set &&
  (a.kind === "square" || a.dir === b.dir);

/**
 * Classify a player move against the displayed step.
 *
 * A firing that forces several squares is one step whose move carries all of
 * them (docs/games/hints.md § "Group one firing into one step"), and the player
 * places them one click or one drag at a time. So the verdict is judged on the
 * step's *own* op list: every op the player made must belong to it, and the
 * step is shrunk in place to what is left so a later `executeHint` does not
 * re-apply what is already done.
 */
export function tracksKeepTrack(
  m: TracksMove,
  step: HintStep<TracksMove, TracksHighlights>,
  state: TracksState,
): "completed" | "onTrack" | "off" {
  if (m.solve) return "off";
  const wanted = step.move.ops;
  if (m.ops.length === 0) return "off";
  if (!m.ops.every((op) => wanted.some((wop) => sameOp(op, wop)))) return "off";

  // `state` is the board the move is about to change (the midend classifies
  // before applying), so an op is done if the player's own move carries it or
  // it was already set.
  const board = stateToBoard(state);
  const done = (op: TracksOp): boolean =>
    m.ops.some((pop) => sameOp(op, pop)) || appliedIn(board, op);
  const left = wanted.filter((op) => !done(op));
  if (left.length === 0) return "completed";

  step.move = { ops: left };
  if (step.highlights) {
    step.highlights = {
      ...step.highlights,
      targets: left
        .filter((o) => o.kind === "square")
        .map((o) => ({ x: o.x, y: o.y, track: o.track })),
      targetEdges: left
        .filter((o) => o.kind === "edge")
        .map((o) => ({ x: o.x, y: o.y, dir: o.dir ?? 0, track: o.track })),
    };
  }
  return "onTrack";
}

/** Is this op's flag already set on `b`? */
function appliedIn(b: Board, op: TracksOp): boolean {
  const f = b.sflags[op.y * b.w + op.x];
  if (op.kind === "square") return (f & (op.track ? S_TRACK : S_NOTRACK)) !== 0;
  const shift = op.track ? S_TRACK_SHIFT : S_NOTRACK_SHIFT;
  return (f & ((op.dir ?? 0) << shift)) !== 0;
}
