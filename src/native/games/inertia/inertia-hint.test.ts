/**
 * Inertia's hint: the plan, the narration, and the one thing that makes it
 * worth having — that it is a *nudge*, where Solve is a commitment.
 */

import { describe, expect, it } from "vitest";
import type { ChangeNotification } from "../../../puzzle/types.ts";
import { Midend } from "../../engine/index.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newInertiaDesc } from "./generator.ts";
import { hint, type InertiaHintHighlights } from "./hint.ts";
import { inertiaGame } from "./index.ts";
import { COL_HINT, COL_HINT_GOAL } from "./render.ts";
import {
  GEM,
  type InertiaMove,
  type InertiaState,
  legalDirections,
  newState,
  slidePath,
} from "./state.ts";

const N = 0;
const E = 2;

const S = 4;

/** A hand-built board. Rows are desc characters, so a test reads like the board
 * it describes. */
function board(rows: string[]): { params: { w: number; h: number }; desc: string } {
  return { params: { w: rows[0].length, h: rows.length }, desc: rows.join("") };
}

const stateOf = (rows: string[]): InertiaState => {
  const { params, desc } = board(rows);
  return newState(params, desc);
};

const idOf = (rows: string[]): string => {
  const { params, desc } = board(rows);
  return `${params.w}x${params.h}:${desc}`;
};

function play(s: InertiaState, ...dirs: number[]): InertiaState {
  let state = s;
  for (const dir of dirs) state = inertiaGame.executeMove(state, { type: "move", dir });
  return state;
}

/** The first step's explanation, for a board the test has set up. */
function firstStep(s: InertiaState) {
  const res = hint(s);
  if (!res.ok) throw new Error(`expected a hint, got: ${res.error}`);
  return res.steps[0];
}

/** The number-pad button code for a direction (the pad layout is the compass) —
 * the way a *player* plays a move, as opposed to `playMoves`, which bypasses
 * the hint's move tracking. */
const padKey = (dir: number): number => 0x4000 | "89632147"[dir].charCodeAt(0);

/** A `Midend` that records its status-bar and hint notifications. */
function harness(id: string) {
  const notes: ChangeNotification[] = [];
  const m = new Midend(inertiaGame);
  m.setCallbacks(
    (n) => notes.push(n),
    () => {},
    () => {},
  );
  m.newGameFromId(id);
  const status = (): string => {
    const last = [...notes].reverse().find((n) => n.type === "status-bar-change") as
      | Extract<ChangeNotification, { type: "status-bar-change" }>
      | undefined;
    return last?.statusBarText ?? "";
  };
  return { m, status };
}

// --- the plan --------------------------------------------------------

describe("inertia hint plan", () => {
  const seeds = ["h-a", "h-b", "h-c", "h-d", "h-e"];

  it("plays out to a solved board, and never onto a mine", () => {
    for (const seed of seeds) {
      const params = { w: 10, h: 8 };
      const { desc } = newInertiaDesc(params, randomNew(seed));
      let s = newState(params, desc);

      const res = hint(s);
      if (!res.ok) throw new Error(`${seed}: ${res.error}`);
      for (const step of res.steps) {
        s = inertiaGame.executeMove(s, step.move);
        expect(s.dead, `${seed}: the plan drove the ball onto a mine`).toBe(false);
      }
      expect(s.gems, `${seed}: the plan left gems behind`).toBe(0);
    }
  });

  it("holds the subgoal stable across a leg, and ends the leg by collecting it", () => {
    for (const seed of seeds) {
      const params = { w: 10, h: 8 };
      const { desc } = newInertiaDesc(params, randomNew(seed));
      let s = newState(params, desc);

      const res = hint(s);
      if (!res.ok) throw new Error(`${seed}: ${res.error}`);

      let legGoal: number | null = null;
      for (const step of res.steps) {
        const goal = (step.highlights as InertiaHintHighlights).goal;
        // Within a leg the goal never budges: it is derived once, from the
        // plan, and carried (design D2). Re-deriving it per step from the
        // ball's position would make the banner flip-flop.
        if (legGoal !== null) {
          expect(goal, `${seed}: the subgoal changed under the player's feet`).toBe(
            legGoal,
          );
        }
        legGoal = goal;

        // The goal is always a gem that is still on the board...
        expect(s.board.cell(goal), `${seed}: the marked square holds no gem`).toBe(GEM);

        const move = step.move as Extract<InertiaMove, { type: "move" }>;
        const path = slidePath(s.board, s.px, s.py, move.dir);
        s = inertiaGame.executeMove(s, step.move);

        // ...and a leg ends exactly when the move that collects it is played.
        if (path.gems.length > 0) {
          expect(
            path.gems,
            `${seed}: a leg ended without collecting its goal`,
          ).toContain(legGoal);
          legGoal = null;
        }
      }
      expect(legGoal, `${seed}: the plan ended mid-leg`).toBe(null);
    }
  });

  it("stops at the last gem, rather than walking the route's way home", () => {
    // `solveRoute` grows a tour that ends where it began, so its tail can wander
    // on past the final gem. The game is won the instant the last gem is
    // collected, so the plan has no business suggesting those moves.
    for (const seed of seeds) {
      const params = { w: 10, h: 8 };
      const { desc } = newInertiaDesc(params, randomNew(seed));
      const s = newState(params, desc);

      const res = hint(s);
      if (!res.ok) throw new Error(`${seed}: ${res.error}`);

      const dirs = res.steps.map(
        (st) => (st.move as Extract<InertiaMove, { type: "move" }>).dir,
      );
      const beforeLast = play(s, ...dirs.slice(0, -1));
      expect(
        slidePath(beforeLast.board, beforeLast.px, beforeLast.py, dirs[dirs.length - 1])
          .gems.length,
        `${seed}: the plan's last move collects nothing`,
      ).toBeGreaterThan(0);
    }
  });
});

