/**
 * **Every input a game accepts must be reachable in every mode** — the
 * collection-wide input-parity bar (owner directive, 2026-08-03), swept through
 * the real registry and a real `Midend` so a game is covered the day it is
 * registered.
 *
 * [`touch-input.test.ts`](./touch-input.test.ts) already proves that a single
 * touch *press* does what a mouse press does. That is not what play consists
 * of, and it is not what this frontend's traps break. The guards here cover
 * what a press-level sweep cannot see:
 *
 *  0. **The instrument itself.** A game that answers *every* button makes the
 *     guards below unanswerable about itself while passing them. That one runs
 *     first, and it is the reason the rest can be believed.
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
 * this file was being written). A behavioral probe over generic geometry can
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
 * ones a game's semantics cannot make innocent, and every probe that needs
 * something to act on is primed first.
 *
 * What is banned is convicting a game **because** the board did not change —
 * the negation is what is unsound. A change is a perfectly sound *sufficient*
 * sign that an input means something, which is how the secondary-button guard
 * asks a far sharper question than "was it consumed" without re-opening the
 * rejected one: a game is reported meaningless only when it is invisible under
 * every observation. See `secondaryMeaning` in `testing/input-probe.ts`.
 *
 * The probes themselves live in
 * [`testing/input-probe.ts`](./testing/input-probe.ts) so this file and
 * `puzzle/shortcuts.test.ts` ask them identically — they each had their own
 * copy, and the copies had already drifted.
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
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  cursorDelta,
  isCancelKey,
  isMouseDown,
  isMouseDrag,
  isMouseRelease,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  MOD_MASK,
  MOD_STYLUS,
} from "./pointer.ts";
import { getTsGame, registeredGameIds } from "./registry.ts";
import {
  type AnyGame,
  probeBoard as board,
  fingerprint,
  probePoints,
  secondaryMeaning,
  UNACTIONABLE,
  unactionableClaims,
} from "./testing/input-probe.ts";

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

/**
 * Games that answer a button they cannot possibly have acted on, each with the
 * reason — and the reason must also be in that game's spec, not only here.
 *
 * Empty, and meant to stay so. Ascent was the only entry: its `interpretMove`
 * gated the `mouseClick` call on the *coordinates* alone, so every key sent to
 * the keyboard origin fell through to the `finishTyping` tail's `UI_UPDATE`.
 */
const CLAIMS_UNACTIONABLE: Record<string, string> = {};

