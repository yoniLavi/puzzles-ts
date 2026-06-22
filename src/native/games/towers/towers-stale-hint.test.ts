/**
 * Regression: a displayed Towers hint step must never reference already-resolved
 * state (openspec change `fix-stale-hint-step`).
 *
 * The defect: a hint plan is computed once with the auto-pencil preference baked
 * in. With auto-pencil OFF the plan teaches explicit `pencilStrike` legs; if the
 * player then turns auto-pencil ON, a placement silently strikes the placed
 * height from its row/column, so a later *kept* stored strike step names notes
 * that are already gone — and the midend re-displayed the stored step without
 * re-validating it. Reproduced on the owner's board with auto-pencil toggled
 * mid-solve; fixed by the engine-level `refreshHintStep` re-validation.
 *
 * This drives a REAL `Midend` through keyboard input (the production
 * `processInput` path, with `hintKeepTrack` and the re-show/auto-play hint
 * lifecycle exactly as the app runs them), following the displayed hint to
 * solved while flipping the auto-pencil pref, and asserts after every
 * (re-)display that the displayed strike names only live candidates.
 */
import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/midend.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_UP,
} from "../../engine/pointer.ts";
import { randomNew } from "../../random/index.ts";
import { newTowersDesc } from "./generator.ts";
import { towersGame } from "./index.ts";
import type { TowersMove, TowersParams, TowersState, TowersUi } from "./state.ts";

type Me = Midend<TowersParams, TowersState, TowersMove, TowersUi, unknown>;

/** Test-only window into the live midend so we can drive the keyboard cursor
 * exactly and check candidate liveness against the real state. */
interface MidendInternals {
  ui: TowersUi;
  history: TowersState[];
  pos: number;
}
function peek(me: Me): { ui: TowersUi; state: TowersState } {
  const internals = me as unknown as MidendInternals;
  return { ui: internals.ui, state: internals.history[internals.pos] };
}

/** Position the keyboard cursor exactly at (x, y), shown. Over-presses into a
 * corner first (clamped) so the landing cell is deterministic regardless of the
 * cursor's prior position. Cursor moves are `UI_UPDATE` — they never touch the
 * hint plan. */
function navTo(me: Me, x: number, y: number): void {
  const w = peek(me).state.w;
  for (let i = 0; i <= w; i++) me.processInput(0, 0, CURSOR_LEFT);
  for (let i = 0; i <= w; i++) me.processInput(0, 0, CURSOR_UP);
  for (let i = 0; i < x; i++) me.processInput(0, 0, CURSOR_RIGHT);
  for (let i = 0; i < y; i++) me.processInput(0, 0, CURSOR_DOWN);
}
function setPencilMode(me: Me, want: boolean): void {
  if (peek(me).ui.hpencil !== want) me.processInput(0, 0, CURSOR_SELECT);
}
function placeKb(me: Me, x: number, y: number, n: number): void {
  navTo(me, x, y);
  setPencilMode(me, false);
  me.processInput(0, 0, 48 + n);
}
function strikeKb(me: Me, x: number, y: number, n: number): void {
  navTo(me, x, y);
  setPencilMode(me, true);
  me.processInput(0, 0, 48 + n);
}

function assertStepLive(me: Me, ctx: string): void {
  const step = me.activeHintStep() as
    | { move: TowersMove; explanation?: string; continuesPrevious?: boolean }
    | undefined;
  if (!step || step.move.type !== "pencilStrike") return;
  const { state } = peek(me);
  const w = state.w;
  for (const { x, y, n } of step.move.marks) {
    const present = (state.pencil[y * w + x] & (1 << n)) !== 0;
    expect(
      present,
      `${ctx}: displayed strike names DEAD candidate (${x},${y})=${n}.\n` +
        `  continuesPrevious=${step.continuesPrevious}\n` +
        `  explanation: ${step.explanation}`,
    ).toBe(true);
  }
}

