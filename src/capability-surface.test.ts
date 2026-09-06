/*
 * What every game can do, snapshotted — the sweep's net for silent capability
 * loss.
 *
 * `re-express-the-collection` converts all 57 games, in batches, and its
 * characteristic failure is not breakage. A converted game that quietly stops
 * offering its keypad, its reference aid, its mistake checking or its hint
 * still compiles, still plays, and still passes most of its own tests — because
 * the tests that would have caught it are the ones that were deleted along with
 * the capability. At a scale of 57 that is the failure that will actually
 * happen, which is why this exists **before** the first game moves rather than
 * alongside it.
 *
 * WHY A SNAPSHOT AND NOT A LIST. The set is derived on every run — from
 * `Object.hasOwn` against the `Game` interface's own optional members, and from
 * the object `newUi` actually returned — so nothing here can be forgotten by a
 * game that changes. The snapshot is the *before* half of a diff, and its whole
 * job is to make a capability's disappearance a reviewable line in a text diff
 * rather than a silence. `vitest -u` re-baselines it, which is correct for an
 * intended change and is why the assertions below are not snapshots: a careless
 * `-u` must not be able to erase the guarantee (`docs/games/testing.md`).
 *
 * WHY NOT A MANIFEST. Because the change that drops a capability would drop its
 * manifest entry in the same edit, and nothing would notice — the shape this
 * repo has now reversed four times (`audit-declared-versus-derived-capabilities`,
 * and `engine/testing/enrollment.ts`'s opening comment for the argument).
 */

import { beforeAll, describe, expect, it } from "vitest";
import {
  builtGames,
  capabilitySets,
  OPTIONAL_GAME_MEMBERS,
} from "./engine/testing/enrollment.ts";
import { registerAllGames } from "./games/index.ts";

beforeAll(registerAllGames);

describe("capability surface", () => {
  it("reads a non-trivial contract and a full collection", () => {
    // The vacuity guard, on both derivations. An `import.meta.glob` that
    // matched nothing yields `{}`, an unregistered collection yields no games,
    // and every assertion below would then pass over nothing and report health
    // — the shape this repo has hit five times.
    expect(OPTIONAL_GAME_MEMBERS.length).toBeGreaterThanOrEqual(10);
    expect(builtGames().length).toBeGreaterThanOrEqual(57);
    expect(capabilitySets()).toHaveLength(builtGames().length);
  });

  it("knows exactly which games hold no Ui state, and why", () => {
    // A game whose `Ui` came back empty is far more likely to be a broken probe
    // — or a re-expression that dropped the `Ui` — than a game with genuinely
    // nothing to remember. One game is genuinely that, so the exemption is a
    // **ledger keyed to the derived set**, not a skip: the derivation says who,
    // and the ledger says why, one entry per member, asserted to be exactly the
    // set (`docs/games/testing.md` § "How a cross-game guard finds its
    // population"). If a converted game empties its `Ui`, this fails; if Cube
    // ever gains state, the stale entry fails too.
    // Both entries are games whose every gesture is a bare direction relative
    // to a position already in `State`, so there is nothing to carry between
    // moves — and both say so in their own types, as `Record<string, never>`.
    // The ledger was written with one entry and the derivation returned two,
    // which is the argument for deriving in miniature.
    const NO_UI_STATE: Record<string, string> = {
      cube: "Rolls a solid across a fixed grid; a move is a direction from where the solid already is. `CubeUi` is `Record<string, never>`.",
      sokoban:
        "Pushes crates by walking; a move is a direction from the player's own cell, which lives in `State`. `SokobanUi` is `Record<string, never>`.",
    };
    const empty = capabilitySets()
      .filter((c) => c.ui.length === 0)
      .map((c) => c.id);
    expect(empty).toEqual(Object.keys(NO_UI_STATE).sort());
  });

  it("derives membership from the object, not from a name", () => {
    // Anchors the derivation against three capabilities whose populations are
    // independently known, so a probe that silently stopped reading the game
    // object cannot pass by returning the same empty set for everyone.
    const sets = capabilitySets();
    const has = (m: string) =>
      sets.filter((c) => c.members.includes(m)).map((c) => c.id);

    // Hints: the enrollment the six cross-game hint guards already derive.
    expect(has("hint").length).toBeGreaterThan(20);
    // Mistake checking: a deliberate-divergence feature, widely but not
    // universally offered.
    expect(has("findMistakes").length).toBeGreaterThan(20);
    // And the negative direction: no game should carry a member the interface
    // does not declare.
    for (const c of sets) {
      for (const m of c.members) expect(OPTIONAL_GAME_MEMBERS).toContain(m);
    }
  });

  it("matches the recorded capability surface", () => {
    // The diff itself. A batch of `re-express-the-collection` is clean when
    // this does not move; a moved line is either an intended capability change
    // (re-baseline it, and say so in the change) or the sweep silently
    // shrinking a game (fix it).
    expect(capabilitySets()).toMatchSnapshot();
  });
});
