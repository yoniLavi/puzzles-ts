/**
 * Loopy's parameters: the grid-type table, the difficulty table, and the
 * params codec / validator / preset menu built from them.
 *
 * Upstream generates four parallel arrays from one `GRIDLIST` macro
 * (`gridnames[]`, `grid_types[]`, `grid_size_limits[]`, `GRID_CONFIGS`) and
 * three more from `DIFFLIST`, because C has no better way to keep them in
 * step. TS does: one `as const` table of objects per list, with the choice
 * names, the encode char and the min-size error messages all *derived* from it.
 */

import type { ParamConfigItem, PresetMenu } from "../../engine/game.ts";
import { type GridType, gridValidateParams } from "../../engine/grid.ts";
import { parseConfigInt, parseLeadingInt } from "../../engine/params.ts";

/**
 * Loopy's grid types, in **Loopy's own ordering** — which is deliberately not
 * `grid.ts`'s `GridType` ordering (`GRIDGEN_LIST`). The two genuinely differ:
 * Loopy's index 11 is Penrose P2, where `GRIDGEN_LIST`'s is
 * `greatdodecagonal`.
 *
 * **The array index is the wire format.** It is encoded into params as `t<n>`
 * and therefore into every saved game and shared game ID. Upstream says it at
 * length and it is worth repeating: *do not add values to this list except at
 * the end, or old game ids will stop working.* Never reorder it, never insert
 * into the middle, and never "tidy" it into `GRIDGEN_LIST` order.
 *
 * `amin` / `omin` are the per-type minimum sizes: both dimensions must be at
 * least `amin`, and at least one must be at least `omin`. They live here rather
 * than in the geometry because they are a *game* judgement about what makes a
 * playable board — `gridValidateParams` deliberately implements only the
 * maximum-size guards.
 */
export const LOOPY_GRIDS = [
  { title: "Squares", type: "square", amin: 3, omin: 3 },
  { title: "Triangular", type: "triangular", amin: 3, omin: 3 },
  { title: "Honeycomb", type: "honeycomb", amin: 3, omin: 3 },
  { title: "Snub-Square", type: "snubsquare", amin: 3, omin: 3 },
  { title: "Cairo", type: "cairo", amin: 3, omin: 4 },
  { title: "Great-Hexagonal", type: "greathexagonal", amin: 3, omin: 3 },
  { title: "Octagonal", type: "octagonal", amin: 3, omin: 3 },
  { title: "Kites", type: "kites", amin: 3, omin: 3 },
  { title: "Floret", type: "floret", amin: 1, omin: 2 },
  { title: "Dodecagonal", type: "dodecagonal", amin: 2, omin: 2 },
  { title: "Great-Dodecagonal", type: "greatdodecagonal", amin: 2, omin: 2 },
  { title: "Penrose (kite/dart)", type: "penrose_p2_kite", amin: 3, omin: 3 },
  { title: "Penrose (rhombs)", type: "penrose_p3_thick", amin: 3, omin: 3 },
  {
    title: "Great-Great-Dodecagonal",
    type: "greatgreatdodecagonal",
    amin: 2,
    omin: 2,
  },
  { title: "Kagome", type: "kagome", amin: 3, omin: 3 },
  { title: "Compass-Dodecagonal", type: "compassdodecagonal", amin: 2, omin: 2 },
  { title: "Hats", type: "hats", amin: 6, omin: 6 },
  { title: "Spectres", type: "spectres", amin: 6, omin: 6 },
] as const satisfies readonly {
  title: string;
  type: GridType;
  amin: number;
  omin: number;
}[];

/** Difficulty levels, in encode order. `char` is the params encoding (`d<c>`);
 * the index is the internal `diff` value the solver caps its rungs by. */
export const LOOPY_DIFFS = [
  { title: "Easy", char: "e" },
  { title: "Normal", char: "n" },
  { title: "Tricky", char: "t" },
  { title: "Hard", char: "h" },
] as const;

