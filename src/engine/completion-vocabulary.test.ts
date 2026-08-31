/**
 * **One completion vocabulary across games** — the guard behind the `ts-engine`
 * requirement of that name.
 *
 * "The player has solved this" and "a solver was used" are two things every
 * game has, and before `unify-cross-game-vocabulary` they went by
 * `completed`/`complete`/`solved`/`wasSolved`/`won` and
 * `cheated`/`usedSolve`/`hasCheated`/`solved`. That last collision is the
 * argument for the whole change: **Magnets spelled `cheated` as `solved`**,
 * which is the word Loopy and Undead used for `completed`. One word, opposite
 * meanings, in neighbouring files.
 *
 * ON THE INSTRUMENT, precisely — the two checks are not equally strong and it
 * matters which is which:
 *
 *  - The first walks a **real state** built by each game's own `newState`, and
 *    asks whether the two fields are there. That is a check on the object the
 *    engine actually reads, over a population derived from the registry, so a
 *    game is covered the day it registers. It does *not* play the game to a
 *    win, and so it does not check that the flags are ever *set* — each game's
 *    own suite does that, and `winFlash`'s callers would break loudly.
 *  - The second is a source pattern over the retired spellings, and is the
 *    weaker, list-shaped half. It is here because it names the failure in the
 *    terms a session would reintroduce it in.
 *
 * The exemption list has its own honesty check, which is the part that keeps
 * either of the above from decaying: an entry for a field the game *does* have
 * fails, so the list cannot quietly grow into a blanket.
 *
 * The vocabulary reaches the **saved bytes** too: the envelope's flag is
 * `cheated`, and a `v: 1` save that spells it `usedSolve` is upgraded on read
 * rather than discarded (`save.ts`). One word, one meaning, from a game's state
 * through to the file.
 *
 * `MinesUi.everCompleted` is deliberately not covered: it is a `Ui` field
 * meaning "was *ever* won" — it survives an undo, unlike the state's, and the
 * two would otherwise read as duplicates sitting next to each other.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { registerAllGames } from "../games/index.ts";
import type { Game } from "./game.ts";
import { randomNew } from "./random/index.ts";
import { getTsGame, registeredGameIds } from "./registry.ts";

beforeAll(registerAllGames);

type AnyGame = Game<unknown, unknown, unknown, unknown, unknown>;

/** The two names the engine derives from — `winFlash`'s parameter type, which
 * a type alone cannot be enumerated from at runtime. The test below asserts
 * that `winFlash` still takes exactly these, so the two cannot drift apart. */
const COMPLETION_FIELDS = ["completed", "cheated"] as const;

