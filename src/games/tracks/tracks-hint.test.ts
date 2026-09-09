/**
 * Tracks' explained hint: the claims its narration makes, and the two things
 * only this game can check.
 *
 * The cross-game guards already cover narration *form* (necessity voice, the
 * 300-char ceiling, no em-dash), plan purity, no-op-free plans and the overlay
 * reaching the render cache — Tracks joined all six by declaring `hint()`
 * (`engine/testing/hint-games.ts`). What is left here is per-game:
 *
 *  - **every move a step asks for is one the player is allowed to make.**
 *    Tracks' `executeMove` *throws* on an op `uiCanFlipSquare` /
 *    `uiCanFlipEdge` refuses, and it refuses several things the solver may
 *    freely deduce — most sharply, laying track on a side of a **clue** square.
 *    No cross-game guard can see this: they replay a plan through
 *    `executeMove`, which would throw rather than fail an assertion, and only
 *    on the seed that reached it.
 *  - **the silent rungs are exactly the two that are meant to be silent**, so
 *    `check-single` cannot start deciding squares the player is never told
 *    about without this going red.
 */

import { describe, expect, it } from "vitest";
import { ALREADY_SOLVED, FIX_MISTAKES_FIRST } from "../../engine/hint-refusal.ts";
import { randomNew } from "../../engine/random/index.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import { narrate, type TracksHighlights } from "./hint.ts";
import { tracksGame } from "./index.ts";
import { uiCanFlipEdge, uiCanFlipSquare } from "./moves.ts";
import { type TracksReason, tracksRecordingPass, tracksSolve } from "./solver.ts";
import {
  DIFF_EASY,
  DIFF_HARD,
  DIFF_TRICKY,
  E_TRACK,
  sEDirs,
  stateToBoard,
  type TracksMove,
  type TracksParams,
  type TracksState,
} from "./state.ts";

const SHAPES: TracksParams[] = [
  { w: 8, h: 8, diff: DIFF_EASY, singleOnes: true },
  { w: 8, h: 8, diff: DIFF_TRICKY, singleOnes: true },
  { w: 10, h: 10, diff: DIFF_HARD, singleOnes: true },
];
const SEEDS = ["hint-a", "hint-b", "hint-c"];

/** Walk a board to solved by following the plan's first step, collecting every
 * step it ever showed. One walk covers far more firings than one plan does. */
function walk(params: TracksParams, seed: string) {
  const { desc } = tracksGame.newDesc(params, randomNew(seed));
  let state = tracksGame.newState(params, desc);
  const steps: { step: (typeof out)[number]; before: TracksState }[] = [];
  const out: {
    move: TracksMove;
    explanation: string;
    highlights?: TracksHighlights;
  }[] = [];
  for (let i = 0; i < 900; i++) {
    if (tracksGame.status(state) === "solved") break;
    const res = tracksGame.hint?.(state);
    if (!res?.ok) throw new Error(`${seed}: refused after ${i}: ${res?.error}`);
    const step = res.steps[0] as (typeof out)[number];
    out.push(step);
    steps.push({ step, before: state });
    state = tracksGame.executeMove(state, step.move);
  }
  return { steps, solved: tracksGame.status(state) === "solved" };
}

describe("every move a Tracks hint asks for is one the player may make", () => {
  // The interesting refusal is on a *clue* square: `uiCanFlipEdge` will not lay
  // track on any side of one, while the solver's rungs set edge flags there
  // without a thought. The port survives it because a clue square arrives from
  // the desc with both its track sides already laid, so no deduction ever adds
  // a third — but that is an argument, and this is the check.
  for (const params of SHAPES) {
    for (const seed of SEEDS) {
      it(`${params.w}x${params.h} tier ${params.diff} / ${seed}`, () => {
        const { steps, solved } = walk(
          params,
          `legal-${params.w}-${params.diff}-${seed}`,
        );
        expect(steps.length, "no steps to check").toBeGreaterThan(10);
        expect(solved, "following the plan did not finish the board").toBe(true);
        for (const { step, before } of steps) {
          const b = stateToBoard(before);
          for (const op of step.move.ops) {
            const legal =
              op.kind === "square"
                ? uiCanFlipSquare(b, op.x, op.y, !op.track)
                : uiCanFlipEdge(b, op.x, op.y, op.dir ?? 0, !op.track);
            expect(
              legal,
              `${JSON.stringify(op)} is a move the player is not allowed to make`,
            ).toBe(true);
          }
        }
      });
    }
  }
});

