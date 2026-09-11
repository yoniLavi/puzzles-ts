/**
 * The collection-wide save/load guard.
 *
 * Every game's move log is written to a save and replayed on load. The
 * per-game suites round-trip saves of a few hand-written moves; this asks each
 * game what happens when the *whole* range of moves its own input produces goes
 * through `loadGame`. A move `executeMove` does not handle falls off the end of
 * its `switch` as `undefined` (the exhaustive-union typing hides it), and in
 * `history` that would make every later `changedState` and `redraw` throw: one
 * broken move, then a permanently broken board.
 *
 * So this sweep drives each game with *real* input through a real `Midend`,
 * saves, loads into a fresh one, and checks the two agree — and, because the
 * failure mode is a corrupt history rather than a wrong answer, it also checks
 * the loaded midend can still be *drawn*, which is the assertion the crash
 * would have failed.
 */

import { beforeAll, describe, expect, it } from "vitest";
// Registers every ported game; `beforeAll` re-runs it in case a sibling file
// reset the shared registry under `isolate: false`.
import { registerAllGames } from "../games/index.ts";
import type { Game } from "./game.ts";
import { Midend } from "./midend.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_UP,
  LEFT_BUTTON,
  LEFT_RELEASE,
  RIGHT_BUTTON,
} from "./pointer.ts";
import { randomNew } from "./random/index.ts";
import { getTsGame, registeredGameIds } from "./registry.ts";
import { encodeSave } from "./save.ts";
import { RecordingDrawing } from "./testing/recording-drawing.ts";

type AnyGame = Game<unknown, unknown, unknown, unknown, unknown>;

const KEY_M = 77; // adaptive mark-all, for the games that offer it

function midendFor(game: AnyGame): Midend<unknown, unknown, unknown, unknown, unknown> {
  const m = new Midend(game);
  m.setCallbacks(
    () => {},
    () => {},
    () => {},
  );
  return m;
}

/**
 * Drive a broad, *real* slice of this game's input and report how many presses
 * the game actually consumed.
 *
 * Deliberately not a hand-written move list: the defect this guards against is
 * a move type the game's own input can emit but its `executeMove` does not
 * handle, and a hand-written list only ever contains moves somebody remembered.
 * The pointer sweep is the touch guard's — a coarse grid misses Untangle's
 * vertices — and the key presses reach the paths pointer input cannot
 * (mark-all, cursor movement, the on-screen keypad's own buttons).
 */
function play(
  m: Midend<unknown, unknown, unknown, unknown, unknown>,
  game: AnyGame,
  params: unknown,
): number {
  let consumed = 0;
  const size = game.computeSize(params, game.preferredTileSize ?? 32);
  const step = Math.max(6, Math.floor(Math.min(size.w, size.h) / 6));

  for (const button of [LEFT_BUTTON, RIGHT_BUTTON]) {
    for (let x = 2; x < size.w; x += step) {
      for (let y = 2; y < size.h; y += step) {
        if (m.processInput(x, y, button)) consumed++;
      }
    }
  }

  // Keyboard: cursor movement, select, then this game's own keypad buttons —
  // the digits/letters a player types — and mark-all where it is offered.
  const keys: number[] = [
    CURSOR_RIGHT,
    CURSOR_DOWN,
    CURSOR_SELECT,
    CURSOR_LEFT,
    CURSOR_UP,
  ];
  if (game.canMarkAll) keys.push(KEY_M, KEY_M); // fill, then strike
  for (const k of game.requestKeys?.(params) ?? []) keys.push(k.button);
  for (const button of keys) {
    if (m.processInput(0, 0, button)) consumed++;
  }
  return consumed;
}

const REGISTERED = registeredGameIds();

beforeAll(registerAllGames);

