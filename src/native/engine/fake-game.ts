/**
 * A tiny fake `Game` used only by the engine's behavioural tests
 * (imported solely from `*.test.ts`). It is the smallest thing that
 * exercises every midend path: a counter you increment toward a
 * target, with a solver that jumps straight to the target, a text
 * format, and a status bar. No drawing, not timed.
 *
 * State carries its own target, so `status(state)` is pure (the goal
 * is encoded in the state, exactly as a real game encodes its goal).
 *
 * This is the `ts-migration` "validated without a golden corpus"
 * discipline applied to the midend: the suite asserts behavioural
 * invariants against this game, not a recorded C corpus.
 */

import { randomUpto } from "../random/index.ts";
import type { Game } from "./game.ts";

export interface FakeParams {
  target: number;
}
export interface FakeState {
  count: number;
  target: number;
}
/** Moves are plain strings ⇒ JSON-safe ⇒ no serialiseMove needed. */
export type FakeMove = "inc" | "solve";

export const LEFT_BUTTON = 0x0200;

export const fakeGame: Game<FakeParams, FakeState, FakeMove, null, null> = {
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

  interpretMove: (_s, _ui, _ds, _p, button) => (button === LEFT_BUTTON ? "inc" : null),
  executeMove: (s, m) =>
    m === "inc"
      ? { count: s.count + 1, target: s.target }
      : { count: s.target, target: s.target },

  status: (s) => (s.count >= s.target ? "solved" : "ongoing"),
  solve: () => ({ ok: true, move: "solve" }),
  textFormat: (s) => `count=${s.count}`,
  statusbarText: (s) => `count ${s.count}/${s.target}`,

  colours: () => [
    [1, 1, 1],
    [0, 0, 0],
  ],
  computeSize: (p, tile) => ({ w: p.target * tile, h: tile }),
};
