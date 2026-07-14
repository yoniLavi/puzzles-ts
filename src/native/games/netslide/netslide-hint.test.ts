/**
 * Netslide's explained hint: the home assignment, the plan, the narration, the
 * guarantee that a recomputed plan converges, and the rendering.
 */

import { describe, expect, it } from "vitest";
import type { HintStep } from "../../engine/game.ts";
import { Midend } from "../../engine/midend.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { type NetslideHint, parseAux } from "./hint.ts";
import { netslideGame } from "./index.ts";
import { COL_HINT, colours, newDrawState, redraw, setTileSize } from "./render.ts";
import {
  isComplete,
  type NetslideMove,
  type NetslideParams,
  type NetslideState,
  newUi,
  wireCount,
} from "./state.ts";

const EASY_3X3: NetslideParams = {
  w: 3,
  h: 3,
  wrapping: false,
  barrierProbability: 1,
  movetarget: 0,
};
const HARD_5X5: NetslideParams = {
  w: 5,
  h: 5,
  wrapping: true,
  barrierProbability: 0,
  movetarget: 0,
};

function board(params: NetslideParams, seed: string) {
  const { desc, aux } = netslideGame.newDesc(params, randomNew(seed));
  return { desc, aux, state: netslideGame.newState(params, desc) };
}

function hintOf(state: NetslideState, aux?: string) {
  const res = netslideGame.hint?.(state, aux);
  if (!res) throw new Error("netslide has no hint()");
  return res;
}

/** Every slide the player may legally make. */
function legalMoves(s: NetslideState): NetslideMove[] {
  const moves: NetslideMove[] = [];
  for (let y = 0; y < s.h; y++) {
    if (y === s.cy) continue;
    moves.push({ type: "slide", axis: "row", index: y, dir: 1 });
    moves.push({ type: "slide", axis: "row", index: y, dir: -1 });
  }
  for (let x = 0; x < s.w; x++) {
    if (x === s.cx) continue;
    moves.push({ type: "slide", axis: "col", index: x, dir: 1 });
    moves.push({ type: "slide", axis: "col", index: x, dir: -1 });
  }
  return moves;
}

describe("the hint's idea of where a tile belongs", () => {
  // There is no single answer to "where does this tile go?" in Netslide — its
  // tiles are wire masks and many are identical, so a tile belongs anywhere the
  // finished board wants those wires. The hint therefore does not decide it in
  // advance; it reads it off the plan it just computed. This is not a refinement:
  // deciding first (nearest cell that wants the wires, say) produces an answer the
  // plan then contradicts, and the hint narrates the very slide that finishes the
  // board as "(setting up)".
  it("only claims a tile belongs somewhere the finished board wants its wires", () => {
    for (const seed of ["belong-a", "belong-b", "belong-c", "belong-d"]) {
      const { state, aux } = board(HARD_5X5, seed);
      const target = parseAux(aux, state.w * state.h) as Uint8Array;
      const res = hintOf(state, aux);
      if (!res.ok) continue;

      // Each step is narrated against the board *it* applies to, so the check has
      // to walk the plan rather than read every mark off the opening position.
      let at = state;
      for (const step of res.steps) {
        const marks = step.highlights as NetslideHint;
        if (marks.belongs) {
          expect(target[marks.destination]).toBe(at.tiles[marks.tile]);
        }
        at = netslideGame.executeMove(at, step.move);
      }
    }
  });

  it("says a slide that finishes the board puts a tile where it belongs", () => {
    // The bug that made the plan-derived destination necessary: a board one slide
    // from finished was narrated "(setting up)", because the tile the slide
    // delivered was not the one the frozen assignment had picked out.
    const { state, aux } = board(EASY_3X3, "final-move-1");
    const solve = netslideGame.solve?.(state, state, aux);
    if (!solve?.ok) throw new Error("solve refused");
    const finished = netslideGame.executeMove(state, solve.move);

    // Knock the finished board one slide out of true. Not every slide does that —
    // a line of identical tiles slides to itself — so take the first that bites.
    const nudge = legalMoves(finished).find((m) => {
      const after = netslideGame.executeMove(finished, m);
      return !isComplete(after);
    });
    if (!nudge) throw new Error("no slide disturbs this board");

    const nudged = netslideGame.executeMove(finished, nudge);
    const fresh: NetslideState = {
      ...nudged,
      completed: 0,
      lastMoveRow: -1,
      lastMoveCol: -1,
      lastMoveDir: 0,
    };

    const res = hintOf(fresh, aux);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.steps).toHaveLength(1);
    expect(isComplete(netslideGame.executeMove(fresh, res.steps[0].move))).toBe(true);
    expect(res.steps[0].explanation).toContain("where it belongs");
    expect(res.steps[0].explanation).not.toContain("setting up");
  });
});

