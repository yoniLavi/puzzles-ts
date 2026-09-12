/**
 * Sticks hint tests: the five contradiction kinds and
 * their narrations, the evidence areas counting out against the sentences,
 * journey grouping on a generated board, resume from a self-played position,
 * refusal on a wrong board, and tier-2.5 render frames for every kind.
 *
 * The cross-game guards (resume convergence, plan purity, no-op-free plans,
 * overlay repaint, narration voice/length) come from the enrollment in
 * `engine/testing/hint-games.ts` and are deliberately not duplicated here.
 */
import { describe, expect, it } from "vitest";
import { randomNew } from "../../engine/random/index.ts";
import { isThin, markSides } from "../../engine/testing/mark-shape.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { newSticksDesc } from "./generator.ts";
import { sticksGame } from "./index.ts";
import { COL_HINT, COL_HINT_CELL, COL_LINE } from "./render.ts";
import {
  deduceSticksPlan,
  newScratch,
  type SticksReason,
  sticksValidate,
} from "./solver.ts";
import {
  defaultParams,
  F_BLOCK,
  F_HOR,
  F_VER,
  newState,
  type SticksState,
} from "./state.ts";

const PARAMS = defaultParams();
const PARAM_STR = `${PARAMS.w}x${PARAMS.h}b${PARAMS.blackpc}s${PARAMS.symm}`;

/** A fixed-seed board — deterministic, so every test below names a real
 * generated position rather than a crafted one. */
function board(seed: number): { id: string; state: SticksState } {
  const { desc } = newSticksDesc(PARAMS, randomNew(String(seed)));
  return { id: `${PARAM_STR}:${desc}`, state: newState(PARAMS, desc) };
}

const KINDS = [
  "tooLong",
  "unreachable",
  "twoClues",
  "overConnected",
  "starved",
] as const;

/** Phrases only one narration branch ever utters — a loose predicate stops a
 * `hintUntil` walk on the wrong frame. */
const PHRASE: Record<SticksReason["kind"], RegExp> = {
  tooLong: /too long for it/,
  unreachable: /needs a longer line/,
  twoClues: /(?:into|on) one line\./,
  overConnected: /already has its \d+ lines?|takes no lines/,
  starved: /needs (?:all \d+|both) of its open sides|has one open side left/,
};

/** The first fixed seed whose opening plan contains each kind. Scanned once. */
const SEED_FOR: Record<SticksReason["kind"], number> = (() => {
  const found: Record<string, number> = {};
  for (let seed = 0; seed < 40 && Object.keys(found).length < KINDS.length; seed++) {
    const plan = deduceSticksPlan(board(seed).state).flat();
    for (const f of plan) if (!(f.reason.kind in found)) found[f.reason.kind] = seed;
  }
  return found as Record<SticksReason["kind"], number>;
})();

describe("sticks hint — technique coverage", () => {
  it("every one of the five contradiction kinds fires on generated boards", () => {
    // A rung that never fires is a rung nothing tests. Sticks' five
    // are the whole of `sticksValidate`'s vocabulary, so this is also the
    // check that the classifier is total.
    expect(Object.keys(SEED_FOR).sort()).toEqual([...KINDS].sort());
  });

  it("the deduction narrates every board to completion — no un-narrated residue", () => {
    for (let seed = 0; seed < 6; seed++) {
      const { state } = board(seed);
      const blanks = [...state.grid].filter((t) => t === 0).length;
      const cells = deduceSticksPlan(state).flat().length;
      // The plan is capped for UX, so it either solves the board or hits the cap.
      expect(cells).toBeGreaterThanOrEqual(Math.min(blanks, 40));
    }
  });
});

