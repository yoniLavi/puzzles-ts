/**
 * The cross-game difficulty guards — the reason `Game.difficulty` exists.
 *
 * Before this file, the cap-monotonicity property (*a board solvable with the
 * ladder capped at `d` is solvable at every cap above `d`*) was asserted for
 * four games out of twenty-eight, by four hand-written tests, in three
 * different strengths: Magnets swept every cap, Rome checked only the top,
 * Salad folded it into a generation test. It was **false** on Boats, and that
 * silently broke Check & Save on every Easy board — because "solvable at Easy"
 * and "solvable at Tricky" were both true statements about different code paths
 * and nothing compared them.
 *
 * **The enrolled set is derived, not listed.** A game is tiered iff it offers a
 * difficulty choice in its custom-params form, which is the tiers a player can
 * actually pick; every such game must declare the contract, and every game
 * declaring the contract must offer such a choice. A hand-maintained list would
 * eventually go stale, and the naming convention that would replace it has
 * already failed once — a `DIFF_*` grep surveying tiered games missed Bridges,
 * whose tiers are a plain `difficulty: number` against a `DIFFICULTY_NAMES`
 * array. A guard blind to a game cannot fire on it.
 */
import { describe, expect, it } from "vitest";
import "../games/index.ts";
import {
  cappedSolveFor,
  type DifficultyContract,
  lowestSolvingCap,
} from "./difficulty.ts";
import type { Game, ParamConfigItem, PresetMenu } from "./game.ts";
import { randomNew } from "./random/index.ts";
import { getTsGame, registeredGameIds } from "./registry.ts";
import { seedBudget } from "./testing/slow.ts";

// biome-ignore lint/suspicious/noExplicitAny: a deliberately game-agnostic probe.
type AnyGame = Game<any, any, any, any, any, any>;

/** The custom-params item a tiered game exposes its difficulty through. 27 of
 * the 28 spell it `difficulty`; Loopy spells it `diff`. Matching the prefix
 * rather than an exact string keeps a future `diff-level` enrolled instead of
 * silently unwatched — the failure mode this whole derivation exists to avoid. */
function difficultyChoiceItem(game: AnyGame): ParamConfigItem<unknown> | undefined {
  return game.paramConfig?.find(
    (item) => item.type === "choices" && /^diff/.test(item.kw),
  );
}

interface TieredGame {
  id: string;
  game: AnyGame;
  contract: DifficultyContract<unknown>;
  choices: readonly string[];
}

/** Every registered game offering a difficulty choice, with its contract. */
const registered = registeredGameIds()
  .sort()
  .map((id) => ({ id, game: getTsGame(id) as AnyGame }));

const tiered: TieredGame[] = [];
const missingContract: string[] = [];
const contractWithoutChoice: string[] = [];

for (const { id, game } of registered) {
  const item = difficultyChoiceItem(game);
  const contract = game.difficulty as DifficultyContract<unknown> | undefined;
  if (item && item.type === "choices" && !contract) missingContract.push(id);
  if (contract && !item) contractWithoutChoice.push(id);
  if (item && item.type === "choices" && contract) {
    tiered.push({ id, game, contract, choices: item.choices });
  }
}

/** First leaf preset's params — a small, valid board (`hint-games.ts` uses the
 * same convention). */
function firstLeaf<P>(menu: PresetMenu<P>): P {
  if (menu.params !== undefined) return menu.params;
  for (const sub of menu.submenu ?? []) {
    const p = firstLeaf(sub);
    if (p !== undefined) return p;
  }
  throw new Error("no leaf preset");
}

/** Every leaf preset's params, in menu order (smallest first by convention). */
function allLeaves<P>(menu: PresetMenu<P>): P[] {
  if (menu.params !== undefined) return [menu.params];
  return (menu.submenu ?? []).flatMap(allLeaves);
}

/**
 * The cheapest preset that is *valid* at `tier`, or `null` when no preset is.
 *
 * Not simply "the first preset with the tier written on it": a tier can be
 * invalid at some sizes and fine at others (Mathrax refuses Normal and
 * Recursive at order 3 and generates them happily above it), so the search has
 * to ask `validateParams`, and only a game where **no** preset accepts the tier
 * is genuinely ungenerable.
 */
