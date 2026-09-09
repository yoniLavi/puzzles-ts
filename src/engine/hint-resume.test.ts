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
import { DEDUCTION_EXHAUSTED, SEARCH_OUT_OF_REACH } from "./hint-refusal.ts";
import { randomNew } from "./random/index.ts";
import {
  type AnyGame,
  firstLeaf,
  HINT_GAMES,
  leafPresets,
  SEARCH_PLANNING_GAMES,
} from "./testing/hint-games.ts";
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
  boundedSearch: boolean,
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
      if (boundedSearch) {
        if (res.error !== SEARCH_OUT_OF_REACH) {
          throw new Error(
            `${seed}: a hint that plans by searching ran out after ${moves} moves and said "${res.error}" — the only honest thing past its reach is the collection's one wording for that`,
          );
        }
        return moves;
      }
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

/**
 * The games whose hint **plans by searching ahead a bounded number of moves**,
 * rather than by deducing.
 *
 * They are the one population this walk's central promise cannot hold. A
 * deductive hint is either complete for its tier or its tier says out loud that
 * search may be needed, so on a sound board it always has something true to
 * say. A searching hint has a *reach* instead: past it there is no honest
 * answer but "I did not find one", and no budget makes that go away — Sixteen's
 * tangled 5×5 endgames are a dozen moves from home with a branching factor of
 * 40, and each further ply costs about 40×. Such a game passes this walk on the
 * seeds it is given and could go red truthfully on a new one, which would be
 * the guard reporting the truth rather than a regression.
 *
 * **Derived from what the game is, never declared** — the derivation lives in
 * `testing/hint-games.ts` as `SEARCH_PLANNING_GAMES`, because a second guard
 * needs the same population for a different reason (what the *gate* may afford
 * to walk). Membership is "calls the shared slide planner", read out of each
 * game's own comment-stripped source.
 */
const BOUNDED_SEARCH_HINTS = SEARCH_PLANNING_GAMES;

/**
 * Why each derived member is excused the walk's promise, **and what covers the
 * largest board the gate no longer walks for it** — one line per member,
 * asserted below to be exactly the derivation.
 *
 * The ledger is attached to the *members*, not to the enrollment: the guard
 * still works out who by reading the games, and this only records what a source
 * scan cannot see, which is whether the reach is a real limit or a bug. An
 * empty derivation would silently restore the old behavior with every
 * assertion here still passing, so the equality is this sweep's vacuity guard
 * as well as its ledger.
 *
 * **The second sentence is load-bearing since
 * `retire-tests-that-do-not-earn-their-runtime`.** These games' walk is sliced
 * to the smallest preset in the gate (see `walkedPresets`), so each entry has to
 * name the test that still walks a full-size board on every commit. A future
 * third member joins the derivation by *having* the mechanic and fails the
 * equality below until someone writes that sentence — which is the point of
 * deriving the population and attaching the reason to the member
 * (`AGENTS.md` § "Convention over configuration").
 */
const SEARCH_REACH: Record<string, string> = {
  netslide:
    "Plans by searching for an arrangement that powers the grid. Has not been " +
    "seen refusing — its finish condition is weak, so its distances are short — " +
    "but it is the same planner and the same bound. Largest board on every " +
    "commit: netslide-reconstruct.test.ts walks EVERY preset (5x5 wrapping " +
    "included) to completion on recomputed hints, with no aux at all.",
  sixteen:
    "Plans by searching for the finished board. Its tangled endgames are a " +
    "dozen moves out with a branching factor of 40, which no arrangement of " +
    "this machinery reaches (`fix-sixteen-deep-local-minima`). Largest board " +
    "on every commit: sixteen.test.ts drives a 5x5 endgame only the exact " +
    "bidirectional search can cross, and walks that board with a fresh search " +
    "per move for recompute stability. The deep-search walks over its tangled " +
    "5x5 boards are DEFERRED by owner decision (2026-09-09) — the hint is " +
    "settled and not expected to change — so a regression in the tangle " +
    "measure specifically is caught by " +
    "`npm run test:slow -- src/games/sixteen`, not by the gate. Verified both " +
    "ways: zeroing TANGLE_COST leaves the gate green and turns the slow tier " +
    "red.",
};

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