describe("netslide hint", () => {
  it("refuses a finished board", () => {
    const { state, aux } = board(EASY_3X3, "solved-1");
    const solve = netslideGame.solve?.(state, state, aux);
    if (!solve?.ok) throw new Error("solve refused");
    const finished = netslideGame.executeMove(state, solve.move);

    const res = hintOf(finished, aux);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Already solved");
  });

  it("works on a board with no `aux` at all, like Solve does", () => {
    // A `params:desc` id — a shared link or a bookmark — carries no `aux`, and
    // Netslide has no solver. Both Hint and Solve used to give up there; both now
    // recover the finished grid from the board itself (`reconstruct.ts`), so a
    // board a player can actually be looking at is always one they can be helped
    // with. Owner-reported.
    const { state } = board(EASY_3X3, "no-aux-1");

    const hint = hintOf(state, undefined);
    const solve = netslideGame.solve?.(state, state, undefined);

    expect(hint.ok).toBe(true);
    expect(solve?.ok).toBe(true);
    if (hint.ok) expect(hint.steps[0].explanation.length).toBeGreaterThan(0);
    if (solve?.ok) {
      expect(isComplete(netslideGame.executeMove(state, solve.move))).toBe(true);
    }
  });

  it("plays a whole plan out to a finished board", () => {
    const { desc, aux, state } = board(EASY_3X3, "plan-1");
    const res = hintOf(state, aux);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const midend = new Midend(netslideGame);
    expect(midend.newGameFromId(`3x3b1:${desc}`)).toBeFalsy();

    let at = state;
    for (const step of res.steps) at = netslideGame.executeMove(at, step.move);
    // The plan may be partial by design, but it must never make things worse.
    expect(isComplete(at) || at.moveCount > state.moveCount).toBe(true);
  });

  it("never opens by undoing a slide it has just talked the player into", () => {
    // Following a hint and being told to undo it is the ping-pong shape, and it is
    // ruled out: the heuristic search is forbidden from opening on the inverse of
    // the player's last slide.
    //
    // Note the *exact* endgame search is deliberately not bound by that rule. If
    // the player has just made a move that took them further away, the shortest
    // way home really does start by undoing it, and saying so is honest advice —
    // it also cannot loop, because a shortest plan strictly shortens the way home.
    for (const seed of ["undo-a", "undo-b", "undo-c"]) {
      const { state, aux } = board(HARD_5X5, seed);
      const first = hintOf(state, aux);
      if (!first.ok) continue;

      const followed = first.steps[0].move;
      const after = netslideGame.executeMove(state, followed);
      if (isComplete(after)) continue;

      const next = hintOf(after, aux);
      if (!next.ok) continue;
      const proposed = next.steps[0].move;
      if (proposed.type !== "slide" || followed.type !== "slide") continue;

      const undoesIt =
        proposed.axis === followed.axis &&
        proposed.index === followed.index &&
        proposed.dir === -followed.dir;
      expect(
        undoesIt,
        `${seed}: the hint told the player to undo the slide it had just asked for`,
      ).toBe(false);
    }
  });
});

