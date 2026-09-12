/**
 * Bridges' explained hint: the narration half of the recording projection in
 * [`solver.ts`](./solver.ts).
 *
 * The deduction end is entirely `solver.ts`'s: the same three rungs on the same
 * `runDeductionFixpoint`, run one firing at a time with a recorder standing
 * (docs/games/hints.md § "Recording the deduction", the *threaded* shape). This
 * file turns each firing into the sentence and the picture.
 *
 * **An island is named by its clue, and a bridge is named by nothing.** Bridges
 * draws no coordinates, so an island's digit is the only handle a sentence can
 * offer, and the step recolors that island so the words point at something
 * visible (docs/games/hints.md § "Name a square by its value"). A bridge has no
 * handle at all: the narration says "this way" or "here" and the hint draws the
 * bridge, or the cross, that the move would make.
 */

import type { HintStep } from "../../engine/game.ts";
import { deduceHintPlan } from "../../engine/hint-plan.ts";
import {
  CONTRADICTION_UNLOCALIZED,
  DEDUCTION_EXHAUSTED,
} from "../../engine/hint-refusal.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import { say } from "./hint-text.ts";
import {
  type BridgesFiring,
  type BridgesReason,
  type BridgesSpan,
  bridgesRecordingPass,
} from "./solver.ts";
import {
  type BridgesMove,
  type BridgesOp,
  type BridgesState,
  G_LINEH,
  G_LINEV,
  G_NOLINEH,
  G_NOLINEV,
} from "./state.ts";

/**
 * A hard cap on how far ahead the plan is computed.
 *
 * A UX bound rather than a correctness one: a 15x15 board runs to some hundreds
 * of forced bridges from empty, and a player rarely follows more than a handful
 * before going their own way, at which point the plan is recomputed anyway
 * (`engine/hint-plan.ts`). It also keeps `hint()` cheap enough to be asked for
 * after every move, which the cross-game resume walk does.
 */
const PLAN_CAP = 12;

// --- highlights -----------------------------------------------------------

/** A span the step decides, and what it decides about it. */
export interface BridgesTarget extends BridgesSpan {
  /** How many bridges the move leaves running here. */
  bridges: number;
  /** The move draws the no-line cross instead. */
  blocked: boolean;
}

/**
 * What one step marks, in four roles.
 *
 * The split follows docs/games/hints.md § "The element-type color legend". The
 * two `COL_HINT` roles are `focus` and `targets`, and they are safe to share a
 * color because they are **different kinds of element**: every sentence names
 * one as an island ("this 5") and the other as a direction ("this way"), which
 * is the test § "Two marks on the board, one 'this cell'" asks first. The
 * evidence roles split the same way and take `COL_HINT_CELL`.
 */
export interface BridgesHighlights {
  /** The spans the step decides; several when one premise forces them all. */
  targets: BridgesTarget[];
  /** The island whose arithmetic forces the step, if the sentence names one. */
  focus: { x: number; y: number } | null;
  /** Islands the argument counts. */
  islands: { x: number; y: number }[];
  /** Bridges the argument counts. */
  spans: BridgesSpan[];
}

// --- narration ------------------------------------------------------------

/**
 * Which sentence a firing speaks, and with what values. The words are
 * [`hint-text.ts`](./hint-text.ts)'s.
 */
export function narrate(state: BridgesState, reason: BridgesReason): string {
  const clue = state.islands[reason.island].count;
  switch (reason.kind) {
    case "exactSpace":
      return say.exactSpace(clue, reason.missing);
    case "everyNeighbor":
      return say.everyNeighbor(clue, reason.neighbors);
    case "wouldCloseLoop":
      return say.wouldCloseLoop;
    case "needsThisWay":
      return say.needsThisWay(clue, reason.elsewhere);
    case "wouldSealGroup":
      return say.wouldSealGroup(reason.group);
    case "wouldStarve":
      // "The outlined island" is a lie when the starved island *is* the one the
      // bridge starts from, because nothing else is then left to outline. The
      // sentence and the picture ask `namesFocus` the same question, so they
      // cannot disagree about which arm this is.
      return say.wouldStarve(clue, namesFocus(reason));
    case "mustReachOut":
      return say.mustReachOut(clue);
  }
}