describe("only the two rungs meant to be silent change the board unnarrated", () => {
  it("is exactly update-flags, across every tier", () => {
    const seen = new Set<string>();
    let firings = 0;
    for (const params of SHAPES) {
      for (const seed of SEEDS) {
        const { desc } = tracksGame.newDesc(
          params,
          randomNew(`silent-${params.w}-${params.diff}-${seed}`),
        );
        const board = stateToBoard(tracksGame.newState(params, desc));
        const pass = tracksRecordingPass(board, params.diff, stepBudget("probe"));
        while (pass.next()) firings++;
        for (const id of pass.silent.keys()) seen.add(id);
      }
    }
    // Vacuity: a pass that fired nothing would agree with any expectation here.
    expect(firings).toBeGreaterThan(200);
    // `update-flags` holds two rules that only restate what the board already
    // draws. `check-single` is the one that must never appear: it fires on no
    // board this generator produces (`tracks-ladder.test.ts`'s `unreached`
    // ledger), and if that ever stops being true it would be silently deciding
    // squares rather than teaching them.
    expect([...seen].sort()).toEqual(["update-flags"]);
  });
});

describe("the picture holds exactly the number the sentence states", () => {
  it("a clue-is-met step outlines that clue's own track squares", () => {
    let checked = 0;
    for (const params of SHAPES) {
      for (const seed of SEEDS) {
        const { steps } = walk(params, `count-${params.w}-${params.diff}-${seed}`);
        for (const { step, before } of steps) {
          const hl = step.highlights;
          if (!hl || hl.clues.length !== 1) continue;
          // "already has all N of the track squares its clue allows" — so the
          // outline must hold N cells, and each must actually carry track.
          const m = step.explanation.match(/already has all (\d+) of the track/);
          if (!m) continue;
          checked++;
          expect(hl.area.length, step.explanation).toBe(Number(m[1]));
          const b = stateToBoard(before);
          for (const c of hl.area) {
            const carries =
              (b.sflags[c.y * b.w + c.x] & 1) !== 0 ||
              sEDirs(b, c.x, c.y, E_TRACK) !== 0;
            expect(carries, `outlined (${c.x},${c.y}) carries no track`).toBe(true);
          }
        }
      }
    }
    expect(checked, "no clue-is-met step in the corpus").toBeGreaterThan(5);
  });

  it("a parity step's outlined crossings are the number it counts", () => {
    let checked = 0;
    for (const seed of SEEDS) {
      const params = SHAPES[2];
      const { steps } = walk(params, `parity-${seed}`);
      for (const { step } of steps) {
        const m = step.explanation.match(/^The track starts and ends outside/);
        if (!m) continue;
        checked++;
        const said = /No crossing of it is marked/.test(step.explanation)
          ? 0
          : /One crossing of it is marked/.test(step.explanation)
            ? 1
            : Number(step.explanation.match(/(\d+) crossings of it are marked/)?.[1]);
        expect(step.highlights?.areaEdges.length, step.explanation).toBe(said);
        expect(step.highlights?.area.length).toBeGreaterThan(0);
      }
    }
    expect(checked, "no parity step in the corpus").toBeGreaterThan(0);
  });
});

