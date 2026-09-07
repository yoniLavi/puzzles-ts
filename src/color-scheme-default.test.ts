/**
 * **The two color-scheme defaults must agree**, because they run at different
 * moments and disagreement is visible as a flash.
 *
 * `color-scheme-init.ts` is inlined into every page's `<head>` and runs before
 * anything else, precisely so the first paint is already the right scheme. It
 * cannot read the settings store — that is Dexie, and it is asynchronous — so
 * it carries its own copy of the default. `settings.ts` then loads and applies
 * the stored preference, or the store's default if there is none.
 *
 * If the two copies differ, a player with no stored preference gets the init
 * script's answer painted and the store's answer a moment later: a flash of the
 * wrong scheme on every cold load, for exactly the players who never touched
 * the setting. That is most of them.
 *
 * The check reads both files as text, because the drift is two spellings of one
 * decision in two files, and the init script cannot be imported here — it has
 * top-level side effects on `document`.
 */
import { describe, expect, it } from "vitest";

const sources = import.meta.glob<string>("./{color-scheme-init,store/settings}.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

const initSource = sources["./color-scheme-init.ts"] ?? "";
const settingsSource = sources["./store/settings.ts"] ?? "";

describe("the color-scheme default is one decision", () => {
  it("reads both files", () => {
    // Vacuity: either glob missing would compare undefined to undefined.
    expect(initSource).toContain("defaultIsDark");
    expect(settingsSource).toContain("declare colorScheme");
  });

  it("the early-paint script and the settings store default to the same scheme", () => {
    // `null` in the init script means "ask the system"; "system" is the store's
    // word for the same thing. The mapping is spelled out rather than inferred,
    // so a third value added later fails here instead of silently comparing
    // unequal strings.
    const initDefault = /const defaultIsDark:[^=]*=\s*(null|true|false)\s*;/.exec(
      initSource,
    )?.[1];
    expect(initDefault, "no `defaultIsDark` in color-scheme-init.ts").toBeDefined();

    const storeDefault =
      /@commonSetting\(\{[\s\S]{0,600}?default:\s*"(light|dark|system)"[\s\S]{0,600}?declare colorScheme/.exec(
        settingsSource,
      )?.[1];
    expect(storeDefault, "no colorScheme default in settings.ts").toBeDefined();

    const asStoreWord = { null: "system", true: "dark", false: "light" } as const;
    expect(
      asStoreWord[initDefault as keyof typeof asStoreWord],
      "the inlined early-paint script and the settings store disagree about " +
        "the default color scheme, so a player with no stored preference sees " +
        "one scheme painted and the other applied a moment later",
    ).toBe(storeDefault);
  });
});