/** `flash.ts`'s own source, read rather than trusted. */
const FLASH_SRC: string = Object.values(
  import.meta.glob<string>("./flash.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
)[0];

/**
 * Games whose state genuinely lacks one of the two flags, **per field**, each
 * with the reason. The list is the point: "this game has no cheat flag" becomes
 * a decision somebody made rather than a condition nobody noticed.
 *
 * Per field rather than per game on purpose. Inertia has `cheated` and derives
 * completion from its gem count; exempting the whole game would hide the day it
 * lost `cheated` too.
 */
const NO_FLAG: Record<string, Partial<Record<"completed" | "cheated", string>>> = {
  blackbox: {
    completed: "the board is revealed rather than solved",
    cheated: "there is no Solve to cheat with",
  },
  bridges: { cheated: "the solve move is replayed like any other, leaving no flag" },
  cube: { cheated: "no solver" },
  guess: {
    completed: "the last row's feedback, read off the guess history",
    cheated: "no solver",
  },
  inertia: {
    completed: "the gem count reaching zero — and dying is a second outcome",
  },
  mosaic: {
    completed: "`notCompletedClues === 0`, the counter its win flash also reads",
  },
  pegs: { cheated: "no solver" },
  samegame: {
    cheated: "no solver; and 'stuck with moves left' is a second outcome",
  },
  sokoban: { cheated: "no solver" },
};

describe("one completion vocabulary", () => {
  it("names the two fields `winFlash` actually reads", () => {
    // Vacuity: an empty list would make every assertion below pass over nothing.
    expect(COMPLETION_FIELDS).toHaveLength(2);
    // …and the list is not free-standing: widening `winFlash` to a third flag
    // fails here rather than leaving this file guarding the old pair.
    const params = /from: \{([^}]*)\}/.exec(FLASH_SRC)?.[1] ?? "";
    const names = [...params.matchAll(/(\w+)\s*:/g)].map((m) => m[1]).sort();
    expect(names).toEqual([...COMPLETION_FIELDS].sort());
  });

  it("spells both flags the same way in every game that has them", () => {
    const ids = registeredGameIds();
    // Vacuity: how many things did we look at?
    expect(ids.length).toBeGreaterThanOrEqual(50);

    const offenders: string[] = [];
    let withCompleted = 0;
    let withCheated = 0;
    for (const id of ids) {
      const game = getTsGame(id) as AnyGame | undefined;
      if (!game) throw new Error(`${id} is registered but has no game object`);
      const params = game.defaultParams();
      const desc = game.newDesc(params, randomNew(`completion-vocab-${id}`)).desc;
      const state = game.newState(params, desc) as Record<string, unknown>;

      for (const field of COMPLETION_FIELDS) {
        if (Object.hasOwn(state, field)) {
          if (field === "completed") withCompleted++;
          else withCheated++;
        } else if (!NO_FLAG[id]?.[field]) {
          offenders.push(
            `${id}: no \`${field}\` on its state, and no reason on record`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
    // Vacuity from the other side: a check that found no flags anywhere would
    // pass silently.
    expect(withCompleted).toBeGreaterThanOrEqual(45);
    expect(withCheated).toBeGreaterThanOrEqual(40);
  });

  it("keeps the exemption list honest — no stale or vacuous entry", () => {
    const ids = new Set(registeredGameIds());
    const stale: string[] = [];
    for (const [id, fields] of Object.entries(NO_FLAG)) {
      if (!ids.has(id)) stale.push(`${id} is not a registered game`);
      const game = getTsGame(id) as AnyGame | undefined;
      if (!game) continue;
      const params = game.defaultParams();
      const desc = game.newDesc(params, randomNew(`completion-vocab-${id}`)).desc;
      const state = game.newState(params, desc) as Record<string, unknown>;
      // An exemption for a field the game *does* have is dead weight that would
      // silently cover a future removal.
      for (const field of Object.keys(fields)) {
        if (Object.hasOwn(state, field)) {
          stale.push(`${id}.${field} is exempted but the field exists`);
        }
      }
    }
    expect(stale).toEqual([]);
  });

  it("finds no game or engine module re-declaring a retired spelling", () => {
    const RETIRED = ["usedSolve", "hasCheated", "wasSolved", "cheating"];
    // The engine is scanned too, not just the games: the save envelope's flag
    // is part of this vocabulary, and it was the last holdout.
    const sources = {
      ...import.meta.glob<string>("../games/**/*.ts", {
        query: "?raw",
        import: "default",
        eager: true,
      }),
      ...import.meta.glob<string>("./*.ts", {
        query: "?raw",
        import: "default",
        eager: true,
      }),
    };
    // Vacuity: an unmatched glob yields `{}` and every assertion below passes.
    expect(Object.keys(sources).length).toBeGreaterThan(300);

    const offenders: string[] = [];
    for (const [path, src] of Object.entries(sources)) {
      for (const [i, line] of src.split("\n").entries()) {
        const re = new RegExp(
          `^\\s*(?:readonly\\s+)?(${RETIRED.join("|")})\\??\\s*:\\s*boolean`,
        );
        if (re.test(line)) offenders.push(`${path}:${i + 1}  ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
