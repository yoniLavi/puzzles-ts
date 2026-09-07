/**
 * **A shortcut label must be true.**
 *
 * A key drawn on a control is a promise, and the cheapest way for it to become
 * a lie is for the binder and the label to read different things — which is
 * why they read one table (`shortcuts.ts`) and why this drives *both* paths
 * from it rather than restating either. The assertions synthesize the event
 * from an entry's own chord and check that the matcher returns that entry's
 * command; the label test renders through `shortcutLabel`, the function the
 * rail row calls. Neither spells a key out a third time.
 *
 * Two properties this also nails down, both of which are the sort of thing a
 * later edit breaks silently:
 *
 * - **A bare letter needs no modifier and a chord needs one.** Swap those and
 *   `Ctrl+U` starts undoing while `u` types into a game.
 * - **Nothing is bound twice.** Two commands on one chord means whichever the
 *   table lists first wins, in a file where order is otherwise meaningless.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { CURSOR_RIGHT } from "../engine/pointer.ts";
import { getTsGame, registeredGameIds } from "../engine/registry.ts";
import { type AnyGame, probeBoard } from "../engine/testing/input-probe.ts";
import { registerAllGames } from "../games/index.ts";
import { bareCommand, chordCommand, SHORTCUTS, shortcutLabel } from "./shortcuts.ts";

/** A `KeyboardEvent`-shaped object for the matchers, which read five fields. */
function key(k: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) {
  return {
    key: k,
    ctrlKey: mods.ctrl === true,
    metaKey: false,
    shiftKey: mods.shift === true,
    altKey: mods.alt === true,
  };
}

describe("the app's keyboard shortcuts", () => {
  it("has a table with chords and bare letters in it", () => {
    // Vacuity: every assertion below iterates SHORTCUTS.
    expect(SHORTCUTS.length).toBeGreaterThan(4);
    expect(SHORTCUTS.filter((s) => s.chords.length > 0).length).toBeGreaterThan(2);
    expect(SHORTCUTS.filter((s) => s.bare).length).toBeGreaterThan(2);
  });

  it("binds no key to two commands", () => {
    const chords = SHORTCUTS.flatMap((s) =>
      s.chords.map((c) => `${c.shift ? "shift+" : ""}${c.key}`),
    );
    expect([...new Set(chords)].sort()).toEqual(chords.sort());

    const bares = SHORTCUTS.flatMap((s) => (s.bare ? [s.bare] : []));
    expect([...new Set(bares)].sort()).toEqual(bares.sort());
  });

  for (const shortcut of SHORTCUTS) {
    for (const chord of shortcut.chords) {
      it(`${shortcut.command}: ${chord.shift ? "Shift+" : ""}Ctrl+${chord.key} runs it`, () => {
        expect(chordCommand(key(chord.key, { ctrl: true, shift: chord.shift }))).toBe(
          shortcut.command,
        );
        // Without the modifier it is a plain letter and belongs to the game.
        expect(chordCommand(key(chord.key, { shift: chord.shift }))).toBeUndefined();
        // With Alt as well it is somebody else's binding, not ours.
        expect(
          chordCommand(key(chord.key, { ctrl: true, shift: chord.shift, alt: true })),
        ).toBeUndefined();
      });
    }

    if (shortcut.bare) {
      const bare = shortcut.bare;
      it(`${shortcut.command}: bare ${bare} runs it`, () => {
        expect(bareCommand(key(bare))).toBe(shortcut.command);
        // A modified press is not the bare shortcut — it is either a chord or
        // the game's, and either way not this.
        expect(bareCommand(key(bare, { ctrl: true }))).toBeUndefined();
        expect(bareCommand(key(bare, { shift: true }))).toBeUndefined();
        expect(bareCommand(key(bare, { alt: true }))).toBeUndefined();
      });
    }

    it(`${shortcut.command}: the label names a key that is bound`, () => {
      const label = shortcutLabel(shortcut.command);
      expect(label, `${shortcut.command} has no label`).toBeTruthy();
      const shown = label as string;

      // The label shows the FIRST chord if there is one, else the bare letter.
      // Read the key back out of the label and press it: that is the check that
      // the drawn key is the working key, rather than that two functions were
      // called with the same string.
      const letter = shown.slice(-1).toLowerCase();
      if (shortcut.chords.length > 0) {
        const first = shortcut.chords[0];
        expect(letter).toBe(first.key);
        expect(chordCommand(key(letter, { ctrl: true, shift: first.shift }))).toBe(
          shortcut.command,
        );
        // A chord label always carries its modifier — a bare "Z" on the Undo
        // row would be a label for a key that does nothing.
        expect(shown.includes("⌘") || shown.startsWith("Ctrl+")).toBe(true);
        // …and shows Shift exactly when the chord needs it.
        expect(shown.includes("⇧") || shown.includes("Shift+")).toBe(
          first.shift === true,
        );
      } else {
        expect(letter).toBe(shortcut.bare);
        expect(bareCommand(key(letter))).toBe(shortcut.command);
      }
    });
  }

  it("claims nothing it has not drawn", () => {
    // A key with no entry runs nothing — the matchers must not fall through to
    // some default, which is how a chord quietly starts eating a browser
    // shortcut the app never meant to take.
    expect(chordCommand(key("p", { ctrl: true }))).toBeUndefined();
    expect(bareCommand(key("q"))).toBeUndefined();
  });
});

