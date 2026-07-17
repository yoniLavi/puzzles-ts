import { beforeAll, describe, expect, it } from "vitest";
import type { Game, PresetMenu } from "../native/engine/game.ts";
import { getTsGame } from "../native/engine/registry.ts";
// Register every TS-ported game so the registry is populated and we can
// drive each game's `describeParams` through the matching `describeConfig`
// augmentation template. `beforeAll` re-runs it because under
// `isolate: false` a sibling file may have reset the shared registry after
// this module's import-time registration ran.
import { registerAllGames } from "../native/games/index.ts";
import { TS_PORTED_PUZZLE_IDS } from "../native/games/ts-ported-ids.ts";

beforeAll(registerAllGames);

import { puzzleAugmentations } from "./augmentation.ts";
import type { ConfigValues, PuzzleId } from "./types.ts";

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
 * spread over it (`src/native/engine/worker-adapter.ts`).
 */
function configFor(game: AnyGame, p: unknown): ConfigValues {
  const rec = p as Record<string, unknown>;
  const base: ConfigValues = {};
  if ("w" in rec && rec.w !== undefined) {
    base.width = String(rec.w);
  }
  if ("h" in rec && rec.h !== undefined) {
    base.height = String(rec.h);
  }
  return { ...base, ...game.describeParams?.(p) };
}

// Matches `configFormatter`'s field token: `{field}` or `{field:opt|opt}`.
const TEMPLATE_FIELD = /\{[a-z0-9-]+(?::[^}]*)?}/;

describe("describeParams covers every augmentation template field", () => {
  for (const id of TS_PORTED_PUZZLE_IDS) {
    const aug = puzzleAugmentations[id as PuzzleId];
    if (!aug?.describeConfig) {
      continue;
    }
    const describeConfig = aug.describeConfig;
    it(`${id}: no unsubstituted {field} placeholder in any preset header`, () => {
      const game = getTsGame(id);
      expect(game, `${id} is in TS_PORTED_PUZZLE_IDS but not registered`).toBeDefined();
      if (!game) {
        return;
      }
      for (const p of allPresetParams(game)) {
        const rendered = describeConfig(configFor(game, p));
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
