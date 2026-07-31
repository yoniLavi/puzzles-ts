/**
 * The declare-or-fail guard for the collection's colours.
 *
 * Every registered game's palette is resolved and each entry must be either a
 * shared role from [`palette.ts`](./palette.ts) / the `mkhighlight` trio, or
 * listed in {@link GAME_LOCAL} below with a reason.
 *
 * **Why a guard is needed at all**: a hand-written colour is invisible to the rest
 * of the suite. A render snapshot records whatever the game emits, and a targeted
 * op assertion matches on the game's *own* constant — so a second spelling of an
 * existing role sails through both. That is exactly how the collection ended up
 * with `[0.85, 0.0, 0.0]` and `[0.85, 0, 0]` in two games, and one hint wash in
 * two values across eighteen. This test is the thing that would have objected.
 *
 * **What it deliberately does not check**: *provenance*. It compares resolved
 * values, so a game that writes `[0.78 * bg[0], …]` longhand passes exactly as if
 * it had imported `highlightWash` — the colour is right, the sharing is not.
 * Catching that means inspecting source, which is the brittle regex hunt design
 * D7 rejected. The rule "take player-facing colours from `palette.ts`" is carried
 * by the port playbook (§3.3) and by review; this guard's job is the one a human
 * reviewer is worst at — noticing that a *new* colour appeared.
 */
import { describe, expect, it } from "vitest";
import type { Colour } from "../../puzzle/types.ts";
import { TS_PORTED_PUZZLE_IDS } from "../games/ts-ported-ids.ts";
import { getTsGame } from "./registry.ts";
import "../games/index.ts";
import { mkhighlight } from "./colour-mkhighlight.ts";
import * as roles from "./palette.ts";

/** A light host background, standing in for the frontend's theme colour. */
const BG: Colour = [0.827, 0.827, 0.827];

const key = (c: Colour): string => c.map((v) => Math.round(v * 1000) / 1000).join(",");

/**
 * The colours each game legitimately owns — its visual *identity*, or members of an
 * enumerated set whose job is to be told apart from *each other* rather than to carry
 * a meaning that recurs elsewhere.
 *
 * Declared **per colour, not per game**, and that distinction is the whole point: a
 * per-game exemption would let a listed game add any colour it liked afterwards,
 * which is precisely the silent drift this guard exists to stop. A game may keep the
 * colours listed here; a *new* one still has to be mapped to a role or added here
 * deliberately.
 *
 * Values are the rounded `r,g,b` key at the test background.
 */
