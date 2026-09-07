/**
 * **A dialog you are only reading closes when you click away from it.**
 *
 * Web Awesome's `wa-dialog` and `wa-drawer` are opt-**in** for light dismiss:
 * without `light-dismiss` a click on the backdrop does not close them, it plays
 * a "deny close" pulse. That pulse is the worst possible answer, because it
 * proves the click was received and then declines to act on it — the player
 * concludes the app is broken rather than that the dialog is modal on purpose.
 *
 * The app had it on About, Preferences and Share and not on the help drawer, so
 * the one surface a player opens most often to *read* was the one that refused
 * to close. Nothing could see the inconsistency: each dialog is written in its
 * own file and the attribute's absence looks like every other attribute's
 * absence.
 *
 * So the rule is written down here instead of re-decided per dialog:
 *
 * - **Reading or browsing → light dismiss.** Nothing is lost by closing.
 * - **Entering something, or answering something → not.** A stray click must
 *   not discard a filename half-typed or a decision half-made.
 *
 * The scan keys on the **shape** — any `<wa-dialog` or `<wa-drawer` opening tag
 * anywhere under `src/` — so a new dialog is covered the day it is written, and
 * every one that opts out is listed below with its reason. The ledger is held
 * to being exactly right in both directions.
 *
 * A tag that *binds* the attribute (`?light-dismiss=${…}`) counts as decided,
 * not as opted out: `alert-dialog.ts` lets each caller choose, and the refusal
 * that Check & save raises passes `true`. What the rule is against is the
 * attribute being **absent**, which is indistinguishable from nobody having
 * thought about it.
 */
import { describe, expect, it } from "vitest";

const sources = import.meta.glob<string>("./**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

/**
 * Dialogs that deliberately do not light-dismiss, and why.
 *
 * Keyed by the file that renders them. Every entry is asserted to name a file
 * that really does render an opted-out dialog, so an excuse cannot outlive the
 * thing it excuses.
 */
const MODAL_ON_PURPOSE: Record<string, string> = {
  "./puzzle/components/config.ts":
    "a form — custom game parameters, half-filled; a stray click must not discard it",
  "./dialogs/saved-game-dialogs.ts":
    "saving takes a filename, and loading offers a delete; both are edits, not reading",
  "./dialogs/enter-gameid-dialog.ts":
    "a form — a pasted game ID is easy to lose and hard to retype",
  "./dialogs/crash-dialog.ts":
    "asks the player to decide about reporting; a click-away is not an answer",
};

/**
 * Blank `//` and `/* … *␝/` comments so a *mention* of a tag cannot vouch for
 * one — `help-viewer.ts` carries the comment "use `<div slot=label>` rather
 * than `<wa-drawer label=...>`", which this scan counted as a second, undecided
 * drawer on its first run.
 *
 * Template literals are deliberately left intact, because that is where the
 * real markup lives. The one thing that could go wrong is a `//` inside a
 * string on the same line as a dialog tag (a URL); no such line exists, and the
 * tag-count floor below would notice mass blanking.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

/** Every file rendering a `wa-dialog` or `wa-drawer`, and whether *every*
 * opening tag in it carries `light-dismiss`.
 *
 * Read over the tag's own attribute list rather than the whole file, so a
 * mention of the attribute in a neighboring comment cannot vouch for a tag that
 * lacks it. */
function dialogFiles(): { file: string; tags: number; dismissing: number }[] {
  const out: { file: string; tags: number; dismissing: number }[] = [];
  for (const [file, text] of Object.entries(sources)) {
    if (/\.test\.ts$/.test(file)) continue;
    // The opening tag, up to its closing `>`, with `>` inside a `${...}`
    // expression tolerated because Lit templates are full of them.
    const tags = [
      ...stripComments(text).matchAll(/<wa-(?:dialog|drawer)\b([\s\S]*?)>/g),
    ];
    if (tags.length === 0) continue;
    const dismissing = tags.filter((m) => /light-dismiss/.test(m[1])).length;
    out.push({ file, tags: tags.length, dismissing });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

describe("a dialog you are only reading closes when you click away", () => {
  const files = dialogFiles();

  it("finds the dialogs at all", () => {
    // Vacuity: an unmatched glob, or a tag spelling that changed, would make
    // every assertion below pass over nothing.
    expect(Object.keys(sources).length).toBeGreaterThan(200);
    expect(files.length).toBeGreaterThan(5);
    expect(files.reduce((n, f) => n + f.tags, 0)).toBeGreaterThan(7);
  });

  it("every dialog either light-dismisses or says why not", () => {
    const offenders = files
      .filter((f) => f.dismissing < f.tags && !Object.hasOwn(MODAL_ON_PURPOSE, f.file))
      .map((f) => `${f.file} (${f.tags - f.dismissing} of ${f.tags} tags)`);
    expect(
      offenders,
      "these dialogs refuse a click on their backdrop, which plays a " +
        "deny-close pulse and looks like a bug. Add `light-dismiss`, or add an " +
        "entry to MODAL_ON_PURPOSE saying what would be lost by closing",
    ).toEqual([]);
  });

  it("the ledger excuses only dialogs that exist and are opted out", () => {
    const known = new Set(files.map((f) => f.file));
    const missing = Object.keys(MODAL_ON_PURPOSE).filter((f) => !known.has(f));
    expect(missing, "MODAL_ON_PURPOSE names a file that renders no dialog").toEqual([]);

    const stale = files
      .filter((f) => Object.hasOwn(MODAL_ON_PURPOSE, f.file) && f.dismissing === f.tags)
      .map((f) => f.file);
    expect(
      stale,
      "MODAL_ON_PURPOSE excuses a dialog that now light-dismisses; remove the entry",
    ).toEqual([]);
  });
});
