/**
 * Shared builders for a game's on-screen keypad (`Game.requestKeys`).
 *
 * Upstream's `game_request_keys` returns `label = NULL` for keys whose text
 * derives from the button code (the digits and the `'\b'` clear key) and lets
 * the frontend's `button2label` resolve them. Here the label is resolved up
 * front: a digit/letter key carries its own character, and the clear key the
 * literal `"Clear"`, which the `puzzle-keys` icon map renders as the clear icon.
 */

import type { KeyLabel } from "./types.ts";

/** ASCII backspace — upstream's clear-key button code (`'\b'`). */
export const CLEAR_BUTTON = 8;

/** The clear key, labeled so `puzzle-keys` maps it to the clear icon. */
export const clearKey: KeyLabel = { button: CLEAR_BUTTON, label: "Clear" };

/**
 * The common digit keypad: buttons `'1'..'9'` then `'a','b',…` once the
 * count exceeds nine, followed by the clear key. Mirrors upstream's
 * `i < 9 ? '1' + i : 'a' + i - 9` used by Filling, Keen, Solo and Towers
 * (Unequal diverges for order ≥ 10 and builds its own).
 */
export function digitKeys(n: number): KeyLabel[] {
  const keys: KeyLabel[] = [];
  for (let i = 0; i < n; i++) {
    const button = i < 9 ? "1".charCodeAt(0) + i : "a".charCodeAt(0) + (i - 9);
    keys.push({ button, label: String.fromCharCode(button) });
  }
  keys.push(clearKey);
  return keys;
}