/**
 * Games that consume a bare shortcut letter themselves, each with the reason.
 *
 * These are **not defects**: the derivation's whole design is that the game is
 * offered the key first, so a game with its own meaning for a letter keeps it.
 * The ledger exists because that collision is otherwise invisible — the
 * shortcut simply does nothing in that game, and nobody finds out from a green
 * suite. An entry is a decision somebody made, and it must be one a player
 * would agree with.
 */
const BINDS_A_SHORTCUT_LETTER: Record<string, string> = {
  guess:
    "binds 'h' (with 'H' and '?') to its own hint, which is the same command " +
    "the bare letter would have run — a player pressing h gets a hint either way.",
  pearl:
    "binds 'h' (with 'H') to its own hint, which is the same command the bare " +
    "letter would have run — a player pressing h gets a hint either way.",
  tents:
    "binds 'n' to 'not a tent', upstream's T/N/B cell vocabulary, and only " +
    "while the keyboard cursor is visible — which is exactly when a player " +
    "means the cell and not a new game. With the cursor hidden it declines 'n' " +
    "and New game runs, so the letter is never simply lost.",
};

describe("a bare shortcut letter reaches the app in every game", () => {
  /**
   * **The other half of the derivation**, and the half no other test covers.
   *
   * `shortcuts.ts` resolves a bare letter by offering it to the game first and
   * acting only if `interpretMove` returned `null`. The tests above prove the
   * table and the matchers are right; none of them proves the *game* lets the
   * letter through, and that is the half a player feels. Ascent used to answer
   * every key — its `interpretMove` gated on the pointer coordinates alone,
   * and keys arrive at (0, 0) — so undo, redo, new game and hint were all dead
   * there while every test in this file passed
   * (`close-the-consumed-probe-blind-spot`).
   *
   * The sweep is *sufficient*, not exhaustive: it asks on a fresh board and
   * with the cursor revealed, which is the state a player is in when they reach
   * for undo. A game that only claims a letter in some deeper mode escapes it —
   * that is a missed catch, never a false conviction, because the ledger below
   * is asserted to be exactly the set found.
   */
  const bare = SHORTCUTS.flatMap((s) => (s.bare ? [[s.bare, s.command] as const] : []));
  const found: Record<string, string[]> = {};
  let swept = 0;

  beforeAll(registerAllGames);

  it("has bare letters to sweep", () => {
    // Vacuity: if the table ever loses its `bare` entries this whole describe
    // block passes over nothing and reports health.
    expect(bare.length).toBeGreaterThan(2);
  });

  for (const id of registeredGameIds()) {
    it(`${id}: declines the letters the app needs`, () => {
      const game = getTsGame(id) as AnyGame | undefined;
      expect(game, `${id} is registered but has no game object`).toBeDefined();
      if (!game) return;
      const { m, reset } = probeBoard(game, id);

      const claimed: string[] = [];
      // Walk the cursor rather than testing one cell. A game's letter is
      // often legal only on some cells — Tents accepts 'n' on any square but
      // a tree — so a single position makes the answer depend on what the
      // seed happened to deal, and this sweep reported a different set of
      // games the moment its board changed.
      for (const [letter] of bare)
        for (let steps = 0; steps <= 4 && !claimed.includes(letter); steps++) {
          reset();
          // Keys reach the engine at (0, 0) — `worker-adapter.ts`.
          for (let n = 0; n < steps; n++) m.processInput(0, 0, CURSOR_RIGHT);
          if (m.processInput(0, 0, letter.charCodeAt(0))) claimed.push(letter);
        }
      if (claimed.length) found[id] = claimed;
      swept++;

      expect(
        claimed.length > 0,
        claimed.length
          ? `${id} consumes ${claimed.join(", ")}, so ${claimed
              .map((l) => bare.find(([b]) => b === l)?.[1])
              .join(", ")} cannot be reached from the keyboard in this game. If ` +
              "the game really does bind the letter, add it to " +
              "BINDS_A_SHORTCUT_LETTER with the reason a player would accept; if " +
              "it does not, it is answering a key it did not act on."
          : `${id} is on BINDS_A_SHORTCUT_LETTER but no longer claims a ` +
              "shortcut letter — delete its entry.",
      ).toBe(id in BINDS_A_SHORTCUT_LETTER);
    });
  }

  it("swept every registered game", () => {
    expect(swept).toBe(registeredGameIds().length);
    expect(Object.keys(found).sort()).toEqual(
      Object.keys(BINDS_A_SHORTCUT_LETTER).sort(),
    );
    for (const reason of Object.values(BINDS_A_SHORTCUT_LETTER))
      expect(reason.length).toBeGreaterThan(80);
  });
});
