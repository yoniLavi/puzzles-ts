/**
 * A params corpus for every registered game — **derived from the registry and
 * from each game's own declarations, never authored**.
 *
 * It holds each game's encoded params byte-stable: params appear in shared game
 * IDs, so an encoding is a promise to players (`ts-migration` spec, "Encoded
 * params are byte-stable, and the guard is derived").
 *
 * **Where the cases come from**, in order of how much they are worth:
 *
 * 1. **Every preset**, walked out of `presets()`. These are the params a player
 *    can actually reach from the menu, and they are the only cases that cover a
 *    game's modes and tiers as the game itself intends them.
 * 2. **Every difficulty tier**, applied to the default params through the
 *    game's own difficulty `paramConfig` item. A game whose presets do not
 *    offer every tier (several offer tiers only at some sizes) is covered here
 *    instead, and the tier is written through the same `set` the Custom dialog
 *    uses rather than by poking a field this module guessed the name of.
 * 3. **One perturbation per field** of the default params: a number bumped, a
 *    boolean flipped. Generic on purpose — it needs no per-game knowledge, and
 *    it is what catches a codec that encodes a field in the preset range and
 *    drops it outside.
 *
 * Perturbed params are frequently **invalid** (a bumped `n` that no longer
 * divides the grid, a tier a game does not offer), and that is deliberate:
 * `encodeParams` and `decodeParams` are asked only to be inverses of each
 * other, never to be a validator. `validateParams` is what rejects a bad board,
 * and it runs on the far side of the codec.
 *
 * Dev/test-only; never imported by production code.
 */

import "../../games/index.ts";
import { difficultyChoiceItem } from "../difficulty.ts";
import type { PresetMenu } from "../game.ts";
import { getTsGame, registeredGameIds } from "../registry.ts";
import type { AnyGame } from "./enrollment.ts";

export type { AnyGame };

/** A params record as this module handles it: plain fields, no methods. */
export type AnyParams = Record<string, unknown>;

/** One corpus entry: a params object and how it was arrived at. */
export interface ParamsCase {
  /** Stable, sortable provenance — `preset:8x8 Easy`, `bump:w`, `tier:2`. */
  readonly label: string;
  readonly params: AnyParams;
}

/**
 * Every registered game, by puzzle id, sorted so the sweeps iterate in a
 * stable order. The side-effect import above is what populates the registry.
 */
export const PARAMS_GAMES: [string, AnyGame][] = registeredGameIds()
  .sort()
  .map((id): [string, AnyGame] => [id, getTsGame(id) as AnyGame]);

/**
 * How many games the registry offered — the **vacuity guard** every derived
 * sweep in this repo owes. An unpopulated registry would leave every
 * downstream assertion passing over nothing and reporting health.
 */
export const REGISTERED_GAME_COUNT = registeredGameIds().length;

/** Walk a preset menu to its leaves, labeling each by its title path. */
function presetCases(menu: PresetMenu<AnyParams>, path: string[] = []): ParamsCase[] {
  const here = [...path, menu.title].filter((t) => t.length > 0);
  if (menu.params !== undefined) {
    return [{ label: `preset:${here.join("/")}`, params: { ...menu.params } }];
  }
  return (menu.submenu ?? []).flatMap((sub) => presetCases(sub, here));
}

/**
 * Numeric fields that are the **length of another field**, and so cannot be
 * perturbed on their own.
 *
 * Boats' `fleet` is how many boats there are and `fleetData` lists their sizes,
 * so `fleet + 1` is not a bigger fleet, it is a params record that contradicts
 * itself — the encoder writes the four sizes it has while the decoder reads the
 * five it was promised. No player path can reach that state (the Custom dialog
 * writes both fields together), so a case built from it measures the corpus
 * rather than the codec.
 *
 * Derived from the record's own shape rather than from a roster of games: a
 * number equal to some sibling array's length is a cardinality field wherever
 * it appears, and a future game with the same shape is covered the day it
 * lands. An exemption roster would rot exactly as quietly as the membership
 * roster it replaces (AGENTS.md, "Convention over configuration").
 */
function cardinalityFields(base: AnyParams): Set<string> {
  const lengths = new Set(
    Object.values(base)
      .filter((v): v is unknown[] => Array.isArray(v))
      .map((v) => v.length),
  );
  return new Set(
    Object.keys(base).filter(
      (k) => typeof base[k] === "number" && lengths.has(base[k] as number),
    ),
  );
}

/**
 * The corpus for one game: its presets, every tier, and one perturbation per
 * field of the default params.
 *
 * Deterministic and duplicate-free — two presets that carry identical params
 * (a few games repeat a size across submenus) collapse to the first, so the
 * recorded table stays a set of distinct encodings rather than a transcript of
 * the menu.
 */
export function paramsCorpus(game: AnyGame): ParamsCase[] {
  const base = game.defaultParams() as AnyParams;
  const cases: ParamsCase[] = [{ label: "default", params: { ...base } }];

  cases.push(...presetCases(game.presets() as PresetMenu<AnyParams>));

  // The fields the difficulty item writes, found by *asking the item* rather
  // than by matching a field name: a tier is not always an index (Spokes stores
  // a string union, Loopy an object lookup). The perturbation pass below skips
  // them, so it never bumps a difficulty field to a value the game has no
  // letter for.
  const owned = new Set<string>();
  const item = difficultyChoiceItem<AnyParams>(game);
  if (item) {
    for (let tier = 0; tier < item.choices.length; tier++) {
      const params = { ...base };
      item.set(params, tier);
      cases.push({ label: `tier:${tier}`, params });
      for (const key of Object.keys(base))
        if (!Object.is(params[key], base[key])) owned.add(key);
    }
  }

  const counts = cardinalityFields(base);
  for (const key of Object.keys(base)) {
    if (owned.has(key) || counts.has(key)) continue;
    const value = base[key];
    if (typeof value === "number") {
      cases.push({ label: `bump:${key}`, params: { ...base, [key]: value + 1 } });
    } else if (typeof value === "boolean") {
      cases.push({ label: `flip:${key}`, params: { ...base, [key]: !value } });
    }
  }

  const seen = new Set<string>();
  return cases.filter((c) => {
    const key = canonical(c.params);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** A params record as a stable string, for de-duplication and for labeling a
 * recorded case. Key-sorted so two records differing only in field order read
 * as the same params, which they are. */
export function canonical(p: AnyParams): string {
  return Object.keys(p)
    .sort()
    .map((k) => `${k}=${String(p[k])}`)
    .join(",");
}