// --- the narration ---------------------------------------------------

describe("inertia hint narration", () => {
  it("names what a collecting slide sweeps up and what stops it", () => {
    // The ball can only stop where the board lets it — the rule beginners fight,
    // so the collecting narration always says what brought it to a halt.
    const stopped = firstStep(stateOf(["bbbbb", "Sbbgs", "bbbbb"]));
    expect(stopped.explanation).toContain("Slide east");
    expect(stopped.explanation).toContain("sweeps up the marked gem");
    expect(stopped.explanation).toContain("the stop square at the end catches you");

    const walled = firstStep(stateOf(["bbbbb", "Sbbbg", "bbbbb"]));
    expect(walled.explanation).toContain("the wall at the end brings you up short");
  });

  it("counts the gems a slide sweeps up on its way to the marked one", () => {
    // A corridor, because a tour ranks gems by what it costs to get out to them
    // *and back* (see `solveRoute`) — on an open board it would rather poke out
    // at a near gem and return than sweep a whole line and be left in a corner,
    // so the sweep has to be the only way through for the route to take it.
    const step = firstStep(stateOf(["wwwwww", "Sbgggs"]));
    expect(step.explanation).toContain("sweeps up two gems and then the marked gem");
  });

  it("calls a move forced when every other direction runs onto a mine", () => {
    // The ball has three ways out; two are mines. That is a genuine necessity
    // claim, and the skill the game punishes you for lacking.
    const step = firstStep(stateOf(["wwww", "wSmw", "wmgw", "wwww"]));
    // Only NE... no: the gem is south-east, the mines east and south.
    expect(step.explanation).toContain("Slide south-east");
    expect(step.explanation).toContain(
      "it is the only direction that doesn't run you onto a mine",
    );
  });

  it("says walls, not mines, when walls are what block every other way", () => {
    // A ball in a one-square-wide corridor is not being clever, and telling it
    // "every other way runs you onto a mine" would be a lie (hint-authoring §2.7).
    const step = firstStep(stateOf(["wwww", "wwgw", "wwSw", "wwww"]));
    expect(step.explanation).toContain("Slide north");
    expect(step.explanation).toContain("walls block every other direction");
    expect(step.explanation).not.toContain("mine");
  });

  it("explains a move that collects nothing by the gem it is going for", () => {
    // The ball has three ways to set off and not one of them sweeps up the gem
    // in the far corner — so the move is explained by what it is *for*.
    const s = stateOf(["Sbbbb", "bbbbb", "bbbbg"]);
    expect(legalDirections(s.board, s.px, s.py)).toHaveLength(3);

    const step = firstStep(s);
    expect(step.explanation).toContain("Working on the marked gem");
    expect(step.explanation).toContain("no slide from here reaches it");
    expect(step.explanation).toContain("one more slide sweeps it up");
    expect((step.highlights as InertiaHintHighlights).goal).toBe(s.board.square(4, 2));
  });

  it("never claims a gem is out of reach when one slide would sweep it up", () => {
    // The overclaim guard. The route may decline a grab it *could* take — a gem
    // is not one place but eight, because the ball arrives still moving and
    // cannot turn — so "no slide from here reaches it" is a claim, and has to be
    // checked rather than assumed (hint-authoring §2.4).
    for (const seed of ["g-a", "g-b", "g-c", "g-d", "g-e", "g-f"]) {
      const params = { w: 10, h: 8 };
      const { desc } = newInertiaDesc(params, randomNew(seed));
      let s = newState(params, desc);

      const res = hint(s);
      if (!res.ok) throw new Error(`${seed}: ${res.error}`);
      for (const step of res.steps) {
        if (step.explanation.includes("no slide from here reaches it")) {
          const goal = (step.highlights as InertiaHintHighlights).goal;
          const grabbable = legalDirections(s.board, s.px, s.py).some((dir) => {
            const path = slidePath(s.board, s.px, s.py, dir);
            return path.stopper !== "mine" && path.gems.includes(goal);
          });
          expect(
            grabbable,
            `${seed}: the hint said the marked gem was out of reach, and it wasn't`,
          ).toBe(false);
        }
        s = inertiaGame.executeMove(s, step.move);
      }
    }
  });

  it("promises 'one more slide' only when the plan's own next move is the one", () => {
    // A promise the plan then breaks reads as a hint that has lost the plot —
    // and the route can reach a gem from a side no single slide from here can,
    // so "a slide exists" is not the claim to make.
    for (const seed of ["p-a", "p-b", "p-c", "p-d"]) {
      const params = { w: 10, h: 8 };
      const { desc } = newInertiaDesc(params, randomNew(seed));
      let s = newState(params, desc);

      const res = hint(s);
      if (!res.ok) throw new Error(`${seed}: ${res.error}`);
      res.steps.forEach((step, i) => {
        if (step.explanation.includes("one more slide sweeps it up")) {
          const next = res.steps[i + 1];
          expect(
            next,
            `${seed}: promised one more slide, then ended the plan`,
          ).toBeDefined();
          const move = next.move as Extract<InertiaMove, { type: "move" }>;
          const after = inertiaGame.executeMove(s, step.move);
          const goal = (step.highlights as InertiaHintHighlights).goal;
          expect(
            slidePath(after.board, after.px, after.py, move.dir).gems,
            `${seed}: promised one more slide, and the plan's next move didn't take it`,
          ).toContain(goal);
        }
        s = inertiaGame.executeMove(s, step.move);
      });
    }
  });

  it("warns when the gem could be grabbed now, and grabbing it would strand the ball", () => {
    // The deepest thing Inertia has to teach, and the one verdict it can *prove*
    // (`unreachableGems`): sliding east sweeps up the gem and carries the ball
    // into a pocket whose only way out is a mine — so the second gem could never
    // be collected. The route comes at the gem down column 4 instead.
    const rows = [
      "bbSbsbbb",
      "bbbwbbww",
      "mbbbgbbb",
      "wwwwbwww",
      "wwwwswww",
      "wwwwgwww",
    ];
    // One move south leaves the ball wall-stopped at (2,2) — the position where
    // the greedy grab is available.
    const s = play(stateOf(rows), S);
    expect(s.px).toBe(2);
    expect(s.py).toBe(2);

    const step = firstStep(s);
    expect(step.explanation).toContain("sliding east would sweep it up right now");
    expect(step.explanation).toContain("you don't choose where you stop");
    expect(step.explanation).toContain("a gem can never be reached again");
    // And the move it actually suggests is the safe approach.
    expect(step.move).toEqual({ type: "move", dir: N });
  });
});

