/**
 * Tracks' explained hint: the narration half of the recording projection in
 * [`solver.ts`](./solver.ts).
 *
 * The deduction end is entirely `solver.ts`'s — the same eight rungs on the
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
import { type TracksFiring, type TracksReason, tracksRecordingPass } from "./solver.ts";
import {
  type Board,
  checkCompletion,
  D,
  L,
  R,
  S_NOTRACK,
  S_NOTRACK_SHIFT,
  S_TRACK,
  S_TRACK_SHIFT,
  stateToBoard,
  type TracksMove,
  type TracksOp,
  type TracksState,
  U,
} from "./state.ts";

/**
 * A hard cap on how far ahead the plan is computed.
 *
 * A UX bound rather than a correctness one, and Tracks needs it more than most:
 * a 15x15 board is ~600 forced decisions from empty, and a player rarely
 * follows more than a handful before going their own way, at which point the
 * plan is recomputed anyway (Spokes and Bricks bound theirs the same way —
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
 * and they are all drawn identically (quality-bar rule 3).
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

// --- naming things the player can see -------------------------------------

/** The word for the direction from one square to its neighbor. */
function towards(dir: number): string {
  if (dir === U) return "above";
  if (dir === D) return "below";
  return dir === L ? "to its left" : "to its right";
}

