/**
 * **Every input a game accepts must be reachable in every mode** — the
 * collection-wide input-parity bar (owner directive, 2026-08-03), swept through
 * the real registry and a real `Midend` so a game is covered the day it is
 * registered.
 *
 * [`touch-input.test.ts`](./touch-input.test.ts) already proves that a single
 * touch *press* does what a mouse press does. That is not what play consists
 * of, and it is not what this frontend's traps break. The three guards here
 * cover what a press-level sweep cannot see:
 *
 *  1. **A gesture, not a press.** Press → drag → release from a finger must
 *     leave the same board as from a mouse.
 *  2. **The long press.** `detectSecondaryButton` promotes a finger that stays
 *     within 8 px for 350 ms to `RIGHT_BUTTON` — and "press, pause to aim, then
 *     drag" *is* a press that stays put. A game with no secondary meaning
 *     therefore drops the whole gesture, only on touch, and only for the player
 *     who stopped to think. `Game.ignoresSecondaryButton` turns the promotion
 *     off, and this asserts the **biconditional**, so the flag can neither be
 *     forgotten by a new game nor left behind by a game that grows a secondary
 *     meaning.
 *  3. **The keyboard exists at all**, and every key the on-screen panel offers
 *     reaches the game. The second is the reverse direction, and it is the one
 *     that separates "the wiring is connected" from "the input is reachable".
 *
 * ON THE INSTRUMENT (this repo's standing rule, and it bit four times while
 * this file was being written). A behavioural probe over generic geometry can
 * only ever observe *"the board did not change"*, and there are many innocent
 * reasons for that:
 *
 *  - Rectangles' right-drag is an **eraser**, so on a fresh board it correctly
 *    does nothing — and its erase covers a rectangle's *interior*, so a
 *    one-tile drag correctly does nothing even on a written board;
 *  - a "Clear" key on an already-empty cell is a legitimate no-op;
 *  - Seismic caps entry at the cell's region size, so 6..9 do nothing on a
 *    board whose regions are all smaller.
 *
 * Each of those masqueraded as a dead binding. So the questions asked below are
 * ones a game's semantics cannot make innocent: *was the button consumed*
 * (`interpretMove` returned non-null) rather than *did the board change*, and
 * every probe that needs something to act on is primed first.
 *
 * The sweeps are also frontend-faithful, which is load-bearing rather than
 * decorative: `view-interactive.ts` installs `pointerTracking` only `if
 * (consumed)`, so a press that returns `null` never receives the drag. A sweep
 * that sent the drag regardless would score Galaxies' shipped left-drag bug —
 * press consumed nothing, every drag frame silently dropped — as healthy.
 *
 * See docs/games/input.md § "The input-parity bar".
 */

import { beforeAll, describe, expect, it } from "vitest";
import { registerAllGames } from "../games/index.ts";
import type { Game } from "./game.ts";
import { Midend } from "./midend.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  MOD_STYLUS,
  RIGHT_BUTTON,
  RIGHT_RELEASE,
} from "./pointer.ts";
import { randomNew } from "./random/index.ts";
import { getTsGame, registeredGameIds } from "./registry.ts";

type AnyGame = Game<unknown, unknown, unknown, unknown, unknown>;

beforeAll(registerAllGames);

const REGISTERED = registeredGameIds();

/**
 * Games with no keyboard at all, each with the reason — and the reason must
 * also be in that game's spec, not only here. The list is the point: it makes
 * "this game has no keyboard" a decision somebody made rather than a condition
 * nobody noticed, which is precisely the state that left nine games touch-dead
 * for months.
 */
const NO_KEYBOARD: Record<string, string> = {
  // Empty, and meant to stay so: every game in the collection has a keyboard.
  // Loopy was the last entry — its input is per-edge across eighteen tilings,
  // so it needed an interaction designed rather than a binding added
  // (`add-loopy-keyboard-control`: the cursor is a dot, an arrow picks one of
  // its edges). A game added here must record its reason in its own spec too.
};

