/**
 * Keen explained-hint tests.
 *
 * Tier 1 — the recording solver records a cage reason per firing and its replayed
 * placements complete a generated board; `hint` populates, strikes (cage
 * eliminations + basic-Latin culls) and places with quality-bar narration; refusal
 * on solved / on mistakes; `hintKeepTrack` verdicts. Tier 2.5 — a render-scenario
 * snapshot of a cage-elimination journey frame (struck candidate `COL_PENCIL`
 * strikethrough, evidence `COL_HINT_CELL`, cage clue glyphs still drawn).
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_BACKGROUND, renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newKeenDesc } from "./generator.ts";
import { keenGame } from "./index.ts";
import { COL_HINT, COL_HINT_CELL, COL_PENCIL } from "./render.ts";
import { type HintReason, recordKeenDeductions } from "./solver.ts";
import {
  DIFF_EXTREME,
  diffToLevel,
  encodeParams,
  type KeenMove,
  type KeenParams,
  type KeenState,
  newState,
  newUi,
  status,
} from "./state.ts";

function gen(p: KeenParams, seed: string) {
  const { desc, aux } = newKeenDesc(p, randomNew(seed));
  return { p, desc, aux, st: newState(p, desc) };
}

// biome-ignore lint/suspicious/noExplicitAny: structural access to hint highlights/move in tests.
type AnyStep = any;

const NORMAL: KeenParams = { w: 6, diff: "normal", multiplicationOnly: false };
const HARD: KeenParams = { w: 6, diff: "hard", multiplicationOnly: false };

// --- tier 1: recording solver ----------------------------------------------

describe("keen recording solver", () => {
  it("records a cage reason and its placements complete the board", () => {
    const { st } = gen(NORMAL, "rec-normal");
    const ops = recordKeenDeductions(
      st.params.w,
      st.clues,
      Uint8Array.from(st.grid),
      Math.min(diffToLevel(NORMAL.diff), DIFF_EXTREME),
    );
    expect(ops.length).toBeGreaterThan(0);
    const kinds = new Set(ops.map((o) => (o.reason as HintReason).kind));
    // The signature cage deduction is exercised.
    expect(kinds.has("cage")).toBe(true);

    // Replaying the placements reconstructs the full (unique) solution.
    const w = st.params.w;
    const filled = new Uint8Array(w * w);
    for (const op of ops) if (op.kind === "place") filled[op.y * w + op.x] = op.n;
    for (let i = 0; i < w * w; i++) expect(filled[i]).toBeGreaterThan(0);
  });

  it("with recording off, leaves the generate/solve path producing a unique solution", () => {
    // A smoke check that recording is opt-in: solving without a recorder still
    // yields the same kind of result (the byte-identical guarantee is the C
    // differential in keen-differential.test.ts; this just guards the wiring).
    const { st } = gen(NORMAL, "rec-off");
    const r = keenGame.solve?.(st, st);
    expect(r?.ok).toBe(true);
  });
});

// --- tier 1: hint plan ------------------------------------------------------

describe("keen hint", () => {
  it("populates before the first elimination", () => {
    const { st } = gen(NORMAL, "hint-empty");
    const res = keenGame.hint?.(st);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    const moves = res.steps.map((s) => (s.move as KeenMove).type);
    const populateAt = moves.indexOf("pencilAll");
    const firstStrike = moves.indexOf("pencilStrike");
    expect(populateAt).toBe(0);
    expect(firstStrike).toBeGreaterThan(0);
    expect(populateAt).toBeLessThan(firstStrike);
  });

  it("skips populate once notes are present", () => {
    const { st } = gen(NORMAL, "hint-pop");
    const populated = keenGame.executeMove(st, { type: "pencilAll" });
    const res = keenGame.hint?.(populated);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    expect((res.steps[0].move as KeenMove).type).not.toBe("pencilAll");
  });

  it("surfaces a naked single as the next move ahead of any elimination", () => {
    const { st } = gen(NORMAL, "hint-naked");
    const r = keenGame.solve?.(st, st);
    if (!r?.ok || r.move.type !== "solve") throw new Error("solve failed");
    const w = st.params.w;
    const x = 2;
    const y = 3;
    const i = y * w + x;
    const v = r.move.grid[i];
    const populated = keenGame.executeMove(st, { type: "pencilAll" });
    // Narrow this one cell to a single candidate (its solution value).
    const marks = [];
    for (let n = 1; n <= w; n++) if (n !== v) marks.push({ x, y, n });
    const narrowed = keenGame.executeMove(populated, { type: "pencilStrike", marks });

    const res = keenGame.hint?.(narrowed);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    expect(res.steps[0].move).toEqual({ type: "set", x, y, n: v, pencil: false, autoElim: true });
    expect(res.steps[0].explanation).toMatch(/can only be/);
  });

  it("every deduction conclusion uses the necessity voice", () => {
    const { st } = gen(NORMAL, "voice");
    const populated = keenGame.executeMove(st, { type: "pencilAll" });
    const res = keenGame.hint?.(populated);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    // A strike concludes "must cross out …" / "must be crossed out"; a placement
    // "it can only be N"; never a bare "is/are/stays". (Populate is the lone
    // instruction.)
    const modal = /can only|can't|must (be|cross out)|must be crossed out/i;
    for (const s of res.steps) {
      if ((s.move as KeenMove).type === "pencilAll") continue;
      expect(s.explanation).toMatch(modal);
    }
  });

  it("names the cage by its arithmetic clue", () => {
    const { st } = gen(NORMAL, "clue-name");
    const populated = keenGame.executeMove(st, { type: "pencilAll" });
    const res = keenGame.hint?.(populated);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    const cageStep = res.steps.find((s) => /this cage/.test(s.explanation));
    expect(cageStep).toBeDefined();
    // Every cage narration names a concrete goal (one of the four operations).
    expect(cageStep?.explanation).toMatch(/sum to|multiply to|differ by|ratio of/);
  });

  it("a cage-strike step's marks all lie in one cell (no bleed across the cage)", () => {
    let checked = 0;
    for (const p of [NORMAL, HARD]) {
      for (let s = 0; s < 8; s++) {
        const { st } = gen(p, `bleed-${p.diff}-${s}`);
        const res = keenGame.hint?.(st);
        if (!res?.ok) continue;
        for (const step of res.steps as AnyStep[]) {
          if (step.move.type !== "pencilStrike") continue;
          if (!/this cage/.test(step.explanation)) continue; // skip basic-Latin dup steps
          const marks = step.move.marks as { x: number; y: number; n: number }[];
          const cells = new Set(marks.map((m) => `${m.x},${m.y}`));
          expect(cells.size).toBe(1);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("auto-pencil on folds away the trivial row/column eliminations a placement implies", () => {
    // Walk a few placements in so a `set` step (and its row/column cleanup) is in
    // range, then compare the dup-step counts.
    const { st } = gen(NORMAL, "autopencil");
    const dupRe = /from the other cells they pass through/;
    const uiOn = newUi(st);
    uiOn.autoPencil = true;
    const on = keenGame.hint?.(st, undefined, uiOn);
    const uiOff = newUi(st);
    uiOff.autoPencil = false;
    const off = keenGame.hint?.(st, undefined, uiOff);
    expect(on?.ok && off?.ok).toBe(true);
    if (!on?.ok || !off?.ok) return;
    const dupCount = (r: typeof on) => r.steps.filter((s) => dupRe.test(s.explanation)).length;
    // With auto-pencil off, each placement also teaches its row/column cleanup.
    expect(dupCount(off)).toBeGreaterThan(dupCount(on));
    expect(off.steps.length).toBeGreaterThan(on.steps.length);
  });

  it("narrates a hidden single by its line and shades the whole line", () => {
    // A hidden single (a cell still showing several candidates, but the placed
    // digit fits nowhere else in its row/column) must NOT be narrated as a naked
    // single ("every other number ruled out in this cell"); it names the line and
    // shades it. Walk boards by hints to reach one.
    let checked = 0;
    for (const seed of ["hs0", "hs1", "hs2", "hs3", "hs4", "hs5"]) {
      const { st } = gen(NORMAL, seed);
      let state: KeenState = st;
      const w = st.params.w;
      for (let i = 0; i < 3000 && status(state) !== "solved"; i++) {
        const res = keenGame.hint?.(state);
        if (!res?.ok) break;
        const step = res.steps.find((s) => /can go in only this cell/.test(s.explanation)) as
          | AnyStep
          | undefined;
        if (step) {
          const m = step.move as { type: string; x: number; y: number; n: number };
          // The narration is a placement, never the naked-single phrasing.
          expect(step.explanation).not.toMatch(/Every other number has been ruled out/);
          expect(step.explanation).toMatch(/In this (row|column)/);
          // The shaded area is exactly one full line (w cells) through the target.
          const area = (step.highlights?.area ?? []) as { x: number; y: number }[];
          expect(area.length).toBe(w);
          const isRow = /In this row/.test(step.explanation);
          for (const a of area) {
            if (isRow) expect(a.y).toBe(m.y);
            else expect(a.x).toBe(m.x);
          }
          expect(area.some((a) => a.x === m.x && a.y === m.y)).toBe(true);
          checked++;
          break;
        }
        state = keenGame.executeMove(state, res.steps[0].move);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("refuses on a solved board and on a board with mistakes", () => {
    const { st } = gen(NORMAL, "refuse");
    const r = keenGame.solve?.(st, st);
    if (!r?.ok) throw new Error("solve failed");
    const solved = keenGame.executeMove(st, r.move);
    expect(keenGame.hint?.(solved)?.ok).toBe(false);

    const w = st.params.w;
    const sol = (r.move as { type: "solve"; grid: number[] }).grid;
    const wrong = (sol[0] % w) + 1;
    const bad = keenGame.executeMove(st, { type: "set", x: 0, y: 0, n: wrong, pencil: false });
    expect(keenGame.hint?.(bad)?.ok).toBe(false);
  });
});

// --- tier 1: keep-track -----------------------------------------------------

describe("keen hintKeepTrack", () => {
  it("matches a populate step, rejects anything else", () => {
    const { st } = gen(NORMAL, "kt-pop");
    const res = keenGame.hint?.(st);
    if (!res?.ok) throw new Error("refused");
    const step = res.steps.find((s) => (s.move as KeenMove).type === "pencilAll");
    if (!step) throw new Error("no populate step");
    expect(keenGame.hintKeepTrack?.({ type: "pencilAll" }, step, st)).toBe("completed");
    expect(
      keenGame.hintKeepTrack?.({ type: "set", x: 0, y: 0, n: 1, pencil: false }, step, st),
    ).toBe("off");
  });

  it("shrinks then finishes a multi-mark strike journey", () => {
    const { st } = gen(NORMAL, "kt-strike");
    const populated = keenGame.executeMove(st, { type: "pencilAll" });
    const res = keenGame.hint?.(populated);
    if (!res?.ok) throw new Error("hint refused");
    const step = res.steps.find(
      (s) =>
        (s.move as KeenMove).type === "pencilStrike" &&
        (s.move as { type: "pencilStrike"; marks: unknown[] }).marks.length >= 2,
    ) as AnyStep | undefined;
    if (!step) throw new Error("no multi-mark strike step");

    const marks = [...step.move.marks] as { x: number; y: number; n: number }[];
    const first = marks[0];
    const v1 = keenGame.hintKeepTrack?.(
      { type: "set", x: first.x, y: first.y, n: first.n, pencil: true },
      step,
      populated,
    );
    expect(v1).toBe("onTrack");
    expect((step.move as { marks: unknown[] }).marks.length).toBe(marks.length - 1);

    let cur = keenGame.executeMove(populated, {
      type: "set",
      x: first.x,
      y: first.y,
      n: first.n,
      pencil: true,
    });
    for (let k = 1; k < marks.length; k++) {
      const mk = marks[k];
      const v = keenGame.hintKeepTrack?.(
        { type: "set", x: mk.x, y: mk.y, n: mk.n, pencil: true },
        step,
        cur,
      );
      expect(v).toBe(k === marks.length - 1 ? "completed" : "onTrack");
      cur = keenGame.executeMove(cur, { type: "set", x: mk.x, y: mk.y, n: mk.n, pencil: true });
    }
  });
});

// --- tier 1: resume to solved ----------------------------------------------

describe("keen hint resumes to solved", () => {
  it("completes a fresh board one recomputed hint at a time", () => {
    const { st: start, aux } = gen(NORMAL, "resume");
    let state: KeenState = start;
    for (let moves = 0; moves < 2000; moves++) {
      if (status(state) === "solved") return;
      const res = keenGame.hint?.(state, aux);
      expect(res?.ok).toBe(true);
      if (!res?.ok) throw new Error(`gave up: ${res?.error}`);
      state = keenGame.executeMove(state, res.steps[0].move);
    }
    throw new Error("did not converge");
  });
});

// --- tier 2.5: render ------------------------------------------------------

/** Scan seeds for an id whose hint, after populating, reaches a cage-strike step
 * matching `pred` — so the render frame is deterministic without a known desc. */