/** Drive a player who follows the displayed hint to solved, flipping the
 * auto-pencil pref per `autoPencilAt`. Asserts no displayed strike is ever
 * stale. Returns whether the board was solved. */
function walkFollowingHints(
  me: Me,
  autoPencilAt: (stepNo: number) => boolean,
): boolean {
  const cap = 400;
  for (let stepNo = 0; stepNo < cap; stepNo++) {
    if (towersGame.status(peek(me).state) === "solved") return true;
    me.setPreferences({ "auto-pencil": autoPencilAt(stepNo) });

    if (me.hint()) return false; // no further deducible move / refusal
    assertStepLive(me, `step ${stepNo} (just displayed)`);

    const step = me.activeHintStep() as { move: TowersMove } | undefined;
    if (!step) return false;
    const m = step.move;
    if (m.type === "pencilAll") {
      me.processInput(0, 0, 77); // 'M'
    } else if (m.type === "set" && !m.pencil) {
      placeKb(me, m.x, m.y, m.n);
    } else if (m.type === "pencilStrike") {
      for (const mk of [...m.marks]) {
        const { state } = peek(me);
        if ((state.pencil[mk.y * state.w + mk.x] & (1 << mk.n)) === 0) continue;
        strikeKb(me, mk.x, mk.y, mk.n);
      }
      if (!me.hint()) assertStepLive(me, `step ${stepNo} (re-show after strike)`);
    } else {
      return false;
    }
    assertStepLive(me, `step ${stepNo} (after move)`);
  }
  return false;
}

const REPORTED_ID = "5:2/4/3/2/1/2/1/3/2/3/3/1/3/4/2/1/3/3/2/2";

function midendFromId(id: string): Me {
  const me: Me = new Midend(towersGame);
  const err = me.newGameFromId(id);
  expect(err).toBeUndefined();
  return me;
}

function midendFromSeed(diff: TowersParams["diff"], seed: string): Me {
  const me: Me = new Midend(towersGame);
  const { desc } = newTowersDesc({ w: 5, diff }, randomNew(seed));
  expect(me.newGameFromId(`5${diffChar(diff)}:${desc}`)).toBeUndefined();
  return me;
}
function diffChar(d: TowersParams["diff"]): string {
  return d === "easy" ? "e" : d === "hard" ? "h" : d === "extreme" ? "x" : "u";
}

const SCENARIOS: { name: string; toggle: (s: number) => boolean }[] = [
  { name: "auto-pencil ON throughout", toggle: () => true },
  { name: "auto-pencil OFF throughout", toggle: () => false },
  { name: "auto-pencil flips every move", toggle: (s) => s % 2 === 0 },
  { name: "auto-pencil OFF then ON at step 3 (owner repro)", toggle: (s) => s >= 3 },
  { name: "auto-pencil ON then OFF at step 3", toggle: (s) => s < 3 },
];

describe("towers: a displayed hint step is never stale", () => {
  for (const sc of SCENARIOS) {
    it(`reported board — ${sc.name}`, () => {
      walkFollowingHints(midendFromId(REPORTED_ID), sc.toggle);
    });
  }

  // Breadth: random boards across difficulties, with the worst-case toggle.
  const diffs: TowersParams["diff"][] = ["easy", "hard", "extreme"];
  for (const diff of diffs) {
    it(`random ${diff} boards survive a mid-solve auto-pencil flip`, () => {
      for (let s = 0; s < 8; s++) {
        const me = midendFromSeed(diff, `stale-${diff}-${s}`);
        walkFollowingHints(me, (n) => n % 2 === 0);
      }
    });
  }

  it("following the hint with auto-pencil toggled still solves the board", () => {
    // Not just "never stale" — the plan must keep making progress through the
    // re-validation. The owner-repro toggle must still reach a solved board.
    expect(walkFollowingHints(midendFromId(REPORTED_ID), (s) => s >= 3)).toBe(true);
  });
});
