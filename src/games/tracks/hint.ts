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
  DX,
  DY,
  E_TRACK,
  inGrid,
  L,
  R,
  S_NOTRACK,
  S_NOTRACK_SHIFT,
  S_TRACK,
  S_TRACK_SHIFT,
  sECount,
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

/** Where a neighbor sits, as in "none above" / "none to the left". */
function towards(dir: number): string {
  if (dir === U) return "above";
  if (dir === D) return "below";
  return dir === L ? "to the left" : "to the right";
}

/** Which way a track carries on, as in "carry on upward". */
function onward(dir: number): string {
  if (dir === U) return "upward";
  if (dir === D) return "downward";
  return dir === L ? "to the left" : "to the right";
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
        : "Only one side of this square is still open, and track needs two, so it must be empty.";

    case "bothSidesLeft":
      return "This square carries a track with only two of its sides still open, so there's only one way for it to go.";

    case "clueFull": {
      const { axis, target } = lineOf(b, reason.line);
      if (target === 0) {
        return `This ${axis}'s clue is 0, so no track can run along it at all: every square in it must be empty.`;
      }
      const has =
        target === 1
          ? "the one track square its clue allows"
          : target === 2
            ? "both of the track squares its clue allows"
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
      return "The outlined track already joins these two squares, so linking them here would close a loop; this side must be blocked.";

    case "wouldStrandTrack":
      return "Joining here would link A's run to B's and finish the track, stranding the outlined track; this side must be blocked.";

    case "wouldFinishEarly": {
      const { axis, target } = lineOf(b, reason.unmet);
      const laid = reason.ev.cells.length;
      return `Joining here would link A's run to B's and finish the track, but the highlighted ${axis} clue wants ${target} and has ${laid}; this side must be blocked.`;
    }

    case "looseEndsFill": {
      const { axis, target } = lineOf(b, reason.line);
      return `The outlined squares already fill this ${axis}'s clue of ${target}, so this loose end can't carry on along it: that side must be blocked.`;
    }

    case "looseEndSpans": {
      const { axis } = lineOf(b, reason.line);
      // "No way across it": every unfinished square has a side blocked across
      // the line, which is what the outlined squares and their bars show.
      return `With two track squares left in this ${axis} and no way across it, this loose end must run straight on.`;
    }

    case "sharedFate": {
      const { axis } = lineOf(b, reason.line);
      const there = onward(reason.dir);
      if (reason.fills && reason.empties) {
        return `Track here would have to carry on ${there}, and this ${axis} has one track square and one empty left, so this must therefore be empty, and the next must carry track.`;
      }
      if (reason.fills) {
        return `Track here would have to carry on ${there}, but this ${axis} has room for one more track square, so this must be empty.`;
      }
      const back = towards(
        reason.dir === U ? D : reason.dir === D ? U : reason.dir === L ? R : L,
      );
      return `No track here would mean none ${back} either, and this ${axis} can spare just one more empty, so this must carry track.`;
    }

    case "crossingParity": {
      const { crossings } = reason;
      // "Every entry needs an exit" is the parity argument in the player's
      // terms: the track begins and ends off the board, so it crosses any
      // closed block's border an even number of times.
      const marked =
        crossings === 0
          ? "none marked yet"
          : `${crossings} ${plural(crossings, "crossing", "crossings")} marked`;
      const verdict = crossings % 2 === 1 ? "carry track" : "be blocked";
      return `Every time the track enters the outlined block it must leave; with ${marked}, this last side must ${verdict}.`;
    }
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
/**
 * Does the player's board already decide this change? True when the **contrary**
 * move is one the game would refuse them: track on a side of a square they have
 * marked empty (or of the board's rim), track as a third side of a finished
 * piece, or "no track" on a square that already shows a rail. Those are
 * `uiCanFlipEdge` / `uiCanFlipSquare`'s own refusals, read as board facts so the
 * answer does not depend on the op having been applied yet.
 *
 * It reads only facts no firing's own ops can create — an edge block creates no
 * empty square and no rail, and marking a track square creates no rail — which
 * is the condition `showable` is judged under (it runs after the firing lands).
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
 * Both halves are needed. The reason check alone was the first cut, and it let
 * through the owner's first playtest finding: `trackComplete` — blocking the
 * two free sides of a finished piece — was narrated, fired on sides the player
 * had already closed off by marking the squares beyond them empty, and was a
 * third of every plan (671 of 2,059 steps measured, every one of them evident).
 * The board check alone would narrate `null`. Together, the rules with no reason
 * are the ones the board shows, and a narrated rule that happens to land on an
 * already-decided side is hidden too, wherever the scan order puts it.
 */
function showable(b: Board, f: TracksFiring): boolean {
  return f.reason !== null && !f.ops.every((op) => evident(b, op));
}

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

  // The board the narration reads is the one the *state* came from: a firing's
  // reason carries its own evidence, so nothing here needs the working board's
  // later state, and `lineOf` only ever reads the clue numbers, which no move
  // changes.
  const shape = stateToBoard(state);
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
        explanation: narrate(shape, reason),
        highlights: highlightsOf(shape, reason, firing),
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
