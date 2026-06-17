/**
 * Behavioural tests for the engine's per-game preferences hook (the
 * idiomatic-TS realisation of upstream `get_prefs`/`set_prefs`): the
 * declarative `Game.prefs`, the midend's
 * `getPreferencesConfig`/`getPreferences`/`setPreferences`, value
 * coercion, retention across a new game, and the empty result for a
 * game that declares no prefs.
 */

import { describe, expect, it } from "vitest";
import { fakeGame } from "./fake-game.ts";
import type { Game } from "./game.ts";
import { Midend } from "./midend.ts";

/** A ui carrying the two preference shapes: a boolean and a choice. */
interface PrefUi {
  highlight: boolean;
  style: number; // 0 = Circles, 1 = Numbers
  scratch: number; // a non-pref field, reset by newUi each game
}

interface PrefState {
  n: number;
}

/** Smallest game exercising the prefs hook: a boolean pref defaulting
 * ON and a two-way choice pref defaulting to index 0. */
const prefGame: Game<{ n: number }, PrefState, "noop", PrefUi> = {
  id: "__pref__",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: false,
  canFormatAsText: false,
  defaultParams: () => ({ n: 1 }),
  presets: () => ({ title: "root", params: { n: 1 } }),
  encodeParams: (p) => `n${p.n}`,
  decodeParams: (s) => ({ n: Number(s.slice(1)) }),
  validateParams: () => null,
  newDesc: () => ({ desc: "d" }),
  validateDesc: () => null,
  newState: (p) => ({ n: p.n }),
  // Defaults live in newUi (the divergence point, exactly like Untangle):
  // highlight ON, style Circles.
  newUi: () => ({ highlight: true, style: 0, scratch: 0 }),
  interpretMove: () => null,
  executeMove: (s) => s,
  status: () => "ongoing",
  colours: () => [
    [1, 1, 1],
    [0, 0, 0],
  ],
  computeSize: () => ({ w: 10, h: 10 }),
  prefs: [
    {
      kw: "highlight",
      name: "Highlight things",
      type: "boolean",
      get: (ui) => ui.highlight,
      set: (ui, v) => {
        ui.highlight = v;
      },
    },
    {
      kw: "style",
      name: "Display style",
      type: "choices",
      choices: ["Circles", "Numbers"],
      get: (ui) => ui.style,
      set: (ui, v) => {
        ui.style = v;
      },
    },
  ],
};

function start(
  game = prefGame,
): Midend<{ n: number }, PrefState, "noop", PrefUi, unknown> {
  const m = new Midend(game);
  m.setCallbacks(
    () => {},
    () => {},
    () => {},
  );
  m.newGame();
  return m;
}

describe("engine preferences hook", () => {
  it("builds a config description from the declarative prefs", () => {
    const cfg = start().getPreferencesConfig();
    expect(cfg.title).toBe("__pref__");
    expect(cfg.items.highlight).toEqual({ type: "boolean", name: "Highlight things" });
    expect(cfg.items.style).toEqual({
      type: "choices",
      name: "Display style",
      choicenames: ["Circles", "Numbers"],
    });
  });

  it("reports current values read off the live ui (defaults from newUi)", () => {
    expect(start().getPreferences()).toEqual({ highlight: true, style: 0 });
  });

  it("round-trips set → get for both item types", () => {
    const m = start();
    expect(m.setPreferences({ highlight: false, style: 1 })).toBeUndefined();
    expect(m.getPreferences()).toEqual({ highlight: false, style: 1 });
  });

  it("applies only the keys present, leaving others unchanged", () => {
    const m = start();
    m.setPreferences({ style: 1 });
    expect(m.getPreferences()).toEqual({ highlight: true, style: 1 });
  });

  it("coerces loosely-typed values (DB JSON / legacy)", () => {
    const m = start();
    // A string index for a choice, a string boolean — as a permissive
    // store might hand back.
    m.setPreferences({ highlight: "true", style: "1" });
    expect(m.getPreferences()).toEqual({ highlight: true, style: 1 });
    m.setPreferences({ highlight: false });
    expect(m.getPreferences()).toEqual({ highlight: false, style: 1 });
  });

  it("repaints when a preference changes", () => {
    let redraws = 0;
    const m = new Midend(prefGame);
    m.setCallbacks(
      () => {},
      () => {},
      () => {
        redraws++;
      },
    );
    m.newGame();
    const before = redraws;
    m.setPreferences({ highlight: false });
    expect(redraws).toBeGreaterThan(before);
  });

  it("retains a preference across a new game (ui is recreated by newUi)", () => {
    const m = start();
    m.setPreferences({ highlight: false, style: 1 });
    m.newGame(); // recreates ui via newUi (defaults highlight=true, style=0)
    expect(m.getPreferences()).toEqual({ highlight: false, style: 1 });
  });

  it("reports an empty set for a game that declares no prefs", () => {
    const m = new Midend(fakeGame);
    m.setCallbacks(
      () => {},
      () => {},
      () => {},
    );
    m.newGame();
    expect(m.getPreferencesConfig().items).toEqual({});
    expect(m.getPreferences()).toEqual({});
    expect(m.setPreferences({ anything: true })).toBeUndefined();
  });

  it("stores prefs set before a game starts and applies them on start", () => {
    const m = new Midend(prefGame);
    m.setCallbacks(
      () => {},
      () => {},
      () => {},
    );
    // No game yet: setPreferences stores but cannot apply (no ui).
    expect(m.getPreferences()).toEqual({});
    m.setPreferences({ highlight: false, style: 1 });
    m.newGame();
    expect(m.getPreferences()).toEqual({ highlight: false, style: 1 });
  });
});
