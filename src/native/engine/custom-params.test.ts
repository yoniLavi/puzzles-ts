import { beforeAll, describe, expect, it } from "vitest";

// Register every TS-ported game so the round-trip guard below can drive
// each game's declared `paramConfig`. `beforeAll` re-runs it because under
// `isolate: false` a sibling file (worker-adapter) may have reset the
// shared registry after this module's import-time registration ran.
import { registerAllGames } from "../games/index.ts";
import { TS_PORTED_PUZZLE_IDS } from "../games/ts-ported-ids.ts";
import type { Game, ParamConfigItem, PresetMenu } from "./game.ts";
import { Midend } from "./midend.ts";
import { getTsGame } from "./registry.ts";

beforeAll(registerAllGames);

// A tiny game exercising all three `paramConfig` types (string / boolean
// / choices) over a params object, so the midend round-trip can be
// asserted end-to-end without depending on any real game's shape.
interface TParams {
  w: number;
  flag: boolean;
  mode: number;
}
type TState = { done: boolean };
type TMove = "noop";

const paramConfig: ParamConfigItem<TParams>[] = [
  {
    kw: "width",
    name: "Width",
    type: "string",
    get: (p) => String(p.w),
    set: (p, v) => {
      p.w = Number.parseInt(v || "0", 10);
    },
  },
  {
    kw: "flag",
    name: "Flag",
    type: "boolean",
    get: (p) => p.flag,
    set: (p, v) => {
      p.flag = v;
    },
  },
  {
    kw: "mode",
    name: "Mode",
    type: "choices",
    choices: ["Alpha", "Beta", "Gamma"],
    get: (p) => p.mode,
    set: (p, v) => {
      p.mode = v;
    },
  },
];

function makeGame(
  overrides: Partial<Game<TParams, TState, TMove, null, null>> = {},
): Game<TParams, TState, TMove, null, null> {
  return {
    id: "__cfg__",
    wantsStatusbar: false,
    isTimed: false,
    canSolve: false,
    canFormatAsText: false,
    defaultParams: () => ({ w: 5, flag: false, mode: 1 }),
    presets: () => ({ title: "root", params: { w: 5, flag: false, mode: 1 } }),
    encodeParams: (p) => `${p.w}${p.flag ? "f" : ""}m${p.mode}`,
    decodeParams: (s) => {
      const m = /^(\d+)(f?)m(\d+)$/.exec(s);
      if (!m) throw new Error(`bad params "${s}"`);
      return { w: Number(m[1]), flag: m[2] === "f", mode: Number(m[3]) };
    },
    validateParams: (p) => (p.w > 0 ? null : "Width must be at least one"),
    paramConfig,
    newDesc: () => ({ desc: "d" }),
    validateDesc: () => null,
    newState: () => ({ done: false }),
    newUi: () => null,
    interpretMove: () => null,
    executeMove: (s) => s,
    status: () => "ongoing",
    colours: () => [
      [1, 1, 1],
      [0, 0, 0],
    ],
    computeSize: () => ({ w: 10, h: 10 }),
    ...overrides,
  };
}

