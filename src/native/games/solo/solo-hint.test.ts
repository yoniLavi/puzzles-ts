/**
 * Solo explained-hint tests.
 *
 * Tier 1 — the recording solver records a reason per technique (incl. a killer
 * deduction and an X-diagonal deduction) and its replayed placements complete a
 * generated board; `hint` populates, strikes (deductive eliminations + basic
 * region culls) and places with quality-bar narration; refusal on solved / on
 * mistakes; `hintKeepTrack` verdicts. Tier 2.5 — a render-scenario snapshot of a
 * deductive elimination journey frame (struck candidate `COL_PENCIL`
 * strikethrough, evidence `COL_HINT_CELL`, grid/clues still drawn).
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_BACKGROUND, renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newSoloDesc } from "./generator.ts";
import { soloGame } from "./index.ts";
import { COL_HINT_CELL, COL_PENCIL } from "./render.ts";
import { type HintReason, recordSoloDeductions } from "./solver.ts";
import {
  DIFF_BLOCK,
  DIFF_INTERSECT,
  DIFF_KINTERSECT,
  DIFF_SET,
  DIFF_SIMPLE,
  defaultParams,
  encodeParams,
  newState,
  type SoloMove,
  type SoloParams,
  type SoloState,
  status as soloStatus,
  SYMM_NONE,
} from "./state.ts";

function gen(p: SoloParams, seed: string) {
  const { desc, aux } = newSoloDesc(p, randomNew(seed));
  return { p, desc, aux, st: newState(p, desc) };
}

// biome-ignore lint/suspicious/noExplicitAny: structural access to hint highlights/move in tests.
type AnyStep = any;

const BASIC: SoloParams = { ...defaultParams(), diff: DIFF_SIMPLE };
const INTER: SoloParams = { ...defaultParams(), diff: DIFF_INTERSECT };
const ADV: SoloParams = { ...defaultParams(), diff: DIFF_SET };
const XADV: SoloParams = { ...defaultParams(), diff: DIFF_SET, xtype: true };
const KILLER: SoloParams = {
  c: 3,
  r: 3,
  symm: SYMM_NONE,
  diff: DIFF_BLOCK,
  kdiff: DIFF_KINTERSECT,
  xtype: false,
  killer: true,
};

// --- tier 1: recording solver ----------------------------------------------

describe("solo recording solver", () => {
  it("records reasons and its placements complete the board (Basic)", () => {
    const { st } = gen(BASIC, "rec-basic");
    const ops = recordSoloDeductions(st, DIFF_SIMPLE);
    expect(ops.length).toBeGreaterThan(0);
    const cr = st.cr;
    const filled = new Int8Array(cr * cr);
    for (let i = 0; i < cr * cr; i++) if (st.immutable[i]) filled[i] = st.grid[i];
    for (const op of ops) if (op.kind === "place") filled[op.y * cr + op.x] = op.n;
    for (let i = 0; i < cr * cr; i++) expect(filled[i]).toBeGreaterThan(0);
  });

  it("records the intersect technique on Intermediate boards", () => {
    const kinds = new Set<string>();
    for (const s of ["i0", "i1", "i2", "i3", "i4", "i5"]) {
      const { st } = gen(INTER, s);
      for (const op of recordSoloDeductions(st, DIFF_INTERSECT))
        kinds.add((op.reason as HintReason).kind);
    }
    expect([...kinds]).toContain("intersect");
  });

  it("records the set technique on Advanced boards", () => {
    const kinds = new Set<string>();
    for (const s of ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7"]) {
      const { st } = gen(ADV, s);
      for (const op of recordSoloDeductions(st, DIFF_SET))
        kinds.add((op.reason as HintReason).kind);
    }
    expect([...kinds]).toContain("set");
  });

  it("records killer-cage reasons on a killer board", () => {
    const kinds = new Set<string>();
    for (const s of ["k0", "k1", "k2"]) {
      const { st } = gen(KILLER, s);
      for (const op of recordSoloDeductions(st, DIFF_BLOCK, DIFF_KINTERSECT))
        kinds.add((op.reason as HintReason).kind);
    }
    expect([...kinds].some((k) => k.startsWith("cage"))).toBe(true);
  }, 30_000);
});

// --- tier 1: hint plan ------------------------------------------------------

describe("solo hint", () => {
  it("populates before the first elimination", () => {
    const { st } = gen(ADV, "hint-empty");
    const res = soloGame.hint?.(st);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    const moves = res.steps.map((s) => (s.move as SoloMove).type);
    const populateAt = moves.indexOf("pencilAll");
    const firstStrike = moves.indexOf("pencilStrike");
    expect(populateAt).toBe(0);
    expect(firstStrike).toBeGreaterThan(0);
  });

  it("skips populate once notes are present", () => {
    const { st } = gen(ADV, "hint-pop");
    const populated = soloGame.executeMove(st, { type: "pencilAll" });
    const res = soloGame.hint?.(populated);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    expect((res.steps[0].move as SoloMove).type).not.toBe("pencilAll");
  });

  it("surfaces a naked single as the next move ahead of any elimination", () => {
    const { st } = gen(ADV, "hint-naked");
    const r = soloGame.solve?.(st, st);
    if (!r?.ok || r.move.type !== "solve") throw new Error("solve failed");
    const cr = st.cr;
    // Pick a non-given cell, narrow it to its solution value.
    let x = 0;
    let y = 0;
    for (let i = 0; i < cr * cr; i++)
      if (!st.immutable[i]) {
        x = i % cr;
        y = (i / cr) | 0;
        break;
      }
    const v = r.move.grid[y * cr + x];
    const populated = soloGame.executeMove(st, { type: "pencilAll" });
    const marks = [];
    for (let n = 1; n <= cr; n++) if (n !== v) marks.push({ x, y, n });
    const narrowed = soloGame.executeMove(populated, { type: "pencilStrike", marks });
    const res = soloGame.hint?.(narrowed);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    expect(res.steps[0].move).toEqual({ type: "set", x, y, n: v, pencil: false, autoElim: true });
    expect(res.steps[0].explanation).toMatch(/can only be/);
  });

  it("every deduction conclusion uses the necessity voice", () => {
    const { st } = gen(ADV, "voice");
    const populated = soloGame.executeMove(st, { type: "pencilAll" });
    const res = soloGame.hint?.(populated);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    const modal = /can only|can't|must (be|sit|cross out)|must be|cross out the|cross out/i;
    for (const s of res.steps) {
      if ((s.move as SoloMove).type === "pencilAll") continue;
      expect(s.explanation, s.explanation).toMatch(modal);
    }
  });

  it("a deductive strike step's marks all lie in one cell or all share one digit", () => {
    let checked = 0;
    for (const p of [INTER, ADV, KILLER]) {
      for (let s = 0; s < 6; s++) {
        const { st } = gen(p, `bleed-${p.diff}-${p.killer}-${s}`);
        const res = soloGame.hint?.(st);
        if (!res?.ok) continue;
        for (const step of res.steps as AnyStep[]) {
          if (step.move.type !== "pencilStrike") continue;
          // Skip the basic-region dup opening (one placed value across its groups).
          if (/already placed in this cell/.test(step.explanation)) continue;
          const marks = step.move.marks as { x: number; y: number; n: number }[];
          const cells = new Set(marks.map((m) => `${m.x},${m.y}`));
          const digits = new Set(marks.map((m) => m.n));
          // One firing's leg either acts on a single cell (cage/set split) or
          // crosses a single digit (intersect) — never a mixed bag.
          expect(cells.size === 1 || digits.size === 1).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  }, 30_000);

  it("auto-pencil off teaches more cleanup steps than on", () => {
    const { st } = gen(ADV, "autopencil");
    const dupRe = /already placed in this cell/;
    const uiOn = soloGame.newUi(st);
    uiOn.autoPencil = true;
    const on = soloGame.hint?.(st, undefined, uiOn);
    const uiOff = soloGame.newUi(st);
    uiOff.autoPencil = false;
    const off = soloGame.hint?.(st, undefined, uiOff);
    expect(on?.ok && off?.ok).toBe(true);
    if (!on?.ok || !off?.ok) return;
    const dupCount = (r: typeof on) => r.steps.filter((s) => dupRe.test(s.explanation)).length;
    expect(dupCount(off)).toBeGreaterThanOrEqual(dupCount(on));
    expect(off.steps.length).toBeGreaterThanOrEqual(on.steps.length);
  });

  it("narrates a hidden single by its region, never as a naked single", () => {
    let checked = 0;
    for (const seed of ["hs0", "hs1", "hs2", "hs3", "hs4", "hs5"]) {
      const { st, aux } = gen(ADV, seed);
      let state: SoloState = st;
      for (let i = 0; i < 3000 && soloStatus(state) !== "solved"; i++) {
        const res = soloGame.hint?.(state, aux);
        if (!res?.ok) break;
        const step = res.steps.find((s) =>
          /can go in only this cell/.test(s.explanation),
        ) as AnyStep | undefined;
        if (step) {
          const m = step.move as { type: string; x: number; y: number; n: number };
          expect(step.explanation).not.toMatch(/Every other number has been ruled out/);
          expect(step.explanation).toMatch(/In this (row|column|block|diagonal)/);
          const area = (step.highlights?.area ?? []) as { x: number; y: number }[];
          expect(area.some((a) => a.x === m.x && a.y === m.y)).toBe(true);
          checked++;
          break;
        }
        state = soloGame.executeMove(state, res.steps[0].move);
      }
    }
    expect(checked).toBeGreaterThan(0);
  }, 30_000);

  it("a naked-single narration only ever appears on a genuine one-candidate cell", () => {
    for (const seed of ["nk0", "nk1", "nk2", "nk3"]) {
      const { st, aux } = gen(ADV, seed);
      let state: SoloState = st;
      const cr = st.cr;
      for (let i = 0; i < 2000 && soloStatus(state) === "ongoing"; i++) {
        const res = soloGame.hint?.(state, aux);
        if (!res?.ok) break;
        const step = res.steps[0];
        const m = step.move as AnyStep;
        if (m.type === "set" && !m.pencil && /ruled out in this cell/.test(step.explanation)) {
          const pen = state.pencil[m.y * cr + m.x];
          const ncand = Array.from({ length: cr }, (_, k) => k + 1).filter(
            (n) => pen & (1 << n),
          ).length;
          expect(ncand, `naked-single narration on a ${ncand}-candidate cell`).toBe(1);
        }
        state = soloGame.executeMove(state, step.move);
      }
    }
  }, 30_000);

  it("teaches an X-diagonal deduction on an X board", () => {
    let found = false;
    for (let s = 0; s < 30 && !found; s++) {
      const { st, aux } = gen(XADV, `xd-${s}`);
      let state: SoloState = st;
      for (let i = 0; i < 2000 && soloStatus(state) === "ongoing"; i++) {
        const res = soloGame.hint?.(state, aux);
        if (!res?.ok) break;
        if (res.steps.some((step) => /diagonal/.test(step.explanation))) {
          found = true;
          break;
        }
        state = soloGame.executeMove(state, res.steps[0].move);
      }
    }
    expect(found).toBe(true);
  }, 30_000);

  it("refuses on a solved board and on a board with mistakes", () => {
    const { st } = gen(BASIC, "refuse");
    const r = soloGame.solve?.(st, st);
    if (!r?.ok) throw new Error("solve failed");
    const solved = soloGame.executeMove(st, r.move);
    expect(soloGame.hint?.(solved)?.ok).toBe(false);

    const cr = st.cr;
    const sol = (r.move as { type: "solve"; grid: number[] }).grid;
    // Place a wrong digit in the first editable cell.
    let bx = 0;
    let by = 0;
    for (let i = 0; i < cr * cr; i++)
      if (!st.immutable[i]) {
        bx = i % cr;
        by = (i / cr) | 0;
        break;
      }
    const wrong = (sol[by * cr + bx] % cr) + 1;
    const bad = soloGame.executeMove(st, { type: "set", x: bx, y: by, n: wrong, pencil: false });
    expect(soloGame.hint?.(bad)?.ok).toBe(false);
  });
});

// --- tier 1: keep-track -----------------------------------------------------

describe("solo hintKeepTrack", () => {
  it("matches a populate step, rejects anything else", () => {
    const { st } = gen(ADV, "kt-pop");
    const res = soloGame.hint?.(st);
    if (!res?.ok) throw new Error("refused");
    const step = res.steps.find((s) => (s.move as SoloMove).type === "pencilAll");
    if (!step) throw new Error("no populate step");
    expect(soloGame.hintKeepTrack?.({ type: "pencilAll" }, step, st)).toBe("completed");
    expect(
      soloGame.hintKeepTrack?.({ type: "set", x: 0, y: 0, n: 1, pencil: false }, step, st),
    ).toBe("off");
  });

  it("shrinks then finishes a multi-mark strike journey", () => {
    const { st } = gen(ADV, "kt-strike");
    const populated = soloGame.executeMove(st, { type: "pencilAll" });
    const res = soloGame.hint?.(populated);
    if (!res?.ok) throw new Error("hint refused");
    const step = res.steps.find(
      (s) =>
        (s.move as SoloMove).type === "pencilStrike" &&
        (s.move as { type: "pencilStrike"; marks: unknown[] }).marks.length >= 2,
    ) as AnyStep | undefined;
    if (!step) throw new Error("no multi-mark strike step");

    const marks = [...step.move.marks] as { x: number; y: number; n: number }[];
    let cur = populated;
    for (let k = 0; k < marks.length; k++) {
      const mk = marks[k];
      const v = soloGame.hintKeepTrack?.(
        { type: "set", x: mk.x, y: mk.y, n: mk.n, pencil: true },
        step,
        cur,
      );
      expect(v).toBe(k === marks.length - 1 ? "completed" : "onTrack");
      cur = soloGame.executeMove(cur, { type: "set", x: mk.x, y: mk.y, n: mk.n, pencil: true });
    }
  });
});

// --- tier 2.5: render ------------------------------------------------------

/** Scan seeds for an id whose from-populated plan reaches a deductive strike step
 * matching `pred` — so the render frame is deterministic without a known desc. */