const GAME_LOCAL: Record<string, { why: string; colours: string[] }> = {
  abcd: {
    why: "letter colours",
    colours: ["0,0,0.496", "0,0.496,0", "0.414,0.414,0.827"],
  },
  ascent: {
    why: "the per-mode line colours",
    colours: ["0,0,1", "0,0.5,0", "0,0.7,0", "1,1,0.8"],
  },
  blackbox: {
    why: "ball, laser and marker colours, plus COL_COVER — the shade a hidden square is covered with",
    colours: ["0,1,0", "0.414,0.414,0.414", "0.579,0.579,0.579", "0.744,0.744,0.744"],
  },
  boats: {
    why: "water, ship, fleet and clue colours",
    colours: ["0,0.5,0", "0.1,0.1,0.1", "0.5,0.7,1", "0.7,0.7,0.7", "0.8,0,0"],
  },
  bricks: {
    why: "the shading colours",
    colours: ["0,0.7,0", "0.1,0.1,0.1"],
  },
  bridges: {
    why: "island, bridge and selection colours",
    colours: ["0.25,1,0.25", "0.744,0.744,0.744", "1,0.25,0.25", "1,0.662,0.662"],
  },
  clusters: {
    why: "the two cluster colours",
    colours: ["0,0.7,0", "0.1,0.1,0.1", "0.1,0.1,0.8", "0.8,0.5,0.5", "0.95,0.6,0.15"],
  },
  crossing: {
    why: "across/down run colours, and their fitted variants",
    colours: [
      "0,0.35,0.85",
      "0.133,0.133,0.133",
      "0.15,0.401,0.634",
      "0.3,0.3,0.3",
      "0.381,0.74,0.402",
      "0.414,0.414,0.827",
      "0.455,0.455,0.455",
      "0.467,0.467,0.467",
      "0.571,0.316,0.022",
      "0.636,0.785,0.943",
      "0.852,0.956,0.852",
      "0.904,0.73,0.591",
    ],
  },
  cube: {
    why: "the die-face colours",
    colours: ["0,0,1"],
  },
  dominosa: {
    why: "domino clash and highlight colours",
    colours: [
      "0.3,0.85,0.2",
      "0.5,0,0",
      "0.551,0.551,0.551",
      "0.6,0.2,0.8",
      "0.85,0.2,0.2",
    ],
  },
  fifteen: {
    why: "the tile colour",
    colours: ["0.3,0.5,0.9"],
  },
  filling: {
    why: "region shading, plus its own COL_CURSOR (see palette.ts: cursor colour is per game, not a role)",
    colours: [
      "0,0.496,0",
      "0.414,0.414,0.414",
      "0.579,0.579,0.579",
      "0.744,0.744,0.744",
      "1,0.703,0.703",
    ],
  },
  flip: {
    why: "the two tile faces",
    colours: ["0.276,0.276,0.276", "0.551,0.551,0.551", "0.8,0,0"],
  },
  flood: {
    why: "the tile colour set",
    colours: [
      "0,1,0",
      "0.2,0.3,1",
      "0.4,0.8,1",
      "0.5,0,0.7",
      "0.5,0.3,0.3",
      "0.7,1,0.7",
      "1,0.5,0",
      "1,0.6,1",
      "1,1,0",
    ],
  },
  galaxies: {
    why: "dot, edge and arrow colours",
    colours: ["0.248,0.248,0.248", "0.662,0.662,0.662", "1,0.662,0.662"],
  },
  group: {
    why: "the element colours",
    colours: ["0,0.496,0", "0.414,0.414,0.827", "0.786,0.786,0.786"],
  },
  guess: {
    why: "the peg colours are the game",
    colours: [
      "0,1,0",
      "0.2,0.3,1",
      "0.4,0.8,1",
      "0.5,0,0.7",
      "0.5,0.3,0.3",
      "0.5,1,1",
      "0.551,0.551,0.551",
      "0.7,1,0.7",
      "1,0.5,0",
      "1,0.5,0.5",
      "1,0.6,1",
      "1,1,0",
    ],
  },
  inertia: {
    why: "gem, goal and player colours",
    colours: ["0,1,0", "0.6,1,1", "0.7,0.15,1", "0.869,0.869,0.869", "1,1,0"],
  },
  keen: {
    why: "cage clue colours",
    colours: ["0,0.496,0", "0.414,0.414,0.827"],
  },
  lightup: {
    why: "COL_ERROR is a pale red *fill* behind a lit cell, so its paleness is load-bearing the way HINT_FILL's is; COL_CURSOR is its own (cursor colour is per game, not a role)",
    colours: [
      "0.414,0.414,0.414",
      "0.551,0.551,0.551",
      "0.98,0.78,0.42",
      "1,0.25,0.25",
      "1,1,0",
    ],
  },
  loopy: {
    why: "per-tiling line/dot colours",
    colours: ["0.744,0.744,0", "0.744,0.744,0.744"],
  },
  magnets: {
    why: "pole colours",
    colours: [
      "0.1,0.6,0.1",
      "0.2,0.2,1",
      "0.551,0.551,0.551",
      "0.8,0,0",
      "0.9,0.9,0.9",
    ],
  },
  map: {
    why: "the four region colours",
    colours: ["0.5,0.6,0.4", "0.55,0.45,0.35", "0.7,0.5,0.4", "0.8,0.7,0.4"],
  },
  mathrax: {
    why: "clue colours",
    colours: ["0,0.5,0", "0,0.5,0.5", "1,0.703,0.703"],
  },
  mines: {
    why: "upstream's per-number digit colours",
    colours: [
      "0,0,0.5",
      "0,0,1",
      "0,0.5,0",
      "0,0.5,0.5",
      "0.5,0,0",
      "0.551,0.551,0.551",
      "0.786,0.786,0.786",
      "1,0.5,0.5",
      "1,0.6,0.6",
    ],
  },
  mosaic: {
    why: "the shading colours",
    colours: [
      "0,0.4,0.388",
      "0.078,0.078,0.078",
      "0.392,0.392,0.392",
      "0.58,0.769,0.745",
      "0.925,0.925,0.925",
      "1,0.784,0.784",
    ],
  },
  net: {
    why: "wire, barrier and powered-state colours",
    colours: ["0,0,1", "0,1,1", "0.414,0.414,0.414"],
  },
  netslide: {
    why: "wire, barrier and powered-state colours",
    colours: ["0,0,1", "0,1,1", "0.414,0.414,0.414", "0.662,0.662,0.662"],
  },
  palisade: {
    why: "region and wall colours",
    colours: ["0.744,0.744,0", "0.744,0.744,0.744"],
  },
  pattern: {
    why: "the black/white cell colours",
    colours: ["0.3,0.3,0.3", "1,0.25,0.25"],
  },
  pearl: {
    why: "the black/white pearl colours",
    colours: ["0,0,1", "0.4,0.4,0.4", "0.8,0.8,1"],
  },
  pegs: {
    why: "peg and hole colours",
    colours: ["0,0,1", "0.5,0.5,1"],
  },
  rect: {
    why: "the region shading colours, plus its own grid grey",
    colours: ["0.2,0.2,1", "0.414,0.414,0.414", "1,0.5,0.5"],
  },
  rome: {
    why: "arrow and goal colours",
    colours: [
      "0,0,0.5",
      "0,0,1",
      "0,0.5,0",
      "0,0.5,0.5",
      "0.786,0.786,1",
      "1,0.703,0.703",
    ],
  },
  salad: {
    why: "symbol colours",
    colours: ["0,0.1,0", "0,0.25,0", "0,0.5,0", "0.414,0.414,0.827", "0.95,1,0.95"],
  },
  samegame: {
    why: "the tile colour set",
    colours: [
      "0,0,1",
      "0,0.5,0",
      "0,0.8,0.8",
      "0.2,0.8,0.2",
      "0.5,0.5,1",
      "0.7,0.7,0",
      "1,0,1",
      "1,0.5,0.5",
    ],
  },
  seismic: {
    why: "region shading",
    colours: ["0,0.5,0", "0,0.5,0.5"],
  },
  separate: {
    why: "letter and region colours",
    colours: ["0.744,0.744,0", "0.744,0.744,0.744"],
  },
  signpost: {
    why: "the per-region arrow colours",
    colours: [
      "0,0,0.9",
      "0.2,1,0.2",
      "0.347,0.697,0.58",
      "0.369,0.563,0.684",
      "0.381,0.692,0.498",
      "0.414,0.414,0.414",
      "0.416,0.686,0.416",
      "0.44,0.576,0.638",
      "0.446,0.896,0.745",
      "0.475,0.724,0.879",
      "0.49,0.889,0.64",
      "0.496,0.996,0.828",
      "0.527,0.805,0.977",
      "0.533,0.454,0.697",
      "0.533,0.507,0.342",
      "0.533,0.63,0.342",
      "0.534,0.882,0.534",
      "0.545,0.988,0.711",
      "0.556,0.562,0.375",
      "0.566,0.74,0.821",
      "0.594,0.98,0.594",
      "0.615,0.453,0.349",
      "0.629,0.822,0.912",
      "0.636,0.636,0.636",
      "0.662,0.912,0.828",
      "0.677,0.816,0.902",
      "0.686,0.584,0.896",
      "0.686,0.652,0.439",
      "0.686,0.81,0.439",
      "0.686,0.908,0.769",
      "0.697,0.438,0.334",
      "0.697,0.451,0",
      "0.697,0.567,0.515",
      "0.697,0.632,0.258",
      "0.697,0.697,0",
      "0.697,0.697,0.697",
      "0.697,0.697,0.967",
      "0.71,0.904,0.71",
      "0.715,0.722,0.482",
      "0.728,0.825,0.87",
      "0.744,0.744,0.744",
      "0.762,0.648,0.996",
      "0.762,0.725,0.488",
      "0.762,0.9,0.488",
      "0.791,0.582,0.448",
      "0.794,0.738,0.912",
      "0.794,0.776,0.658",
      "0.794,0.864,0.658",
      "0.795,0.803,0.535",
      "0.811,0.815,0.681",
      "0.853,0.737,0.663",
      "0.879,0.646,0.498",
      "0.896,0.563,0.429",
      "0.896,0.58,0",
      "0.896,0.729,0.663",
      "0.896,0.813,0.331",
      "0.896,0.896,0",
      "0.896,0.896,0.896",
      "0.912,0.726,0.652",
      "0.912,0.736,0.414",
      "0.912,0.819,0.782",
      "0.912,0.865,0.598",
      "0.912,0.912,0.414",
      "0.912,0.912,0.912",
      "0.996,0.625,0.477",
      "0.996,0.645,0",
      "0.996,0.811,0.736",
      "0.996,0.903,0.368",
      "0.996,0.996,0",
      "0.996,0.996,0.996",
    ],
  },
  singles: {
    why: "its own hint-strand colour",
    colours: ["0.2,0.8,0", "0.4,0.4,0.4", "0.98,0.78,0.42"],
  },
  sixteen: {
    why: "the tile colour",
    colours: ["0.3,0.5,0.9"],
  },
  slant: {
    why: "the two slash orientations",
    colours: ["0.579,0.579,0.579", "0.662,0.662,0.662"],
  },
  slide: {
    why: "main-block, target and dragging tints",
    colours: [
      "0.646,0.646,0.806",
      "0.646,0.806,0.646",
      "0.764,0.764,0.871",
      "0.771,0.771,0.771",
      "0.796,0.796,0.993",
      "0.796,0.993,0.796",
      "0.864,0.864,0.995",
      "0.883,0.883,0.883",
    ],
  },
  sokoban: {
    why: "player, barrel, pit and target colours",
    colours: ["0,1,0", "0.33,0.33,0.33", "0.6,0.3,0", "0.869,0.869,0.869"],
  },
  solo: {
    why: "killer-cage and jigsaw block colours",
    colours: [
      "0,0.496,0",
      "0.414,0.414,0.083",
      "0.414,0.414,0.827",
      "0.744,0.744,0.744",
    ],
  },
  spokes: {
    why: "hub and spoke colours, plus COL_SATISFIED — a hub whose spokes are all placed",
    colours: ["0,0,1", "0,1,0", "0.3,0.3,0.3", "0.3,0.3,1", "0.703,0.703,0.703"],
  },
  sticks: {
    why: "the two stick orientations",
    colours: ["0,0,1", "0,0.7,0"],
  },
  subsets: {
    why: "its own three-level hint vocabulary (spot/placed/area)",
    colours: ["0,0,1", "0,0.5,0", "0.1,0.62,0.4", "0.55,0.75,0.95", "0.82,0.5,0.1"],
  },
  tents: {
    why: "tree/tent/grass colours",
    colours: ["0,0.7,0", "0.6,0,0", "0.6,0.4,0", "0.7,1,0.5", "0.8,0.7,0"],
  },
  towers: {
    why: "the 3D tower faces",
    colours: ["0,0.496,0", "0.414,0.414,0.827", "0.551,0.551,0.551"],
  },
  tracks: {
    why: "track and sleeper colours",
    colours: ["0,0,1", "0.3,0.3,0.3", "0.5,0.4,0.1", "0.8,0.8,1", "0.91,0.91,0.91"],
  },
  twiddle: {
    why: "the tile colours",
    colours: [
      "0.496,0.248,0.248",
      "0.744,0.744,0.744",
      "0.827,0.414,0.414",
      "0.91,0.91,0.91",
    ],
  },
  undead: {
    why: "the three monster colours",
    colours: [
      "0.414,0.827,0.414",
      "0.414,0.827,0.827",
      "0.551,0.551,0.551",
      "0.827,0.744,0.744",
    ],
  },
  unequal: {
    why: "the adjacency-clue colours",
    colours: ["0,0.496,0", "0.414,0.414,0.827"],
  },
  unruly: {
    why: "the black/white tile colours",
    colours: [
      "0,0.7,0",
      "0.033,0.033,0.033",
      "0.2,0.2,0.2",
      "0.3,0.3,0.3",
      "0.367,0.367,0.367",
      "0.687,0.687,0.687",
      "0.833,0.833,0.833",
      "0.95,0.6,0.15",
    ],
  },
  untangle: {
    why: "vertex, edge and crossing colours",
    colours: ["0,0,1", "0.45,0.7,1", "1,0.55,0"],
  },
};

