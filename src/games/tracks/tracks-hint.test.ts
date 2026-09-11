/**
 * Tracks' explained hint: the claims its narration makes, and the two things
 * only this game can check.
 *
 * The cross-game guards already cover narration *form* (necessity voice, the
 * length limit, no em-dash), plan purity, no-op-free plans and the overlay
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
 *  - **what the plan hides is exactly what the player's board already says.**
 *    The production predicate reads board facts; these guards hold it to the
 *    game's own move legality, judged on the board *before* each firing landed,
 *    so the two derivations are independent. It is also what would catch
 *    `check-single` if it ever started firing: its conclusions are real, and a
 *    reason-less firing that is not evident fails here.
 */

import { describe, expect, it } from "vitest";
import { ALREADY_SOLVED, FIX_MISTAKES_FIRST } from "../../engine/hint-refusal.ts";
import { randomNew } from "../../engine/random/index.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import { evident, narrate, type TracksHighlights } from "./hint.ts";
import { tracksGame } from "./index.ts";
import { uiCanFlipEdge, uiCanFlipSquare } from "./moves.ts";
import {
  type TracksFiring,
  type TracksReason,
  tracksRecordingPass,
  tracksSolve,
} from "./solver.ts";
import {
  type Board,
  D,
  DIFF_EASY,
  DIFF_HARD,
  DIFF_TRICKY,
  DX,
  DY,
  E_TRACK,
  inGrid,
  R,
  S_TRACK,
  sEDirs,
  sEFlags,
  stateToBoard,
  type TracksMove,
  type TracksOp,
  type TracksParams,
  type TracksState,
  U,
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

/**
 * Would the game refuse the player the *opposite* of this op, on the board
 * before it landed? The derivation the production `evident` is held to: it
 * asks `uiCanFlipSquare` / `uiCanFlipEdge` directly rather than reading board
 * facts, so the two are independent. Judged *before*, because after the op
 * lands its own flag is what makes the contrary illegal, and every block would
 * read as evident.
 */
function contraryRefused(before: Board, op: TracksOp): boolean {
  return op.kind === "square"
    ? !uiCanFlipSquare(before, op.x, op.y, op.track)
    : !uiCanFlipEdge(before, op.x, op.y, op.dir ?? 0, op.track);
}

/** Every firing the recording pass makes on a fresh board, each with the board
 * as it stood before the firing and as it stands straight after. */
function* recordedFirings(
  params: TracksParams,
  seed: string,
): Generator<{ f: TracksFiring; before: Board; after: Board }> {
  const { desc } = tracksGame.newDesc(params, randomNew(seed));
  const board = stateToBoard(tracksGame.newState(params, desc));
  const next = tracksRecordingPass(board, params.diff, stepBudget("probe"));
  for (;;) {
    const before: Board = { ...board, sflags: Int32Array.from(board.sflags) };
    const f = next();
    if (!f) return;
    // Consumed before the next `next()` call, so `after` is this firing's board.
    yield { f, before, after: board };
  }
}

describe("what the plan hides is exactly what the board already says", () => {
  it("every firing with no premise is one the player's board already decides", () => {
    // The declaration, held to the derivation. The reason-less rules are a
    // list somebody wrote; this is what makes it impossible for the list to
    // hide a real deduction — including `check-single`, whose conclusions are
    // real, should it ever start firing.
    let reasonless = 0;
    for (const params of SHAPES) {
      for (const seed of SEEDS) {
        for (const { f, before } of recordedFirings(
          params,
          `hide-${params.w}-${params.diff}-${seed}`,
        )) {
          if (f.reason !== null) continue;
          reasonless++;
          for (const op of f.ops) {
            expect(
              contraryRefused(before, op),
              `${JSON.stringify(op)} was hidden but the player could have chosen otherwise`,
            ).toBe(true);
          }
        }
      }
    }
    expect(
      reasonless,
      "no reason-less firing; the guard proves nothing",
    ).toBeGreaterThan(100);
  });

  it("the production predicate and the legality test agree on every firing", () => {
    let firings = 0;
    let evidentSeen = 0;
    for (const params of SHAPES) {
      for (const seed of SEEDS) {
        for (const { f, before, after } of recordedFirings(
          params,
          `agree-${params.w}-${params.diff}-${seed}`,
        )) {
          firings++;
          const byFacts = f.ops.every((op) => evident(after, op));
          const byLegality = f.ops.every((op) => contraryRefused(before, op));
          if (byLegality) evidentSeen++;
          expect(byFacts, `${JSON.stringify(f.ops)}`).toBe(byLegality);
        }
      }
    }
    // Both classes, or agreement is vacuous on one side.
    expect(evidentSeen).toBeGreaterThan(50);
    expect(firings - evidentSeen).toBeGreaterThan(50);
  });

  it("no step a player is shown is one their board already decides", () => {
    // A guard over what reaches the screen: no step asks for sides the player
    // has already closed off. Every op, not just the step as a whole, so a step
    // cannot smuggle a redundant op in beside a real one.
    let shown = 0;
    for (const params of SHAPES) {
      for (const seed of SEEDS) {
        const { steps } = walk(params, `shown-${params.w}-${params.diff}-${seed}`);
        for (const { step, before } of steps) {
          shown++;
          const b = stateToBoard(before);
          for (const op of step.move.ops) {
            expect(
              contraryRefused(b, op),
              `"${step.explanation}" asks for ${JSON.stringify(op)}, which the board already decides`,
            ).toBe(false);
          }
        }
      }
    }
    expect(shown).toBeGreaterThan(200);
  });

  it("the reported board: a finished piece beside squares marked empty gets no step about its sides", () => {
    // The entrance's piece is given, and the player marks the squares beyond
    // its two free sides empty; no step may then ask them to block those sides.
    let checked = 0;
    for (let s = 0; s < 40 && checked < 3; s++) {
      const params = SHAPES[1];
      const { desc } = tracksGame.newDesc(params, randomNew(`reported-${s}`));
      const fresh = tracksGame.newState(params, desc);
      const solution = stateToBoard(fresh);
      if (tracksSolve(solution, DIFF_HARD).ret !== 1) continue;
      const b = stateToBoard(fresh);
      const ax = 0;
      const ay = b.rowS;
      const beyond: TracksOp[] = [];
      for (const d of [U, D, R]) {
        if (sEFlags(b, ax, ay, d) & E_TRACK) continue; // the piece's own side
        const nx = ax + DX(d);
        const ny = ay + DY(d);
        if (!inGrid(b, nx, ny) || solution.sflags[ny * b.w + nx] & S_TRACK) continue;
        beyond.push({ kind: "square", x: nx, y: ny, track: false, set: true });
      }
      if (beyond.length < 2) continue;
      const res = tracksGame.hint?.(tracksGame.executeMove(fresh, { ops: beyond }));
      if (!res?.ok) continue;
      checked++;
      for (const step of res.steps) {
        for (const op of step.move.ops) {
          if (op.kind !== "edge" || op.track) continue;
          const d = op.dir ?? 0;
          const touches =
            (op.x === ax && op.y === ay) ||
            (op.x + DX(d) === ax && op.y + DY(d) === ay);
          expect(touches, `"${step.explanation}" blocks a side of the entrance`).toBe(
            false,
          );
        }
      }
    }
    expect(checked, "no seed reproduced the reported shape").toBeGreaterThan(0);
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
        const m = step.explanation.match(
          /^Every time the track enters the outlined block/,
        );
        if (!m) continue;
        checked++;
        const said = /with none marked yet/.test(step.explanation)
          ? 0
          : Number(step.explanation.match(/with (\d+) crossings? marked/)?.[1]);
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
 * against it), so an arm without a reason would not vanish, it would be hidden
 * from the player instead of taught — which the first guard in "what the plan
 * hides" would then catch. What they lose by being unreachable is the corpus's check
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
        const next = tracksRecordingPass(board, params.diff, stepBudget("cover"));
        for (;;) {
          const f = next();
          if (!f) break;
          firings++;
          if (f.reason) seen.add(f.reason.kind);
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
      "with only two of its sides still open", // bothSidesLeft
      "Only one side of this square is still open", // onlyOneSideLeft
      "the track squares its clue allows", // clueFull
      "can leave only", // clueExact
      "would close a loop", // wouldCloseLoop
      "stranding the outlined track", // wouldStrandTrack
      "this loose end must run straight on", // looseEndSpans
      "Track here would carry on", // sharedFate, fill arm
      "No track here means none", // sharedFate, empty arm
      "enters the outlined block it must leave", // crossingParity
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
    expect(say({ kind: "onlyOneSideLeft", x: 0, y: 0, open: 1, ev })).toMatch(
      /only one side/i,
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
    // "all 2 of" is grammatical and reads wrong.
    b0.numbers[0] = 2;
    expect(narrate(b0, { kind: "clueFull", line: 0, ev })).toContain(
      "both of the track squares its clue allows",
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
    expect(s).toContain("with none marked yet");
    expect(s).not.toMatch(/\b0 crossings?\b/);
    expect(s).toContain("must be blocked");
    expect(
      say({ kind: "crossingParity", x: 0, y: 0, dir: 8, crossings: 1, ev }),
    ).toContain("with 1 crossing marked");
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
    expect(both).toContain("this must be empty, the next track");
    expect(both).toContain("the next track");
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
    // The contrary of an op the step asks for: same place, the other fate.
    const asked = step.move.ops[0];
    const foreign: TracksMove = { ops: [{ ...asked, track: !asked.track }] };
    expect(step.move.ops).not.toContainEqual(foreign.ops[0]);
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
