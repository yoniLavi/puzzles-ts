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
import { describe, expect, it } from "vitest";
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