describe("a saved game reloads in every ported game", () => {
  for (const id of REGISTERED) {
    const game = getTsGame(id);
    if (!game) continue;

    it(`${id}: play, save, load — the board survives and can still be drawn`, () => {
      const params = game.defaultParams();
      const desc = game.newDesc(params, randomNew(`save-${id}`)).desc;
      const gameId = `${game.encodeParams(params, true)}:${desc}`;

      const played = midendFor(game);
      played.newGameFromId(gameId);
      const consumed = play(played, game, params);

      // Guard the guard: a game none of whose presses landed would round-trip
      // an untouched board and prove nothing about its move log.
      expect(
        consumed,
        `${id}: no input was consumed, so the save is empty`,
      ).toBeGreaterThan(0);

      const saved = played.saveGame();

      // The replay itself. A move the game cannot execute surfaces here.
      const loaded = midendFor(game);
      expect(
        loaded.loadGame(saved),
        `${id}: loadGame refused its own save`,
      ).toBeUndefined();

      // The board came back. `formatAsText` is the game's own description of
      // its state, so this compares what the player would see.
      if (game.canFormatAsText) {
        expect(loaded.formatAsText(), `${id}: board differs after reload`).toBe(
          played.formatAsText(),
        );
      }

      // Re-saving must produce the same bytes: proves the *whole* envelope
      // (move log, cursor position, timer, solve flag) survived, not just the
      // part `formatAsText` happens to render.
      expect(loaded.saveGame(), `${id}: re-saved bytes differ`).toEqual(saved);

      // The assertion the crash would have failed. A poisoned history is not
      // visible in any comparison above — `loadGame` returns `undefined` and
      // the text may even match — but the state is gone and drawing throws.
      const drawing = new RecordingDrawing(loaded.getColorPalette([1, 1, 1]));
      loaded.size({ w: 400, h: 400 });
      expect(
        () => loaded.redraw(drawing),
        `${id}: cannot draw the reloaded board`,
      ).not.toThrow();
      expect(drawing.ops.length, `${id}: reloaded board drew nothing`).toBeGreaterThan(
        0,
      );
    });
  }

  it("the registry is populated, so the sweep above is not vacuous", () => {
    expect(REGISTERED.length).toBeGreaterThan(25);
  });
});

/**
 * The other half: a save this build cannot play.
 *
 * A save is untrusted input: JSON that has been sitting in the player's
 * IndexedDB, written by whatever build they were running then. Its `moves` are
 * typed `unknown[]` and *cast* to `Move`, never parsed, so a move a later build
 * does not handle reaches `executeMove` looking perfectly well-typed. The load
 * must be refused and rewound to the saved game's opening position, never left
 * as a history with a hole in it that throws on every repaint.
 */
describe("a save this build cannot play is refused, not half-applied", () => {
  for (const id of REGISTERED) {
    const game = getTsGame(id);
    if (!game) continue;

    it(`${id}: a foreign move in the log never corrupts the board`, () => {
      const params = game.defaultParams();
      const desc = game.newDesc(params, randomNew(`foreign-${id}`)).desc;
      const gameId = `${game.encodeParams(params, true)}:${desc}`;

      const m = midendFor(game);
      m.newGameFromId(gameId);
      play(m, game, params);
      const beforeBytes = m.saveGame();

      // A move from no build that ever existed. Every game's `executeMove`
      // dispatches on some property of the move; none of them has a case for
      // this, so each either falls off its `switch` or throws — and both must
      // come out as a refusal rather than a corrupted board.
      const env = JSON.parse(new TextDecoder().decode(beforeBytes)) as {
        moves: unknown[];
      };
      env.moves.push({ type: "__not_a_move__", kind: "__not_a_move__" });
      const tampered = new TextEncoder().encode(JSON.stringify(env));

      const err = m.loadGame(tampered);

      // Every game refuses, and refuses *as itself*. The regex is doing three
      // jobs at once, and the middle one is the point: the save was rejected,
      // the game named itself, and the error came from its own guard rather
      // than from whatever a misread happened to break first.
      //
      // That third job is why this is not merely `toMatch(/Could not restore/)`:
      // an unplayable move can come back `undefined`, throw something downstream
      // ("m.ops is not iterable"), or silently yield a board that is not the one
      // saved, and the loose form passed for all three.
      expect(err, `${id}: a foreign move in the log was not refused`).toMatch(
        new RegExp(`^Could not restore this saved game: ${id}: .*unrecognized`),
      );

      // Refused ⇒ rewound to the saved game's OPENING position: a real board
      // with the right params, rather than a half-replayed history.
      //
      // Deliberately not the stronger "the previous game is untouched".
      // That needed the midend to snapshot and restore a dozen fields by
      // hand, and a hand-listed field set rots the first time somebody adds
      // a thirteenth — silently, in the rollback path nobody exercises. The
      // caller that actually matters (`restoreAutoSavedGame`) throws the
      // save away and deals a fresh game regardless, so the stronger promise
      // bought nothing that anything kept.
      expect(m.getParams(), `${id}: params lost on refusal`).toBeTruthy();

      // Universal: whichever camp, the midend is intact — self-consistent,
      // saveable, and above all still drawable. The shipped crash failed
      // exactly here, and nowhere earlier.
      const drawing = new RecordingDrawing(m.getColorPalette([1, 1, 1]));
      m.size({ w: 400, h: 400 });
      expect(() => m.redraw(drawing), `${id}: board no longer draws`).not.toThrow();
      expect(drawing.ops.length, `${id}: reloaded board drew nothing`).toBeGreaterThan(
        0,
      );
      expect(() => m.saveGame(), `${id}: board no longer saves`).not.toThrow();
    });
  }
});

