/**
 * Unequal explained-hint tests.
 *
 * Tier 1 — the recording solver records a reason per technique in both modes and
 * its replayed placements complete a generated board; `hint` populates, strikes
 * (basic-Latin culls + the two-mode clue eliminations) and places with quality-bar
 * narration; refusal on solved / on mistakes; `hintKeepTrack` verdicts; resume to
 * solved in both modes. Tier 2.5 — a render-scenario snapshot of a clue-elimination
 * journey frame in each mode (struck candidate `COL_HINT`/strikethrough, evidence
 * `COL_HINT_CELL`, clue glyphs still drawn).
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_BACKGROUND, renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newUnequalDesc } from "./generator.ts";
import { unequalGame } from "./index.ts";
import { COL_HINT, COL_HINT_CELL, COL_PENCIL } from "./render.ts";
import { type HintReason, recordUnequalDeductions } from "./solver.ts";
import {
  DIFF_EXTREME,
  diffToLevel,
  encodeParams,
  newState,
  newUi,
  status,
  type UnequalMove,
  type UnequalParams,
  type UnequalState,
} from "./state.ts";

function gen(p: UnequalParams, seed: string) {
  const { desc, aux } = newUnequalDesc(p, randomNew(seed));
  return { p, desc, aux, st: newState(p, desc) };
}

// biome-ignore lint/suspicious/noExplicitAny: structural access to hint highlights/move in tests.
type AnyStep = any;

const UNEQ: UnequalParams = { order: 5, mode: "unequal", diff: "tricky" };
const ADJ: UnequalParams = { order: 5, mode: "adjacent", diff: "tricky" };

// --- tier 1: recording solver ----------------------------------------------

describe("unequal recording solver", () => {
  for (const [label, p, want] of [
    ["unequal", UNEQ, ["greater", "lesser"]],
    ["adjacent", ADJ, ["adjacent"]],
  ] as const) {
    it(`records ${label}-mode reasons and its placements complete the board`, () => {
      const { st } = gen(p, `rec-${label}`);
      const ops = recordUnequalDeductions(
        st.order,
        st.mode,
        st.clueFlags,
        Uint8Array.from(st.grid),
        Math.min(diffToLevel(p.diff), DIFF_EXTREME),
      );
      expect(ops.length).toBeGreaterThan(0);
      const kinds = new Set(ops.map((o) => (o.reason as HintReason).kind));
      // The mode's signature deduction is exercised.
      expect(want.some((k) => kinds.has(k as HintReason["kind"]))).toBe(true);

      // Replaying the placements reconstructs the full (unique) solution.
      const filled = Uint8Array.from(st.immutable);
      for (const op of ops) if (op.kind === "place") filled[op.y * st.order + op.x] = op.n;
      for (let i = 0; i < st.order * st.order; i++) expect(filled[i]).toBeGreaterThan(0);
    });
  }
});

// --- tier 1: hint plan ------------------------------------------------------

function firstHint(st: UnequalState) {
  const res = unequalGame.hint?.(st);
  if (!res) throw new Error("no hint method");
  return res;
}

describe("unequal hint", () => {
  it("populates before the first elimination", () => {
    const { st } = gen(UNEQ, "hint-empty");
    const res = firstHint(st);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const moves = res.steps.map((s) => (s.move as UnequalMove).type);
    const populateAt = moves.indexOf("pencilAll");
    const firstStrike = moves.indexOf("pencilStrike");
    expect(populateAt).toBe(0);
    expect(firstStrike).toBeGreaterThan(0);
    expect(populateAt).toBeLessThan(firstStrike);
    expect(moves.includes("set")).toBe(true);
  });

  it("skips populate once notes are present", () => {
    const { st } = gen(UNEQ, "hint-pop");
    const populated = unequalGame.executeMove(st, { type: "pencilAll" });
    const res = firstHint(populated);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect((res.steps[0].move as UnequalMove).type).not.toBe("pencilAll");
  });

  it("surfaces a naked single as the next move ahead of any elimination", () => {
    const { st } = gen(UNEQ, "hint-naked");
    const r = unequalGame.solve?.(st, st);
    if (!r?.ok || r.move.type !== "solve") throw new Error("solve failed");
    const o = st.order;
    const i = [...st.immutable].indexOf(0);
    const x = i % o;
    const y = (i / o) | 0;
    const v = r.move.grid[i];
    const populated = unequalGame.executeMove(st, { type: "pencilAll" });
    // Narrow this one cell to a single candidate (its solution value).
    const marks = [];
    for (let n = 1; n <= o; n++) if (n !== v) marks.push({ x, y, n });
    const narrowed = unequalGame.executeMove(populated, { type: "pencilStrike", marks });

    const res = unequalGame.hint?.(narrowed);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    expect(res.steps[0].move).toEqual({ type: "set", x, y, n: v, pencil: false, autoElim: true });
    expect(res.steps[0].explanation).toMatch(/can only be/);
  });

  it("every deduction conclusion uses the necessity voice", () => {
    for (const p of [UNEQ, ADJ]) {
      const { st } = gen(p, `voice-${p.mode}`);
      const populated = unequalGame.executeMove(st, { type: "pencilAll" });
      const res = unequalGame.hint?.(populated);
      expect(res?.ok).toBe(true);
      if (!res?.ok) continue;
      // A strike concludes "we must cross out …"; a placement "it can only be N";
      // never a bare "is/are/stays". (The populate step is the lone instruction.)
      const modal = /can only|can't|must (be|cross out)/i;
      for (const s of res.steps) {
        if ((s.move as UnequalMove).type === "pencilAll") continue;
        expect(s.explanation).toMatch(modal);
      }
    }
  });

  it("differ-by-1 narration reads correctly at the value extremes", () => {
    // §2.7: the adjacency clue must never say "N−1 or N+1" (wrong at N=1 or N=o);
    // it says "one away from N".
    const { st } = gen(ADJ, "adj-extreme");
    const populated = unequalGame.executeMove(st, { type: "pencilAll" });
    const res = unequalGame.hint?.(populated);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    for (const s of res.steps) {
      expect(s.explanation).not.toMatch(/-\s*1 or|\+\s*1/);
    }
  });

  it("auto-pencil on folds away the trivial row/column eliminations a placement implies", () => {
    const { st } = gen(UNEQ, "hint-autopencil");
    const populated = unequalGame.executeMove(st, { type: "pencilAll" });
    const dupRe = /from the other cells they pass through/;

    const uiOn = newUi(populated);
    uiOn.autoPencil = true;
    const on = unequalGame.hint?.(populated, undefined, uiOn);
    const uiOff = newUi(populated);
    uiOff.autoPencil = false;
    const off = unequalGame.hint?.(populated, undefined, uiOff);
    expect(on?.ok && off?.ok).toBe(true);
    if (!on?.ok || !off?.ok) return;

    // The basic-Latin opening culls (givens) use the same dup narration in both,
    // so compare the *count*: with auto-pencil off, each placement also teaches
    // its row/column cleanup, so there are strictly more dup steps.
    const dupCount = (r: typeof on) =>
      r.steps.filter((s) => dupRe.test(s.explanation)).length;
    expect(dupCount(off)).toBeGreaterThan(dupCount(on));
    expect(off.steps.length).toBeGreaterThan(on.steps.length);
  });

  it("a clue-strike step's marks all lie in its narrated cell (no bleed)", () => {
    let checked = 0;
    for (const p of [UNEQ, ADJ]) {
      for (let s = 0; s < 8; s++) {
        const { st } = gen(p, `bleed-${p.mode}-${s}`);
        const res = unequalGame.hint?.(st);
        if (!res?.ok) continue;
        for (const step of res.steps as AnyStep[]) {
          if (step.move.type !== "pencilStrike") continue;
          const marks = step.move.marks as { x: number; y: number; n: number }[];
          // A clue strike (greater/lesser/adjacent/adjacentSet) shades two evidence
          // cells and acts on exactly one of them; every mark is in that one cell.
          const area: { x: number; y: number }[] = step.highlights?.area ?? [];
          if (area.length !== 2) continue; // basic-Latin/dup steps shade ≤1
          const cells = new Set(marks.map((m) => `${m.x},${m.y}`));
          expect(cells.size).toBe(1);
          for (const m of marks) {
            expect(area.some((a) => a.x === m.x && a.y === m.y)).toBe(true);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("refuses on a solved board and on a board with mistakes", () => {
    const { st } = gen(UNEQ, "hint-refuse");
    const r = unequalGame.solve?.(st, st);
    if (!r?.ok) throw new Error("solve failed");
    const solved = unequalGame.executeMove(st, r.move);
    expect(unequalGame.hint?.(solved).ok).toBe(false);

    const o = st.order;
    const empty = [...st.immutable].indexOf(0);
    const sol = (r.move as { type: "solve"; grid: number[] }).grid;
    const wrong = (sol[empty] % o) + 1;
    const bad = unequalGame.executeMove(st, {
      type: "set",
      x: empty % o,
      y: (empty / o) | 0,
      n: wrong,
      pencil: false,
    });
    expect(unequalGame.hint?.(bad).ok).toBe(false);
  });
});

// --- tier 1: keep-track -----------------------------------------------------

describe("unequal hintKeepTrack", () => {
  it("matches a populate step, rejects anything else", () => {
    const { st } = gen(UNEQ, "kt-pop");
    const res = firstHint(st);
    if (!res.ok) throw new Error("refused");
    const step = res.steps.find((s) => (s.move as UnequalMove).type === "pencilAll");
    if (!step) throw new Error("no populate step");
    expect(unequalGame.hintKeepTrack?.({ type: "pencilAll" }, step, st)).toBe("completed");
    expect(
      unequalGame.hintKeepTrack?.({ type: "set", x: 0, y: 0, n: 1, pencil: false }, step, st),
    ).toBe("off");
  });

  it("shrinks then finishes a multi-mark strike journey", () => {
    const { st } = gen(UNEQ, "kt-strike");
    const populated = unequalGame.executeMove(st, { type: "pencilAll" });
    const res = unequalGame.hint?.(populated);
    if (!res?.ok) throw new Error("hint refused");
    const step = res.steps.find(
      (s) => (s.move as UnequalMove).type === "pencilStrike" &&
        (s.move as { type: "pencilStrike"; marks: unknown[] }).marks.length >= 2,
    ) as AnyStep | undefined;
    if (!step) throw new Error("no multi-mark strike step");

    const marks = [...step.move.marks] as { x: number; y: number; n: number }[];
    // Clear the first mark via a pencil toggle (the production strike path).
    const first = marks[0];
    const v1 = unequalGame.hintKeepTrack?.(
      { type: "set", x: first.x, y: first.y, n: first.n, pencil: true },
      step,
      populated,
    );
    expect(v1).toBe("onTrack");
    expect((step.move as { marks: unknown[] }).marks.length).toBe(marks.length - 1);

    // Apply that toggle, then clear the remaining marks one by one to "completed".
    let cur = unequalGame.executeMove(populated, {
      type: "set",
      x: first.x,
      y: first.y,
      n: first.n,
      pencil: true,
    });
    for (let k = 1; k < marks.length; k++) {
      const mk = marks[k];
      const v = unequalGame.hintKeepTrack?.(
        { type: "set", x: mk.x, y: mk.y, n: mk.n, pencil: true },
        step,
        cur,
      );
      expect(v).toBe(k === marks.length - 1 ? "completed" : "onTrack");
      cur = unequalGame.executeMove(cur, { type: "set", x: mk.x, y: mk.y, n: mk.n, pencil: true });
    }
  });
});

// --- tier 1: resume to solved (both modes) ----------------------------------

describe("unequal hint resumes to solved", () => {
  for (const p of [UNEQ, ADJ]) {
    it(`completes a fresh ${p.mode}-mode board one recomputed hint at a time`, () => {
      const { st: start, aux } = gen(p, `resume-${p.mode}`);
      let state = start;
      for (let moves = 0; moves < 600; moves++) {
        if (status(state) === "solved") return;
        const res = unequalGame.hint?.(state, aux);
        expect(res?.ok).toBe(true);
        if (!res?.ok) throw new Error(`gave up: ${res?.error}`);
        state = unequalGame.executeMove(state, res.steps[0].move);
      }
      throw new Error("did not converge");
    });
  }
});

// --- tier 2.5: render ------------------------------------------------------

/** Scan seeds for an id whose hint, after populating, reaches a clue-strike step
 * matching `pred` — so the render frame is deterministic without a known desc. */
