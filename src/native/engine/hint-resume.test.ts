/**
 * Cross-game guarantee: a hint can always make progress from *any* mid-game
 * position, and following hints solves the board.
 *
 * This is the uniform "solve from the middle" check, applied to every
 * hint-bearing game through the shared `Game` interface. It exists because two
 * games shipped a real bug of the same shape — a hint that gives up (or loops)
 * when asked from a position the player reached by their own play, even though
 * the board is still solvable:
 *
 *  - **Singles** — its deductive `solveSpecific` only ran from an empty board
 *    (upstream's sole use); resumed from the player's marks, the cascade never
 *    propagated from those marks and the solver stalled ("No further move").
 *  - **Untangle** — its aux-walk re-suggested a no-op move forever once a
 *    vertex sat on its (jittering) target pixel.
 *
 * The probe drives the importable scenario both bugs travelled: ask for a fresh
 * hint, apply only its first step, repeat. (In the app, a self-played move
 * drops any stored plan, so the next hint recomputes from the current state —
 * exactly this.) Recomputing every step exercises resumption from many
 * arbitrary partial positions; a correct hint must never give up before solved.
 */
import { describe, expect, it } from "vitest";
import { fillingGame } from "../games/filling/index.ts";
import { fifteenGame } from "../games/fifteen/index.ts";
import { floodGame } from "../games/flood/index.ts";
import { keenGame } from "../games/keen/index.ts";
import { lightupGame } from "../games/lightup/index.ts";
import { palisadeGame } from "../games/palisade/index.ts";
import { patternGame } from "../games/pattern/index.ts";
import { rangeGame } from "../games/range/index.ts";
import { singlesGame } from "../games/singles/index.ts";
import { sixteenGame } from "../games/sixteen/index.ts";
import { slantGame } from "../games/slant/index.ts";
import { soloGame } from "../games/solo/index.ts";
import { towersGame } from "../games/towers/index.ts";
import { undeadGame } from "../games/undead/index.ts";
import { unequalGame } from "../games/unequal/index.ts";
import { unrulyGame } from "../games/unruly/index.ts";
import { untangleGame } from "../games/untangle/index.ts";
import { randomNew } from "../random/index.ts";
import type { Game, PresetMenu } from "./game.ts";

// biome-ignore lint/suspicious/noExplicitAny: a deliberately game-agnostic probe.
type AnyGame = Game<any, any, any, any, any, any>;

/** First leaf preset's params — a small, valid board for each game. */
function firstLeaf<P>(menu: PresetMenu<P>): P {
  if (menu.params !== undefined) return menu.params;
  for (const sub of menu.submenu ?? []) {
    const p = firstLeaf(sub);
    if (p !== undefined) return p;
  }
  throw new Error("no leaf preset");
}

/** Walk a fresh board to solved, recomputing the hint after every move.
 * Returns the move count, or throws with a diagnostic if a hint gives up or
 * the walk fails to converge. */
function solveByHints(game: AnyGame, seed: string): number {
  const params = firstLeaf(game.presets());
  const { desc, aux } = game.newDesc(params, randomNew(seed));
  let state = game.newState(params, desc);
  // Generous cap: far above any honest plan length, so only a genuine
  // loop/non-convergence trips it.
  const cap = 800;
  for (let moves = 0; moves < cap; moves++) {
    if (game.status(state) === "solved") return moves;
    const res = game.hint?.(state, aux);
    if (!res) throw new Error(`${seed}: game has no hint() method`);
    if (!res.ok) {
      throw new Error(`${seed}: hint gave up after ${moves} moves: "${res.error}"`);
    }
    state = game.executeMove(state, res.steps[0].move);
  }
  throw new Error(`${seed}: did not converge within ${cap} moves (loop?)`);
}

const HINT_GAMES: [string, AnyGame][] = [
  ["filling", fillingGame],
  ["fifteen", fifteenGame],
  ["flood", floodGame],
  ["keen", keenGame],
  ["lightup", lightupGame],
  ["palisade", palisadeGame],
  ["pattern", patternGame],
  ["range", rangeGame],
  ["singles", singlesGame],
  ["sixteen", sixteenGame],
  ["slant", slantGame],
  ["solo", soloGame],
  ["towers", towersGame],
  ["undead", undeadGame],
  ["unequal", unequalGame],
  ["unruly", unrulyGame],
  ["untangle", untangleGame],
];

const SEEDS = ["hr-a", "hr-b", "hr-c", "hr-d", "hr-e"];

/** A structural key for a game state — typed arrays rendered as plain arrays so
 * two states compare equal iff every field matches. Used to detect a hint step
 * that does nothing (a no-op when reached = an intrinsically stale step). */
function stateKey(s: unknown): string {
  return JSON.stringify(s, (_k, v) =>
    ArrayBuffer.isView(v) && !(v instanceof DataView)
      ? Array.from(v as unknown as ArrayLike<number>)
      : v instanceof Set
        ? [...v]
        : v,
  );
}