describe("sticks hint — narration", () => {
  const stepsFor = (seed: number) => {
    const r = sticksGame.hint?.(board(seed).state);
    if (!r?.ok) throw new Error("expected a hint");
    return r.steps;
  };

  it("states its conclusion in the necessity voice, naming the orientation", () => {
    for (const kind of KINDS) {
      const s = stepsFor(SEED_FOR[kind]).find((x) => PHRASE[kind].test(x.explanation));
      expect(s, kind).toBeDefined();
      expect(s?.explanation, kind).toMatch(/ must be (horizontal|vertical)\.$/);
    }
  });

  it("names the clue by the number the player can see, never a bare pronoun", () => {
    for (let seed = 0; seed < 6; seed++) {
      for (const s of stepsFor(seed)) {
        expect(s.explanation).toMatch(/\d/);
        expect(s.explanation).not.toMatch(/^(It|They|This is)\b/);
      }
    }
  });

  it("a black 0's continuation never claims another line already runs into it", () => {
    // "As well" is true at every clue value except the one where the rule is
    // starkest: a black 0 has no line running into it at all.
    let seen = 0;
    for (let seed = 0; seed < 12; seed++) {
      for (const s of stepsFor(seed)) {
        if (/The black 0/.test(s.explanation)) {
          expect(s.explanation).not.toMatch(/as well|another/);
          seen++;
        }
      }
    }
    expect(seen, "no step narrated a black 0 — the phrase has changed").toBeGreaterThan(
      0,
    );
  });

  it("says which orientation is being ruled out, and it is not the forced one", () => {
    for (let seed = 0; seed < 6; seed++) {
      for (const s of stepsFor(seed)) {
        const forced = /must be (horizontal|vertical)\.$/.exec(s.explanation)?.[1];
        // "here" is optional: a continuation leg drops it, since the opening
        // leg already located the move.
        const ruledOut = /[Aa] (horizontal|vertical) line\b/.exec(s.explanation)?.[1];
        expect(ruledOut, s.explanation).toBeDefined();
        expect(ruledOut, s.explanation).not.toBe(forced);
      }
    }
  });
});

describe("sticks hint — evidence counts out against the words", () => {
  const reasons = (seed: number): SticksReason[] =>
    deduceSticksPlan(board(seed).state)
      .flat()
      .map((f) => f.reason);

  it("every step shows evidence on the board", () => {
    for (let seed = 0; seed < 6; seed++) {
      const r = sticksGame.hint?.(board(seed).state);
      if (!r?.ok) throw new Error("expected a hint");
      for (const s of r.steps) {
        const hl = s.highlights as { target: number; evidence: number[] };
        expect(hl.evidence.length, s.explanation).toBeGreaterThan(0);
        // A black clue's counted lines never include the one being ruled out.
        if (/black/.test(s.explanation)) expect(hl.evidence).not.toContain(hl.target);
      }
    }
  });

  it("a length argument shades exactly the run it narrates", () => {
    let seen = 0;
    for (let seed = 0; seed < 12; seed++) {
      for (const r of reasons(seed)) {
        if (r.kind === "tooLong") {
          expect(r.segment.length).toBe(r.size);
          seen++;
        }
      }
    }
    expect(seen, "no `tooLong` reason fired across twelve seeds").toBeGreaterThan(0);
  });

  it("a reachability argument shades exactly the span the walk covered", () => {
    // The span is the premise, so an approximated one would make the sentence
    // false. It is also the *quirked* walk's span, deliberately.
    let seen = 0;
    for (let seed = 0; seed < 12; seed++) {
      for (const r of reasons(seed)) {
        if (r.kind === "unreachable") {
          expect(r.span.length).toBe(r.max);
          expect(r.max).toBeLessThan(r.value);
          seen++;
        }
      }
    }
    expect(seen, "no `unreachable` reason fired across twelve seeds").toBeGreaterThan(
      0,
    );
  });

  it("a black clue's argument marks as many sides as it claims", () => {
    let seen = 0;
    for (let seed = 0; seed < 12; seed++) {
      for (const r of reasons(seed)) {
        // Counted on the trial board: over-connected has gained the offending
        // line (value + 1), starved has just lost one of its value open sides.
        if (r.kind === "overConnected") {
          expect(r.lines.length).toBe(r.value + 1);
          seen++;
        }
        if (r.kind === "starved") {
          expect(r.open.length).toBe(r.value - 1);
          seen++;
        }
      }
    }
    expect(seen, "neither black-clue reason fired across twelve seeds").toBeGreaterThan(
      0,
    );
  });

  it("a two-numbers argument names both numbers and shades the run holding them", () => {
    let seen = 0;
    for (let seed = 0; seed < 12; seed++) {
      for (const r of reasons(seed)) {
        if (r.kind !== "twoClues") continue;
        expect(r.clues.length).toBeGreaterThanOrEqual(2);
        for (const c of r.clues) expect(r.segment).toContain(c);
        seen++;
      }
    }
    expect(seen, "no `twoClues` reason fired across twelve seeds").toBeGreaterThan(0);
  });
});