function strikeFrame(p: SoloParams, pred: (s: string) => boolean): string {
  for (let s = 0; s < 40; s++) {
    const seed = `frame-${p.diff}-${s}`;
    const { st } = gen(p, seed);
    const populated = soloGame.executeMove(st, { type: "pencilAll" });
    const res = soloGame.hint?.(populated);
    if (!res?.ok) continue;
    if (res.steps.some((step) => (step.move as SoloMove).type === "pencilStrike" && pred(step.explanation)))
      return `${encodeParams(p, true)}#${seed}`;
  }
  throw new Error(`no strike frame found for ${p.diff}`);
}

describe("solo hint render", () => {
  it("a deductive elimination shades the evidence and strikes the candidate", () => {
    const pred = (e: string) => /where they overlap|already accounts for/.test(e);
    const id = strikeFrame(ADV, pred);
    const { recording, hint } = renderScenario({
      game: soloGame,
      id,
      defaultBackground: DEFAULT_BACKGROUND,
      moves: [{ type: "pencilAll" }],
      showHint: true,
      hintUntil: (s) => pred(s.explanation),
    });
    expect(pred(hint?.explanation ?? "")).toBe(true);
    // The evidence region is shaded COL_HINT_CELL.
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_HINT_CELL)).toBe(true);
    // The struck candidate keeps its COL_PENCIL digit, crossed through in COL_PENCIL.
    expect(recording.ops.some((o) => o.op === "line" && o.colour === COL_PENCIL)).toBe(true);
    expect(recording.ops.some((o) => o.op === "text" && o.colour === COL_PENCIL)).toBe(true);
    expect(recording.ops).toMatchSnapshot();
  }, 30_000);
});
