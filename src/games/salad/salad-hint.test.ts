/**
 * Salad's explained hint (tier 1 — pure logic).
 *
 * What the cross-game guards already cover, and this file therefore does not
 * repeat: convergence from any mid-game position, plan purity and no-op-free
 * plans (`hint-resume.test.ts`), the overlay reaching the render cache
 * (`hint-overlay.test.ts`) and narration form (`hint-quality.test.ts`) — Salad is
 * enrolled in `testing/hint-games.ts`, which buys all three.
 *
 * What is here: that each of Salad's three signature techniques actually fires
 * and narrates its own deduction, that one firing reads as one journey, that
 * every narration arm is exercised (including the two `forced*` backstops that a
 * 60-board sweep never reached), that the refusals fire, and that the recorder
 * cannot touch the board the generator sees.
 */
import { describe, expect, it } from "vitest";
import type { HintStep } from "../../engine/game.ts";
import { randomNew } from "../../engine/random/index.ts";
import { narrate, type SaladHint, symbolChar } from "./hint.ts";
import { saladGame } from "./index.ts";
import { recordSaladDeductions, saladSolution } from "./solver.ts";
import {
  CIRCLE,
  CROSS,
  DIFF_EASY,
  DIFF_HARD,
  GAMEMODE_LETTERS,
  GAMEMODE_NUMBERS,
  newState,
  type SaladParams,
  type SaladState,
  scratchBoard,
} from "./state.ts";

const LETTERS: SaladParams = {
  order: 5,
  nums: 3,
  mode: GAMEMODE_LETTERS,
  diff: DIFF_EASY,
};
const NUMBERS: SaladParams = {
  order: 5,
  nums: 3,
  mode: GAMEMODE_NUMBERS,
  diff: DIFF_EASY,
};

function board(p: SaladParams, seed: string): SaladState {
  const { desc } = saladGame.newDesc(p, randomNew(seed));
  return newState(p, desc);
}

/** Walk hints from a fresh board, applying each plan's first step, collecting
 * every narration seen along the way. */
function walk(
  p: SaladParams,
  seed: string,
  cap = 400,
): { texts: string[]; steps: HintStep<unknown, SaladHint>[]; solved: boolean } {
  let state = board(p, seed);
  const texts: string[] = [];
  const steps: HintStep<unknown, SaladHint>[] = [];
  for (let i = 0; i < cap && saladGame.status(state) === "ongoing"; i++) {
    const res = saladGame.hint?.(state);
    if (!res?.ok) break;
    for (const s of res.steps) {
      texts.push(s.explanation);
      steps.push(s as HintStep<unknown, SaladHint>);
    }
    state = saladGame.executeMove(state, res.steps[0].move);
  }
  return { texts, steps, solved: saladGame.status(state) === "solved" };
}

