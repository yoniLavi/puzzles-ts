/**
 * **The app's keyboard shortcuts — one table, read by both the binder and the
 * label.** Keys otherwise go straight through `eventKeyToPuzzleKey` to the game.
 *
 * Two tiers:
 *
 * - **Chords, always on.** `Ctrl/Cmd` + a letter cannot collide with a game's
 *   input, because the board never sees a key with `Ctrl` held
 *   (`wantsKeyEvent` declines them).
 * - **Bare letters, behind a preference.** These *can* collide, and the
 *   collision is resolved by deriving it from the game rather than from a
 *   roster.
 *
 * **How the derivation works.** `Midend.processInput` returns `false` **exactly
 * when the game's `interpretMove` returned `null`** — that is, when the game
 * declined the key. So the rule is *offer the key to the game first, and act
 * only if it declines*, which needs no list of games, cannot be forgotten by a
 * new one, and also covers a game that consumes a letter without ever putting
 * it on the keypad. (Upstream's `midend.c` intercepts `n`/`u`/`r`/`q` before
 * the game runs, which is precisely why its `one_key_shortcuts` preference has
 * to exist.) The wiring is `view-interactive.ts`, which raises
 * `puzzle-key-unhandled` when the game declines, and `puzzle-screen.ts`, which
 * listens.
 *
 * **`Ctrl/Cmd+S` is bound** to Check & save, with a `preventDefault()` that
 * suppresses the browser's save dialog. Deliberately, though the design left
 * that chord to the browser: it is a working, player-visible shortcut, and
 * listing it here is what puts it on the rail's Check & save row.
 *
 * Nothing here decides *what* a command does; `puzzle-screen.ts`'s `commandMap`
 * does, and every `command` below is one of its keys (asserted by
 * `puzzle-command-homes.test.ts`).
 */

/** One always-on chord. `ctrl` means Control on Windows/Linux, Command on a
 * Mac — the platform's own "app command" modifier, resolved by `hasCtrlKey`. */
export interface Chord {
  /** `KeyboardEvent.key`, lowercased. */
  readonly key: string;
  readonly shift?: boolean;
}

export interface Shortcut {
  /** A `commandMap` key on the puzzle screen. */
  readonly command: string;
  /** Every chord that runs it. More than one where a platform convention is
   * genuinely split — redo is `Shift+Cmd+Z` on a Mac and `Ctrl+Y` on Windows,
   * and a player who knows one should not have to learn the other. */
  readonly chords: readonly Chord[];
  /** The bare letter, if this command has one. Behind the preference, and only
   * ever fired after the game has declined the key. */
  readonly bare?: string;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { command: "undo", chords: [{ key: "z" }], bare: "u" },
  { command: "redo", chords: [{ key: "z", shift: true }, { key: "y" }], bare: "r" },
  { command: "check-and-save", chords: [{ key: "s" }] },
  { command: "switch-puzzle", chords: [{ key: "k" }] },
  { command: "new-game", chords: [], bare: "n" },
  { command: "hint", chords: [], bare: "h" },
];

/** True on a platform whose app-command modifier is ⌘ and whose users read
 * chords as glyphs. Guarded for a non-browser context (a `node`-environment
 * test importing this module for its table). */
function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

/** How a chord is written on a control. `⌘Z` / `⇧⌘Z` on Apple platforms,
 * `Ctrl+Z` / `Ctrl+Shift+Z` elsewhere. */
function chordLabel(chord: Chord): string {
  const key = chord.key.toUpperCase();
  if (isApplePlatform()) {
    return `${chord.shift ? "⇧" : ""}⌘${key}`;
  }
  return `Ctrl+${chord.shift ? "Shift+" : ""}${key}`;
}

/**
 * What a control shows for `command`, or `undefined` when it has no shortcut.
 *
 * The **first** chord, not all of them: a control has room for one, and a list
 * of equivalents teaches nothing. The bare letter is shown only when there is no
 * chord, because a bare letter is conditional — on the preference, and on the
 * game not wanting that letter — and a label that is sometimes a lie is worse
 * than no label.
 */
export function shortcutLabel(command: string): string | undefined {
  const shortcut = SHORTCUTS.find((s) => s.command === command);
  if (!shortcut) return undefined;
  const [first] = shortcut.chords;
  if (first) return chordLabel(first);
  return shortcut.bare?.toUpperCase();
}

/** The Ctrl/Cmd state of an event, the way the rest of the app reads it. */
type ModifierEvent = Pick<
  KeyboardEvent,
  "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey"
>;

/**
 * The command an always-on chord in `event` runs, or `undefined`.
 *
 * Alt/Option disqualifies a match: `⌥⌘Z` is somebody's window-manager binding,
 * not ours, and claiming a superset of what is drawn on the rail is how a
 * shortcut label stops being true.
 */
export function chordCommand(event: ModifierEvent): string | undefined {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return undefined;
  const key = event.key.toLowerCase();
  return SHORTCUTS.find((s) =>
    s.chords.some((c) => c.key === key && Boolean(c.shift) === event.shiftKey),
  )?.command;
}

/**
 * The command a bare letter in `event` runs, or `undefined`.
 *
 * Caller's responsibility, both of them deliberately not decided here: that the
 * preference is on, and that **the game has already declined this key**.
 */
export function bareCommand(event: ModifierEvent): string | undefined {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return undefined;
  }
  const key = event.key.toLowerCase();
  return SHORTCUTS.find((s) => s.bare === key)?.command;
}