/** One board per game, built once — the generators are the expensive part. */
function board(game: AnyGame, id: string) {
  const params = game.defaultParams();
  const desc = game.newDesc(params, randomNew(`parity-${id}`)).desc;
  const tileSize = game.preferredTileSize ?? 32;
  const m = new Midend(game);
  m.setCallbacks(
    () => {},
    () => {},
    () => {},
  );
  const gameId = `${game.encodeParams(params, true)}:${desc}`;
  const reset = () => m.newGameFromId(gameId);
  reset();
  return { params, tileSize, size: game.computeSize(params, tileSize), m, reset };
}

function fingerprint(m: Midend<unknown, unknown, unknown, unknown, unknown>): string {
  const bytes = m.saveGame();
  let h = 0;
  for (const b of bytes) h = (h * 31 + b) | 0;
  return String(h);
}

/** Probe points across the whole board — a coarse grid is not enough (an early
 * cut of the press sweep sailed straight past Untangle, whose vertices sit at
 * arbitrary points, and would have reported health). */
function probePoints(size: { w: number; h: number }): { x: number; y: number }[] {
  const step = Math.max(4, Math.floor(Math.min(size.w, size.h) / 12));
  const pts: { x: number; y: number }[] = [];
  for (let x = 2; x < size.w; x += step)
    for (let y = 2; y < size.h; y += step) pts.push({ x, y });
  return pts;
}

const LEFT: [number, number, number] = [LEFT_BUTTON, LEFT_DRAG, LEFT_RELEASE];

/**
 * Panel keys known to be inert, each an entry that is a **finding under
 * management** rather than an exemption — adding one without an owning change
 * is the thing this list exists to prevent.
 */
const INERT_PANEL_KEYS: Record<string, string[]> = {
  // Empty, and meant to stay so. Seismic sat here once, offering four digits
  // no generated region could hold, because its keypad copied the *format*
  // bound where the *generator* bound was wanted; it now derives the keypad
  // from the generator (`maxGeneratedRegionSize`).
};

describe("a gesture from a finger does what the same gesture from a mouse does", () => {
  let sweptGames = 0;
  let sweptGestures = 0;

  for (const id of REGISTERED) {
    const game = getTsGame(id) as AnyGame | undefined;
    if (!game) continue;

    it(`${id}: press, drag and release are equivalent on touch`, () => {
      const { tileSize, size, m, reset } = board(game, id);

      /** The frontend's own state machine: press; only if the press was
       * consumed does the drag follow; an unconsumed press gets its release
       * immediately, which is what `handlePointerDown`'s `else` branch does. */
      const gesture = (
        p: { x: number; y: number },
        q: { x: number; y: number },
        [down, drag, up]: [number, number, number],
        mod = 0,
      ) => {
        reset();
        if (!m.processInput(p.x, p.y, down | mod)) {
          m.processInput(p.x, p.y, up | mod);
          return { consumed: false, fp: fingerprint(m) };
        }
        m.processInput(q.x, q.y, drag | mod);
        m.processInput(q.x, q.y, up | mod);
        return { consumed: true, fp: fingerprint(m) };
      };

      let live = 0;
      for (const p of probePoints(size)) {
        for (const q of [
          { x: p.x + tileSize, y: p.y },
          { x: p.x, y: p.y + tileSize },
          { x: p.x + 2 * tileSize, y: p.y + 2 * tileSize },
        ]) {
          if (q.x >= size.w || q.y >= size.h) continue;
          const mouse = gesture(p, q, LEFT);
          if (!mouse.consumed) continue;
          live++;
          // A game that asked for the stylus bit is NOT skipped — excluding
          // the two games with bespoke touch handling would make them the two
          // nothing checks. It is asserted against what it declares: the bit
          // is visible to it, so its gesture may legitimately differ from the
          // mouse's, and what must hold is that the gesture still does
          // something rather than falling through a raw-button comparison.
          const touch = gesture(p, q, LEFT, MOD_STYLUS);
          if (game.wantsStylusModifier) expect(touch.consumed).toBe(true);
          else expect(touch).toEqual(mouse);
        }
      }

      // Guard the guard: a game whose every probe fell on dead space would
      // pass the comparison above over nothing at all.
      expect(live, `${id}: no live pointer gesture found to compare`).toBeGreaterThan(
        0,
      );
      sweptGames++;
      sweptGestures += live;
    });
  }

  it("swept every registered game, and found gestures in each", () => {
    expect(sweptGames).toBe(REGISTERED.length);
    expect(sweptGestures).toBeGreaterThan(1000);
  });
});