/**
 * The presets the resume walk covers.
 *
 * **Every preset in the slow tier; in the gate slice, one per axis the game
 * actually varies.**
 *
 * This walked `firstLeaf` alone until `refuse-honestly-at-every-tier` — by
 * convention the smallest and easiest board a game offers — so the collection's
 * strongest hint guarantee had never seen a Hard board, an `Unreasonable` board
 * or any mode variant. Widened, it found thirteen refusals across seven games
 * that the narrow form could not reach, saying three different things.
 *
 * **Tier is the right axis only for a game that has one.** Keyed on tier alone,
 * every preset of an *untiered* game collapses to a single key, so the slice
 * took the first and nothing else — reinstating, for those games, exactly the
 * first-preset blindness the widening existed to remove. It cost a real defect:
 * Sixteen is untiered with five presets, its 3×3 walks in seven moves, and the
 * hint cycled for ever on its 5×5 (`fix-sixteen-hint-recompute-stability`) where
 * only the slow tier could see it.
 *
 * So an untiered game is sliced by **size** instead, taking the first preset and
 * the last. Presets are conventionally ordered smallest-first, which is the same
 * convention `firstLeaf` already relies on, and taking both ends is the cheap
 * honest approximation of "cover the axis this game varies". It costs one extra
 * walk per untiered game.
 *
 * **The exception, and it is the whole reason this file is affordable: a game
 * that plans by *searching* walks its smallest preset only.** Measured
 * 2026-09-09 (`retire-tests-that-do-not-earn-their-runtime`), Sixteen's single
 * 5×5 walk was the most expensive test in the collection and Netslide's 5×5 the
 * third; between them the two members of `SEARCH_PLANNING_GAMES` were 43% of
 * all test time. A search pays for board size twice over — one full search per
 * move, and more moves to make — so for these two the last preset is not "one
 * extra walk", it is most of the suite.
 *
 * **This is a deferral, not a retirement, and what still covers the large board
 * is recorded per member in `SEARCH_REACH` above** — Sixteen's five hand-picked
 * 5×5 endgames in `sixteen.test.ts`, Netslide's every-preset walk in
 * `netslide-reconstruct.test.ts`, both on every commit. The hand-picked boards
 * are sharper than a random one: they are the positions the hint actually gave
 * up on, and removing the tangle term was verified to turn them red. The slow
 * tier walks every preset for these games as for all others.
 */
function walkedPresets(
  id: string,
  game: AnyGame,
): { title: string; params: unknown }[] {
  const all = leafPresets(game.presets());
  if (SLOW_TESTS_ENABLED) return all;
  // A searching hint's cost is superlinear in board size; its large boards are
  // covered deterministically by the game's own file (see SEARCH_REACH).
  if (SEARCH_PLANNING_GAMES.includes(id)) return all.slice(0, 1);
  const contract = game.difficulty as DifficultyContract<unknown> | undefined;
  if (!contract) {
    // First and last, de-duplicated for a game that offers only one preset.
    return all.length <= 1 ? all : [all[0], all[all.length - 1]];
  }
  const seen = new Set<unknown>();
  return all.filter((e) => {
    const key = contract.tierOf(e.params);
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

describe("the games excused the walk's promise are derived, and each is accounted for", () => {
  it("every game that plans by searching has a ledger entry, and nothing else does", () => {
    expect(BOUNDED_SEARCH_HINTS).toEqual(Object.keys(SEARCH_REACH).sort());
  });
});

describe("a hint can solve from any mid-game position", () => {
  for (const [name, game] of HINT_GAMES) {
    // Heavy, fixed-seed work (re-solve by following hints move-by-move across
    // every seed). The work per seed is bounded and deterministic; only the
    // wall-clock varies, stretching several-fold under full-suite CPU
    // saturation. That is why nothing here is clock-gated — the assertion is on
    // the *result*. See docs/games/testing.md § "Seed-deterministic, never clock-gated".
    it(`${name}: following hints one move at a time always reaches solved`, () => {
      const presets = walkedPresets(name, game);
      // Per-game vacuity: a presets menu that flattened to nothing would leave
      // this loop asserting nothing while reporting health.
      expect(presets.length, `${name}: no preset to walk`).toBeGreaterThan(0);
      for (const { title, params } of presets) {
        const search = permitsSearch(game, params);
        const bounded = BOUNDED_SEARCH_HINTS.includes(name);
        // **This walk buys breadth over presets; the seed count is not the dial
        // to turn, and that was priced rather than assumed.** One seed either
        // way: the slow tier widens the *presets* (209 cases, ~2 min), the gate
        // slices by the axis a game varies — 76 cases, 69 s measured 2026-09-08
        // on this box at load 4.7, so read that as an upper bound rather than a
        // clean figure. Adding the untiered games' last preset took it from 65
        // walks to 76; the eleven it added are each a game's *largest* board,
        // which is why eleven walks in six cost roughly as much as the first 65.
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
            solveByHints(game, params, `${name}-${title}-${seed}`, search, bounded),
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
    // below the gate slice's true count (74 walks over 30 games as of
    // 2026-09-09, down from 76 when the two searching games stopped walking
    // their largest preset here — see `walkedPresets`),
    // so it is not a ratchet a legitimate change has to bump.
    expect(walkedCases).toBeGreaterThan(40);
  });
});