describe("sticks hint — grouping", () => {
  it("groups one firing into one journey, on a generated board", () => {
    // Validated by scanning seeds, not by reading the solver:
    // ~a fifth of firings decide more than one square, and a black clue that
    // has run out of lines is the commonest.
    let journeys = 0;
    for (let seed = 0; seed < 12 && journeys === 0; seed++) {
      for (const group of deduceSticksPlan(board(seed).state)) {
        if (group.length < 2) continue;
        journeys++;
        const first = group[0].reason;
        for (const f of group) {
          expect(f.reason.kind).toBe(first.kind);
          if (f.reason.kind !== "twoClues" && first.kind !== "twoClues")
            expect(f.reason.clue).toBe(first.clue);
        }
      }
    }
    expect(journeys).toBeGreaterThan(0);
  });

  it("a journey's first leg opens it and the rest continue it", () => {
    for (let seed = 0; seed < 6; seed++) {
      const r = sticksGame.hint?.(board(seed).state);
      if (!r?.ok) throw new Error("expected a hint");
      expect(r.steps[0].continuesPrevious).toBe(false);
      for (const s of r.steps) {
        if (s.continuesPrevious)
          expect(s.explanation).toMatch(/rules this square out too|same numbers/);
      }
    }
  });
});

describe("sticks hint — lifecycle", () => {
  it("resumes from a position the player reached by their own moves", () => {
    // Sticks rescans every blank square on every call rather than propagating
    // from what it changed, so it needs no cascade priming — the assumption
    // Singles shipped a bug on, so it is evidenced rather than assumed.
    const { state } = board(3);
    let cur = state;
    // Play the first few forced squares by hand, out of the plan's order.
    const plan = deduceSticksPlan(cur).flat();
    for (const f of [plan[2], plan[0], plan[5]]) {
      cur = sticksGame.executeMove(cur, {
        kind: "set",
        changes: [{ index: f.index, line: f.to }],
      });
    }
    const r = sticksGame.hint?.(cur);
    expect(r?.ok).toBe(true);
    if (!r?.ok) return;
    expect(r.steps.length).toBeGreaterThan(0);
    // And it does not re-suggest anything already on the board.
    for (const s of r.steps) {
      const hl = s.highlights as { target: number };
      expect(cur.grid[hl.target] & (F_HOR | F_VER | F_BLOCK)).toBe(0);
    }
  });

  it("refuses on a wrong board, with the mistake highlighted", () => {
    const { state } = board(1);
    const plan = deduceSticksPlan(state).flat();
    const wrong = plan[0];
    const bad = sticksGame.executeMove(state, {
      kind: "set",
      changes: [{ index: wrong.index, line: wrong.to === "hor" ? "ver" : "hor" }],
    });
    const r = sticksGame.hint?.(bad);
    expect(r?.ok).toBe(false);
    if (r?.ok === false) expect(r.error).toMatch(/mistakes/);
    // The refusal is only useful because findMistakes lights the square.
    expect(sticksGame.findMistakes?.(bad)).toContainEqual({ index: wrong.index });
  });

  it("refuses a solved board", () => {
    const { state } = board(1);
    const r = sticksGame.hint?.({ ...state, completed: true });
    expect(r?.ok).toBe(false);
  });

  it("follows a step only when the hinted square gets the hinted orientation", () => {
    const { state } = board(1);
    const r = sticksGame.hint?.(state);
    if (!r?.ok) throw new Error("expected a hint");
    const step = r.steps[0];
    const hl = step.highlights as { target: number; to: "hor" | "ver" };
    const other = hl.to === "hor" ? "ver" : "hor";
    expect(
      sticksGame.hintKeepTrack?.(
        { kind: "set", changes: [{ index: hl.target, line: hl.to }] },
        step,
        state,
      ),
    ).toBe("completed");
    expect(
      sticksGame.hintKeepTrack?.(
        { kind: "set", changes: [{ index: hl.target, line: other }] },
        step,
        state,
      ),
    ).toBe("off");
  });
});