/**
 * Which premises the generator's boards actually reach, and why each of the
 * three they do not is still written.
 *
 * This is `tracks-ladder.test.ts`'s `unreached` ledger one level finer. That
 * one found a whole **rung** the corpus never reaches (`check-single`); measured
 * the same way over 119 boards — every shape, tier and `singleOnes` setting,
 * 10,356 firings, 2026-09-09 — three narratable *arms* are unreachable too, and
 * the tally the runner keeps on the generator's own recorder-free path agrees
 * (`check-loose-ends` fires 62 times there against 66 `looseEndSpans` recorded
 * here and no `looseEndsFill`; `check-loop` 198 against 264 recorded arms and no
 * `wouldFinishEarly`).
 *
 * **None of the three is deleted, and the reason is the same each time**: the
 * deduction itself is upstream's and cannot go (the generator is byte-matched
 * against it), so an arm without a reason would not vanish, it would start
 * changing the player's board *silently* — which the silent-rung guard above
 * would then catch. What they lose by being unreachable is the corpus's check
 * on their wording, and § "reads correctly at the degenerate extremes" below is
 * where that is bought back: `narrate` is called on a hand-built reason, which
 * is the only instrument that can read a sentence no board produces.
 */
const UNREACHED: Record<string, string> = {
  looseEndsFill:
    "Subsumed by cheaper rungs. Its premise is that a line's clue is fully " +
    "accounted for, at which point `count-clues` has already marked every " +
    "other square in that line empty and `update-flags` has blocked their " +
    "sides, including the one this arm would block. Both run to exhaustion " +
    "before `check-loose-ends` is reached, so it arrives with nothing left.",
  wouldFinishEarly:
    "Needs a join of the A run to the B run that strands no track elsewhere " +
    "and still leaves a clue short. `wouldStrandTrack`, the same firing's " +
    "other cause, fires 64 times over the corpus; this combination did not " +
    "come up. Retire this entry by building a board that reaches it.",
};

describe("every narratable premise the corpus reaches is reached", () => {
  // Adding a variant to `TracksReason` breaks this object until it is listed,
  // which is what stops the census silently shrinking.
  const ALL_KINDS: Record<TracksReason["kind"], true> = {
    onlyOneSideLeft: true,
    bothSidesLeft: true,
    trackComplete: true,
    clueFull: true,
    clueExact: true,
    wouldCloseLoop: true,
    wouldStrandTrack: true,
    wouldFinishEarly: true,
    looseEndsFill: true,
    looseEndSpans: true,
    sharedFate: true,
    crossingParity: true,
  };

  it("reaches every premise but the ledgered ones, and ledgers nothing it reaches", () => {
    const seen = new Set<string>();
    let firings = 0;
    for (const params of SHAPES) {
      for (const seed of SEEDS) {
        const { desc } = tracksGame.newDesc(
          params,
          randomNew(`cover-${params.w}-${params.diff}-${seed}`),
        );
        const board = stateToBoard(tracksGame.newState(params, desc));
        const pass = tracksRecordingPass(board, params.diff, stepBudget("cover"));
        for (;;) {
          const f = pass.next();
          if (!f) break;
          firings++;
          seen.add(f.reason.kind);
        }
      }
    }
    expect(firings, "the census walked no firings").toBeGreaterThan(200);
    for (const [id, why] of Object.entries(UNREACHED)) {
      expect(id in ALL_KINDS, `${id} is ledgered but is not a premise`).toBe(true);
      expect(why.length, `${id}'s ledger entry states no reason`).toBeGreaterThan(80);
      expect(
        seen.has(id),
        `${id} is ledgered as unreached but the corpus reached it`,
      ).toBe(false);
    }
    expect([...seen].sort()).toEqual(
      Object.keys(ALL_KINDS)
        .filter((k) => !(k in UNREACHED))
        .sort(),
    );
  });

  it("each premise says something a player could tell apart", () => {
    const sentences = new Set<string>();
    for (const params of SHAPES) {
      for (const seed of SEEDS) {
        const { steps } = walk(params, `cover-${params.w}-${params.diff}-${seed}`);
        for (const { step } of steps) {
          // Collapse interpolated numbers so one shape counts once.
          sentences.add(step.explanation.replace(/\d+/g, "#"));
        }
      }
    }
    expect(sentences.size).toBeGreaterThanOrEqual(12);
    const all = [...sentences].join("\n");
    for (const marker of [
      "already enters and leaves", // trackComplete
      "only two of its sides are still open", // bothSidesLeft
      "only one side of this square is still open", // onlyOneSideLeft
      "the track squares its clue allows", // clueFull
      "can leave only", // clueExact
      "would close a loop", // wouldCloseLoop
      "left stranded off the end", // wouldStrandTrack
      "must therefore run straight on", // looseEndSpans
      "carrying on into the one", // sharedFate, fill arm
      "an empty here would leave that one empty too", // sharedFate, empty arm
      "cross that block's border an even number of times", // crossingParity
    ]) {
      expect(all, `no step ever said "${marker}"`).toContain(marker);
    }
  });
});