describe("a game does not claim a button it did not act on", () => {
  /**
   * **The guard on the instrument the three guards below run on.** They ask
   * their questions by `interpretMove`'s return value — see "ON THE INSTRUMENT"
   * above — and a game that answers *everything* makes every one of those
   * questions unanswerable about itself while passing all of them.
   *
   * It is not only the tests that read that value. `view-interactive.ts` raises
   * `puzzle-key-unhandled` exactly when the game declines a key, and that is
   * what lets a bare letter be an app shortcut without a per-game roster
   * (`src/puzzle/shortcuts.ts`). A game claiming every code takes `u`, `r`, `n`
   * and `h` away from its own players — which is what Ascent did.
   */
  it("the probe codes really are unactionable", () => {
    // Checking the instrument before the finding: every reason these codes are
    // safe is derived from the vocabulary, so a code that stops being safe
    // (a new modifier bit, a new cursor button) fails here rather than
    // silently convicting whichever game reads it.
    for (const code of UNACTIONABLE) {
      expect(code & MOD_MASK, `0x${code.toString(16)} carries modifier bits`).toBe(0);
      expect(isMouseDown(code) || isMouseDrag(code) || isMouseRelease(code)).toBe(
        false,
      );
      expect(cursorDelta(code)).toBe(null);
      expect(code === CURSOR_SELECT || code === CURSOR_SELECT2).toBe(false);
      expect(isCancelKey(code)).toBe(false);
      // Not a character a keyboard or the on-screen panel can produce.
      expect(code > 0x7e).toBe(true);
    }
    // And not a code any game's own keypad offers.
    for (const id of REGISTERED) {
      const game = getTsGame(id) as AnyGame | undefined;
      for (const k of game?.requestKeys?.(game.defaultParams()) ?? [])
        expect(UNACTIONABLE, `${id}'s keypad offers a probe code`).not.toContain(
          k.button,
        );
    }
  });

  const claimants: string[] = [];
  let sweptGames = 0;

  for (const id of REGISTERED) {
    const game = getTsGame(id) as AnyGame | undefined;
    if (!game) continue;

    it(`${id}: declines a code it cannot act on`, () => {
      const { claims: claimed, boardChanged } = unactionableClaims(game, id);

      if (claimed.length) claimants.push(id);
      // A biconditional, so the ledger cannot rot in either direction: a game
      // that acquires the defect is caught, and a game that is fixed forces its
      // entry to be deleted rather than left behind as a standing excuse.
      expect(
        claimed.length > 0,
        claimed.length
          ? `${id} answered a button code nothing could act on (${claimed[0]}, ` +
              `${claimed.length} in all). It blinds every guard below, which asks ` +
              "its question by this same return value, and it takes the bare-letter " +
              "app shortcuts away from this game's players (`puzzle/shortcuts.ts`). " +
              "Decline the button instead of falling through to a repaint."
          : `${id} is on CLAIMS_UNACTIONABLE but no longer claims anything — ` +
              "delete its entry.",
      ).toBe(id in CLAIMS_UNACTIONABLE);

      // A code nothing acts on cannot have moved the board either. This is the
      // one direction "did the board change" is safe to ask in (constraint C1
      // of `close-the-consumed-probe-blind-spot`): there is no innocent reason
      // for a code with no meaning to write to the grid.
      expect(boardChanged, `${id} changed the board for a meaningless code`).toBe(
        false,
      );
      sweptGames++;
    });
  }

  it("swept every registered game, over codes that exist", () => {
    expect(sweptGames).toBe(REGISTERED.length);
    expect(UNACTIONABLE.length).toBeGreaterThan(1);
    expect(claimants.sort()).toEqual(Object.keys(CLAIMS_UNACTIONABLE).sort());
  });
});

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
   * The §3.8c trap, stated so it cannot be innocent. `Game.ignoresSecondaryButton`
   * declares that the secondary button means nothing in this game, and the flag
   * turns off `detectSecondaryButton` entirely — so a wrong answer in either
   * direction costs a real gesture, and the two are asserted **equal** rather
   * than merely compatible.
   *
   * **The question is "did anything observable happen", not "was it consumed".**
   * Consumption is what this guard used to ask, and it was satisfied by a bare
   * repaint: 16 of 57 games consumed `RIGHT_BUTTON` without ever committing a
   * move, so for those the biconditional held whatever the game did. Ascent made
   * that concrete — its `finishTyping` tail answered any in-grid pointer button,
   * so deleting its entire right-button arm left this guard green.
   *
   * `secondaryMeaning` asks the sharper question, and it is one question rather
   * than a list of special cases: the collection's three legitimate answers —
   * commit a move (34 games), change what the next input does (16), fold onto
   * the primary button (Slide) — are all "something observable changed", now or
   * next. Nothing is declared; a game joins by *having* the behavior.
   */
  const declared: string[] = [];
  const observed: string[] = [];

  for (const id of REGISTERED) {
    const game = getTsGame(id) as AnyGame | undefined;
    if (!game) continue;

    it(`${id}: declares ignoresSecondaryButton iff it ignores it`, () => {
      const { used, evidence } = secondaryMeaning(game, id);
      if (!used) observed.push(id);
      if (game.ignoresSecondaryButton) declared.push(id);

      expect(
        game.ignoresSecondaryButton ?? false,
        used
          ? `${id} has a secondary meaning (${evidence}), so it must NOT set ` +
              "ignoresSecondaryButton — setting it would turn off a long press " +
              "the game handles"
          : `${id} does nothing observable with RIGHT_BUTTON — no move, no ` +
              "change to what the next input does, no fold onto the primary " +
              "button — so it MUST set ignoresSecondaryButton. Otherwise every " +
              "long press and two-finger tap a touch player makes is silently " +
              "dropped, and a press-and-drag gesture dies whenever they pause " +
              "to aim.",
      ).toBe(!used);
    });
  }

  it("found the games it claims to have found", () => {
    // Vacuity: a probe that observed nothing anywhere would declare all 57
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