describe("sticks hint — recording stays off the solve path", () => {
  it("collecting reasons does not change a single verdict", () => {
    // The generator's byte-identity rests on this, and the differential is the
    // other half of the check: `nextSticksFiring` is a parallel function, so
    // the only shared surface is `sticksValidate`'s extra out-param.
    let compared = 0;
    for (let seed = 0; seed < 6; seed++) {
      const { state } = board(seed);
      const { w, h, numbers } = state;
      const grid = state.grid.slice();
      const scratch = newScratch(w * h);
      for (let i = 0; i < w * h; i++) {
        if (grid[i] & F_BLOCK) continue;
        for (const bit of [F_HOR, F_VER]) {
          grid[i] = bit;
          const plain = sticksValidate(grid, numbers, w, h, scratch);
          const recorded = sticksValidate(grid, numbers, w, h, scratch, undefined, []);
          expect(recorded).toBe(plain);
          compared++;
        }
        grid[i] = 0;
      }
    }
    // Six all-block fixtures would compare nothing and pass.
    expect(compared).toBeGreaterThan(100);
  });
});

describe("sticks hint — render frames (tier 2.5)", () => {
  for (const kind of KINDS) {
    it(`draws the forced line and its evidence for a ${kind} deduction`, () => {
      const { id } = board(SEED_FOR[kind]);
      const result = renderScenario({
        game: sticksGame,
        id,
        showHint: true,
        hintUntil: (step) => PHRASE[kind].test(step.explanation),
      });
      expect(result.hint?.explanation).toMatch(PHRASE[kind]);
      const ops = result.recording.ops;
      // The forced square is drawn as a bar in the hint color — the game's own
      // line shape, which a plain tint could not give an orientation.
      const bars = ops.filter((o) => o.op === "rect" && o.color === COL_HINT);
      expect(bars.length).toBe(1);
      const bar = bars[0];
      if (bar.op !== "rect") throw new Error("unreachable");
      // A bar, not a square: its long axis *is* the orientation being hinted.
      expect(bar.w === bar.h).toBe(false);
      // …and the evidence as an area, not a single premise square, drawn
      // as a **ring per square** — never a wash, on a white square or a black
      // one: a white evidence square carries the clue the deduction counts with.
      const evidence = markSides(ops, COL_HINT_CELL);
      expect(evidence.length).toBeGreaterThanOrEqual(4);
      expect(evidence.length % 4).toBe(0);
      for (const s of evidence) expect(isThin(s)).toBe(true);
      // Clue numbers stay drawn under the overlay.
      expect(ops.some((o) => o.op === "text")).toBe(true);
      expect(ops).toMatchSnapshot();
    });
  }

  it("never draws the forced line in the placed-line color", () => {
    // The hint shows where and which, it does not perform the move. On a
    // fresh board no line is placed, so any COL_LINE bar would be a preview.
    const { id } = board(SEED_FOR.tooLong);
    const result = renderScenario({ game: sticksGame, id, showHint: true });
    expect(
      result.recording.ops.some((o) => o.op === "rect" && o.color === COL_LINE),
    ).toBe(false);
  });
});