function clueStrikeFrame(p: UnequalParams, pred: (s: string) => boolean): string {
  for (let s = 0; s < 30; s++) {
    const seed = `frame-${p.mode}-${s}`;
    const { st } = gen(p, seed);
    const populated = unequalGame.executeMove(st, { type: "pencilAll" });
    const res = unequalGame.hint?.(populated);
    if (!res?.ok) continue;
    if (res.steps.some((step) => (step.move as UnequalMove).type === "pencilStrike" && pred(step.explanation)))
      return `${encodeParams(p, true)}#${seed}`;
  }
  throw new Error(`no clue-strike frame found for ${p.mode}`);
}

describe("unequal hint render", () => {
  it("an Unequal-mode link elimination shades the pair and strikes the candidate", () => {
    const id = clueStrikeFrame(UNEQ, (e) => /greater-than sign/.test(e));
    const { recording, hint } = renderScenario({
      game: unequalGame,
      id,
      defaultBackground: DEFAULT_BACKGROUND,
      moves: [{ type: "pencilAll" }],
      showHint: true,
      hintUntil: (s) => /greater-than sign/.test(s.explanation),
    });
    expect(hint?.explanation).toMatch(/greater-than sign/);
    // The two clue cells are shaded COL_HINT_CELL evidence.
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_HINT_CELL)).toBe(true);
    // The struck candidate keeps its COL_PENCIL digit, crossed through in COL_PENCIL.
    expect(recording.ops.some((o) => o.op === "line" && o.colour === COL_PENCIL)).toBe(true);
    expect(recording.ops.some((o) => o.op === "text" && o.colour === COL_PENCIL)).toBe(true);
    // A strike cell is NOT solid-filled COL_HINT (that is the placement-target fill).
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_HINT)).toBe(false);
    // Clue glyphs (the > polygons) are still drawn.
    expect(recording.ops.some((o) => o.op === "polygon")).toBe(true);
    expect(recording.ops).toMatchSnapshot();
  });

  it("an Adjacent-mode elimination shades the pair and strikes the candidate", () => {
    const id = clueStrikeFrame(ADJ, (e) => /bar/.test(e));
    const { recording, hint } = renderScenario({
      game: unequalGame,
      id,
      defaultBackground: DEFAULT_BACKGROUND,
      moves: [{ type: "pencilAll" }],
      showHint: true,
      hintUntil: (s) => /bar/.test(s.explanation),
    });
    expect(hint?.explanation).toMatch(/bar/);
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_HINT_CELL)).toBe(true);
    expect(recording.ops.some((o) => o.op === "line" && o.colour === COL_PENCIL)).toBe(true);
    expect(recording.ops).toMatchSnapshot();
  });
});