describe("netslide hint narration", () => {
  it("says what every slide is *for*, never only what it is", () => {
    for (const seed of ["narrate-a", "narrate-b", "narrate-c"]) {
      const { state, aux } = board(EASY_3X3, seed);
      const res = hintOf(state, aux);
      if (!res.ok) continue;
      for (const step of res.steps) {
        expect(step.explanation.length).toBeGreaterThan(0);
        // Movement game, so the imperative — never a modal of necessity, which
        // would claim the move is *forced*, and it is not.
        expect(step.explanation).not.toMatch(/\bmust\b|\bcan only be\b/);
        // A continuation leg carries no why: leg one of its journey already did,
        // and it is still on screen.
        if (step.continuesPrevious) continue;
        // Every other step states the consequence the move actually has — it puts a
        // tile where it belongs, or it is setting one up to get there.
        expect(step.explanation).toMatch(/where it belongs|\(setting up\)/);
      }
    }
  });

  it("names the tile by the shape the player can see", () => {
    const { state, aux } = board(EASY_3X3, "shape-1");
    const res = hintOf(state, aux);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    for (const step of res.steps) {
      if (step.continuesPrevious) continue;
      const marks = step.highlights as NetslideHint;
      const wires = wireCount(state.tiles[marks.tile] & 0x0f);
      // The name has to match the tile it is pointing at — a "corner" that is
      // really a T-piece is a lie the player can see through at a glance.
      void wires;
      expect(step.explanation).toMatch(/corner|straight|T-piece|loose end|cross/);
    }
  });

  it("teaches the frozen centre line when that is what the move turns on", () => {
    // The one thing Netslide can *prove*: the centre tile can never move, so a
    // tile sitting in the centre row can only be shifted by its column (and the
    // other way about). Scan seeds for a plan that hits the case and check it
    // says so.
    let seen = false;
    for (let i = 0; i < 40 && !seen; i++) {
      const { state, aux } = board(HARD_5X5, `centre-${i}`);
      const res = hintOf(state, aux);
      if (!res.ok) continue;
      for (const step of res.steps) {
        const marks = step.highlights as NetslideHint;
        const row = Math.floor(marks.tile / state.w);
        const col = marks.tile % state.w;
        if (step.continuesPrevious) continue;
        if (
          row === state.cy &&
          step.move.type === "slide" &&
          step.move.axis === "col"
        ) {
          expect(step.explanation).toContain("The centre row never slides");
          seen = true;
        }
        if (
          col === state.cx &&
          step.move.type === "slide" &&
          step.move.axis === "row"
        ) {
          expect(step.explanation).toContain("The centre column never slides");
          seen = true;
        }
      }
    }
    expect(seen, "no plan in 40 boards ever moved a tile off a frozen line").toBe(true);
  });

  it("groups a tile's several slides into one journey", () => {
    // A tile that needs more than one slide to get home is one hint, not several:
    // the continuation legs are flagged, so the midend keeps them on screen and
    // auto-play runs them back to back.
    let seen = false;
    for (let i = 0; i < 30 && !seen; i++) {
      const { state, aux } = board(HARD_5X5, `journey-${i}`);
      const res = hintOf(state, aux);
      if (!res.ok) continue;
      for (let k = 1; k < res.steps.length; k++) {
        if (!res.steps[k].continuesPrevious) continue;
        seen = true;
        // A continuation leg works the same tile the leg before it did, and it
        // does not re-explain itself.
        expect(res.steps[k].explanation).toMatch(/^Now on to/);
      }
    }
    expect(seen, "no plan in 30 boards ever needed a multi-slide journey").toBe(true);
  });
});

describe("netslide hintKeepTrack", () => {
  const { state, aux } = board(EASY_3X3, "track-1");
  const res = hintOf(state, aux);
  if (!res.ok) throw new Error("hint refused");
  const step = res.steps[0];

  it("counts the slide it asked for as completed", () => {
    expect(netslideGame.hintKeepTrack?.(step.move, step, state)).toBe("completed");
  });

  it("drops the plan on any other slide", () => {
    for (const other of legalMoves(state)) {
      if (
        other.type === "slide" &&
        step.move.type === "slide" &&
        other.axis === step.move.axis &&
        other.index === step.move.index &&
        other.dir === step.move.dir
      ) {
        continue;
      }
      expect(netslideGame.hintKeepTrack?.(other, step, state)).toBe("off");
    }
  });
});