describe("salad hint — the three signature techniques", () => {
  it("narrates a border clue by what it sees and how far its symbol can reach", () => {
    const texts = ["b1", "b2", "b3"].flatMap((s) => walk(LETTERS, s).texts);
    // Near the clue: the first square that could hold anything must hold the
    // clue's symbol, so every other symbol is crossed out of it.
    expect(
      texts.some((t) => /sees [A-C] first.*so nothing but [A-C] can go here/.test(t)),
    ).toBe(true);
    // Past its reach: bounded by how many empty squares the line may hold.
    expect(
      texts.some((t) =>
        /sees [A-C] first, so every square before its [A-C] must be empty\. This (row|column) has room for only \d+ empty squares?/.test(
          t,
        ),
      ),
    ).toBe(true);
  });

  it("narrates a line's hole and symbol counts from their own side", () => {
    const texts = ["c1", "c2", "c3"].flatMap((s) => walk(NUMBERS, s).texts);
    expect(
      texts.some((t) =>
        /already has (its one empty square|both of its empty squares|all \d+ of its empty squares), so every other square in it must hold a number/.test(
          t,
        ),
      ),
    ).toBe(true);
    expect(
      texts.some((t) =>
        /(All \d+ numbers of this (row|column) are already placed|We already know which \d+ squares of this (row|column) hold its numbers), so every other square in it must be empty/.test(
          t,
        ),
      ),
    ).toBe(true);
  });

  it("narrates the hole/symbol synchronisation as a note collapse", () => {
    const texts = ["s1", "s2"].flatMap((s) => walk(LETTERS, s).texts);
    expect(
      texts.some((t) =>
        /The empty-square mark is the only one left in this square — every letter has been ruled out here — so it must be empty\./.test(
          t,
        ),
      ),
    ).toBe(true);
  });

  it("never emits a step it cannot name a technique for", () => {
    // The standing bar: no "just because" fallback (hint-authoring §1A). Every
    // narration must match one of the arms the game knows how to say.
    const KNOWN =
      /(sees [A-C1-9] first|empty squares?, so every other|so every other square in it must be empty|empty-square mark is the only one left|no (letter|number) can still go here|cannot be one of the empty ones|cross out their empty-square marks|ruled out in this square|can go in only this square|together, only|There's already|fixed set of|Following a chain|Start by pencilling|Now clear the easy ones)/;
    for (const p of [LETTERS, NUMBERS, { ...LETTERS, diff: DIFF_HARD }]) {
      for (const t of walk(p, "bar-1").texts) {
        expect(t, `unnamed technique: ${t}`).toMatch(KNOWN);
      }
    }
  });
});

describe("salad hint — journeys and highlights", () => {
  it("one line-count firing settling several squares is one journey", () => {
    // A count deduction settles every still-unsettled square of its line at
    // once; those legs must read as one multi-leg hint, not N unrelated ones
    // (quality-bar rule 2). Note two *different* lines produce word-for-word the
    // same narration, so sameness of text proves nothing — the flag is what
    // separates one firing from the next, and a flagged leg must always restate
    // its own firing's premise.
    let journeys = 0;
    for (const seed of ["j1", "j2", "j3", "j4"]) {
      let state = board(NUMBERS, seed);
      for (let i = 0; i < 60 && saladGame.status(state) === "ongoing"; i++) {
        const res = saladGame.hint?.(state);
        if (!res?.ok) break;
        for (let k = 1; k < res.steps.length; k++) {
          const prev = res.steps[k - 1];
          const cur = res.steps[k];
          const isMarker =
            (cur.move as { type: string; value?: unknown }).type === "set" &&
            typeof (cur.move as { value?: unknown }).value === "string";
          if (!isMarker || !cur.continuesPrevious) continue;
          // A continuation leg of a marker journey is the same firing, so it
          // carries the same premise — never glued to an unrelated deduction.
          expect(cur.explanation).toBe(prev.explanation);
          journeys++;
        }
        state = saladGame.executeMove(state, res.steps[0].move);
      }
    }
    expect(journeys, "no multi-square marker journey was seen").toBeGreaterThan(0);
  });

  it("a border step highlights its clue and the run it reasons over", () => {
    /** The two far arms both conclude *about squares past* the shaded run. */
    const isFar = (t: string): boolean =>
      /has room for only|shaded square furthest/.test(t);
    let near = 0;
    let far = 0;
    for (const seed of ["h1", "h2", "h3"]) {
      for (const step of walk(LETTERS, seed).steps) {
        if (!/sees [A-C] first/.test(step.explanation)) continue;
        const hl = step.highlights as SaladHint;
        // The premise is only visible if the clue itself is lit (design D8).
        expect(hl.clues.length).toBe(1);
        expect(hl.area.length).toBeGreaterThan(0);
        const inArea = (t: { x: number; y: number }): boolean =>
          hl.area.some((a) => a.x === t.x && a.y === t.y);
        if (isFar(step.explanation)) {
          // The run is where the clue's symbol *can* be; the struck squares lie
          // beyond it, which is exactly the deduction.
          for (const t of hl.targets) expect(inArea(t)).toBe(false);
          far++;
        } else {
          // The near arm acts on the last square of the run it walks.
          for (const t of hl.targets) expect(inArea(t)).toBe(true);
          near++;
        }
      }
    }
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(0);
  });

  it("a marker step previews the entry it asks for, a placement its symbol", () => {
    const seen = new Set<unknown>();
    for (const seed of ["g1", "g2"]) {
      for (const step of walk(NUMBERS, seed).steps) {
        const hl = step.highlights as SaladHint;
        if (hl.ghost !== undefined)
          seen.add(typeof hl.ghost === "number" ? "num" : hl.ghost);
      }
    }
    expect(seen.has("cross")).toBe(true);
    expect(seen.has("circle")).toBe(true);
    expect(seen.has("num")).toBe(true);
  });
});

describe("salad hint — narration arms", () => {
  // The two `forced*` arms are the honest weaker residue: a 60-board sweep over
  // both modes and both difficulties never reached them, because a cheaper,
  // visible reason always applied first. They stay as the backstop that keeps
  // the plan from ever being wordless, so their wording is pinned here directly.
  const s = { mode: GAMEMODE_LETTERS, order: 5, nums: 3 };

  it("states what a forced marker rests on without overclaiming", () => {
    expect(narrate({ kind: "forcedCross" }, [], s)).toBe(
      "Working through this square's row and column together, no letter can still go here — so it must be empty.",
    );
    expect(narrate({ kind: "forcedCircle" }, [], s)).toBe(
      "Working through this square's row and column together, this square cannot be one of the empty ones — so it holds a letter, even though we don't know which yet.",
    );
  });

  it("names a blocking ball when that is what bounds a clue's reach", () => {
    const t = narrate(
      {
        kind: "borderFar",
        clue: 5,
        clueVal: 3,
        reach: 2,
        holes: 2,
        tightenedBy: 0,
        circleAt: 7,
      },
      [3],
      s,
    );
    expect(t).toMatch(/shaded square furthest from it already holds a letter/);
    expect(t).toMatch(/must sit somewhere in the shaded run/);
  });

  it("reads correctly where a line holds exactly one empty square", () => {
    // §2.7's degenerate extreme: `nums = order − 1`.
    const tight = { mode: GAMEMODE_NUMBERS, order: 4, nums: 3 };
    expect(narrate({ kind: "countHolesDone", line: "row", index: 0 }, [], tight)).toBe(
      "This row already has its one empty square, so every other square in it must hold a number.",
    );
    expect(
      narrate(
        {
          kind: "borderFar",
          clue: 4,
          clueVal: 1,
          reach: 0,
          holes: 1,
          tightenedBy: 1,
          circleAt: null,
        },
        [1],
        { mode: GAMEMODE_LETTERS, order: 4, nums: 3 },
      ),
    ).toMatch(
      /one of them is already marked further along, so the A must be in the square nearest the clue/,
    );
  });

  it("speaks each mode's own value vocabulary", () => {
    expect(symbolChar(GAMEMODE_LETTERS, 3)).toBe("C");
    expect(symbolChar(GAMEMODE_NUMBERS, 3)).toBe("3");
    expect(narrate({ kind: "single" }, [1], s)).toBe(
      "Every other letter has been ruled out in this square, so it can only be A.",
    );
    expect(narrate({ kind: "single" }, [1], { ...s, mode: GAMEMODE_NUMBERS })).toBe(
      "Every other number has been ruled out in this square, so it can only be 1.",
    );
    // The shared `dup` arm picks its article by the rendered value, so a letter
    // value never reads as "a A".
    expect(narrate({ kind: "dup", n: 1, px: 0, py: 0 }, [1], s)).toMatch(
      /There's already an A in this row and column/,
    );
    expect(narrate({ kind: "dup", n: 2, px: 0, py: 0 }, [2], s)).toMatch(
      /There's already a B in this row and column/,
    );
  });
});

describe("salad hint — refusals and resumption", () => {
  it("refuses on a solved board", () => {
    const state = board(LETTERS, "r1");
    const res = saladGame.solve?.(state, state);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    const solved = saladGame.executeMove(state, res.move);
    const hinted = saladGame.hint?.(solved);
    expect(hinted?.ok).toBe(false);
    expect(hinted?.ok === false && hinted.error).toMatch(/already solved/);
  });

  it("refuses while the board holds a mistake, pointing at the overlay", () => {
    const state = board(LETTERS, "r2");
    const soln = saladSolution(state);
    expect(soln).not.toBeNull();
    // Write a symbol the unique solution contradicts.
    let wrong: SaladState | null = null;
    for (let i = 0; i < state.order * state.order && !wrong; i++) {
      if (state.gridclues[i] !== 0) continue;
      for (let n = 1; n <= state.nums; n++) {
        if (n === (soln as number[])[i]) continue;
        wrong = saladGame.executeMove(state, {
          type: "set",
          x: i % state.order,
          y: (i / state.order) | 0,
          value: n,
        });
        break;
      }
    }
    expect(wrong).not.toBeNull();
    const res = saladGame.hint?.(wrong as SaladState);
    expect(res?.ok).toBe(false);
    expect(res?.ok === false && res.error).toMatch(/highlighted mistakes/);
    expect(saladGame.findMistakes?.(wrong as SaladState).length).toBeGreaterThan(0);
  });

  it("resumes from a partly-followed plan without repeating or stalling", () => {
    const state = board(LETTERS, "r3");
    const first = saladGame.hint?.(state);
    expect(first?.ok).toBe(true);
    if (!first?.ok) return;
    // Play the plan's first two steps by hand — the app drops the stored plan on
    // a self-played move, so the next request recomputes.
    let after = state;
    const played = first.steps.slice(0, 2);
    for (const s of played) after = saladGame.executeMove(after, s.move);
    const again = saladGame.hint?.(after);
    expect(again?.ok).toBe(true);
    if (!again?.ok) return;
    const key = (m: unknown): string => JSON.stringify(m);
    for (const s of played) {
      expect(again.steps.some((n) => key(n.move) === key(s.move))).toBe(false);
    }
    // And it still makes progress.
    const next = saladGame.executeMove(after, again.steps[0].move);
    expect(key(next)).not.toBe(key(after));
  });
});

describe("salad hint — the opener never destroys the player's own notes", () => {
  it("fills only the squares that carry no mark yet", () => {
    // Owner-reported 2026-07-29: on a board with *some* pencilled squares and
    // *some* blank ones, the opener used upstream's `markAll`, which resets every
    // fillable square — throwing away deductions the player had already made.
    const state = board(LETTERS, "fill-1");
    const o = state.order;
    let s = saladGame.executeMove(state, { type: "markAll" });

    // Narrow one square's notes down (keeping the solution value, so the board
    // stays mistake-free and the hint doesn't refuse), and blank another's
    // entirely, so a fill is genuinely needed.
    const soln = saladSolution(s);
    expect(soln).not.toBeNull();
    const cells = soln as number[];
    const editable = (i: number): boolean =>
      state.gridclues[i] === 0 && s.grid[i] === 0 && s.holes[i] === 0;
    const narrow = [...cells.keys()].find((i) => editable(i) && cells[i] > 0);
    const blank = [...cells.keys()].find((i) => i !== narrow && editable(i));
    expect(narrow).toBeDefined();
    expect(blank).toBeDefined();
    const at = (i: number): { x: number; y: number } => ({ x: i % o, y: (i / o) | 0 });
    for (let n = 1; n <= state.nums; n++) {
      if (n === cells[narrow as number]) continue;
      s = saladGame.executeMove(s, {
        type: "pencil",
        ...at(narrow as number),
        value: n,
      });
    }
    s = saladGame.executeMove(s, {
      type: "pencil",
      ...at(narrow as number),
      value: "cross",
    });
    s = saladGame.executeMove(s, {
      type: "set",
      ...at(blank as number),
      value: "clear",
    });
    const narrowed = s.marks[narrow as number];
    expect(s.marks[blank as number]).toBe(0);

    const res = saladGame.hint?.(s);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    // The opener is the *additive* fill, never upstream's resetting `markAll`.
    const fill = res.steps.find(
      (step) => (step.move as { type: string }).type === "pencilAll",
    );
    expect(fill, "the plan did not open with an additive fill").toBeDefined();
    expect(
      res.steps.some((step) => (step.move as { type: string }).type === "markAll"),
    ).toBe(false);
    if (!fill) return;

    const filled = saladGame.executeMove(s, fill.move);
    expect(filled.marks[narrow as number]).toBe(narrowed);
    expect(filled.marks[blank as number]).not.toBe(0);
  });

  it("the additive `pencilAll` is idempotent where `markAll` is destructive", () => {
    const state = board(NUMBERS, "fill-2");
    const o = state.order;
    const full = saladGame.executeMove(state, { type: "markAll" });
    const i = [...full.marks.keys()].find(
      (k) => full.marks[k] !== 0 && state.gridclues[k] === 0,
    );
    expect(i).toBeDefined();
    const cell = { x: (i as number) % o, y: ((i as number) / o) | 0 };
    const narrowed = saladGame.executeMove(full, {
      type: "pencil",
      ...cell,
      value: 1,
    });
    expect(narrowed.marks[i as number]).not.toBe(full.marks[i as number]);

    // The additive fill changes nothing at all here (every square has a mark)…
    const refilled = saladGame.executeMove(narrowed, { type: "pencilAll" });
    expect(Array.from(refilled.marks)).toEqual(Array.from(narrowed.marks));
    // …where the player's own Mark-all deliberately resets it, as upstream does.
    const reset = saladGame.executeMove(narrowed, { type: "markAll" });
    expect(reset.marks[i as number]).toBe(full.marks[i as number]);
  });
});

describe("salad hint — the recorder cannot reach the generator", () => {
  it("recording leaves the board it was given untouched", () => {
    // The 28-fixture byte-match differential is the real proof that the recorder
    // is inert on the generate/solve path; this pins the narrower property that
    // the recording run itself is pure on its input.
    const state = board(LETTERS, "i1");
    const b = scratchBoard(state);
    const before = [Array.from(b.grid), Array.from(b.holes)];
    recordSaladDeductions(b, DIFF_HARD);
    expect([Array.from(b.grid), Array.from(b.holes)]).toEqual(before);
  });

  it("records the border deduction with the premise the narration cites", () => {
    const state = board(LETTERS, "i2");
    const { ops } = recordSaladDeductions(scratchBoard(state), DIFF_EASY);
    const kinds = new Set(ops.map((o) => (o.reason as { kind: string }).kind));
    expect(kinds.has("borderNear") || kinds.has("borderFar")).toBe(true);
    for (const op of ops) {
      const r = op.reason as { kind: string; clue?: number; clueVal?: number };
      if (r.kind === "borderNear" || r.kind === "borderFar") {
        expect(r.clue).toBeGreaterThanOrEqual(0);
        expect(state.borderclues[r.clue as number]).toBe(r.clueVal);
      }
    }
  });
});

describe("salad hint — the strike move", () => {
  it("clearing a pencil mark twice is a no-op, unlike the toggle", () => {
    const state = board(NUMBERS, "m1");
    const marked = saladGame.executeMove(state, { type: "markAll" });
    const mark = { x: 0, y: 0, n: 1 };
    // Pick a square the fill actually noted.
    let cell = -1;
    for (let i = 0; i < state.order * state.order; i++) {
      if (marked.marks[i] & 1) {
        cell = i;
        break;
      }
    }
    expect(cell).toBeGreaterThanOrEqual(0);
    mark.x = cell % state.order;
    mark.y = (cell / state.order) | 0;
    const once = saladGame.executeMove(marked, { type: "pencilStrike", marks: [mark] });
    const twice = saladGame.executeMove(once, { type: "pencilStrike", marks: [mark] });
    expect(Array.from(twice.marks)).toEqual(Array.from(once.marks));
    expect(once.marks[cell] & 1).toBe(0);
    // The X mark rides the same formula: `n = nums + 1` clears bit `nums`.
    const xstruck = saladGame.executeMove(marked, {
      type: "pencilStrike",
      marks: [{ x: mark.x, y: mark.y, n: state.nums + 1 }],
    });
    expect(xstruck.marks[cell] & (1 << state.nums)).toBe(0);
  });

  it("a marker step is judged followed once the square carries that marker", () => {
    const state = board(NUMBERS, "m2");
    let plan = saladGame.hint?.(state);
    let step: HintStep<unknown, SaladHint> | undefined;
    for (let i = 0; i < 40 && !step; i++) {
      if (!plan?.ok) break;
      step = plan.steps.find(
        (s) =>
          (s.move as { type: string; value?: unknown }).type === "set" &&
          typeof (s.move as { value?: unknown }).value === "string",
      ) as HintStep<unknown, SaladHint> | undefined;
      if (step) break;
      plan = saladGame.hint?.(saladGame.executeMove(state, plan.steps[0].move));
    }
    expect(step, "no marker step in any early plan").toBeDefined();
    if (!step) return;
    const move = step.move as {
      type: "set";
      x: number;
      y: number;
      value: "cross" | "circle";
    };
    expect(saladGame.hintKeepTrack?.(move, step as never, state)).toBe("completed");
    // A different marker on the same square is off-plan.
    expect(
      saladGame.hintKeepTrack?.(
        { ...move, value: move.value === "cross" ? "circle" : "cross" },
        step as never,
        state,
      ),
    ).toBe("off");
    // And the step is resolved (dropped) once the board already shows it.
    const done = saladGame.executeMove(state, move);
    expect(saladGame.refreshHintStep?.(step as never, done)).toBeNull();
    expect(done.holes[move.y * state.order + move.x]).toBe(
      move.value === "cross" ? CROSS : CIRCLE,
    );
  });
});