describe("a kept hint plan never contains a step that does nothing", () => {
  // The engine guarantees a displayed step is never stale (openspec
  // `fix-stale-hint-step`). The Towers-specific trigger (auto-pencil resolving a
  // later step) has its own end-to-end test; this is the cross-game invariant
  // that catches the *intrinsic* form for every hint game — a plan whose own
  // steps, replayed in order (the exact-follow path), include one that is
  // already a no-op when reached. A clean plan means the game has no latent
  // staleness of this shape.
  for (const [name, game] of HINT_GAMES) {
    it(`${name}: every plan step changes the board when reached`, () => {
      for (const seed of SEEDS) {
        const params = firstLeaf(game.presets());
        const { desc, aux } = game.newDesc(params, randomNew(`noop-${name}-${seed}`));
        let state = game.newState(params, desc);
        const res = game.hint?.(state, aux);
        if (!res?.ok) continue; // refusal (e.g. already solved) — nothing to check
        res.steps.forEach((step, i) => {
          const after = game.executeMove(state, step.move);
          expect(
            stateKey(after) !== stateKey(state),
            `${name}/${seed}: plan step ${i} is a no-op when reached (stale step)`,
          ).toBe(true);
          state = after;
        });
      }
    });
  }
});

describe("requesting a hint never mutates the board", () => {
  // A hint computes and *displays* a plan; it must leave the state untouched —
  // the player applies a step by following it (or pressing Hint a second time).
  // (Owner-reported: a Towers hint appeared to delete a pencil note. The note
  // was intact — a render bug drew the struck candidate invisibly — but the
  // guarantee is worth asserting directly: `hint()` is pure on the state.)
  for (const [name, game] of HINT_GAMES) {
    it(`${name}: hint() leaves the state unchanged`, () => {
      for (const seed of SEEDS) {
        const params = firstLeaf(game.presets());
        const { desc, aux } = game.newDesc(params, randomNew(`pure-${name}-${seed}`));
        const state = game.newState(params, desc);
        const before = stateKey(state);
        game.hint?.(state, aux);
        expect(stateKey(state), `${name}/${seed}: hint() mutated the state`).toBe(
          before,
        );
      }
    });
  }
});

describe("a Latin-family placement never falsely claims a naked single", () => {
  // The shared `latin.ts` solver records naked and hidden singles under one
  // `single` reason; a hint must re-derive which (engine/latin-hint.ts) so it never
  // says "every other number/height has been ruled out in this cell" about a cell
  // that still visibly shows several candidates (owner-reported on Keen). Walk each
  // Latin game and assert the naked-single phrasing only ever appears on a cell
  // whose notes really are down to one candidate.
  const LATIN: [string, AnyGame][] = [
    ["towers", towersGame],
    ["unequal", unequalGame],
    ["keen", keenGame],
  ];
  for (const [name, game] of LATIN) {
    it(`${name}: "ruled out in this cell" only on a genuine naked single`, () => {
      for (const seed of SEEDS) {
        const params = firstLeaf(game.presets());
        const { desc, aux } = game.newDesc(params, randomNew(`naked-${name}-${seed}`));
        let state = game.newState(params, desc);
        // biome-ignore lint/suspicious/noExplicitAny: structural state access.
        const w = (params as any).w ?? (params as any).order;
        for (let moves = 0; moves < 2000 && game.status(state) === "ongoing"; moves++) {
          const res = game.hint?.(state, aux);
          if (!res?.ok) break;
          const step = res.steps[0];
          // biome-ignore lint/suspicious/noExplicitAny: structural move/state access.
          const m = step.move as any;
          if (
            m.type === "set" &&
            !m.pencil &&
            /ruled out in this cell/.test(step.explanation)
          ) {
            // biome-ignore lint/suspicious/noExplicitAny: structural state access.
            const pen = (state as any).pencil[m.y * w + m.x] as number;
            const ncand = Array.from({ length: w }, (_, k) => k + 1).filter(
              (n) => pen & (1 << n),
            ).length;
            expect(
              ncand,
              `${name}/${seed}: naked-single narration on a cell with ${ncand} candidates`,
            ).toBe(1);
          }
          state = game.executeMove(state, step.move);
        }
      }
    }, 30_000);
  }
});

describe("a hint can solve from any mid-game position", () => {
  for (const [name, game] of HINT_GAMES) {
    // Heavy, fixed-seed work (re-solve by following hints move-by-move across
    // every seed). The work per seed is bounded and deterministic; only the
    // wall-clock varies, and it stretches several-fold under full-suite CPU
    // saturation — flood once crossed the default 5s. An explicit per-test
    // timeout keeps it from flaking without masking a real regression (the
    // assertion is on the *result*, not the clock). See the test-discipline
    // note in AGENTS.md.
    it(`${name}: following hints one move at a time always reaches solved`, () => {
      for (const seed of SEEDS) {
        // Throws with a per-seed diagnostic on failure.
        expect(() => solveByHints(game, `${name}-${seed}`)).not.toThrow();
      }
    }, 30_000);
  }
});