// --- a nudge, not a commitment ---------------------------------------

describe("inertia hint is a nudge; only Solve is a commitment", () => {
  const id = "10x8#h-nudge";

  it("does not brand the game auto-solved, and installs no route", () => {
    const { m, status } = harness(id);
    expect(m.hint()).toBeUndefined();

    const s = m.saveGame();
    expect(status()).not.toContain("Auto-solver used.");
    expect(new TextDecoder().decode(s)).not.toContain('"cheated":true');

    // The hint shows an arrow, but it is the *hint's* arrow: nothing has been
    // written into the state for the game to follow afterwards.
    const step = m.activeHintStep();
    expect(step).toBeDefined();
    expect(step?.move).toMatchObject({ type: "move" });
  });

  it("...whereas Solve does both", () => {
    const { m, status } = harness(id);
    expect(m.solve()).toBeUndefined();
    expect(status()).toContain("Auto-solver used.");
  });

  it("refuses honestly when the ball is dead, and says the move is to undo", () => {
    const s = play(stateOf(["Smgb", "bbbb"]), E);
    expect(s.dead).toBe(true);

    const res = hint(s);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("dead");
    expect(res.error).toContain("Undo");
  });

  it("refuses honestly when a gem can no longer be reached", () => {
    // The ball slides into the pocket, and the gem outside it is now beyond any
    // sequence of moves at all — which Inertia can *prove*, so the refusal says
    // what is wrong rather than shrugging that it found no route.
    const s = play(
      stateOf(["bbSbsbbb", "bbbwbbww", "mbbbgbbb", "wwwwbwww", "wwwwswww", "wwwwgwww"]),
      S,
      E,
    );
    expect(s.px).toBe(7);
    expect(s.gems).toBe(1);

    const res = hint(s);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("can no longer reach");
    expect(res.error).toContain("undo");
  });

  it("refuses when the board is solved", () => {
    const s = play(stateOf(["Sgs"]), E);
    expect(s.gems).toBe(0);
    expect(hint(s)).toEqual({ ok: false, error: "Already solved" });
  });
});