describe("narration reads correctly at the degenerate extremes", () => {
  // Every arm whose wording branches on a count, read at the value that breaks
  // the typical phrasing (docs/games/hints.md § "Sanity-read at the degenerate
  // extremes"). Reasons are built by hand: the corpus does not reliably reach a
  // clue of 0 or a full-width row.
  const board = stateToBoard(
    tracksGame.newState(SHAPES[0], tracksGame.newDesc(SHAPES[0], randomNew("x")).desc),
  );
  const ev = { cells: [], edges: [], clues: [] };
  const say = (r: TracksReason) => narrate(board, r);

  it("a square with no side left open does not claim it has one", () => {
    expect(say({ kind: "onlyOneSideLeft", x: 0, y: 0, open: 0, ev })).toContain(
      "Every side of this square is blocked",
    );
    expect(say({ kind: "onlyOneSideLeft", x: 0, y: 0, open: 1, ev })).toContain(
      "only one side",
    );
  });

  it("a clue of one is singular, and a clue of zero says so", () => {
    const b0 = { ...board, numbers: Int32Array.from(board.numbers) };
    b0.numbers[0] = 0;
    expect(narrate(b0, { kind: "clueFull", line: 0, ev })).toContain(
      "clue is 0, so no track can run along it",
    );
    b0.numbers[0] = 1;
    expect(narrate(b0, { kind: "clueFull", line: 0, ev })).toContain(
      "the one track square its clue allows",
    );
  });

  it("a line with no room to be empty is not asked to leave 0 squares empty", () => {
    const bFull = { ...board, numbers: Int32Array.from(board.numbers) };
    bFull.numbers[0] = board.h;
    const s = narrate(bFull, { kind: "clueExact", line: 0, ev });
    expect(s).toContain("squares long, so every square in it must carry track");
    expect(s).not.toContain("only 0");
  });

  it("a parity step with nothing marked yet does not say it crosses 0 times", () => {
    const s = say({ kind: "crossingParity", x: 0, y: 0, dir: 8, crossings: 0, ev });
    expect(s).toContain("No crossing of it is marked yet");
    expect(s).toContain("must be blocked");
    expect(
      say({ kind: "crossingParity", x: 0, y: 0, dir: 8, crossings: 1, ev }),
    ).toContain("One crossing of it is marked");
  });

  // The three arms the census above ledgers as unreachable. A sentence no board
  // produces still has to be a sentence, and this is the only place that can
  // say so — the cross-game narration guard walks *fired* steps, so it has
  // never seen these either.
  it("the unreachable arms are still English, and still in the necessity voice", () => {
    const NECESSITY = /\bmust\b|\bcan(?:no|')t\b|\bcannot\b|\bno other\b|\bonly\b/;
    for (const reason of [
      { kind: "looseEndsFill", line: 0, ev } as const,
      { kind: "wouldFinishEarly", x: 1, y: 1, dir: 8, unmet: 0, ev } as const,
      {
        kind: "sharedFate",
        line: 0,
        x: 1,
        y: 1,
        dir: 8,
        fills: true,
        empties: true,
        ev,
      } as const,
    ]) {
      const s = say(reason);
      expect(s.length, `${reason.kind} narrates nothing`).toBeGreaterThan(60);
      expect(
        s.length,
        `${reason.kind} is over the 300-char ceiling`,
      ).toBeLessThanOrEqual(300);
      expect(NECESSITY.test(s), `${reason.kind}: "${s}"`).toBe(true);
      expect(s).not.toContain("—");
      expect(s, `${reason.kind} left a template hole`).not.toContain("undefined");
    }
    // The both-arm forces two squares in opposite directions, so it is the one
    // sentence that has to name both conclusions; a single-arm phrasing here
    // would describe half the move it is attached to.
    const both = say({
      kind: "sharedFate",
      line: 0,
      x: 1,
      y: 1,
      dir: 8,
      fills: true,
      empties: true,
      ev,
    });
    expect(both).toContain("must therefore be empty");
    expect(both).toContain("must carry track");
  });
});

describe("following one step at a time", () => {
  it("a partial follow holds the step and shrinks it; the last op completes it", () => {
    // A `clueFull` firing empties several squares at once, which is what a
    // player does one click at a time.
    const params = SHAPES[0];
    const { steps } = walk(params, "keeptrack-a");
    const multi = steps.find(({ step }) => step.move.ops.length >= 3);
    expect(multi, "no multi-op step in the corpus").toBeDefined();
    if (!multi) return;

    const { step, before } = multi;
    const wanted = [...step.move.ops];
    let state = before;
    for (let i = 0; i < wanted.length; i++) {
      const one: TracksMove = { ops: [wanted[i]] };
      const verdict = tracksGame.hintKeepTrack?.(one, step, state);
      expect(verdict).toBe(i === wanted.length - 1 ? "completed" : "onTrack");
      state = tracksGame.executeMove(state, one);
      if (i < wanted.length - 1) {
        // Shrunk in place, so a later `executeHint` cannot re-apply what is done.
        expect(step.move.ops.length).toBe(wanted.length - i - 1);
        expect(step.move.ops).not.toContainEqual(wanted[i]);
      }
    }
  });

  it("a move the step never asked for is off-plan", () => {
    const params = SHAPES[0];
    const { steps } = walk(params, "keeptrack-b");
    const { step, before } = steps[0];
    const foreign: TracksMove = {
      ops: [{ kind: "square", x: 0, y: 0, track: false, set: true }],
    };
    const isWanted = step.move.ops.some(
      (o) => o.kind === "square" && o.x === 0 && o.y === 0,
    );
    if (!isWanted)
      expect(tracksGame.hintKeepTrack?.(foreign, step, before)).toBe("off");
  });
});

describe("the two refusals every deductive hint owes", () => {
  const params = SHAPES[0];

  it("declines on a solved board", () => {
    const { desc } = tracksGame.newDesc(params, randomNew("refuse-solved"));
    const fresh = tracksGame.newState(params, desc);
    const solved = tracksGame.solve?.(fresh, fresh);
    expect(solved?.ok).toBe(true);
    if (!solved?.ok) return;
    const done = tracksGame.executeMove(fresh, solved.move);
    expect(tracksGame.hint?.(done)).toEqual({ ok: false, error: ALREADY_SOLVED });
  });

  it("declines while a mark contradicts the solution", () => {
    const { desc } = tracksGame.newDesc(params, randomNew("refuse-wrong"));
    const fresh = tracksGame.newState(params, desc);
    // Find a square the unique solution leaves empty and claim it carries track.
    const sol = stateToBoard(fresh);
    expect(tracksSolve(sol, 3).ret).toBe(1);
    let wrong: TracksMove | null = null;
    for (let i = 0; i < params.w * params.h && !wrong; i++) {
      if (sol.sflags[i] & 1) continue;
      const x = i % params.w;
      const y = Math.floor(i / params.w);
      if (uiCanFlipSquare(stateToBoard(fresh), x, y, false)) {
        wrong = { ops: [{ kind: "square", x, y, track: true, set: true }] };
      }
    }
    expect(wrong).not.toBeNull();
    if (!wrong) return;
    const bad = tracksGame.executeMove(fresh, wrong);
    expect(tracksGame.hint?.(bad)).toEqual({ ok: false, error: FIX_MISTAKES_FIRST });
  });
});