describe("a long press cannot silently swallow a gesture", () => {
  /**
   * The §3.8c trap, stated so it cannot be innocent. Asking "does the promoted
   * gesture change the board?" is unanswerable — a right-button eraser on a
   * fresh board correctly changes nothing. Asking "does the game consume
   * `RIGHT_BUTTON` anywhere?" is not: if it never does, then *every* long press
   * and *every* two-finger tap that player makes is dropped, whatever the board
   * holds. That is the exact condition `Game.ignoresSecondaryButton` declares,
   * so the two are asserted equal rather than merely compatible.
   */
  const declared: string[] = [];
  const observed: string[] = [];

  for (const id of REGISTERED) {
    const game = getTsGame(id) as AnyGame | undefined;
    if (!game) continue;

    it(`${id}: declares ignoresSecondaryButton iff it ignores it`, () => {
      const { size, m, reset } = board(game, id);
      let usesRight = false;
      for (const p of probePoints(size)) {
        if (usesRight) break;
        // Twice: once on the fresh board, once after the left button has
        // written something, because a secondary meaning is often "undo what
        // the primary one did" and has nothing to act on until then.
        for (const prime of [false, true]) {
          reset();
          if (prime) {
            m.processInput(p.x, p.y, LEFT_BUTTON);
            m.processInput(p.x, p.y, LEFT_RELEASE);
          }
          if (m.processInput(p.x, p.y, RIGHT_BUTTON)) usesRight = true;
          m.processInput(p.x, p.y, RIGHT_RELEASE);
          if (usesRight) break;
        }
      }
      if (!usesRight) observed.push(id);
      if (game.ignoresSecondaryButton) declared.push(id);

      expect(
        game.ignoresSecondaryButton ?? false,
        usesRight
          ? `${id} consumes RIGHT_BUTTON, so it must NOT set ignoresSecondaryButton — ` +
              "setting it would turn off a long press the game handles"
          : `${id} never consumes RIGHT_BUTTON, so it MUST set ` +
              "ignoresSecondaryButton — otherwise every long press and two-finger " +
              "tap a touch player makes is silently dropped, and a press-and-drag " +
              "gesture dies whenever they pause to aim",
      ).toBe(!usesRight);
    });
  }

  it("found the games it claims to have found", () => {
    // Vacuity: a probe that consumed nothing anywhere would declare all 57
    // games secondary-button-free and demand the flag on every one of them.
    expect(observed.length).toBeGreaterThan(0);
    expect(observed.length).toBeLessThan(REGISTERED.length / 2);
    expect(declared).toEqual(observed);
  });
});