/**
 * The `v: 1` → `v: 2` upgrade, end to end and over real saves.
 *
 * `save.test.ts` checks the decoder against hand-written envelopes. This checks
 * the thing a player has: a save produced by really playing a game and using
 * Solve, rewritten into the shape the old code wrote, and handed to the current
 * `loadGame`. The flag has to survive, or the restored game silently forgets it
 * was solved with help.
 */
describe("a v1 save still loads", () => {
  beforeAll(registerAllGames);

  // One per interesting shape: a plain grid game, a game with a private desc
  // (Mines), the two that recompute `completed`, and the game whose cheat flag
  // used to be spelled `solved`.
  const SAMPLE = ["slant", "loopy", "mines", "range", "magnets", "palisade"];

  it("names games that exist", () => {
    // Vacuity: a typo here would silently check nothing.
    for (const id of SAMPLE) expect(registeredGameIds()).toContain(id);
    expect(SAMPLE.length).toBeGreaterThanOrEqual(5);
  });

  for (const id of SAMPLE) {
    it(`${id}: restores a v1 save with its cheat record intact`, () => {
      const game = getTsGame(id) as AnyGame;
      const params = game.defaultParams();
      const desc = game.newDesc(params, randomNew(`legacy-${id}`)).desc;

      let playedStatus: string | undefined;
      const played = midendFor(game);
      played.setCallbacks(
        (n) => {
          if (n.type === "game-state-change") playedStatus = n.status;
        },
        () => {},
        () => {},
      );
      played.newGameFromId(`${game.encodeParams(params, true)}:${desc}`);
      // One real click first — press *and* release, because Mines opens on the
      // release. Mines needs it (its layout does not exist until the first
      // click, and Solve refuses before that), and it is what puts a `privDesc`
      // in the envelope, which is the half of the format this game covers.
      const size = game.computeSize(params, game.preferredTileSize ?? 32);
      const cx = Math.floor(size.w / 2);
      const cy = Math.floor(size.h / 2);
      played.processInput(cx, cy, LEFT_BUTTON);
      played.processInput(cx, cy, LEFT_RELEASE);
      expect(played.solve(), `${id}: Solve refused`).toBeFalsy();
      const current = JSON.parse(new TextDecoder().decode(played.saveGame()));
      expect(current.cheated, `${id}: Solve did not set the flag`).toBe(true);

      // Rewrite into the shape the old code wrote: `v: 1`, flag as `usedSolve`.
      const { cheated, ...rest } = current;
      const legacy = encodeSave({ ...rest, v: 1, usedSolve: cheated } as never);

      const restored = midendFor(game);
      let status: string | undefined;
      restored.setCallbacks(
        (n) => {
          if (n.type === "game-state-change") status = n.status;
        },
        () => {},
        () => {},
      );
      expect(restored.loadGame(legacy), `${id}: v1 save refused`).toBeFalsy();
      // The invariant is *fidelity*, not a hard-coded verdict: whatever the
      // game reported when it was saved, it reports again when restored. That
      // is the assertion the flag is load-bearing for — and it covers Mines,
      // whose Solve reveals the board without marking it won (as upstream's
      // does), so it saves and restores as "ongoing".
      expect(status, `${id}: status changed across a v1 restore`).toBe(playedStatus);

      // And what it saves back out is clean v2 — the old key gone, not carried.
      const again = JSON.parse(new TextDecoder().decode(restored.saveGame()));
      expect(again.v).toBe(2);
      expect(again.cheated).toBe(true);
      expect(Object.hasOwn(again, "usedSolve")).toBe(false);
    });
  }
});