// --- following the plan ----------------------------------------------

describe("inertia hint tracking", () => {
  // A two-step plan: the ball can't reach the gem in one slide, so it
  // repositions, then sweeps it up.
  const rows = ["Sbbbb", "bbbbb", "bbbbg"];
  const dirOf = (step: { move: InertiaMove }): number =>
    (step.move as Extract<InertiaMove, { type: "move" }>).dir;

  /** A midend over a game that counts `hint()` calls, so a test can tell a
   * *re-shown* plan from a *recomputed* one. */
  function counting() {
    let computed = 0;
    const game = {
      ...inertiaGame,
      hint: (s: InertiaState, aux?: string, ui?: never) => {
        computed++;
        // biome-ignore lint/style/noNonNullAssertion: inertia has a hint.
        return inertiaGame.hint!(s, aux, ui);
      },
    };
    const m = new Midend(game);
    m.setCallbacks(
      () => {},
      () => {},
      () => {},
    );
    m.newGameFromId(idOf(rows));
    return { m, computed: () => computed };
  }

  it("keeps the plan when the player follows it — no recompute, so the subgoal holds", () => {
    // Without `hintKeepTrack` the midend drops the plan on *every* player move,
    // including one that faithfully follows the hint. The next hint would then
    // re-run `solveRoute`, whose fresh heuristic tour is no guaranteed suffix of
    // the old one and may reach for a different gem — the very flip-flop the
    // stable subgoal exists to prevent.
    const { m, computed } = counting();
    expect(m.hint()).toBeUndefined();
    expect(computed()).toBe(1);

    const plan = hint(stateOf(rows));
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.steps.length).toBeGreaterThan(1);

    const first = m.activeHintStep();
    expect(first?.move).toEqual(plan.steps[0].move);

    // Follow it, as a player would.
    expect(m.processInput(0, 0, padKey(dirOf(plan.steps[0])))).toBe(true);

    // A manual completion advances the plan but hides the display — one hint per
    // request. Asking again re-shows the *stored* next step: no recompute.
    expect(m.hint()).toBeUndefined();
    expect(computed(), "following the hint threw the plan away").toBe(1);
    expect(m.activeHintStep()?.move).toEqual(plan.steps[1].move);
  });

  it("drops the plan when the player goes their own way", () => {
    const { m, computed } = counting();
    m.hint();

    const s = stateOf(rows);
    const suggested = dirOf(m.activeHintStep() ?? { move: { type: "move", dir: -1 } });
    const other = legalDirections(s.board, s.px, s.py).find((d) => d !== suggested);
    expect(other, "expected another legal move to deviate with").toBeDefined();

    // biome-ignore lint/style/noNonNullAssertion: asserted above.
    expect(m.processInput(0, 0, padKey(other!))).toBe(true);
    expect(m.activeHintStep(), "deviating kept the plan").toBeUndefined();

    // So the next hint is planned afresh from where the ball now is.
    m.hint();
    expect(computed()).toBe(2);
    expect(m.activeHintStep()).toBeDefined();
  });
});

// --- rendering (tier 2.5) --------------------------------------------

describe("inertia hint rendering", () => {
  it("rings the marked gem and points the arrow the hint's way", () => {
    const rows = ["Sbbbb", "wwwwb", "gbbbb"];
    const result = renderScenario({
      game: inertiaGame,
      id: idOf(rows),
      showHint: true,
    });

    // The ring: Inertia's gems are anonymous, so "the marked gem" has to *be*
    // marked. It is drawn on a tile, so it also has to survive the per-tile
    // cache — a ring that never repaints is the classic overlay-cache trap.
    expect(
      result.recording.ops.some(
        (o) => o.op === "circle" && o.outline === COL_HINT_GOAL,
      ),
    ).toBe(true);

    // The arrow: the route arrow's own shape and colour — both mean "the solver
    // says go this way".
    expect(
      result.recording.ops.some((o) => o.op === "polygon" && o.fill === COL_HINT),
    ).toBe(true);

    expect(result.hint?.explanation).toContain("Working on the marked gem");
    expect(result.recording.ops).toMatchSnapshot();
  });

  it("rings nothing when no hint is showing", () => {
    const result = renderScenario({
      game: inertiaGame,
      id: idOf(["Sbbbb", "wwwwb", "gbbbb"]),
    });
    expect(
      result.recording.ops.some(
        (o) => o.op === "circle" && o.outline === COL_HINT_GOAL,
      ),
    ).toBe(false);
  });
});
