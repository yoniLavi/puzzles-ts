/**
 * **Params encodings are a promise to players, and this is where the promise is
 * kept.**
 *
 * A game's params appear inside every shared game ID, so changing how a game
 * encodes them silently invalidates every link anyone has ever shared of it.
 * `ts-migration` states that as policy — *"existing games keep their
 * byte-stable codecs permanently"* — and until this file nothing in the tree
 * asserted it. The frozen differentials cover **descs**, not params, so a codec
 * could have been rewritten with the whole suite green.
 *
 * Two guarantees, and they do different jobs:
 *
 * 1. **Encode and decode are mutual inverses**, for all 612 cases. This is a
 *    property, not a fixture — it stays true when a preset is added and it
 *    cannot be re-baselined by a careless `vitest -u`. It held for all 57 games
 *    on the day it was written, so it is asserted for all of them with no
 *    exemption roster.
 * 2. **The recorded encodings do not move**, as a per-game snapshot. This is
 *    the fixture, and it is the one that makes replacing a codec safe: a
 *    derived codec that produces a different string for any reachable params is
 *    a compatibility break, and it shows up here as a reviewable text diff
 *    rather than as a broken link in a player's chat history.
 *
 * The corpus is derived — see `testing/params-corpus.ts` for where the cases
 * come from and why the perturbed ones are deliberately invalid.
 */

import { describe, expect, it } from "vitest";
import {
  PARAMS_GAMES,
  paramsCorpus,
  REGISTERED_GAME_COUNT,
} from "./testing/params-corpus.ts";

/** Every game's corpus, computed once. */
const CORPUS = PARAMS_GAMES.map(
  ([id, game]) => [id, game, paramsCorpus(game)] as const,
);

describe("params corpus", () => {
  it("covers every registered game", () => {
    expect(PARAMS_GAMES.length).toBe(REGISTERED_GAME_COUNT);
    expect(REGISTERED_GAME_COUNT).toBeGreaterThanOrEqual(57);
  });

  it("draws enough cases from each game to be worth asserting", () => {
    // The vacuity guard this repo owes every derived sweep: a corpus that
    // silently found nothing — an unpopulated registry, a `presets()` that
    // returned an empty menu — would leave every assertion below passing over
    // nothing and reporting health.
    const total = CORPUS.reduce((n, [, , cases]) => n + cases.length, 0);
    expect(total).toBeGreaterThanOrEqual(600);
    for (const [id, , cases] of CORPUS) {
      expect(`${id}:${cases.length >= 3}`).toBe(`${id}:true`);
    }
  });
});

describe("encodeParams and decodeParams are mutual inverses", () => {
  for (const [id, game, cases] of CORPUS) {
    it(id, () => {
      for (const c of cases) {
        const full = game.encodeParams(c.params, true);
        const reencoded = game.encodeParams(game.decodeParams(full), true);
        // Compared through the encoding rather than by deep-equaling the two
        // params records: a record may legitimately carry fields the codec does
        // not round-trip (a derived default, a coupled array), and the string
        // is what a shared game ID actually contains.
        expect(`${c.label} ${reencoded}`).toBe(`${c.label} ${full}`);
      }
    });
  }
});

describe("encoded params are byte-stable", () => {
  for (const [id, game, cases] of CORPUS) {
    it(id, () => {
      const table = cases.map((c) => {
        const full = game.encodeParams(c.params, true);
        const brief = game.encodeParams(c.params, false);
        return `${c.label}  full=${full}${brief === full ? "" : `  brief=${brief}`}`;
      });
      // Re-baselining this snapshot is a **compatibility decision**, not a
      // formatting one: every line that moves is a shared game ID that stops
      // resolving to the board it named. `vitest -u` here needs the owner's
      // say-so, per AGENTS.md ("Nothing is sacred": player- and data-visible
      // changes are proposed, not just done).
      expect(table.join("\n")).toMatchSnapshot();
    });
  }
});