/** Read a line's clue index back into orientation, length and target. */
function lineOf(b: Board, line: number) {
  const isCol = line < b.w;
  return {
    isCol,
    axis: isCol ? "column" : "row",
    /** How many squares the line holds. */
    len: isCol ? b.h : b.w,
    /** How many of them carry track. */
    target: b.numbers[line],
    /** Being crossed straight through, in that line's terms. */
    across: isCol ? "from side to side" : "from top to bottom",
  };
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

// --- narration ------------------------------------------------------------

/**
 * One sentence per premise, in the arc the guide asks for: **indication**
 * (the board pattern that fired it) then **reasoning** then **conclusion** in
 * the necessity voice.
 *
 * Seven rungs are represented here and the eighth, `check-single`, is not: it
 * fires on no board this generator produces, so narrating it would be prose
 * nobody can ever read or check (`tracks-ladder.test.ts`'s `unreached` ledger,
 * and `tracks-hint.test.ts` asserts it stays that way).
 */
export function narrate(b: Board, reason: TracksReason): string {
  switch (reason.kind) {
    case "onlyOneSideLeft":
      return reason.open === 0
        ? "Every side of this square is blocked, so no track can reach it: it must be empty."
        : "Track has to enter a square by one side and leave by another, and only one side of this square is still open, so it must be empty.";

    case "bothSidesLeft":
      return "This square carries track, and only two of its sides are still open, so the track must run in through one of them and out through the other.";

    case "trackComplete":
      return "The track already enters and leaves this square, so it can use neither of its other two sides: both must be blocked.";

    case "clueFull": {
      const { axis, target } = lineOf(b, reason.line);
      if (target === 0) {
        return `This ${axis}'s clue is 0, so no track can run along it at all: every square in it must be empty.`;
      }
      const has =
        target === 1
          ? "the one track square its clue allows"
          : `all ${target} of the track squares its clue allows`;
      return `This ${axis} already has ${has}, so every other square in it must be empty.`;
    }

    case "clueExact": {
      const { axis, target, len } = lineOf(b, reason.line);
      const room = len - target;
      if (room === 0) {
        return `This ${axis}'s clue is ${target} and it is ${len} squares long, so every square in it must carry track.`;
      }
      const marked = plural(room, "it is already marked", "they are already marked");
      return `This ${axis} can leave only ${room} ${plural(room, "square", "squares")} empty and ${marked}, so every other square in it must carry track.`;
    }

    case "wouldCloseLoop":
      return "These two squares are already linked by the outlined track running round the other way, so joining them here would close a loop; the track has to run from A to B instead, so this side must be blocked.";

    case "wouldStrandTrack":
      return "Joining these two squares would link the run from A to the run from B and finish the track, but the outlined track would be left stranded off the end of it. So this side must be blocked.";

    case "wouldFinishEarly": {
      const { axis, target } = lineOf(b, reason.unmet);
      const laid = reason.ev.cells.length;
      return `Joining these two squares would link the run from A to the run from B and finish the track, but the highlighted ${axis} clue asks for ${target} track ${plural(target, "square", "squares")} and only ${laid} are laid. So this side must be blocked.`;
    }

    case "looseEndsFill": {
      const { axis, target } = lineOf(b, reason.line);
      return `The outlined squares already account for this ${axis}'s whole clue of ${target}, so no other square in it can take track. Carrying this loose end on along the ${axis} would need one, so that side must be blocked.`;
    }

    case "looseEndSpans": {
      const { axis, across } = lineOf(b, reason.line);
      return `Only two squares in this ${axis} have still to take track, and every unfinished square in it is blocked on one side, so none can be crossed ${across}. This loose end must therefore run straight on, so both its ${axis} sides must carry track.`;
    }

    case "sharedFate": {
      const { axis } = lineOf(b, reason.line);
      const there = towards(reason.dir);
      if (reason.fills && reason.empties) {
        return `Only two squares in this ${axis} are still undecided, and track can pass through this one only by carrying on into the square ${there}, so the two share a fate. This one must therefore be empty, and the one ${there} must carry track.`;
      }
      if (reason.fills) {
        return `This ${axis} has room for just one more track square, and track can pass through this square only by carrying on into the one ${there}, which would take two. So this square must be empty.`;
      }
      const back = towards(
        reason.dir === U ? D : reason.dir === D ? U : reason.dir === L ? R : L,
      );
      return `This ${axis} has room for just one more empty square, and track can pass through the square ${back} only by carrying on into this one, so an empty here would leave that one empty too. This square must carry track.`;
    }

    case "crossingParity": {
      const { crossings } = reason;
      const marked =
        crossings === 0
          ? "No crossing of it is marked yet"
          : crossings === 1
            ? "One crossing of it is marked"
            : `${crossings} crossings of it are marked`;
      const verdict = crossings % 2 === 1 ? "carry track" : "be blocked";
      return `The track starts and ends outside the outlined block, so it must cross that block's border an even number of times. ${marked}, and this side is the last crossing still undecided, so it must ${verdict}.`;
    }
  }
}

// --- highlights from a firing ---------------------------------------------

function highlightsOf(b: Board, firing: TracksFiring): TracksHighlights {
  const { w } = b;
  const { ev } = firing.reason;
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
 * Deduce the plan from the player's current marks.
 *
 * `deduceHintPlan` supplies no `apply`: the rungs mutate the working board as
 * they detect, so re-applying a firing would be wrong rather than merely
 * redundant (`engine/hint-plan.ts`). The tier cap is the board's own
 * difficulty, not `DIFF_COUNT` — the generator only ever certified the board
 * soluble at that tier, and every rung is monotone in what is already marked,
 * so a correct partial board stays soluble there too. It is also what stops an
 * Easy board being handed a parity argument it never needed.
 */
export function tracksHint(
  state: TracksState,
):
  | { ok: true; steps: HintStep<TracksMove, TracksHighlights>[] }
  | { ok: false; error: string } {
  const board = stateToBoard(state);
  const pass = tracksRecordingPass(board, state.diff, stepBudget("tracks hint"));
  const { plan } = deduceHintPlan<Board, TracksFiring, string>({
    board,
    status: (bd) =>
      bd.impossible ? "broken" : checkCompletion(bd, false) ? "done" : "open",
    incomplete: "open",
    next: pass.next,
    planCap: PLAN_CAP,
  });

  // A contradiction on a board `findMistakes` called clean would mean the
  // deduction is unsound, not that the player went wrong, so say the honest
  // thing rather than showing steps derived on the way to it.
  if (board.impossible) return { ok: false, error: PUZZLE_NOT_REASONABLE };
  if (plan.length === 0) return { ok: false, error: DEDUCTION_EXHAUSTED };

  // The board the narration reads is the one the *state* came from: a firing's
  // reason carries its own evidence, so nothing here needs the working board's
  // later state, and `lineOf` only ever reads the clue numbers, which no move
  // changes.
  const shape = stateToBoard(state);
  return {
    ok: true,
    steps: plan.map((firing) => ({
      move: { ops: firing.ops },
      explanation: narrate(shape, firing.reason),
      highlights: highlightsOf(shape, firing),
    })),
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