describe("keyboard reachability is a recorded decision for every game", () => {
  const withKeyboard: string[] = [];
  const without: string[] = [];

  for (const id of REGISTERED) {
    const game = getTsGame(id) as AnyGame | undefined;
    if (!game) continue;

    it(`${id}: responds to a cursor key, or is on the exemption list`, () => {
      const { m, reset } = board(game, id);
      reset();
      // Keyboard events reach the engine at (0, 0) — `worker-adapter.ts`'s
      // `processKey` — so the probe uses the frontend's own coordinates.
      const responds = [CURSOR_RIGHT, CURSOR_DOWN, CURSOR_LEFT, CURSOR_UP].some((b) =>
        m.processInput(0, 0, b),
      );
      if (responds) withKeyboard.push(id);
      else without.push(id);

      // Coverage is derived through the real `Midend`, never by grepping a
      // game's `index.ts` for `CURSOR_UP`: Palisade and Separate have no direct
      // `CURSOR_*` reference and full cursor handling, via `border-grid.ts`.
      // A check that reads one file convicts two games that are fine, which is
      // how a guard gets turned off rather than fixed.
      expect(
        responds || id in NO_KEYBOARD,
        `${id} handles no cursor key and is not on the exemption list. Either ` +
          "give it a keyboard, or add it to NO_KEYBOARD with the reason — and " +
          "put that reason in the game's spec, not only here.",
      ).toBe(true);
    });
  }

  it("the exemption list names only games that really have no keyboard", () => {
    expect(withKeyboard.length).toBeGreaterThan(50);
    expect(Object.keys(NO_KEYBOARD).sort()).toEqual(without.sort());
    for (const reason of Object.values(NO_KEYBOARD))
      expect(reason.length).toBeGreaterThan(80);
  });
});

describe("every on-screen key a game offers reaches that game", () => {
  /**
   * The reverse direction, and the one the emittable-key scan cannot see: that
   * scan asks whether a code a game tests can be *sent*, and this asks whether
   * a code the frontend sends is *received*. On touch the key panel is the only
   * character-entry route there is, so a panel key that reaches nothing is an
   * input a touch player simply cannot make.
   *
   * It is also the reason `emittable-keys.test.ts` cannot read `puzzleKeyMap`
   * alone: `clearKey`'s button is 8, which that map never sends. The panel is a
   * second emitter.
   */
  let panelGames = 0;
  let panelKeys = 0;

  for (const id of REGISTERED) {
    const game = getTsGame(id) as AnyGame | undefined;
    if (!game?.requestKeys) continue;

    it(`${id}: no on-screen key is inert`, () => {
      const { params, size, m, reset } = board(game, id);
      const panel = game.requestKeys?.(params) ?? [];
      expect(panel.length).toBeGreaterThan(0);
      panelGames++;
      panelKeys += panel.length;

      const pts = probePoints(size);
      const dead: string[] = [];
      for (const k of panel) {
        let reached = false;
        // Walk the keyboard cursor, and separately select a cell with the
        // pointer, since a panel key acts on whichever the game tracks. Each
        // is asked twice: bare, and after the panel's first key has written
        // something — a "Clear" on an empty cell is a legitimate no-op, and
        // scoring that as dead convicted Abcd and Crossing wrongly.
        for (let j = 0; j < 8 && !reached; j++)
          for (let i = 0; i < 8 && !reached; i++)
            for (const prime of [undefined, panel[0].button]) {
              reset();
              for (let n = 0; n <= i; n++) m.processInput(0, 0, CURSOR_RIGHT);
              for (let n = 0; n < j; n++) m.processInput(0, 0, CURSOR_DOWN);
              if (prime !== undefined) m.processInput(0, 0, prime);
              if (m.processInput(0, 0, k.button)) reached = true;
            }
        for (const p of pts) {
          if (reached) break;
          for (const prime of [undefined, panel[0].button]) {
            reset();
            m.processInput(p.x, p.y, LEFT_BUTTON);
            m.processInput(p.x, p.y, LEFT_RELEASE);
            if (prime !== undefined) m.processInput(0, 0, prime);
            if (m.processInput(0, 0, k.button)) reached = true;
          }
        }
        if (!reached) dead.push(`${k.label} (button ${k.button})`);
      }

      expect(
        dead,
        `${id} offers on-screen keys its own interpretMove never accepts. On ` +
          "touch the panel is the only way to type, so these are inputs a " +
          "touch player cannot make.",
      ).toEqual(INERT_PANEL_KEYS[id] ?? []);
    });
  }

  it("swept a plausible number of panels", () => {
    // A floor that only ever moves up. It is set at the twelve panels present
    // when written rather than comfortably below them, because the loose
    // version of this line is what let a deliberately-removed `requestKeys`
    // hook pass unnoticed while task 3.4 was proving these guards fail: a game
    // that *loses* its keypad has every on-screen key made unreachable at once,
    // which is the largest version of the defect this describe block exists to
    // catch, and it was the one thing it could not see.
    expect(panelGames).toBeGreaterThanOrEqual(12);
    expect(panelKeys).toBeGreaterThan(60);
  });
});

