/**
 * Inertia's hint.
 *
 * Inertia is a movement game, so its hint belongs to the **non-deductive
 * family** (hint-authoring §6): no move is *forced* by logic, and a narration
 * claiming otherwise would be a fabrication. But it has far more to say than
 * Untangle's wordless suggestion, because every move here has a concrete
 * consequence the player can be taught — and the one beginners get wrong is
 * precisely the one a hint can say out loud: **you do not choose where you
 * stop.**
 *
 * Three things shape it.
 *
 * 1. **The plan goes for the nearest gem the ball can take without stranding
 *    itself** (`nextLeg`), rather than following `solveRoute`'s tour. Not a
 *    style choice: a hint recomputed from scratch after every player move has to
 *    be *stable*, and the tour is a heuristic that can send the ball north-east
 *    and then, one move later, tell it to come back south-west, for ever.
 *
 * 2. **The gem is the subgoal, and it is held stable across the leg that works
 *    toward it** (the Fifteen lesson, design D2). Re-deriving the goal per step
 *    makes the banner flip-flop and read as though it has lost the plot.
 *
 * 3. **Nothing overclaims.** Every narration branch states only what this file
 *    has actually checked — see `narrate`.
 *
 * And the hint is a *nudge*, which is its whole reason for existing: Solve hands
 * out a route too, but sets `cheated`, so the status bar reads "Auto-solver
 * used." for the rest of the game. Nothing here installs a route or touches that
 * flag (design D1).
 */

import type { HintResult, HintStep, HintTrackVerdict } from "../../engine/game.ts";
import { solveRoute, unreachableGems } from "./solver.ts";
import {
  type InertiaMove,
  type InertiaState,
  legalDirections,
  type SlidePath,
  slide,
  slidePath,
} from "./state.ts";

/** What the board shows for the step being displayed. */
export interface InertiaHintHighlights {
  /** The gem the current leg is going for, as a square index. Inertia's gems
   * are anonymous — there is no "tile 8" to name one by — so the narration says
   * "the marked gem" and the board carries the reference (hint-authoring §2.3).
   */
  readonly goal: number;
  /** The direction to play, drawn as an arrow on the ball. */
  readonly dir: number;
}

type Step = HintStep<InertiaMove, InertiaHintHighlights>;

const DIR_NAMES = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
] as const;

// --- the claims we are allowed to make -------------------------------

/**
 * Is this the only move the ball has, and why? Either every other direction is
 * walled off, or every other direction it *can* set off in kills it — the
 * second being the one real necessity claim Inertia affords, and the skill the
 * game punishes you for lacking.
 *
 * The two are told apart because saying "every other way runs you onto a mine"
 * about a ball hemmed in by walls would be a lie of the kind
 * hint-authoring §2.7 asks you to catch by reading a narration at its
 * degenerate extremes.
 */
function onlyMove(s: InertiaState, dir: number): "mines" | "walls" | null {
  const others = legalDirections(s.board, s.px, s.py).filter((d) => d !== dir);
  if (others.length === 0) return "walls";

  const allFatal = others.every(
    (d) => slidePath(s.board, s.px, s.py, d).stopper === "mine",
  );
  return allFatal ? "mines" : null;
}

/** A single slide from here that sweeps up `goal` without killing the ball, or
 * null if there is none. The positioning narration turns on this: "you cannot
 * reach the marked gem from here" is a claim, and it has to be checked. */
function oneSlideGrab(s: InertiaState, goal: number): number | null {
  for (const dir of legalDirections(s.board, s.px, s.py)) {
    const path = slidePath(s.board, s.px, s.py, dir);
    if (path.stopper === "mine") continue;
    if (path.gems.includes(goal)) return dir;
  }
  return null;
}

// --- narration -------------------------------------------------------

const NUMBER_WORDS = ["no", "a", "two", "three", "four", "five", "six"] as const;

const gemsPhrase = (n: number): string =>
  n === 1 ? "a gem" : `${NUMBER_WORDS[n] ?? n} gems`;

/** What brings the ball to a halt — the rule the whole game turns on, so the
 * collecting narration always names it. */
function stopClause(path: SlidePath): string {
  return path.stopper === "stop"
    ? "the stop square at the end catches you"
    : "the wall at the end brings you up short";
}

/**
 * One move, narrated against the gem its leg is going for. Every branch states
 * something this function has verified:
 *
 * - **forced** — every other direction is walled off, or every other direction
 *   the ball can take runs it onto a mine (`onlyMove`);
 * - **collecting** — the slide's own path says what it sweeps up and what stops
 *   it (`slidePath`);
 * - **stranding** — the route declines a gem the ball *could* grab right now,
 *   and grabbing it would leave some gem unreachable for ever
 *   (`unreachableGems`, the one thing about a position Inertia can prove);
 * - **positioning** — no slide from here reaches the marked gem (checked, not
 *   assumed: the route may decline an available grab, so this is *not* true by
 *   construction), and the plan says how much further there is to go.
 *
 * The one weak branch — a grab the route declines for a reason we cannot prove
 * — says only that the route comes at the gem from another side. Both halves of
 * that are true, and it points at the deep fact underneath: a gem is not one
 * place but up to eight, because the ball arrives still moving and cannot turn,
 * so *which way you come at it* decides where you fetch up. Claiming more —
 * that the grab is a trap, or that this move is the only one — would not be
 * honest (hint-authoring §2.4).
 */