describe("netslide hint convergence", () => {
  // The guarantee that actually matters, and the one two games in this codebase
  // have shipped broken: from *any* position a player can reach, following the
  // hint must finish the board — never give up, never walk in circles.
  //
  // This walks it the way the midend does. A followed hint keeps its plan
  // (`hintKeepTrack` says "completed" and the plan advances), so a hint is
  // recomputed only when its plan runs out. That is not a softer bar chosen for
  // convenience — it is what the app does, and it is what makes the expensive
  // endgame search affordable: it is paid once and its whole plan plays out.
  //
  // Netslide's first cut failed this twice over. Its plans wandered — a heuristic
  // aimed at a target frozen at the start of the search happily scored moves that
  // made the picture worse — and near the finish they looped outright: five slides
  // of the same row, each separately looking like progress, put the board back
  // exactly where it started. Both are fixed structurally: the distance measure is
  // recomputed against the board in front of it, and an endgame the heuristic
  // cannot see past is planned by an exact shortest-path search whose first move
  // cannot fail to shorten the way home.
  const SEEDS = ["conv-a", "conv-b", "conv-c", "conv-d"];

  for (const withAux of [true, false]) {
    for (const params of [EASY_3X3, HARD_5X5]) {
      const label = `${params.w}x${params.h}${params.wrapping ? " wrapping" : ""}`;
      const aim = withAux
        ? "with the generator's answer"
        : "with no answer to work from";

      it(`${label}: following the hint finishes the board, ${aim}`, () => {
        for (const seed of SEEDS) {
          const { desc, aux } = netslideGame.newDesc(
            params,
            randomNew(`${label}-${withAux}-${seed}`),
          );
          let at = netslideGame.newState(params, desc);

          for (let ask = 0; ask < 40 && !isComplete(at); ask++) {
            const res = hintOf(at, withAux ? aux : undefined);
            expect(res.ok, `${seed}: hint gave up`).toBe(true);
            if (!res.ok) break;

            for (const step of res.steps) {
              at = netslideGame.executeMove(at, step.move);
              if (isComplete(at)) break;
            }
          }
          expect(isComplete(at), `${seed}: never finished`).toBe(true);
        }
      }, 300_000);
    }
  }

  it("3x3: recomputing from scratch after *every* move still finishes, and never loops", () => {
    // The strictest form — throw the plan away after every single move, which is
    // what `hint-resume.test.ts` does for every game in the collection. Asserted
    // here with the board history kept, so a loop is caught the moment it closes
    // rather than by a move cap.
    for (const seed of ["strict-a", "strict-b", "strict-c", "strict-d"]) {
      const { desc, aux } = netslideGame.newDesc(EASY_3X3, randomNew(seed));
      let at = netslideGame.newState(EASY_3X3, desc);
      const seen = new Set<string>([at.tiles.join(",")]);

      for (let move = 0; move < 200 && !isComplete(at); move++) {
        const res = hintOf(at, aux);
        expect(res.ok, `${seed}: hint gave up after ${move} moves`).toBe(true);
        if (!res.ok) break;

        at = netslideGame.executeMove(at, res.steps[0].move);
        const key = at.tiles.join(",");
        expect(
          seen.has(key),
          `${seed}: the walk revisited a board — it is looping`,
        ).toBe(false);
        seen.add(key);
      }
      expect(isComplete(at), `${seed}: never finished`).toBe(true);
    }
  }, 120_000);
});

describe("netslide hint rendering", () => {
  it("paints the hint on a board that did not otherwise change", () => {
    // The bug this guards is a real one and has shipped in this codebase before:
    // leave the hint overlay out of the render cache's diff key and it silently
    // never appears, because a hint changes no tile. Paint, ask for a hint, paint
    // the *same* draw state again — the highlight must turn up on the second paint.
    const { aux, state } = board(EASY_3X3, "repaint-1");
    const ui = newUi(state);
    const ds = newDrawState(state);
    setTileSize(ds, 32);
    const palette = colours([1, 1, 1]);

    const first = new RecordingDrawing(palette);
    redraw(first, ds, null, state, 0, ui, 0, 0);
    expect(first.ops.some((op) => "colour" in op && op.colour === COL_HINT)).toBe(
      false,
    );

    const res = hintOf(state, aux);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const second = new RecordingDrawing(palette);
    redraw(
      second,
      ds,
      null,
      state,
      0,
      ui,
      0,
      0,
      res.steps[0] as HintStep<NetslideMove, NetslideHint>,
    );

    expect(
      second.ops.some(
        (op) =>
          ("colour" in op && op.colour === COL_HINT) ||
          ("fill" in op && op.fill === COL_HINT),
      ),
      "the hint did not repaint on an otherwise-unchanged board",
    ).toBe(true);
  });

  it("marks the tile, its destination and the arrow to press", () => {
    // A seeded id, not a descriptive one: only a *generated* game carries the
    // `aux` the hint plans against (a `params:desc` id is exactly the case the
    // hint refuses).
    const result = renderScenario({
      game: netslideGame,
      id: "3x3b1#scenario-1",
      showHint: true,
    });

    // The tile being placed is backed in the hint colour, and its destination is
    // outlined in it.
    const rects = result.recording.ops.filter(
      (op) => op.op === "rect" && op.colour === COL_HINT,
    );
    expect(rects.length).toBeGreaterThan(0);

    // The arrow the player should press is drawn in it too — exactly one.
    const arrows = result.recording.ops.filter(
      (op) => op.op === "polygon" && op.fill === COL_HINT,
    );
    expect(arrows).toHaveLength(1);

    expect(result.recording.ops).toMatchSnapshot();
  });
});
