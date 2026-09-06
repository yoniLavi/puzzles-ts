/**
 * The invariant behind the shared run-length desc grammar: **a desc
 * `validateDesc` accepts is a desc `newState` can build a board from.**
 *
 * Each adopting game scans the grammar twice — once to check a desc, once to
 * build a board from it — and nothing held those two scans to each other. The
 * two loops now share their character arithmetic, but each game still decides
 * for itself which value characters it accepts, so the two can still disagree.
 *
 * **Membership is derived, never declared.** A game is in this sweep because
 * its own code imports the scanner; the ledger below is asserted equal to that
 * derivation, so a game that adopts the module joins on its next run and a game
 * that stops importing it drops out — neither can be forgotten.
 *
 * **What each half is worth, measured rather than claimed.** The pristine half
 * — every generated desc validates and parses — has teeth: flipping
 * `keepTrailingBlanks` in one adopter's encoder turns it red, because the game
 * then refuses to load its own board. The mutation half is weaker than it
 * reads, and it is worth knowing why before trusting it. It is a **crash
 * sweep**, not a proof that the two scans agree: a typed array swallows an
 * out-of-range write, so a desc that shifts a game's clues by one is parsed
 * silently and this notices nothing. Two deliberate breaks were tried against
 * it and neither was reachable from a mutated default-params desc. It catches
 * the class that does throw — loopy's `validateDesc` has a line reserved for a
 * grid description that trims away to nothing — and no more than that.
 */
import { describe, expect, it } from "vitest";
import "./games/index.ts";
import { randomNew, randomUpto } from "./engine/random/index.ts";
import {
  type AnyGame,
  builtGames,
  membersNotMentioning,
  SCANNED_SOURCE_FILES,
} from "./engine/testing/enrollment.ts";

/**
 * The games that had two hand-written copies of the run-length grammar and now
 * have none. **This may only grow**: the remaining games with a run-length desc
 * parse a different grammar (multi-digit values, `_` separators, or a second
 * run coding in the same desc), which `run-length.ts` documents and declines.
 */
const ADOPTERS = [
  "bridges",
  "filling",
  "loopy",
  "map",
  "mosaic",
  "palisade",
  "pearl",
  "slant",
];

/** Mutations per desc. Enough that some land on a still-acceptable desc. */
const MUTATIONS = 60;

/**
 * A one-character insert / delete / substitute, drawn from the desc's own
 * alphabet so a mutation is a *plausible* desc rather than obvious garbage —
 * mutating toward characters the game has never seen only exercises the
 * rejection path.
 */
function mutate(desc: string, alphabet: string, rng: ReturnType<typeof randomNew>) {
  if (desc.length === 0) return desc;
  const at = randomUpto(rng, desc.length);
  const ch = alphabet[randomUpto(rng, alphabet.length)];
  switch (randomUpto(rng, 3)) {
    case 0:
      return desc.slice(0, at) + ch + desc.slice(at);
    case 1:
      return desc.slice(0, at) + desc.slice(at + 1);
    default:
      return desc.slice(0, at) + ch + desc.slice(at + 1);
  }
}

describe("the shared run-length desc grammar", () => {
  it("is adopted by exactly the games this ledger names", () => {
    // Vacuity: an unmatched glob would leave every id trivially "not
    // mentioning" the module, and the ledger would then have to be empty.
    expect(SCANNED_SOURCE_FILES).toBeGreaterThan(250);
    const all = builtGames().map((g) => g.id);
    expect(all.length).toBeGreaterThanOrEqual(57);
    const adopters = all.filter(
      (id) => !membersNotMentioning([id], "engine/run-length.ts").length,
    );
    expect(adopters).toEqual(ADOPTERS);
  });

  it("accepts only descs it can then parse", () => {
    const games = new Map(builtGames().map((g) => [g.id, g.game as AnyGame]));
    let accepted = 0;
    let rejected = 0;
    let pristine = 0;

    for (const id of ADOPTERS) {
      const game = games.get(id);
      if (!game) throw new Error(`${id} is in the ledger but not registered`);
      const params = game.defaultParams();

      for (let n = 0; n < 2; n++) {
        const desc = game.newDesc(params, randomNew(`run-length-${id}-${n}`)).desc;

        // The generator's own output must validate and parse. If this fails the
        // game is broken outright, not merely inconsistent.
        expect(game.validateDesc(params, desc)).toBeNull();
        expect(() => game.newState(params, desc)).not.toThrow();
        pristine++;

        const alphabet = [...new Set(desc)].join("");
        const rng = randomNew(`run-length-mut-${id}-${n}`);
        for (let m = 0; m < MUTATIONS; m++) {
          const candidate = mutate(desc, alphabet, rng);
          if (game.validateDesc(params, candidate) !== null) {
            rejected++;
            continue;
          }
          accepted++;
          // The whole point: validation said yes, so parsing must not blow up.
          // `newUi` and `status` are in the assertion because the midend runs
          // all three together — a half-built board usually survives the
          // constructor and fails on the first thing that reads it.
          expect(() => {
            const state = game.newState(params, candidate);
            game.newUi(state);
            game.status(state);
          }, `${id}: validateDesc accepted "${candidate}" but building it threw`).not.toThrow();
        }
      }
    }

    // Vacuity, both ways. A run where nothing was accepted would assert only
    // that mutations are usually garbage; one where nothing was rejected would
    // mean `validateDesc` is not discriminating at all.
    expect(pristine).toBe(ADOPTERS.length * 2);
    expect(accepted).toBeGreaterThan(100);
    expect(rejected).toBeGreaterThan(400);
  });
});