export const DIFF_EASY = 0;
export const DIFF_NORMAL = 1;
export const DIFF_TRICKY = 2;
export const DIFF_HARD = 3;
/** One past the hardest difficulty. Doubles as the solver rungs' "no progress"
 * sentinel, exactly as upstream. */
export const DIFF_MAX = 4;

export interface LoopyParams {
  w: number;
  h: number;
  /** Index into {@link LOOPY_DIFFS}. */
  diff: number;
  /** Index into {@link LOOPY_GRIDS} — Loopy's ordering, not `GridType`'s. */
  type: number;
}

/** The `grid.ts` tiling a Loopy grid-type index selects. */
export function gridTypeOf(p: LoopyParams): GridType {
  return LOOPY_GRIDS[p.type].type;
}

export function defaultParams(): LoopyParams {
  return { w: 10, h: 10, diff: DIFF_EASY, type: 0 };
}

export function encodeParams(p: LoopyParams, full: boolean): string {
  const base = `${p.w}x${p.h}t${p.type}`;
  return full ? `${base}d${LOOPY_DIFFS[p.diff].char}` : base;
}

/**
 * Parse a params string (`<w>x<h>t<type>d<diffchar>`, every part after the
 * width optional).
 *
 * Mirrors upstream `decode_params`, which mutates a caller-supplied params
 * struct: it resets `diff` to Easy up front but pointedly does **not** reset
 * `type`. Every caller hands it fresh defaults, so starting from
 * {@link defaultParams} (`type: 0`) is exactly equivalent — but the asymmetry
 * is deliberate upstream, so don't "fix" it into a reset of both.
 */
export function decodeParams(s: string): LoopyParams {
  const p = defaultParams();
  let i = 0;
  const int = (): number => {
    const r = parseLeadingInt(s, i);
    i = r.next;
    return r.value;
  };

  p.h = p.w = int();
  p.diff = DIFF_EASY;
  if (s[i] === "x") {
    i++;
    p.h = int();
  }
  if (s[i] === "t") {
    i++;
    p.type = int();
  }
  if (s[i] === "d") {
    i++;
    const found = LOOPY_DIFFS.findIndex((d) => d.char === s[i]);
    if (found >= 0) p.diff = found;
    if (i < s.length) i++;
  }
  return p;
}

export function validateParams(p: LoopyParams, _full: boolean): string | null {
  if (p.type < 0 || p.type >= LOOPY_GRIDS.length) return "Illegal grid type";
  const { amin, omin, type } = LOOPY_GRIDS[p.type];
  if (p.w < amin || p.h < amin)
    return `Width and height for this grid type must both be at least ${amin}`;
  if (p.w < omin && p.h < omin)
    return `At least one of width and height for this grid type must be at least ${omin}`;
  // A deliberate divergence from upstream, which accepts these params and then
  // *aborts* during generation. A Penrose kite/dart patch of width 3 comes out
  // empty for every seed and every height — measured at 0 successes in 200
  // descriptions for each of 3x3 through 3x8, where every other aperiodic
  // configuration surveyed succeeds at least ~20% of the time and so is
  // recovered by `buildLoopyGrid`'s retry. Since retrying cannot rescue an
  // impossible configuration, reject it here, where the Custom dialog can show
  // the player a reason instead of failing on "New game". Note the asymmetry is
  // real: 4x3 and larger heights-of-3 generate fine, so this is a width bound,
  // not an `amin` bump (which would forbid those too).
  if (type === "penrose_p2_kite" && p.w < 4)
    return "Width for Penrose (kite/dart) must be at least 4";
  return gridValidateParams(type, p.w, p.h);
}