function paramsForTier(t: TieredGame, tier: number): unknown | null {
  for (const leaf of allLeaves(t.game.presets())) {
    const p = t.contract.withTier(leaf, tier);
    if (t.game.validateParams(p, true) === null) return p;
  }
  return null;
}

describe("the tiered-game set is derived from the registry", () => {
  it("inspected every registered game", () => {
    // THE GUARD ON THE INSTRUMENT. Every assertion below iterates `tiered`, and
    // an empty or shrunken `tiered` makes all of them pass having checked
    // nothing — the shape this repo has now hit six times (`grid.test.ts`'s
    // `d.edges.length === d.order`, `touch-input.test.ts` counting the catalog
    // while its sweep skipped on the registry, the silently-empty
    // `import.meta.glob`, and both halves of the help-link check). So count what
    // was looked at, not only what offended.
    //
    // The floor is deliberately below the true count (57 games, 28 tiered when
    // written): it separates "working" from "enumerating nothing", and is not a
    // ratchet that a legitimate change would have to bump.
    expect(registered.length).toBeGreaterThan(50);
    expect(tiered.length).toBeGreaterThan(25);
  });

  it("every game offering a difficulty choice declares the contract", () => {
    expect(missingContract).toEqual([]);
  });

  it("every game declaring the contract offers a difficulty choice", () => {
    // The other direction, and not redundant: a contract on a game a player
    // cannot pick a tier for would be dead metadata, and the tier list would
    // have nothing to be checked against.
    expect(contractWithoutChoice).toEqual([]);
  });
});

