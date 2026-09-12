/**
 * **One keyboard cursor, spelled one way, across the whole collection** —
 * the guard behind the `ts-engine` requirement "One keyboard-cursor vocabulary
 * across games".
 *
 * Before `unify-cross-game-vocabulary` the same three values went by ten
 * spellings of the flag and eight of the position, so nothing above the games
 * could ask where the cursor was. Renaming them fixes today; this file is what
 * stops the drift coming back one game at a time, which is how it arrived.
 *
 * ON THE INSTRUMENT. Two of the three checks are **derived**, and say so:
 *
 *  - The canonical shape is read out of `newCursor()` itself, not written down
 *    here. Add a field to `GridCursor` and this file tracks it the same day.
 *  - Every game's *actual* `newUi()` object is walked, so the population is the
 *    registry rather than a list somebody has to remember to extend — and a
 *    cursor hidden under a differently-named field is caught **structurally**,
 *    by its shape, with no name matching at all.
 *
 * The third check is a source pattern over the retired spellings, and that one
 * is a list; it is here because it names the failure in the terms a session
 * would reintroduce it in (`hshow`, `cshow`, `curVisible`, …). The structural
 * check above is the one that holds when somebody invents an eleventh spelling.
 *
 * The shadowing half of the contract — a game re-declaring a `pointer.ts`
 * helper such as `moveCursor` — is guarded in `emittable-keys.test.ts`, derived
 * from that module's export list.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { registerAllGames } from "../games/index.ts";
import type { Game } from "./game.ts";
import { CURSOR_RIGHT, newCursor } from "./pointer.ts";
import { randomNew } from "./random/index.ts";
import { getTsGame, registeredGameIds } from "./registry.ts";

beforeAll(registerAllGames);

type AnyGame = Game<unknown, unknown, unknown, unknown, unknown>;

/** The cursor's field names, read off the engine's own constructor. */
const CURSOR_KEYS = Object.keys(newCursor()).sort();

/** The canonical `Ui` field the whole collection holds its cursor under. */
const CURSOR_FIELD = "cursor";

/** True iff `v` has exactly the shape `newCursor()` produces. */
function isCursorShaped(v: unknown): boolean {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const keys = Object.keys(v).sort();
  return (
    keys.length === CURSOR_KEYS.length && keys.every((k, i) => k === CURSOR_KEYS[i])
  );
}

/** A fresh `Ui` per game, built through the game's own `newUi`. */
function uis(): { id: string; ui: Record<string, unknown> }[] {
  const out: { id: string; ui: Record<string, unknown> }[] = [];
  for (const id of registeredGameIds()) {
    const game = getTsGame(id) as AnyGame | undefined;
    if (!game) throw new Error(`${id} is registered but has no game object`);
    const params = game.defaultParams();
    // The board is irrelevant — only the `Ui` `newUi` builds from it is — but
    // the seed is fixed so a failure names the same board every run.
    const desc = game.newDesc(params, randomNew(`cursor-vocab-${id}`)).desc;
    out.push({
      id,
      ui: game.newUi(game.newState(params, desc)) as Record<string, unknown>,
    });
  }
  return out;
}

describe("one keyboard-cursor vocabulary", () => {
  it("reads a plausible cursor shape from the engine", () => {
    // Vacuity: if `newCursor()` ever returns `{}` every check below passes over
    // nothing and reports health.
    expect(CURSOR_KEYS).toEqual(["visible", "x", "y"]);
  });

  it("holds every cursor under one field, named the same everywhere", () => {
    const all = uis();
    // Vacuity: how many things did we look at?
    expect(all.length).toBe(registeredGameIds().length);
    expect(all.length).toBeGreaterThanOrEqual(50);

    const misplaced: string[] = [];
    let withCursor = 0;
    for (const { id, ui } of all) {
      for (const [field, value] of Object.entries(ui)) {
        if (!isCursorShaped(value)) continue;
        if (field === CURSOR_FIELD) withCursor++;
        else misplaced.push(`${id}: Ui.${field} is a cursor but is not \`cursor\``);
      }
    }
    expect(misplaced).toEqual([]);
    // Vacuity again, from the other side: a structural check that finds no
    // cursors at all would pass silently.
    expect(withCursor).toBeGreaterThanOrEqual(45);
  });

  it("reveals and moves on one arrow press, in every game with a cursor", () => {
    // The player-visible half of the contract, and the one that had no net at
    // all: five games (Pearl, Range, Signpost, Sixteen, Tracks) spent the first
    // press on the reveal, and every one of their suites stayed green when that
    // was changed. Nothing below any individual game could see it, because the
    // question is only interesting across the collection.
    const stalled: string[] = [];
    let checked = 0;
    for (const { id, ui } of uis()) {
      const cursor = ui[CURSOR_FIELD];
      if (!isCursorShaped(cursor)) continue;
      const c = cursor as { x: number; y: number; visible: boolean };
      const game = getTsGame(id) as AnyGame;
      const params = game.defaultParams();
      const desc = game.newDesc(params, randomNew(`cursor-vocab-${id}`)).desc;
      const state = game.newState(params, desc);
      const ds = game.newDrawState?.(state) as Record<string, number> | undefined;
      // Both spellings are in use across the collection's draw states.
      if (ds && "tileSize" in ds) ds["tileSize"] = game.preferredTileSize ?? 32;
      if (ds && "tileSize" in ds) ds["tileSize"] = game.preferredTileSize ?? 32;

      const before = { ...c };
      expect(before.visible, `${id} starts with a hidden cursor`).toBe(false);
      game.interpretMove(state, ui, ds, { x: 0, y: 0 }, CURSOR_RIGHT);
      checked++;
      const moved = c.x !== before.x || c.y !== before.y;
      if (!moved) {
        stalled.push(
          `${id}: one arrow press revealed the cursor without moving it ` +
            `(${before.x},${before.y}) → (${c.x},${c.y})`,
        );
      }
    }
    expect(stalled).toEqual([]);
    // Vacuity: a loop that skipped every game would report health.
    expect(checked).toBeGreaterThanOrEqual(45);
  });

  it("finds no game re-declaring a retired cursor spelling", () => {
    const RETIRED = [
      "hshow",
      "cshow",
      "curVisible",
      "cursorVisible",
      "cursorShow",
      "cursorActive",
      "displayCur",
      "displaySel",
    ];
    const sources = import.meta.glob<string>("../games/**/*.ts", {
      query: "?raw",
      import: "default",
      eager: true,
    });
    // Vacuity: an unmatched glob yields `{}` and every assertion below passes.
    expect(Object.keys(sources).length).toBeGreaterThan(300);

    const offenders: string[] = [];
    for (const [path, src] of Object.entries(sources)) {
      for (const [i, line] of src.split("\n").entries()) {
        const decl = new RegExp(
          `^\\s*(?:readonly\\s+)?(${RETIRED.join("|")})\\??\\s*:\\s*boolean`,
        ).exec(line);
        if (decl) offenders.push(`${path}:${i + 1}  ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/** `pointer.ts`'s own source, so this file cannot end up describing a contract
 * that has been renamed out from under it. */
const POINTER_SRC: string = Object.values(
  import.meta.glob<string>("./pointer.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
)[0];

it("pointer.ts still exports the cursor vocabulary this guard derives from", () => {
  for (const name of [
    "GridCursor",
    "newCursor",
    "moveCursor",
    "showCursor",
    "hideCursor",
  ]) {
    expect(POINTER_SRC).toMatch(new RegExp(`export (?:interface|function) ${name}\\b`));
  }
});