/**
 * Call a derived role, whatever it takes.
 *
 * Most roles are a function of the background alone; `wallColour` also needs the
 * highlight, because "a quarter of the way from the floor toward its bevel" is
 * what the colour *means*. Dispatching on arity keeps that one exception from
 * needing a hand-maintained list here — a new role is picked up automatically.
 */
// biome-ignore lint/complexity/noBannedTypes: the role table is heterogeneous by design.
function resolve(fn: Function, background: Colour, highlight: Colour): Colour {
  return fn.length === 2
    ? (fn as (b: Colour, h: Colour) => Colour)(background, highlight)
    : (fn as (b: Colour) => Colour)(background);
}

/** Every colour the shared vocabulary can produce, at this background. */
function sharedColours(): Set<string> {
  const out = new Set<string>();
  const { background, highlight, lowlight } = mkhighlight(BG);
  for (const c of [background, highlight, lowlight]) out.add(key(c));
  for (const [name, value] of Object.entries(roles)) {
    if (typeof value === "function") {
      // A background-derived role: resolve it against this background, and
      // against the pure white the app hands games in dark mode.
      out.add(key(resolve(value, background, highlight)));
      out.add(key(resolve(value, [1, 1, 1], mkhighlight([1, 1, 1]).highlight)));
    } else if (Array.isArray(value) && value.length === 3) {
      out.add(key(value as Colour));
    } else {
      throw new Error(`palette.ts exports ${name}, which is neither a Colour nor a fn`);
    }
  }
  return out;
}