function cageStrikeFrame(p: KeenParams, pred: (s: string) => boolean): string {
  for (let s = 0; s < 30; s++) {
    const seed = `frame-${p.diff}-${s}`;
    const { st } = gen(p, seed);
    const populated = keenGame.executeMove(st, { type: "pencilAll" });
    const res = keenGame.hint?.(populated);
    if (!res?.ok) continue;
    if (res.steps.some((step) => (step.move as KeenMove).type === "pencilStrike" && pred(step.explanation)))
      return `${encodeParams(p, true)}#${seed}`;
  }
  throw new Error(`no cage-strike frame found for ${p.diff}`);
}

/** Scan seeds for an id whose from-empty plan contains a hidden-single placement
 * step (so the render frame — reached by walking the plan — is deterministic). */
function hiddenSingleFrame(p: KeenParams): string {
  for (let s = 0; s < 60; s++) {
    const seed = `hsf-${p.diff}-${s}`;
    const { st } = gen(p, seed);
    const res = keenGame.hint?.(st);
    if (!res?.ok) continue;
    if (res.steps.some((step) => /can go in only this cell/.test(step.explanation)))
      return `${encodeParams(p, true)}#${seed}`;
  }
  throw new Error(`no hidden-single frame found for ${p.diff}`);
}

describe("keen hint render", () => {
  it("a cage elimination shades the cage and strikes the candidate", () => {
    const id = cageStrikeFrame(NORMAL, (e) => /leaves room for/.test(e));
    const { recording, hint } = renderScenario({
      game: keenGame,
      id,
      defaultBackground: DEFAULT_BACKGROUND,
      moves: [{ type: "pencilAll" }],
      showHint: true,
      hintUntil: (s) => /leaves room for/.test(s.explanation),
    });
    expect(hint?.explanation).toMatch(/this cage/);
    // The cage's cells are shaded COL_HINT_CELL evidence.
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_HINT_CELL)).toBe(true);
    // The struck candidate keeps its COL_PENCIL digit, crossed through in COL_PENCIL.
    expect(recording.ops.some((o) => o.op === "line" && o.colour === COL_PENCIL)).toBe(true);
    expect(recording.ops.some((o) => o.op === "text" && o.colour === COL_PENCIL)).toBe(true);
    // A strike cell is NOT solid-filled COL_HINT (that is the placement-target fill).
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_HINT)).toBe(false);
    expect(recording.ops).toMatchSnapshot();
  });

  it("a hidden-single placement shades the whole line and fills the target", () => {
    const small: KeenParams = { w: 4, diff: "easy", multiplicationOnly: false };
    const id = hiddenSingleFrame(small);
    const { recording, hint } = renderScenario({
      game: keenGame,
      id,
      defaultBackground: DEFAULT_BACKGROUND,
      showHint: true,
      hintUntil: (s) => /can go in only this cell/.test(s.explanation),
    });
    expect(hint?.explanation).toMatch(/In this (row|column)/);
    // The line is shaded COL_HINT_CELL (≥ w−1 evidence cells; the target itself is
    // COL_HINT) and the placement target is solid-filled COL_HINT.
    const cellRects = recording.ops.filter((o) => o.op === "rect" && o.colour === COL_HINT_CELL);
    expect(cellRects.length).toBe(small.w - 1);
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_HINT)).toBe(true);
    expect(recording.ops).toMatchSnapshot();
  });
});