describe("Midend custom-params round-trip", () => {
  it("builds a ConfigDescription from paramConfig (one item per field, typed)", () => {
    const m = new Midend(makeGame());
    const cfg = m.getCustomParamsConfig();
    expect(cfg.title).toBe("__cfg__");
    expect(cfg.items.width).toEqual({ type: "string", name: "Width" });
    expect(cfg.items.flag).toEqual({ type: "boolean", name: "Flag" });
    expect(cfg.items.mode).toEqual({
      type: "choices",
      name: "Mode",
      choicenames: ["Alpha", "Beta", "Gamma"],
    });
  });

  it("reads the current params as initial values", () => {
    const m = new Midend(makeGame());
    expect(m.getCustomParams()).toEqual({ width: "5", flag: false, mode: 1 });
  });

  it("applies valid submitted values and adopts the new params", () => {
    const m = new Midend(makeGame());
    const err = m.setCustomParams({ width: "12", flag: true, mode: 2 });
    expect(err).toBeUndefined();
    expect(m.getParams()).toBe("12fm2");
    expect(m.getCustomParams()).toEqual({ width: "12", flag: true, mode: 2 });
  });

  it("rejects invalid values with the game's validateParams message, unchanged", () => {
    const m = new Midend(makeGame());
    const before = m.getParams();
    const err = m.setCustomParams({ width: "0" });
    expect(err).toBe("Width must be at least one");
    expect(m.getParams()).toBe(before);
  });

  it("applies only submitted keys, leaving the rest at their current value", () => {
    const m = new Midend(makeGame());
    // Only width submitted: flag/mode keep the current params' values.
    expect(m.setCustomParams({ width: "7" })).toBeUndefined();
    expect(m.getParams()).toBe("7m1");
  });

  it("does not mutate the live params when validation fails", () => {
    // A rejected edit that touches several fields must leave ALL of them
    // as they were — the midend applies onto a copy, not live params.
    const m = new Midend(makeGame());
    m.setCustomParams({ width: "0", flag: true, mode: 2 });
    expect(m.getCustomParams()).toEqual({ width: "5", flag: false, mode: 1 });
  });

  it("encodeCustomParams returns the encoded id, or #ERROR: on invalid", () => {
    const m = new Midend(makeGame());
    expect(m.encodeCustomParams({ width: "9", flag: true, mode: 0 })).toBe("9fm0");
    expect(m.encodeCustomParams({ width: "0" })).toBe(
      "#ERROR:Width must be at least one",
    );
    // A preview never adopts the params.
    expect(m.getParams()).toBe("5m1");
  });

  it("coerces loosely-typed values at the boundary (DB/JSON strings)", () => {
    const m = new Midend(makeGame());
    // The app form submits typed values, but a persisted/legacy value may
    // arrive as a string; boolean and choices coerce like applyPrefs.
    expect(m.setCustomParams({ width: "8", flag: "true", mode: "2" })).toBeUndefined();
    expect(m.getParams()).toBe("8fm2");
  });
});

describe("A game without paramConfig keeps an empty custom dialog", () => {
  it("yields empty items and setCustomParams is a no-op", () => {
    const m = new Midend(makeGame({ paramConfig: undefined }));
    const cfg = m.getCustomParamsConfig();
    expect(cfg.items).toEqual({});
    expect(m.getCustomParams()).toEqual({});
    const before = m.getParams();
    expect(m.setCustomParams({ width: "99" })).toBeUndefined();
    expect(m.getParams()).toBe(before);
  });
});

// --- guard over every registered game ------------------------------

type AnyGame = Game<unknown, unknown, unknown, unknown, unknown>;

/** Every leaf preset's params, plus the default, for one game. */
function allPresetParams(game: AnyGame): unknown[] {
  const out: unknown[] = [game.defaultParams()];
  const walk = (menu: PresetMenu<unknown>): void => {
    if (menu.submenu) {
      for (const child of menu.submenu) walk(child);
    } else if (menu.params !== undefined) {
      out.push(menu.params);
    }
  };
  walk(game.presets());
  return out;
}

describe("Every registered game with paramConfig round-trips its presets", () => {
  for (const id of TS_PORTED_PUZZLE_IDS) {
    const game = getTsGame(id);
    if (!game?.paramConfig) continue;
    it(`${id}: getCustomParams∘setCustomParams ≡ identity through ConfigValues`, () => {
      // Deliberately typed loose: this guard drives the non-generic
      // engine surface only.
      const m = new Midend(game as AnyGame);
      for (const p of allPresetParams(game)) {
        const encoded = game.encodeParams(p, true);
        const setErr = m.setParams(encoded);
        expect(setErr, `${id} rejected its own preset ${encoded}`).toBeUndefined();
        const values = m.getCustomParams();
        // Feeding the read-back values into setCustomParams must validate
        // and reproduce the same param id — no drift between get and set.
        const err = m.setCustomParams(values);
        expect(
          err,
          `${id} rejected its own values ${JSON.stringify(values)}`,
        ).toBeUndefined();
        expect(m.getParams()).toBe(encoded);
      }
    });
  }
});