describe("the shared colour vocabulary", () => {
  it("names a role exactly once", () => {
    // Two roles with the same value would be two names for one colour — the very
    // duplication this module exists to remove.
    const byValue = new Map<string, string[]>();
    for (const [name, value] of Object.entries(roles)) {
      if (typeof value === "function") continue;
      const k = key(value as Colour);
      byValue.set(k, [...(byValue.get(k) ?? []), name]);
    }
    for (const [value, names] of byValue) {
      // ERROR_TEXT is deliberately an alias of PAPER: it records *why* a game is
      // painting white there, which is what a theme needs to know.
      const meaningful = names.filter((n) => n !== "ERROR_TEXT");
      expect(
        meaningful.length,
        `${value} is shared by ${names.join(", ")}`,
      ).toBeLessThan(2);
    }
  });

  it("keeps the three hint emphases distinct", () => {
    // The audit found HINT_ACTION and HINT_FILL are two roles by *function* — a
    // stroke versus a fill behind text — so collapsing them is a real regression
    // (blue-on-blue digits). Pin that they stay apart.
    expect(key(roles.HINT_ACTION)).not.toBe(key(roles.HINT_FILL));
    expect(key(roles.HINT_FILL)).not.toBe(key(roles.HINT_EVIDENCE));
    // ...and that they are ordered light-to-dark, which is what makes the
    // evidence wash readable *behind* the other two.
    const lum = (c: Colour): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    expect(lum(roles.HINT_EVIDENCE)).toBeGreaterThan(lum(roles.HINT_FILL));
    expect(lum(roles.HINT_FILL)).toBeGreaterThan(lum(roles.HINT_ACTION));
  });

  it("keeps every derived role visible against both host backgrounds", () => {
    // The app hands games pure white in dark mode, so a derived role that only
    // separates from a light background is the Spokes COL_DONE bug waiting to
    // happen.
    const distance = (a: Colour, b: Colour) =>
      Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    for (const bg of [BG, [1, 1, 1] as Colour]) {
      const { background, highlight } = mkhighlight(bg);
      for (const [name, value] of Object.entries(roles)) {
        if (typeof value !== "function") continue;
        const derived = resolve(value, background, highlight);
        expect(
          distance(derived, background),
          `${name} against ${bg.join(",")}`,
        ).toBeGreaterThan(0.05);
      }
    }
  });
});

describe("no game holds an undeclared colour", () => {
  const shared = sharedColours();

  for (const id of [...TS_PORTED_PUZZLE_IDS].sort()) {
    it(`${id}`, () => {
      const game = getTsGame(id);
      if (!game) throw new Error(`${id} is in TS_PORTED_PUZZLE_IDS but not registered`);
      const palette: Colour[] = game.colours(BG);
      const declared = new Set(GAME_LOCAL[id]?.colours ?? []);
      const undeclared = palette
        .map((c, i) => ({ i, c }))
        .filter(({ c }) => c && !shared.has(key(c)) && !declared.has(key(c)));
      expect(
        // Report the rounded *key*, which is what GAME_LOCAL takes — printing the
        // raw triple sends you to add a declaration that then doesn't match.
        undeclared.map((u) => `index ${u.i} = "${key(u.c)}" (raw [${u.c.join(", ")}])`),
        `${id} holds a colour that is neither a shared role nor declared ` +
          `game-local — map it to a role in palette.ts, or add it to GAME_LOCAL ` +
          `with a reason`,
      ).toEqual([]);
    });
  }
});