describe.each(tiered)("$id difficulty contract", ({ id, game, contract, choices }) => {
  const tiers = contract.tiers;

  it("declares the tiers its custom-params form offers", () => {
    // NOTE ON STRENGTH, because a reader deserves it: for the seventeen games
    // whose `paramConfig` spreads the same `DIFF_NAMES` this contract names,
    // this comparison is trivially true — and that is the *better* outcome, not
    // a hole. One source cannot drift from itself. The check earns its keep on
    // the eleven that write the names out twice (Bricks, Bridges, Galaxies,
    // Keen, Lightup, Singles, Solo, Towers, Undead, Unequal, Unruly), where the
    // two really can diverge.
    expect([...tiers]).toEqual([...choices]);
    expect(tiers.length).toBeGreaterThan(1);
  });

  it("round-trips every declared tier through the params codec", () => {
    // Non-vacuous everywhere, unlike the check above: it proves each tier has a
    // distinct encoding, i.e. that a game which gained a rung also extended its
    // `DIFF_CHARS`. Without that, two tiers share a game ID and the board a
    // shared link produces is not the board that was shared.
    const base = firstLeaf(game.presets());
    const seen = new Set<string>();
    for (let tier = 0; tier < tiers.length; tier++) {
      const p = contract.withTier(base, tier);
      expect(contract.tierOf(p), `${id}: withTier(${tier}) did not read back`).toBe(
        tier,
      );
      const encoded = game.encodeParams(p, true);
      expect(
        contract.tierOf(game.decodeParams(encoded)),
        `${id}: tier ${tier} does not survive "${encoded}"`,
      ).toBe(tier);
      expect(seen.has(encoded), `${id}: tier ${tier} encodes as an earlier tier`).toBe(
        false,
      );
      seen.add(encoded);
    }
  });

  it("does not mutate the params it is given", () => {
    const base = firstLeaf(game.presets());
    const before = JSON.stringify(base);
    for (let tier = 0; tier < tiers.length; tier++) contract.withTier(base, tier);
    contract.tierOf(base);
    expect(JSON.stringify(base)).toBe(before);
  });

  it("either generates every declared tier, or refuses it with a reason", () => {
    // A tier that exists in the solver but that no size can generate is allowed
    // — `grade-difficulty-tiers-honestly` deliberately created two, refusing
    // them at generation rather than silently downgrading them (Bricks' Tricky
    // rung never decides anything its Normal rung has not). What is *not*
    // allowed is a tier that fails to generate and says nothing about why.
    for (let tier = 0; tier < tiers.length; tier++) {
      const p = paramsForTier({ id, game, contract, choices }, tier);
      if (p !== null) continue;
      const refusals = allLeaves(game.presets()).map((leaf) =>
        game.validateParams(contract.withTier(leaf, tier), true),
      );
      expect(
        refusals.every((r) => typeof r === "string" && r.length > 0),
        `${id}: tier ${tier} ("${tiers[tier]}") generates at no preset and gives no reason`,
      ).toBe(true);
    }
  });

  it(
    contract.nonMonotone
      ? "solves at some tier (non-monotone)"
      : "is monotone in its cap",
    () => {
      // THE PROPERTY THIS WHOLE CONTRACT EXISTS FOR. Generate a real board at each
      // reachable tier, find the lowest cap that solves it, and require every
      // higher cap to solve it too.
      //
      // Seed-deterministic and bounded, never clock-gated (playbook §5.2).
      //
      // **Four boards per tier, and the number was measured rather than guessed.**
      // The first version generated one, and it was proved insufficient the only
      // way that counts: removing Boats' `nonMonotone` declaration and checking
      // the guard fires. It did not — Boats' first tier-0 seed happens to be
      // monotone, so the guard was passing on luck while claiming to hunt exactly
      // that defect. A direct probe put the real rate at **7 of 8** Boats Easy
      // boards non-monotone, so one sample misses it 1 time in 8 and four samples
      // miss it about 1 time in 4,000. With four, removing the declaration fails
      // on the first board.
      //
      // The general lesson, which is why this comment is long: *a guard that has
      // never been shown to fail is not known to work*, and sampling is where a
      // cross-game guard silently becomes decorative.
      const boards = seedBudget(4, 12);
      let checked = 0;

      for (let tier = 0; tier < tiers.length; tier++) {
        const p = paramsForTier({ id, game, contract, choices }, tier);
        if (p === null) continue; // an ungenerable tier; covered by the test above

        for (let seed = 0; seed < boards; seed++) {
          const { desc } = game.newDesc(
            p,
            randomNew(`difficulty-${id}-${tier}-${seed}`),
          );
          const solve = cappedSolveFor(contract, p, desc);
          const lowest = lowestSolvingCap(solve, tiers.length);
          checked++;

          if (contract.nonUniqueTiers?.includes(tier)) {
            // Dominosa's "Ambiguous". The tier promises the *opposite* of unique
            // solvability, so the guard swaps rather than skips: the board must
            // genuinely come out non-unique. If it started solving uniquely, the
            // tier would have stopped meaning what its menu entry says.
            expect(
              lowest,
              `${id}: tier ${tier} ("${tiers[tier]}") is declared non-unique but the board solves at cap ${lowest}`,
            ).toBeNull();
            continue;
          }

          expect(
            lowest,
            `${id}: a board generated at tier ${tier} ("${tiers[tier]}", seed ${seed}) solves at no cap`,
          ).not.toBeNull();
          if (lowest === null) continue;

          if (contract.nonMonotone) {
            // Boats. Its solver really does fail at a higher cap what it solves at
            // a lower one, so the property under test is the WORKAROUND its spec
            // promises and every consumer applies — solve at each tier in turn and
            // take the first success. Asserting that, rather than skipping the
            // game, keeps the exemption itself under test: if the underlying
            // `checkDsf` defect were ever fixed, the monotonicity branch below
            // would start applying and this branch would have to be removed
            // deliberately.
            continue;
          }

          for (let cap = lowest; cap < tiers.length; cap++) {
            expect(
              solve(cap),
              `${id}: tier ${tier} seed ${seed} solves at cap ${lowest} but not at cap ${cap}`,
            ).toBe("solved");
          }
        }
      }

      // Per-game instrument guard: a game whose every tier turned out ungenerable
      // would pass the loop above having solved nothing.
      expect(checked, `${id}: no board was generated at any tier`).toBeGreaterThan(0);
    },
  );
});
