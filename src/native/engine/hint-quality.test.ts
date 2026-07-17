/**
 * Cross-game guarantees on hint narration *form* (never content).
 *
 * `hint-authoring.md` §2 is a list of narration rules that were, until
 * this file, enforced per-game or by review alone — and narration
 * quality is the broadest hint-defect class in the history (8 games; see
 * `unify-hint-framework` §0.2). Three of its rules are pure form, so
 * they are guarded here for every hinting game at once:
 *
 *  - **Every step shows something** (§5.2): board marks, words, or both.
 *    A step with neither is invisible — a "hint" the player cannot see.
 *  - **Deductive conclusions use the necessity voice** (§2.1): a
 *    deduction is narrated as what *must* / *can't* be, never a bare
 *    state of being. Movement games narrate imperatively instead and are
 *    exempt, as are the candidate games' mechanical populate/cleanup
 *    openers (procedure, not deduction) and each game's declared idioms
 *    (owner-endorsed phrasings whose necessity is carried by the words
 *    themselves — e.g. Filling's "fits exactly into").
 *  - **Narration stays terse** (§2.5): a hard length ceiling. The
 *    longest shipped narration is Undead's 281-char sightline teach; the
 *    cap catches the "rulebook bled into the step" class (Netslide,
 *    `d1f37b8`) without constraining anything that shipped.
 *
 * Form only: no assertion here ever touches *what* a hint says about the
 * board — flattening a good hint to satisfy a guard is the failure mode
 * this change's spec explicitly forbids.
 */
import { describe, expect, it } from "vitest";
import { randomNew } from "../random/index.ts";
import { declaresNoMarks, firstLeaf, HINT_GAMES } from "./testing/hint-games.ts";

const SEEDS = ["hq-a", "hq-b", "hq-c"];

/** Hard ceiling on one step's narration. Longest shipped today: 281. */
const MAX_NARRATION_CHARS = 300;

/** The shared necessity vocabulary a deductive conclusion draws from. */
const NECESSITY =
  /\bmust\b|\bcan(?:no|')t\b|\bcannot\b|\bcan only\b|\bcan never\b|\bhas to\b|\bhave to\b|\bneeds?\b|\brul(?:e|es|ed|ing)\b.{0,40}\bout\b|\bno other\b|\bonly\b|\bnever\b|\bforce[sd]?\b|\bimpossible\b|\bneither\b/i;

/** The candidate-elimination games' mechanical openers — procedure the
 * player is walked through, not a deduction, so no necessity modal. */
const MECHANICAL = /^Start by pencilling|^Now clear the easy ones/;

/** Games whose hints narrate deductions (the necessity-voice rule).
 * Movement/objective games (fifteen, sixteen, netslide, flood, inertia,
 * untangle) narrate moves imperatively and are exempt from that check. */
const DEDUCTIVE = new Set([
  "dominosa",
  "filling",
  "keen",
  "lightup",
  "palisade",
  "pattern",
  "range",
  "singles",
  "slant",
  "solo",
  "towers",
  "undead",
  "unequal",
  "unruly",
]);

/** Owner-endorsed per-game idioms that carry necessity in their own
 * words rather than a modal. Adding here is a deliberate, reviewable
 * act — the list is the legend of endorsed exceptions, not a loophole. */
const IDIOMS: Record<string, RegExp> = {
  // Filling's grouped region step: "The shaded region of N fits exactly
  // into these squares." — the exactness *is* the forcing claim
  // (hint-authoring §5.5; owner-endorsed with the Filling hint).
  filling: /fits exactly into/,
};

describe("hint narration form, cross-game", () => {
  for (const [name, game] of HINT_GAMES) {
    it(`${name}: every step is visible, terse${DEDUCTIVE.has(name) ? ", and necessity-voiced" : ""}`, () => {
      for (const seed of SEEDS) {
        const params = firstLeaf(game.presets());
        const { desc, aux } = game.newDesc(params, randomNew(`${name}-${seed}`));
        const state = game.newState(params, desc);
        const res = game.hint?.(state, aux);
        if (!res?.ok) continue;
        res.steps.forEach((step, i) => {
          const at = `${name}/${seed} step ${i}: "${step.explanation}"`;

          // §5.2 — a step the player cannot see is not a hint.
          expect(
            step.explanation.length > 0 || !declaresNoMarks(step.highlights),
            `${at} — shows nothing: no words, no board marks`,
          ).toBe(true);

          // §2.5 — terse; the rulebook belongs in the help.
          expect(
            step.explanation.length,
            `${at} — narration over ${MAX_NARRATION_CHARS} chars`,
          ).toBeLessThanOrEqual(MAX_NARRATION_CHARS);

          // §2.1 — a deduction concludes in the necessity voice.
          if (DEDUCTIVE.has(name) && !MECHANICAL.test(step.explanation)) {
            expect(
              NECESSITY.test(step.explanation) ||
                (IDIOMS[name]?.test(step.explanation) ?? false),
              `${at} — no necessity modal (and no declared idiom)`,
            ).toBe(true);
          }
        });
      }
    });
  }
});
