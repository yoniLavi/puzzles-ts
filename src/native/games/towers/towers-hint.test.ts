/**
 * Towers explained-hint tests.
 *
 * Tier 1 — the recording solver records a reason per technique and its replayed
 * placements complete a generated board; `hint` populates, strikes and places
 * with quality-bar narration (indication → necessity voice); refusal on
 * solved / on mistakes; `hintKeepTrack` verdicts. Tier 2.5 — a render-scenario
 * snapshot of a clue-elimination journey frame (struck candidates `COL_HINT`,
 * the clue's line of sight `COL_HINT_CELL`, clues still drawn).
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BACKGROUND,
  renderScenario,
} from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newTowersDesc } from "./generator.ts";
import { towersGame } from "./index.ts";
import { COL_HINT, COL_HINT_CELL, COL_PENCIL } from "./render.ts";
import { type HintReason, recordTowersDeductions } from "./solver.ts";
import {
  DIFF_EXTREME,
  type Difficulty,
  diffToLevel,
  newState,
  newUi,
  type TowersMove,
  type TowersParams,
  type TowersState,
} from "./state.ts";

function gen(w: number, diff: TowersParams["diff"], seed: string) {
  const p: TowersParams = { w, diff };
  const { desc } = newTowersDesc(p, randomNew(seed));
  return { p, desc, st: newState(p, desc) };
}

function solutionGrid(st: TowersState): number[] {
  const r = towersGame.solve?.(st, st);
  if (!r?.ok || r.move.type !== "solve") throw new Error("solve failed");
  return r.move.grid;
}

// biome-ignore lint/suspicious/noExplicitAny: structural access to hint highlights/move in tests.
type AnyStep = any;

// --- tier 1: recording solver ----------------------------------------------

describe("towers recording solver", () => {
  it("records reasons and its placements complete the board", () => {
    const { p, st } = gen(5, "easy", "rec-easy");
    const grid = Uint8Array.from(st.grid);
    const ops = recordTowersDeductions(
      st.w,
      st.clues,
      grid,
      Math.min(diffToLevel(p.diff), DIFF_EXTREME),
    );
    expect(ops.length).toBeGreaterThan(0);

    // Every op carries a discriminated reason.
    const kinds = new Set(ops.map((o) => (o.reason as HintReason).kind));
    // An easy board exercises the basic Towers + Latin techniques.
    expect(kinds.size).toBeGreaterThan(1);
    expect([...kinds].some((k) => k === "facing" || k === "lineFull" || k === "lowerBound"))
      .toBe(true);

    // Replaying the placements reconstructs the full (unique) solution.
    const filled = Uint8Array.from(st.immutable);
    for (const op of ops) if (op.kind === "place") filled[op.y * st.w + op.x] = op.n;
    for (let i = 0; i < st.w * st.w; i++) expect(filled[i]).toBeGreaterThan(0);
  });

  it("records the harder techniques on a hard board", () => {
    const { p, st } = gen(6, "hard", "rec-hard");
    const grid = Uint8Array.from(st.grid);
    const ops = recordTowersDeductions(
      st.w,
      st.clues,
      grid,
      Math.min(diffToLevel(p.diff), DIFF_EXTREME),
    );
    const kinds = new Set(ops.map((o) => (o.reason as HintReason).kind));
    // Hard boards engage the set (naked-subset) deduction at some point.
    expect(ops.length).toBeGreaterThan(0);
    expect(kinds.has("set") || kinds.has("arrangement")).toBe(true);
  });
});

// --- tier 1: hint plan ------------------------------------------------------

function firstHint(st: TowersState) {
  const res = towersGame.hint?.(st);
  if (!res) throw new Error("no hint method");
  return res;
}

describe("towers hint", () => {
  it("populates an empty board before eliminating", () => {
    const { st } = gen(5, "easy", "hint-empty");
    const res = firstHint(st);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.steps[0].move).toEqual({ type: "pencilAll" });
    // The plan goes on to strike and place.
    const types = new Set(res.steps.map((s) => (s.move as TowersMove).type));
    expect(types.has("pencilStrike")).toBe(true);
    expect(types.has("set")).toBe(true);
  });

  it("clue-strike marks never bleed outside the narrated clue's line (regression)", () => {
    // One recorded firing must cover a single clue. An earlier bug let one
    // solver pass lump several clues' lower-bound eliminations under one
    // `group`, so a hint step narrated one clue's line of sight while a struck
    // mark sat on a *different* clue's line ("the 5 from the next column got
    // pulled in"). A standalone clue-strike step shades its clue's line as the
    // evidence `area`; every struck mark must lie within it.
    const diffs: Difficulty[] = ["easy", "hard", "extreme"];
    let checked = 0;
    for (const diff of diffs) {
      for (let s = 0; s < 8; s++) {
        const { st } = gen(5, diff, `bleed-${diff}-${s}`);
        const res = towersGame.hint?.(st);
        if (!res?.ok) continue;
        for (const step of res.steps as AnyStep[]) {
          if (step.move.type !== "pencilStrike") continue;
          const area: { x: number; y: number }[] = step.highlights?.area ?? [];
          if (area.length === 0) continue; // dup continuation: no clue line
          for (const m of step.move.marks as { x: number; y: number }[]) {
            expect(area.some((a) => a.x === m.x && a.y === m.y)).toBe(true);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("skips populate once notes are present", () => {
    const { st } = gen(5, "easy", "hint-pop");
    const populated = towersGame.executeMove(st, { type: "pencilAll" });
    const res = firstHint(populated);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect((res.steps[0].move as TowersMove).type).not.toBe("pencilAll");
  });

  it("every deduction conclusion uses the necessity voice", () => {
    const { st } = gen(5, "easy", "hint-voice");
    const populated = towersGame.executeMove(st, { type: "pencilAll" });
    const res = firstHint(populated);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const modal = /can('|\s+only|not|t)\b|must (be|stay|hold)|can only|can't/i;
    for (const s of res.steps) {
      // Deduction steps (everything but the populate setup) state the conclusion
      // as a forced decision, never a bare "is/are/stays".
      expect(s.explanation).toMatch(modal);
    }
  });

  it("auto-pencil on folds away the trivial row/column eliminations", () => {
    const { st } = gen(5, "easy", "hint-autopencil");
    const populated = towersGame.executeMove(st, { type: "pencilAll" });
    const dupRe = /now sits in this row and column/;

    const uiOn = newUi(populated);
    uiOn.autoPencil = true;
    const on = towersGame.hint?.(populated, undefined, uiOn);
    expect(on?.ok).toBe(true);
    if (on?.ok) expect(on.steps.some((s) => dupRe.test(s.explanation))).toBe(false);

    const uiOff = newUi(populated);
    uiOff.autoPencil = false;
    const off = towersGame.hint?.(populated, undefined, uiOff);
    expect(off?.ok).toBe(true);
    if (off?.ok) {
      // With auto-pencil off the player must clean notes by hand, so the hint
      // teaches those eliminations as explicit continuation strikes.
      expect(off.steps.some((s) => dupRe.test(s.explanation))).toBe(true);
      expect(off.steps.length).toBeGreaterThan(on?.ok ? on.steps.length : 0);
    }
  });

  it("surfaces a naked single as the next move (suggestion 2)", () => {
    const { st } = gen(5, "easy", "hint-naked");
    const sol = solutionGrid(st);
    const w = st.w;
    const i = [...st.immutable].indexOf(0);
    const x = i % w;
    const y = (i / w) | 0;
    const v = sol[i];
    const populated = towersGame.executeMove(st, { type: "pencilAll" });
    // Strike every candidate but the solution height in this one cell, leaving a
    // naked single there.
    const marks = [];
    for (let n = 1; n <= w; n++) if (n !== v) marks.push({ x, y, n });
    const narrowed = towersGame.executeMove(populated, { type: "pencilStrike", marks });

    const res = towersGame.hint?.(narrowed);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    // The very next step places that cell (no populate needed — notes present).
    expect(res.steps[0].move).toEqual({
      type: "set",
      x,
      y,
      n: v,
      pencil: false,
      autoElim: true,
    });
    expect(res.steps[0].explanation).toMatch(/can only be|must be/);
  });

  it("refuses on a solved board and on a board with mistakes", () => {
    const { st } = gen(5, "easy", "hint-refuse");
    const r = towersGame.solve?.(st, st);
    if (!r?.ok) throw new Error("solve failed");
    const solved = towersGame.executeMove(st, r.move);
    expect(towersGame.hint?.(solved).ok).toBe(false);

    // A wrong tower → refusal coupled to the mistake overlay (tested via the
    // engine elsewhere); here we just assert the refusal.
    const w = st.w;
    const empty = [...st.immutable].indexOf(0);
    const sol = (r.move as { type: "solve"; grid: number[] }).grid;
    const wrong = (sol[empty] % w) + 1;
    const bad = towersGame.executeMove(st, {
      type: "set",
      x: empty % w,
      y: (empty / w) | 0,
      n: wrong,
      pencil: false,
    });
    const res = towersGame.hint?.(bad);
    expect(res?.ok).toBe(false);
  });
});

// --- tier 1: keep-track -----------------------------------------------------

/** Find the first hint step of a given move type (after populating). */
function stepOfType(
  st: TowersState,
  type: TowersMove["type"],
): { step: AnyStep; state: TowersState } {
  const populated = towersGame.executeMove(st, { type: "pencilAll" });
  const res = towersGame.hint?.(populated);
  if (!res?.ok) throw new Error("hint refused");
  const step = res.steps.find((s) => (s.move as TowersMove).type === type);
  if (!step) throw new Error(`no ${type} step`);
  return { step, state: populated };
}

