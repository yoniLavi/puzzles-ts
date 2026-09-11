/**
 * A tiny fake `Game` used only by the engine's behavioral tests (imported
 * solely from `*.test.ts`): the smallest thing that exercises every midend
 * path. A counter you increment toward a target, with a solver that jumps
 * straight to the target, a hint plan, a text format and a status bar; no
 * timed clock.
 *
 * State carries its own target, so `status(state)` is pure, as a real game
 * encodes its goal in its state.
 *
 * Its drawing members record each drawstate's identity and each `setTileSize`
 * and `redraw` call on the drawstate itself, so tests can assert on first-draw
 * and force-redraw behavior without leaking globals.
 */

import type { Game } from "./game.ts";
import { LEFT_BUTTON, RIGHT_BUTTON } from "./pointer.ts";
import { randomUpto } from "./random/index.ts";

export interface FakeParams {
  target: number;
}
export interface FakeState {
  count: number;
  target: number;
}
/** Moves are plain strings ⇒ JSON-safe ⇒ no serializeMove needed.
 * `dec` exists so hint tests have an off-plan move available. */
export type FakeMove = "inc" | "dec" | "solve";

export interface FakeDrawState {
  tileSize: number;
  /** The first-paint flag every real game keeps (`ds.started`): `redraw`
   * paints a one-off background rect while it is false, then sets it. */
  started: boolean;
  /** Incremented every time `setTileSize` is called. */
  setSizeCalls: number;
  /** Incremented every time `redraw` is called. */
  redrawCalls: number;
  /** The drawstate's identity counter, copied from a module-local
   * monotonic at construction. Lets a test prove that
   * `canvasCleared`/`forceRedraw` recreated the drawstate (rather
   * than mutating it in place). */
  instance: number;
}

let nextInstance = 0;

export const fakeGame: Game<FakeParams, FakeState, FakeMove, null, FakeDrawState> = {
  id: "__fake__",
  wantsStatusbar: true,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  preferredTileSize: 10,

  defaultParams: () => ({ target: 3 }),
  presets: () => ({
    title: "root",
    submenu: [
      { title: "Easy", params: { target: 2 } },
      { title: "Hard", params: { target: 9 } },
    ],
  }),
  encodeParams: (p) => `t${p.target}`,
  decodeParams: (s) => {
    const m = /^t(\d+)$/.exec(s);
    if (!m) throw new Error(`bad params "${s}"`);
    return { target: Number(m[1]) };
  },
  validateParams: (p) => (p.target > 0 ? null : "target must be positive"),

  newDesc: (p, rng) => {
    // Exercise the retained bit-identical RNG; desc is deterministic
    // per (params, seed) so game IDs reproduce.
    const salt = randomUpto(rng, 1000);
    return { desc: `g${p.target}-${salt}` };
  },
  validateDesc: (_p, desc) => (/^g\d+-\d+$/.test(desc) ? null : "bad desc"),
  newState: (p) => ({ count: 0, target: p.target }),
  newUi: () => null,

  interpretMove: (_s, _ui, _ds, _p, button) =>
    button === LEFT_BUTTON ? "inc" : button === RIGHT_BUTTON ? "dec" : null,
  executeMove: (s, m) =>
    m === "inc"
      ? { count: s.count + 1, target: s.target }
      : m === "dec"
        ? { count: s.count - 1, target: s.target }
        : { count: s.target, target: s.target },

  status: (s) => (s.count >= s.target ? "solved" : "ongoing"),
  solve: () => ({ ok: true, move: "solve" }),
  // The hint plan is the full remaining path to the target, one `inc`
  // per step, each narrated for the count it applies to — the
  // smallest game exercising the midend's plan store/advance/drop.
  hint: (s) =>
    s.count >= s.target
      ? { ok: false, error: "Already solved" }
      : {
          ok: true,
          steps: Array.from({ length: s.target - s.count }, (_, i) => ({
            move: "inc" as FakeMove,
            explanation: `Increment the counter to ${s.count + i + 1}`,
          })),
        },
  // `inc` always lands exactly where the plan expects (one step has
  // exactly one shape), so it completes the current step; anything
  // else deviates.
  hintKeepTrack: (m) => (m === "inc" ? "completed" : "off"),
  textFormat: (s) => `count=${s.count}`,
  statusbarText: (s) => `count ${s.count}/${s.target}`,

  colors: () => [
    [1, 1, 1],
    [0, 0, 0],
  ],
  computeSize: (p, tile) => ({ w: p.target * tile, h: tile }),

  newDrawState: (_s) => ({
    tileSize: 10,
    started: false,
    setSizeCalls: 0,
    redrawCalls: 0,
    instance: nextInstance++,
  }),
  setTileSize: (ds, tileSize) => {
    ds.tileSize = tileSize;
    ds.setSizeCalls += 1;
  },
  redraw: (dr, ds, _prev, s) => {
    ds.redrawCalls += 1;
    if (!ds.started) {
      // First paint of this drawstate: the game owns its background fill, at
      // the size `computeSize` reports.
      dr.drawRect({ x: 0, y: 0, w: s.target * ds.tileSize, h: ds.tileSize }, 0);
      ds.started = true;
    }
  },
};
