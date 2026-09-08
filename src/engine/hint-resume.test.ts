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
 * The probe drives the importable scenario both bugs traveled: ask for a fresh
 * hint, apply only its first step, repeat. (In the app, a self-played move
 * drops any stored plan, so the next hint recomputes from the current state —
 * exactly this.) Recomputing every step exercises resumption from many
 * arbitrary partial positions; a correct hint must never give up before solved.
 */
import { describe, expect, it } from "vitest";
import { type DifficultyContract, difficultyTiers } from "./difficulty.ts";
import type { PresetMenu } from "./game.ts";
import { DEDUCTION_EXHAUSTED } from "./hint-refusal.ts";
import { randomNew } from "./random/index.ts";
import { type AnyGame, firstLeaf, HINT_GAMES } from "./testing/hint-games.ts";
import { SLOW_TESTS_ENABLED } from "./testing/slow.ts";

/** Walk a fresh board to solved, recomputing the hint after every move.
 * Returns the move count, or throws with a diagnostic if a hint gives up or
 * the walk fails to converge.
 *
 * `permitsSearch` says whether this board's tier is one whose boards may need
 * trial and error — derived from the tier's *name*, since `Unreasonable` is the
 * collection's promise about search (AGENTS.md § "Check / Tactic / Search").
 * On such a board a refusal is the honest end of the road rather than a defect,
 * so the walk accepts it — but only with the collection's single wording for it,
 * because a refusal that does not tell the player trial and error is expected
 * reads exactly like a broken hint. */
function solveByHints(
  game: AnyGame,
  params: unknown,
  seed: string,
  permitsSearch: boolean,
): number {
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
      if (!permitsSearch) {
        throw new Error(`${seed}: hint gave up after ${moves} moves: "${res.error}"`);
      }
      if (res.error !== DEDUCTION_EXHAUSTED) {
        throw new Error(
          `${seed}: ran out of deduction after ${moves} moves and said "${res.error}" — a board whose tier permits search must use the collection's one wording for it`,
        );
      }
      return moves;
    }
    state = game.executeMove(state, res.steps[0].move);
  }
  throw new Error(`${seed}: did not converge within ${cap} moves (loop?)`);
}

/** Does this preset's tier promise that its boards may need search?
 *
 * Derived from what the game already declares — the tier list its params form
 * offers, and the contract that reads a tier off params. A game with no
 * difficulty contract has no tier to blame, so **nothing** it offers permits
 * search: such a game must never run out of deduction on a sound board, and the
 * walk holds it to that rather than skipping it. */
function permitsSearch(game: AnyGame, params: unknown): boolean {
  const tiers = difficultyTiers(game);
  const contract = game.difficulty as DifficultyContract<unknown> | undefined;
  const tier = contract?.tierOf(params);
  return (
    tiers !== undefined && typeof tier === "number" && tiers[tier] === "Unreasonable"
  );
}

/** Every leaf preset with the title the menu shows for it. */
function leafEntries(menu: PresetMenu<unknown>): { title: string; params: unknown }[] {
  if (menu.params !== undefined) return [{ title: menu.title, params: menu.params }];
  return (menu.submenu ?? []).flatMap(leafEntries);
}

/**
 * The presets the resume walk covers.
 *
 * **Every preset in the slow tier; one per declared tier in the gate slice.**
 * This walked `firstLeaf` alone until `refuse-honestly-at-every-tier` — by
 * convention the smallest and easiest board a game offers — so the collection's
 * strongest hint guarantee had never seen a Hard board, an `Unreasonable` board
 * or any mode variant. Widened, it found thirteen refusals across seven games
 * that the narrow form could not reach, saying three different things.
 *
 * The slice is keyed on **tier** rather than on a count because tier is the axis
 * the narrow form was blind to; a slice that fell back to one preset per game
 * would restore exactly the blindness this exists to remove
 * (`testing/slow.ts`: never defer the only case for a configuration).
 */
function walkedPresets(game: AnyGame): { title: string; params: unknown }[] {
  const all = leafEntries(game.presets());
  if (SLOW_TESTS_ENABLED) return all;
  const contract = game.difficulty as DifficultyContract<unknown> | undefined;
  const seen = new Set<unknown>();
  return all.filter((e) => {
    const key = contract?.tierOf(e.params) ?? "untiered";
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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
  const LATIN: [string, AnyGame][] = HINT_GAMES.filter(([name]) =>
    ["towers", "unequal", "keen", "group"].includes(name),
  );
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
    });
  }
});

describe("a hint can solve from any mid-game position", () => {
  for (const [name, game] of HINT_GAMES) {
    // Heavy, fixed-seed work (re-solve by following hints move-by-move across
    // every seed). The work per seed is bounded and deterministic; only the
    // wall-clock varies, stretching several-fold under full-suite CPU
    // saturation. That is why nothing here is clock-gated — the assertion is on
    // the *result*. See docs/games/testing.md § "Seed-deterministic, never clock-gated".
    it(`${name}: following hints one move at a time always reaches solved`, () => {
      const presets = walkedPresets(game);
      // Per-game vacuity: a presets menu that flattened to nothing would leave
      // this loop asserting nothing while reporting health.
      expect(presets.length, `${name}: no preset to walk`).toBeGreaterThan(0);
      for (const { title, params } of presets) {
        const search = permitsSearch(game, params);
        // **This walk buys breadth over presets; the seed count is not the dial
        // to turn, and that was priced rather than assumed.** One seed either
        // way: the slow tier widens the *presets* (209 cases, ~2 min), the gate
        // takes one per declared tier (~70 cases, 35 s).
        //
        // Five seeds — the count `SEEDS` carried when this walked a single
        // preset — was tried over every preset and **withdrawn**: 50 minutes of
        // wall clock without reporting. Two was tried next and was still north
        // of 20. A once-per-refactoring-round check that takes tens of minutes
        // has not been made thorough, it has been made unrunnable
        // (`AGENTS.md` § "Test discipline": a slow tier nobody invokes is not
        // coverage), and this walk is quadratic in board size twice over — one
        // full hint recompute per move, and more moves on a bigger board.
        //
        // **The depth `SEEDS` used to buy is not lost**: the three guards above
        // in this file — no-op-free plans, hint purity, Latin naked-single
        // honesty — still run all five seeds, and a seed-specific plan bug shows
        // up in those rather than here. What was missing was never another seed
        // on the easiest board; it was ever looking at a hard one.
        const seeds = SEEDS.slice(0, 1);
        for (const seed of seeds) {
          expect(() =>
            solveByHints(game, params, `${name}-${title}-${seed}`, search),
          ).not.toThrow();
          walkedCases++;
        }
      }
    });
  }
});

/** How many (preset, seed) walks actually ran, across every hinting game — the
 * sweep-wide vacuity guard. Accumulated above, asserted below, which runs last
 * because it is registered last. */
let walkedCases = 0;

describe("the resume walk", () => {
  it("covered enough boards to mean something", () => {
    // The floor separates "working" from "enumerating nothing" and sits well
    // below the gate slice's true count (~70 walks over 30 games when written),
    // so it is not a ratchet a legitimate change has to bump.
    expect(walkedCases).toBeGreaterThan(40);
  });
});
