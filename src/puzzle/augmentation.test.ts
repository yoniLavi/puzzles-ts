import { beforeAll, describe, expect, it } from "vitest";
import type { Game, PresetMenu } from "../engine/game.ts";
import { getTsGame } from "../engine/registry.ts";
// Register every TS-ported game so the registry is populated and we can
// drive each game's `describeParams` through the matching `describeConfig`
// augmentation template. `beforeAll` re-runs it because under
// `isolate: false` a sibling file may have reset the shared registry after
// this module's import-time registration ran.
import { registerAllGames } from "../games/index.ts";
import { puzzleIds } from "./catalog.ts";

beforeAll(registerAllGames);

import { difficultyChoiceItem, difficultyTiers } from "../engine/difficulty.ts";
import type { ConfigValues, PuzzleId } from "../engine/types.ts";
import { type ChoiceNames, puzzleAugmentations } from "./augmentation.ts";

type AnyGame = Game<unknown, unknown, unknown, unknown, unknown>;

/** Every leaf preset's params, plus the default, for one game. */
function allPresetParams(game: AnyGame): unknown[] {
  const out: unknown[] = [game.defaultParams()];
  const walk = (menu: PresetMenu<unknown>): void => {
    if (menu.submenu) {
      for (const child of menu.submenu) {
        walk(child);
      }
    } else {
      out.push(menu.params);
    }
  };
  walk(game.presets());
  return out;
}

/**
 * Replicate the worker adapter's `decodeCustomParams` config base: a generic
 * `width`/`height` from `w`/`h` params, then the game's own `describeParams`
 * spread over it (`src/puzzle/worker-adapter.ts`).
 */
function configFor(game: AnyGame, p: unknown): ConfigValues {
  const rec = p as Record<string, unknown>;
  const base: ConfigValues = {};
  if ("w" in rec && rec["w"] !== undefined) {
    base["width"] = String(rec["w"]);
  }
  if ("h" in rec && rec["h"] !== undefined) {
    base["height"] = String(rec["h"]);
  }
  return { ...base, ...game.describeParams?.(p) };
}

// Matches `configFormatter`'s field token: `{field}` or `{field:opt|opt}`.
const TEMPLATE_FIELD = /\{[a-z0-9-]+(?::[^}]*)?}/;

/**
 * Replicate `Puzzle.getChoiceNames`: each `choices` field's declared option
 * names, read off the game's own `paramConfig` — which is what the midend
 * builds the `ConfigDescription` from, and what the real call passes in.
 */
function choiceNamesFor(game: AnyGame): ChoiceNames {
  const names: ChoiceNames = {};
  for (const item of game.paramConfig ?? []) {
    if (item.type === "choices") {
      names[item.kw] = item.choices;
    }
  }
  return names;
}

describe("describeParams covers every augmentation template field", () => {
  for (const id of puzzleIds) {
    const aug = puzzleAugmentations[id as PuzzleId];
    if (!aug?.describeConfig) {
      continue;
    }
    const describeConfig = aug.describeConfig;
    it(`${id}: no unsubstituted {field} placeholder in any preset header`, () => {
      const game = getTsGame(id);
      expect(game, `${id} is in the catalog but not registered`).toBeDefined();
      if (!game) {
        return;
      }
      for (const p of allPresetParams(game)) {
        const rendered = describeConfig(configFor(game, p), choiceNamesFor(game));
        // A surviving `{difficulty:Easy|Tricky}`-style token means
        // describeParams omitted a key the template needs.
        expect(
          TEMPLATE_FIELD.test(rendered),
          `${id} params ${JSON.stringify(p)} rendered "${rendered}" with an unsubstituted template field`,
        ).toBe(false);
      }
    });
  }
});

/**
 * **The check the one above could not be.** It asserts a token was *replaced*,
 * and substituting the wrong word is still substituting — so it stayed green
 * while 19 of the 21 games that spelled their tier lists named a tier the game
 * does not have, and Bricks offered three words for two tiers.
 *
 * This one compares the word a player actually reads against the tier the
 * params carry. Wrong word, wrong order and wrong count all fail it.
 */
describe("the type header names the tier the game declares", () => {
  let checked = 0;

  for (const id of puzzleIds) {
    const aug = puzzleAugmentations[id as PuzzleId];
    if (!aug?.describeConfig) {
      continue;
    }
    const describeConfig = aug.describeConfig;
    it(`${id}: every tier renders as its declared name`, () => {
      const game = getTsGame(id);
      expect(game, `${id} is in the catalog but not registered`).toBeDefined();
      if (!game) {
        return;
      }
      const tiers = difficultyTiers(game);
      const item = difficultyChoiceItem(game);
      if (!tiers || !item) {
        return; // not a tiered game; nothing to name
      }
      for (let tier = 0; tier < tiers.length; tier++) {
        const p = game.defaultParams();
        item.set(p, tier);
        const rendered = describeConfig(configFor(game, p), choiceNamesFor(game));
        checked++;
        // Substring rather than equality: the header carries a size and other
        // fields around the tier word. What matters is that the word present is
        // this tier's, and that no *other* tier's word is.
        expect(
          rendered.includes(tiers[tier]),
          `${id} tier ${tier} should read "${tiers[tier]}" but rendered "${rendered}"`,
        ).toBe(true);
      }
    });
  }

  it("looked at enough tiers to be worth asserting", () => {
    // The vacuity guard: a template scan that matched nothing, or a registry
    // that came up empty, would leave every assertion above passing over
    // nothing. 29 games declare tiers, most with two or three.
    expect(checked).toBeGreaterThanOrEqual(40);
  });
});