export const paramConfig: ParamConfigItem<LoopyParams>[] = [
  {
    kw: "width",
    name: "Width",
    type: "string",
    get: (p) => String(p.w),
    set: (p, v) => {
      p.w = parseConfigInt(v);
    },
  },
  {
    kw: "height",
    name: "Height",
    type: "string",
    get: (p) => String(p.h),
    set: (p, v) => {
      p.h = parseConfigInt(v);
    },
  },
  {
    kw: "type",
    name: "Grid type",
    type: "choices",
    choices: LOOPY_GRIDS.map((g) => g.title),
    get: (p) => p.type,
    set: (p, v) => {
      p.type = v;
    },
  },
  {
    kw: "diff",
    name: "Difficulty",
    type: "choices",
    choices: LOOPY_DIFFS.map((d) => d.title),
    get: (p) => p.diff,
    set: (p, v) => {
      p.diff = v;
    },
  },
];

const preset = (w: number, h: number, diff: number, type: number): LoopyParams => ({
  w,
  h,
  diff,
  type,
});

const PRESETS_TOP: LoopyParams[] = [
  preset(7, 7, DIFF_EASY, 0),
  preset(10, 10, DIFF_EASY, 0),
  preset(7, 7, DIFF_NORMAL, 0),
  preset(10, 10, DIFF_NORMAL, 0),
  preset(7, 7, DIFF_HARD, 0),
  preset(10, 10, DIFF_HARD, 0),
  preset(12, 10, DIFF_HARD, 1), // Triangular
  preset(7, 7, DIFF_HARD, 3), // Snub-Square
  preset(9, 9, DIFF_HARD, 4), // Cairo
  preset(5, 5, DIFF_HARD, 7), // Kites
  preset(10, 10, DIFF_HARD, 11), // Penrose (kite/dart)
  preset(10, 10, DIFF_HARD, 12), // Penrose (rhombs)
];

const PRESETS_MORE: LoopyParams[] = [
  preset(10, 10, DIFF_HARD, 2), // Honeycomb
  preset(5, 4, DIFF_HARD, 5), // Great-Hexagonal
  preset(5, 4, DIFF_HARD, 14), // Kagome
  preset(7, 7, DIFF_HARD, 6), // Octagonal
  preset(5, 5, DIFF_HARD, 8), // Floret
  preset(5, 4, DIFF_HARD, 9), // Dodecagonal
  preset(5, 4, DIFF_HARD, 10), // Great-Dodecagonal
  preset(5, 3, DIFF_HARD, 13), // Great-Great-Dodecagonal
  preset(5, 4, DIFF_HARD, 15), // Compass-Dodecagonal
  preset(10, 10, DIFF_HARD, 16), // Hats
  preset(10, 10, DIFF_HARD, 17), // Spectres
];

/** Preset title. Note the dimensions are printed **height first** — upstream's
 * `sprintf(buf, "%dx%d %s - %s", params->h, params->w, ...)` — so the 12×10
 * triangular preset displays as "10x12". Kept because these strings are the
 * user-visible preset names and match the rest of the collection's history. */
function presetTitle(p: LoopyParams): string {
  return `${p.h}x${p.w} ${LOOPY_GRIDS[p.type].title} - ${LOOPY_DIFFS[p.diff].title}`;
}

/**
 * The **two-level** preset menu — unusual in this collection. The top level
 * holds the common grids, and a "More..." submenu holds the exotic tilings.
 * The app shell flattens submenus into a labelled section (a divider plus an
 * `<h3>` heading followed by the section's entries — see
 * `puzzle-type-menu.ts`), so the nesting renders as a titled group rather than
 * a nested flyout. That is a faithful and readable rendering of the intent, so
 * the nesting is kept rather than flattened here.
 */
export function presets(): PresetMenu<LoopyParams> {
  return {
    title: "Loopy",
    submenu: [
      ...PRESETS_TOP.map((p) => ({ title: presetTitle(p), params: p })),
      {
        title: "More...",
        submenu: PRESETS_MORE.map((p) => ({ title: presetTitle(p), params: p })),
      },
    ],
  };
}
