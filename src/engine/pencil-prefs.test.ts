import { beforeAll, describe, expect, it } from "vitest";
// Registering every game lets the drift guard below read each one's declared
// prefs. `beforeAll` re-runs it because under `isolate: false` a sibling file
// may have reset the shared registry after import-time registration ran.
import { registerAllGames } from "../games/index.ts";
import type { GamePref } from "./game.ts";
import {
  autoPencilPref,
  pencilKeepHighlightPref,
  stickyPencilPref,
} from "./pencil-prefs.ts";
import { getTsGame, registeredGameIds } from "./registry.ts";

beforeAll(registerAllGames);

describe("the shared pencil preferences", () => {
  it("drives ui.pencilSticky under upstream's keyword", () => {
    const pref = stickyPencilPref<{ pencilSticky: boolean }>();
    expect([pref.kw, pref.type]).toEqual(["sticky-pencil-mode", "boolean"]);
    const ui = { pencilSticky: false };
    expect(pref.get(ui)).toBe(false);
    if (pref.type !== "boolean") throw new Error("boolean pref");
    pref.set(ui, true);
    expect(ui.pencilSticky).toBe(true);
  });

  it("drives ui.pencilKeepHighlight under upstream's keyword", () => {
    const pref = pencilKeepHighlightPref<{ pencilKeepHighlight: boolean }>();
    expect([pref.kw, pref.type]).toEqual(["pencil-keep-highlight", "boolean"]);
    const ui = { pencilKeepHighlight: false };
    if (pref.type !== "boolean") throw new Error("boolean pref");
    pref.set(ui, true);
    expect(ui.pencilKeepHighlight).toBe(true);
    expect(pref.get(ui)).toBe(true);
  });

  it("takes auto-pencil's label from the game, since it names that game's regions", () => {
    const label = "When you place a number, remove it from pencil marks in its block";
    const pref = autoPencilPref<{ autoPencil: boolean }>(label);
    expect([pref.kw, pref.name]).toEqual(["auto-pencil", label]);
    const ui = { autoPencil: false };
    if (pref.type !== "boolean") throw new Error("boolean pref");
    pref.set(ui, true);
    expect(ui.autoPencil).toBe(true);
  });
});

// --- drift guard over every registered game -------------------------------

/** The labels that are the *collection's* wording, not a game's. A game
 * re-hand-rolling one of these would reintroduce exactly the divergence the
 * helpers exist to prevent — and a preference label is player-visible, so the
 * divergence would be too. `auto-pencil` is deliberately absent: its sentence
 * names the regions a placement clears, which genuinely differs per game. */
const SHARED_LABELS: Record<string, string> = {
  "sticky-pencil-mode": stickyPencilPref<{ pencilSticky: boolean }>().name,
  "pencil-keep-highlight": pencilKeepHighlightPref<{ pencilKeepHighlight: boolean }>()
    .name,
};

describe("Every game offering a shared pencil preference uses the shared wording", () => {
  it("has no game hand-rolling a divergent label", () => {
    const offenders: string[] = [];
    const seen = new Map<string, number>();
    for (const id of registeredGameIds()) {
      const prefs = (getTsGame(id)?.prefs ?? []) as GamePref<unknown>[];
      for (const pref of prefs) {
        const shared = SHARED_LABELS[pref.kw];
        if (shared === undefined) continue;
        seen.set(pref.kw, (seen.get(pref.kw) ?? 0) + 1);
        if (pref.name !== shared) offenders.push(`${id}/${pref.kw}: "${pref.name}"`);
      }
    }
    expect(offenders).toEqual([]);
    // A guard that matched nothing would pass silently for ever, so pin that
    // the shared prefs are actually reached (ten and five games respectively
    // as of adopt-declarative-config-helpers).
    expect(seen.get("sticky-pencil-mode") ?? 0).toBeGreaterThanOrEqual(10);
    expect(seen.get("pencil-keep-highlight") ?? 0).toBeGreaterThanOrEqual(5);
  });
});