function narrate(
  before: InertiaState,
  dir: number,
  path: SlidePath,
  goal: number,
  /** How many moves of this leg are left, counting this one. */
  toGoal: number,
): string {
  const d = DIR_NAMES[dir];
  const only = onlyMove(before, dir);

  if (path.gems.length > 0) {
    // The leg's payoff. The goal is the *last* gem on the path, so any others
    // are swept up on the way to it.
    const extras = path.gems.length - 1;
    const sweep = extras
      ? `it sweeps up ${gemsPhrase(extras)} and then the marked gem`
      : "it sweeps up the marked gem";

    if (only === "mines") {
      return `Slide ${d}: ${sweep}, and it is the only direction that doesn't run you onto a mine.`;
    }
    if (only === "walls") {
      return `Slide ${d}: ${sweep} — and walls block every other direction, so it is the only move the ball has.`;
    }
    return `Slide ${d}: ${sweep}, and ${stopClause(path)}.`;
  }

  // A move that collects nothing: say what it is *for*.
  const working = "Working on the marked gem";

  if (only === "mines") {
    return `${working}: slide ${d} — every other direction you can set off in runs you onto a mine.`;
  }
  if (only === "walls") {
    return `${working}: slide ${d} — walls block every other direction, so it is the only move the ball has.`;
  }

  const grab = oneSlideGrab(before, goal);
  if (grab !== null) {
    const stranded = unreachableGems(slide(before, grab));
    if (stranded.length > 0) {
      return `${working}: sliding ${DIR_NAMES[grab]} would sweep it up right now — but you don't choose where you stop, and it leaves the ball where ${gemsPhrase(stranded.length)} can never be reached again. Slide ${d} instead.`;
    }
    // The route declines a grab it could take. Which side the ball comes at a
    // gem from decides where it fetches up, so this is a real trade-off — but
    // we have not proved the grab is a trap, so we don't say it is.
    return `${working}: slide ${d} — sweeping it up straight from here is possible, but the route comes at it from another side.`;
  }

  // "One more slide" is a promise about the *plan's own next move*, not about
  // some slide existing: the route may reach the gem from a side no single
  // slide from here can, and a promise it then breaks reads as a hint that has
  // lost the plot.
  return toGoal === 2
    ? `${working}: no slide from here reaches it. Slide ${d}, and one more slide sweeps it up.`
    : `${working}: no slide from here reaches it. Slide ${d} to work the ball round toward it.`;
}

// --- planning: the nearest gem the ball can safely take ---------------

/**
 * Every way to collect a gem from where the ball stands, shortest first: a
 * breadth-first search over the squares it can come to rest on, where a slide
 * that sweeps up a gem ends the walk. The board doesn't change under the search
 * — a leg collects nothing until its last move — so a plain visited-set BFS is
 * exact.
 */
function* collectingLegs(s: InertiaState): Generator<number[]> {
  const seen = new Set<number>([s.board.square(s.px, s.py)]);
  let frontier = [{ px: s.px, py: s.py, dirs: [] as number[] }];

  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const at of frontier) {
      for (const dir of legalDirections(s.board, at.px, at.py)) {
        const path = slidePath(s.board, at.px, at.py, dir);
        if (path.stopper === "mine") continue;

        if (path.gems.length > 0) {
          yield [...at.dirs, dir];
          continue; // the leg ends here — past it the board is a different one
        }

        const end = path.squares[path.squares.length - 1];
        if (seen.has(end)) continue;
        seen.add(end);
        next.push({
          px: s.board.x(end),
          py: s.board.y(end),
          dirs: [...at.dirs, dir],
        });
      }
    }
    frontier = next;
  }
}

/** How many stranding approaches to reject before falling back to the route
 * solver's own tour. Generous: the nearest gem is almost always safe. */
const MAX_UNSAFE_LEGS = 16;

/** The moves of one leg, and the boards they are played on. */
interface Leg {
  readonly dirs: readonly number[];
  /** The state each move is played from; `states[i]` for `dirs[i]`. */
  readonly states: readonly InertiaState[];
  readonly paths: readonly SlidePath[];
  /** The gem the leg is going for: the last one along its final move's path —
   * the one the ball is really travelling for, where a slide sweeps up several. */
  readonly goal: number;
  /** The board once the leg has been played. */
  readonly after: InertiaState;
}

/** Play a leg out, recording the board each of its moves is played on (so each
 * can be narrated against the gems that are still there when it happens). */
function walkLeg(s: InertiaState, dirs: readonly number[]): Leg {
  const states: InertiaState[] = [];
  const paths: SlidePath[] = [];

  let at = s;
  for (const dir of dirs) {
    states.push(at);
    paths.push(slidePath(at.board, at.px, at.py, dir));
    at = slide(at, dir);
  }

  const collected = paths[paths.length - 1].gems;
  return { dirs, states, paths, goal: collected[collected.length - 1], after: at };
}