// --- highlights from a firing ---------------------------------------------

/**
 * Does this firing's sentence name the island the move runs from?
 *
 * Four of the seven do ("This 5 still needs…"), and those recolor it in the
 * action color so the words point at it. **The other three do not, and they
 * must not recolor it either**: a mark on the board that no sentence mentions
 * is one the player has to account for on their own, and here it would be worse
 * than that. Two of the three count a *group* the source island belongs to, so
 * marking it apart would say two islands play different parts in an argument
 * that treats them the same, and "these 2 islands" would point at one mark of
 * each color (docs/games/hints.md § "The element-type color legend").
 */
function namesFocus(reason: BridgesReason): boolean {
  switch (reason.kind) {
    case "exactSpace":
    case "everyNeighbor":
    case "needsThisWay":
    case "mustReachOut":
      return true;
    case "wouldStarve":
      // Only the arm that says "this 5 itself", which is exactly the one where
      // nothing else is left to outline.
      return reason.ev.islands.every((i) => i === reason.island);
    case "wouldSealGroup":
    case "wouldCloseLoop":
      return false;
  }
}

function highlightsOf(
  state: BridgesState,
  reason: BridgesReason,
  firing: BridgesFiring,
): BridgesHighlights {
  const focused = namesFocus(reason);
  const focus = state.islands[reason.island];
  const at = (i: number) => ({ x: state.islands[i].x, y: state.islands[i].y });
  return {
    targets: firing.ops.flatMap((op) =>
      op.op === "L" || op.op === "N"
        ? [
            {
              x1: op.x1,
              y1: op.y1,
              x2: op.x2,
              y2: op.y2,
              bridges: op.op === "L" ? op.n : 0,
              blocked: op.op === "N",
            },
          ]
        : [],
    ),
    focus: focused ? { x: focus.x, y: focus.y } : null,
    // Only the island the words are *about* is filtered out of its own
    // evidence: a demotion that removes context makes the remaining mark
    // louder, not quieter (docs/games/hints.md, the Galaxies partner). Where
    // the sentence does not name it, it stays in the group it belongs to.
    islands: reason.ev.islands.filter((i) => !focused || i !== reason.island).map(at),
    spans: reason.ev.spans,
  };
}

// --- the plan -------------------------------------------------------------

/**
 * Deduce the plan from the player's own bridges.
 *
 * `deduceHintPlan` supplies no `apply`: the rungs mutate the working board as
 * they detect, so re-applying a firing would be wrong rather than merely
 * redundant. The tier cap is the board's own difficulty rather than the top
 * rung: that is the tier the generator certified it soluble at, and it is what
 * stops an Easy board being handed a connectivity argument it never needed.
 *
 * **`showable` is the reason test alone, with no board-legality half.** Tracks
 * needs both because three of its rules restate what the board already draws;
 * Bridges has exactly one reason-less rule, the bookkeeping mark, and the fork's
 * own auto-mark aid draws it. Every other firing changes something the player
 * could not already have: a bridge count the solver only ever raises, and a
 * no-line it only ever draws where `possibles` is still nonzero, which a cross
 * the player has drawn already zeroes.
 */
export function bridgesHint(
  state: BridgesState,
):
  | { ok: true; steps: HintStep<BridgesMove, BridgesHighlights>[] }
  | { ok: false; error: string } {
  const work = state.workingCopy();
  const pass = bridgesRecordingPass(
    work,
    state.params.difficulty,
    stepBudget("bridges hint"),
  );
  const { plan } = deduceHintPlan<BridgesState, BridgesFiring, string>({
    board: work,
    status: () => (pass.impossible() ? "broken" : pass.solved() ? "done" : "open"),
    incomplete: "open",
    next: () => pass.next(),
    showable: (_board, firing) => firing.reason !== null,
    planCap: PLAN_CAP,
  });

  // The board is sound as far as `findMistakes` can tell — it re-solves from
  // the clues and compares bridges — and the deduction still contradicts
  // itself, so what is wrong is an annotation it cannot see: an island marked
  // complete before it is, or a no-line across a bridge the solution needs.
  // Neither is a cell to highlight, which is exactly what this refusal is for.
  if (pass.impossible()) return { ok: false, error: CONTRADICTION_UNLOCALIZED };
  if (plan.length === 0) return { ok: false, error: DEDUCTION_EXHAUSTED };

  return {
    ok: true,
    steps: plan.map((firing) => {
      // `showable` admits only firings with a premise, so this cannot happen;
      // if it ever does the plan has lost track of what it told the player,
      // and that should reach Sentry rather than render a blank sentence.
      const { reason } = firing;
      if (!reason) throw new Error("bridges hint: a step with no premise was shown");
      return {
        move: { ops: firing.ops },
        explanation: narrate(work, reason),
        highlights: highlightsOf(work, reason, firing),
      };
    }),
  };
}