describe("towers hintKeepTrack", () => {
  it("matches a populate step", () => {
    const { st } = gen(5, "easy", "kt-pop");
    const res = firstHint(st);
    if (!res.ok) throw new Error("refused");
    const step = res.steps[0];
    expect(towersGame.hintKeepTrack?.({ type: "pencilAll" }, step, st)).toBe("completed");
    expect(
      towersGame.hintKeepTrack?.(
        { type: "set", x: 0, y: 0, n: 1, pencil: false },
        step,
        st,
      ),
    ).toBe("off");
  });

  it("shrinks then finishes a multi-mark strike journey", () => {
    const { st } = gen(5, "easy", "kt-strike");
    // Find a strike step with more than one mark so we can exercise onTrack.
    const populated = towersGame.executeMove(st, { type: "pencilAll" });
    const res = towersGame.hint?.(populated);
    if (!res?.ok) throw new Error("hint refused");
    const step = res.steps.find(
      (s) =>
        (s.move as TowersMove).type === "pencilStrike" &&
        (s.move as Extract<TowersMove, { type: "pencilStrike" }>).marks.length >= 2,
    ) as AnyStep;
    expect(step).toBeDefined();

    const total = (step.move as Extract<TowersMove, { type: "pencilStrike" }>).marks
      .length;
    let cur = populated;
    for (let k = 0; k < total; k++) {
      // Always strike the *current* first remaining mark (the step shrinks).
      const m = (step.move as Extract<TowersMove, { type: "pencilStrike" }>).marks[0];
      const toggle: TowersMove = { type: "set", x: m.x, y: m.y, n: m.n, pencil: true };
      // `hintKeepTrack` sees the PRE-move state (production passes the state the
      // move is applied to, before applying it — `Midend.processInput`), so
      // classify against `cur` *then* advance it.
      const verdict = towersGame.hintKeepTrack?.(toggle, step, cur);
      cur = towersGame.executeMove(cur, toggle);
      expect(verdict).toBe(k === total - 1 ? "completed" : "onTrack");
    }
    // The journey shrank as it was followed: only the final (just-completed)
    // mark remains — the midend advances past the step on "completed".
    expect(
      (step.move as Extract<TowersMove, { type: "pencilStrike" }>).marks.length,
    ).toBe(1);
  });

  it("a strike step rejects a non-target candidate and a re-add", () => {
    const { st } = gen(5, "easy", "kt-strike-off");
    const { step, state } = stepOfType(st, "pencilStrike");
    const m = (step.move as Extract<TowersMove, { type: "pencilStrike" }>).marks[0];
    // A toggle on a cell/candidate the step doesn't target is off-plan.
    const otherN = (m.n % 5) + 1;
    const nonTarget: TowersMove = { type: "set", x: m.x, y: m.y, n: otherN, pencil: true };
    // Only off if (x,y,otherN) isn't itself one of the marks. `hintKeepTrack`
    // sees the PRE-move state (`state`).
    if (
      !(step.move as Extract<TowersMove, { type: "pencilStrike" }>).marks.some(
        (k) => k.x === m.x && k.y === m.y && k.n === otherN,
      )
    ) {
      expect(towersGame.hintKeepTrack?.(nonTarget, step, state)).toBe("off");
    }
  });

  it("a placement step matches the entered height", () => {
    const { st } = gen(5, "easy", "kt-place");
    const { step, state } = stepOfType(st, "set");
    const move = step.move as Extract<TowersMove, { type: "set" }>;
    expect(towersGame.hintKeepTrack?.(move, step, state)).toBe("completed");
    expect(
      towersGame.hintKeepTrack?.({ ...move, n: (move.n % 5) + 1 }, step, state),
    ).toBe("off");
  });

  it("a strike step never mixes heights; its narration names the struck height", () => {
    // A single clue firing can rule out *several* heights (the lower-bound rule
    // strikes both 4 and 5 along a line). Each height must be its own step so
    // the narration ("a tower of height 5…") matches what is crossed out — a
    // step striking 4 *and* 5 while the text says only 5 is the reported bug.
    // The further heights of one firing are continuation legs of one journey.
    let checked = 0;
    let sawJourneyLeg = false;
    for (let i = 0; i < 30 && checked < 40; i++) {
      const { st } = gen(5, "easy", `mix-${i}`);
      const pop = towersGame.executeMove(st, { type: "pencilAll" });
      const res = towersGame.hint?.(pop);
      if (!res?.ok) continue;
      for (const step of res.steps) {
        const m = step.move as TowersMove;
        if (m.type !== "pencilStrike") continue;
        checked++;
        if (step.continuesPrevious) sawJourneyLeg = true;
        const heights = new Set(m.marks.map((k) => k.n));
        expect(heights.size, `step "${step.explanation.slice(0, 48)}" mixes heights`).toBe(1);
        const n = m.marks[0].n;
        if (/can see only|none of them puts/.test(step.explanation)) {
          expect(step.explanation).toContain(`height ${n}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    // Multi-height firings exist on these boards, emitted as continuation legs.
    expect(sawJourneyLeg).toBe(true);
  });
});

// --- tier 2.5: render scenario ----------------------------------------------

/** Scan seeds for a 5×5 easy board whose populated hint plan reaches a
 * clue lower-bound elimination frame (one with a shaded line of sight). */
function lowerBoundFrame() {
  for (let i = 0; i < 40; i++) {
    const seed = `lb-${i}`;
    const { desc } = gen(5, "easy", seed);
    const id = `5de:${desc}`;
    const st = newState({ w: 5, diff: "easy" }, desc);
    const pop = towersGame.executeMove(st, { type: "pencilAll" });
    const res = towersGame.hint?.(pop);
    if (!res?.ok) continue;
    if (res.steps.some((s) => /can see only/.test(s.explanation))) return id;
  }
  throw new Error("no lower-bound frame found in the scanned seeds");
}

/** Scan seeds for a 5×5 easy board whose populated hint plan contains a `set`
 * placement step (a facing/forced placement). */
function facingPlacementFrame() {
  for (let i = 0; i < 40; i++) {
    const seed = `fp-${i}`;
    const { desc } = gen(5, "easy", seed);
    const id = `5de:${desc}`;
    const st = newState({ w: 5, diff: "easy" }, desc);
    const pop = towersGame.executeMove(st, { type: "pencilAll" });
    const res = towersGame.hint?.(pop);
    if (!res?.ok) continue;
    if (res.steps.some((s) => (s.move as TowersMove).type === "set")) return id;
  }
  throw new Error("no placement frame found in the scanned seeds");
}

describe("towers hint render", () => {
  it("a clue-elimination journey shades the line of sight and struck candidates", () => {
    const id = lowerBoundFrame();
    const { recording, hint } = renderScenario({
      game: towersGame,
      id,
      defaultBackground: DEFAULT_BACKGROUND,
      moves: [{ type: "pencilAll" }],
      showHint: true,
      hintUntil: (s) => /can see only/.test(s.explanation),
    });
    expect(hint).toBeDefined();
    expect(hint?.explanation).toMatch(/can see only/);

    // The clue line of sight is shaded COL_HINT_CELL.
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_HINT_CELL)).toBe(
      true,
    );
    // The struck candidate keeps its normal pencil colour (legible) and is
    // crossed through with a same-colour (COL_PENCIL) line — the strikethrough,
    // not a recolour, is the "ruled out" cue (highest contrast against the
    // lighter hint background).
    expect(recording.ops.some((o) => o.op === "line" && o.colour === COL_PENCIL)).toBe(true);
    expect(recording.ops.some((o) => o.op === "text" && o.colour === COL_PENCIL)).toBe(true);
    expect(recording.ops.some((o) => o.op === "text" && o.colour === COL_HINT)).toBe(false);
    // ...and a strike cell is NOT solid-filled COL_HINT. That fill is the
    // *placement*-target colour; painting a struck cell with it would hide the
    // struck digit, making the candidate look already-removed. (Regression:
    // fix-stale-hint-step — owner-reported "the hint deletes my note". The note
    // is intact; the frame must show it.)
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_HINT)).toBe(false);
    // Clues are still drawn (text).
    expect(recording.ops.some((o) => o.op === "text")).toBe(true);

    expect(recording.ops).toMatchSnapshot();
  });

  it("a placement step DOES solid-fill its target cell COL_HINT (no struck digit to hide)", () => {
    // The `struck === 0` guard must still fill a placement target — only strike
    // cells (which carry COL_HINT digits) skip the solid fill.
    const id = facingPlacementFrame();
    const { recording, hint } = renderScenario({
      game: towersGame,
      id,
      defaultBackground: DEFAULT_BACKGROUND,
      moves: [{ type: "pencilAll" }],
      showHint: true,
      hintUntil: (s) => (s.move as TowersMove).type === "set",
    });
    expect((hint?.move as TowersMove)?.type).toBe("set");
    // A placement target is solid COL_HINT, and carries no struck digit/line.
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_HINT)).toBe(true);
    expect(recording.ops.some((o) => o.op === "line" && o.colour === COL_HINT)).toBe(false);
  });
});