describe("the keyboard can commit a move, not merely move a cursor", () => {
  /**
   * A cursor that goes everywhere and does nothing is not a keyboard. This
   * asks the whole question D1 asks — is the input *reachable* — by finding one
   * keyboard sequence per game that actually changes the board.
   *
   * Two-step interactions are the reason the probe is not a single keypress:
   * Pegs, Map, Rectangles, Samegame, Signpost, Slide and Untangle all pick
   * something up with a select and put it down with a second one, so asking
   * once scores every one of them deaf.
   */
  for (const id of REGISTERED) {
    const game = getTsGame(id) as AnyGame | undefined;
    if (!game || id in NO_KEYBOARD) continue;

    it(`${id}: some keyboard-only sequence changes the board`, () => {
      const { params, m, reset } = board(game, id);
      const panelButtons = (game.requestKeys?.(params) ?? []).map((k) => k.button);
      const chars: number[] = [];
      for (let c = 33; c <= 126; c++) {
        reset();
        m.processInput(0, 0, CURSOR_RIGHT);
        if (m.processInput(0, 0, c)) chars.push(c);
      }

      const sequences: number[][] = [
        // All four directions, because in a direct-action game the arrow key
        // *is* the move and the walk below has already driven it as far right
        // and as far down as it goes — Fifteen's gap starts in the top-left
        // corner, where `CURSOR_RIGHT` and `CURSOR_DOWN` correctly do nothing.
        [CURSOR_RIGHT],
        [CURSOR_LEFT],
        [CURSOR_UP],
        [CURSOR_DOWN],
        [CURSOR_SELECT],
        [CURSOR_SELECT2],
        [CURSOR_SELECT, CURSOR_SELECT],
        [CURSOR_SELECT, CURSOR_RIGHT, CURSOR_SELECT],
        [CURSOR_SELECT, CURSOR_DOWN, CURSOR_SELECT],
        [CURSOR_SELECT, CURSOR_RIGHT, CURSOR_RIGHT, CURSOR_SELECT],
        [CURSOR_SELECT, CURSOR_DOWN, CURSOR_DOWN, CURSOR_SELECT],
        ...[...new Set([...chars, ...panelButtons])].flatMap((c) => [
          [c],
          [c, CURSOR_SELECT],
          [c, c, CURSOR_SELECT],
        ]),
      ];

      let committed = false;
      outer: for (let j = 0; j < 5; j++) {
        for (let i = 0; i < 5; i++) {
          for (const seq of sequences) {
            reset();
            for (let n = 0; n <= i; n++) m.processInput(0, 0, CURSOR_RIGHT);
            for (let n = 0; n < j; n++) m.processInput(0, 0, CURSOR_DOWN);
            const before = fingerprint(m);
            for (const b of seq) m.processInput(0, 0, b);
            if (fingerprint(m) !== before) {
              committed = true;
              break outer;
            }
          }
        }
      }
      expect(
        committed,
        `${id}: no keyboard-only sequence changed the board, so a player with ` +
          "no pointer cannot play it.",
      ).toBe(true);
    });
  }
});