// --- following the plan ---------------------------------------------------

/**
 * The same two islands, in either order. A recorded op always runs *from* the
 * island whose arithmetic forced it, and the player's drag runs from whichever
 * end they started at, so an oriented compare would call half the right moves
 * off-plan.
 */
const sameSpan = (a: BridgesSpan, b: BridgesSpan): boolean =>
  (a.x1 === b.x1 && a.y1 === b.y1 && a.x2 === b.x2 && a.y2 === b.y2) ||
  (a.x1 === b.x2 && a.y1 === b.y2 && a.x2 === b.x1 && a.y2 === b.y1);

/** How many bridges run along this span right now. */
function spanBridges(state: BridgesState, span: BridgesSpan): number {
  const dx = Math.sign(span.x2 - span.x1);
  const dy = Math.sign(span.y2 - span.y1);
  return state.gridCount(span.x1 + dx, span.y1 + dy, dx ? G_LINEH : G_LINEV);
}

/** Is this span already crossed out? */
function spanBlocked(state: BridgesState, span: BridgesSpan): boolean {
  const dx = Math.sign(span.x2 - span.x1);
  const dy = Math.sign(span.y2 - span.y1);
  const c = state.idx(span.x1 + dx, span.y1 + dy);
  return (state.grid[c] & (dx ? G_NOLINEH : G_NOLINEV)) !== 0;
}

/**
 * Classify a player move against the displayed step.
 *
 * One premise can force bridges in several directions at once, and the player
 * draws them one drag at a time — **and a drag adds one bridge, not the whole
 * count**, so a step asking for two on a span is reached by two drags. So an op
 * is on-plan when it moves the span *toward* what the step asks for, and the
 * step is shrunk in place to the spans still short of it, so a later
 * `executeHint` does not re-apply what is already done.
 */
export function bridgesKeepTrack(
  m: BridgesMove,
  step: HintStep<BridgesMove, BridgesHighlights>,
  state: BridgesState,
): "completed" | "onTrack" | "off" {
  const wanted = step.move.ops;
  if (m.ops.length === 0) return "off";

  for (const op of m.ops) {
    if (op.op !== "L" && op.op !== "N") return "off";
    const want = wanted.find(
      (w) => (w.op === "L" || w.op === "N") && w.op === op.op && sameSpan(w, op),
    );
    if (!want) return "off";
    // A drag that wraps a full span back to zero, or one past what the step
    // asks for, is the player going their own way.
    if (op.op === "L" && want.op === "L") {
      const now = spanBridges(state, op);
      if (op.n <= now || op.n > want.n) return "off";
    }
  }

  const done = (want: BridgesOp): boolean => {
    if (want.op === "L") {
      return (
        m.ops.some((op) => op.op === "L" && sameSpan(op, want) && op.n === want.n) ||
        spanBridges(state, want) === want.n
      );
    }
    if (want.op === "N") {
      return (
        m.ops.some((op) => op.op === "N" && sameSpan(op, want)) ||
        spanBlocked(state, want)
      );
    }
    return true;
  };

  const left = wanted.filter((want) => !done(want));
  if (left.length === 0) return "completed";

  step.move = { ops: left };
  if (step.highlights) {
    step.highlights = {
      ...step.highlights,
      targets: step.highlights.targets.filter((t) =>
        left.some((w) => (w.op === "L" || w.op === "N") && sameSpan(w, t)),
      ),
    };
  }
  return "onTrack";
}