/**
 * The leg to play next: the **nearest gem the ball can take without stranding
 * itself**, reached by the shortest walk to it.
 *
 * "Nearest" is not a stylistic choice — it is what makes the hint *stable*, and
 * an unstable hint is worse than none. A plan is recomputed from scratch
 * whenever the player goes their own way, and `solveRoute`'s tour is a
 * heuristic: two runs from adjacent positions can disagree about which gem to
 * fetch first, so the ball gets sent north-east, then told to come back
 * south-west, for ever. (That is not hypothetical — it is what this hint did
 * before, and what `hint-resume.test.ts` caught.) Going for the *nearest* safe
 * gem cannot do it: each move of the walk strictly shortens the distance to a
 * gem that is still safe, so the distance falls by one every move and a gem is
 * always collected within it.
 *
 * "Without stranding itself" is the other half, and it is the game's own lesson:
 * grabbing the nearest gem is what a beginner does, and it loses — you do not
 * choose where you stop, and the ball can fetch up where a gem is unreachable
 * for ever. So a candidate is played out and the rest of the board re-solved
 * before its leg is accepted.
 *
 * `tourLeg` is the fallback for the rare board where the near gems all strand:
 * the tour collects every gem, so its own first leg is safe by construction —
 * the rest of its route is the witness.
 */
function nextLeg(s: InertiaState, tourLeg: () => readonly number[] | null): Leg | null {
  let rejected = 0;
  for (const dirs of collectingLegs(s)) {
    const leg = walkLeg(s, dirs);
    if (leg.after.gems === 0 || solveRoute(leg.after).ok) return leg;
    if (++rejected >= MAX_UNSAFE_LEGS) break;
  }

  const fallback = tourLeg();
  return fallback === null ? null : walkLeg(s, fallback);
}

/** The tour's own first leg: its moves up to and including the first that
 * collects a gem. */
function firstLegOf(s: InertiaState, route: readonly number[]): number[] | null {
  let at = s;
  for (const [i, dir] of route.entries()) {
    if (slidePath(at.board, at.px, at.py, dir).gems.length > 0) {
      return [...route.slice(0, i + 1)];
    }
    at = slide(at, dir);
  }
  return null;
}

// --- the plan --------------------------------------------------------

export function hint(
  state: InertiaState,
): HintResult<InertiaMove, InertiaHintHighlights> {
  if (state.gems === 0) return { ok: false, error: "Already solved" };
  if (state.dead) {
    return {
      ok: false,
      error:
        "The ball is dead — no move can be played from here. Undo to bring it back.",
    };
  }

  // Inertia's one provable verdict, and a much better answer than the route
  // solver's shrug: a gem the ball can never reach again means the game is lost,
  // and the move to make is undo.
  const stranded = unreachableGems(state);
  if (stranded.length > 0) {
    return {
      ok: false,
      error: `The ball can no longer reach ${gemsPhrase(stranded.length)} — undo to a position where it can.`,
    };
  }

  // Not the plan — the *check* that one exists, and the fallback's witness if
  // the greedy legs all turn out to strand the ball.
  if (!solveRoute(state).ok) {
    return { ok: false, error: "Unable to find a solution from this starting point" };
  }

  const steps: Step[] = [];
  let s = state;

  while (s.gems > 0) {
    const at = s;
    const leg = nextLeg(at, () => {
      const route = solveRoute(at);
      return route.ok ? firstLegOf(at, route.route) : null;
    });
    if (leg === null) break;

    leg.dirs.forEach((dir, i) => {
      steps.push({
        move: { type: "move", dir },
        explanation: narrate(
          leg.states[i],
          dir,
          leg.paths[i],
          leg.goal,
          leg.dirs.length - i,
        ),
        // The goal is carried across every step of the leg, not re-derived per
        // step from where the ball is standing (design D2) — the gem the plan is
        // going for does not change just because the ball has moved.
        highlights: { goal: leg.goal, dir },
      });
    });

    s = leg.after;
  }

  if (steps.length === 0) return { ok: false, error: "No helpful hint found" };
  return { ok: true, steps };
}

/**
 * A slide is settled by its direction alone, so a move in the step's direction
 * lands exactly the board the plan expects and completes the step; anything
 * else drops the plan.
 *
 * Inertia *needs* this — it is not the ceremony it looks. Without it the midend
 * drops the plan on every player move, including one that faithfully follows
 * the hint, and the next hint re-runs `solveRoute` from scratch. That is a
 * heuristic tour, not a guaranteed suffix of the old one, so the gem it reaches
 * for could change from step to step — the very flip-flop the stable subgoal
 * exists to prevent.
 */
export function hintKeepTrack(
  m: InertiaMove,
  step: Step,
  _state: InertiaState,
): HintTrackVerdict {
  if (m.type !== "move" || step.move.type !== "move") return "off";
  return m.dir === step.move.dir ? "completed" : "off";
}
