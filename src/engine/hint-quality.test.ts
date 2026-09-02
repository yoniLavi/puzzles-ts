/**
 * Cross-game guarantees on hint narration *form* (never content).
 *
 * `docs/games/hints.md § "Writing the narration" is a list of narration rules that were, until
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
 *  - **No step asks the player to carry a chain it never lays out**
 *    (`audit-guessing-tier-names`): a bounded chain is a legitimate
 *    *Tactic* and may be narrated — but with the chain **shown on the
 *    board**, ordered and anchored at both ends, rather than compressed
 *    into a claim; an unbounded search may not be narrated at all.
 *    Checked twice — once on each game's first preset with the rules
 *    above, and once **per tier** in its own block at the bottom,
 *    because such a rung is tier-gated and the first preset is the one
 *    place it can never fire.
 *
 * Form only: no assertion here ever touches *what* a hint says about the
 * board — flattening a good hint to satisfy a guard is the failure mode
 * this change's spec explicitly forbids.
 */
import { describe, expect, it } from "vitest";
import { randomNew } from "./random/index.ts";
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
  "clusters",
  "crossing",
  "dominosa",
  "filling",
  "galaxies",
  "keen",
  "lightup",
  "palisade",
  "pattern",
  "range",
  "singles",
  "slant",
  "solo",
  "spokes",
  "towers",
  "undead",
  "unequal",
  "unruly",
]);

/**
 * The vocabulary of a conclusion the player is asked to take on trust because
 * the reasoning behind it was *not laid out* — `audit-guessing-tier-names`'s
 * Check / Tactic / Search taxonomy, which splits on whether the reasoning is a
 * **bounded chain the player can be walked through**:
 *
 * - **Check** — place, look, one rule breaks. Narrate directly.
 * - **Tactic** — a bounded chain of forced consequences to a named endpoint.
 *   Legitimate at a middle tier, but the chain must be **shown on the board** —
 *   each link marked in the order it falls, both ends anchored — rather than
 *   compressed into a claim the player can only check by redoing the deduction.
 *   The stricter form (a display-only leg per link, so the player advances one
 *   inference at a time) was designed and set aside by an owner decision:
 *   holding a *hypothesis* in your head is fine, holding the *chain* is not
 *   (`walk-tactic-hint-chains` D1–D2). This list was emptied by seven games
 *   meeting the revised bar, not by seven walks.
 * - **Search** — run the whole solver from a hypothesis, or branch and
 *   backtrack. `Unreasonable` only, and never narrated at all.
 *
 * Promoted here from `galaxies-hint.test.ts`, where it guarded one game out of
 * thirty: a rule enforced in one place is not enforced.
 *
 * **It matches the compressed chain, not the hypothesis.** The first cut also
 * caught "if this cell were …" and instantly failed Clusters on *"If this cell
 * were blue, at most one neighbor could ever match it"* — a sound single-step
 * refutation, i.e. a Check, and exactly what the rule permits everywhere. A
 * hypothesis framing is not the defect; asking the reader to carry it forward
 * unaided is.
 *
 * **What this cannot see, stated rather than implied.** A Search that describes
 * itself as though it were a Check slips through — Undead's removed arm said
 * *"If this cell were a vampire, the sightline clues and monster counts could no
 * longer all be met"*, wordwise indistinguishable from a one-glance refutation.
 * So this is a backstop. The guarantee for the Search rungs is structural:
 * `UndeadReason` and Dominosa's tag no longer *contain* one, so narrating it is
 * a compile error rather than a string a test might miss.
 */
const SPECULATIVE =
  /\btr(?:y|ied|ies)\b|\bbreak the board\b|following (?:a|the) chain\b|following the forced\b|\bin turn\b|\bfurther along\b|\beventually\b/i;

/** Owner-endorsed per-game idioms that carry necessity in their own
 * words rather than a modal. Adding here is a deliberate, reviewable
 * act — the list is the legend of endorsed exceptions, not a loophole. */
const IDIOMS: Record<string, RegExp> = {
  // Filling's grouped region step: "The shaded region of N fits exactly
  // into these squares." — the exactness *is* the forcing claim
  // (docs/games/hints.md § "Group one firing into one step"; owner-endorsed with the Filling hint).
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

          expect(
            SPECULATIVE.test(step.explanation),
            `${at} — asks the player to carry a chain it never lays out`,
          ).toBe(false);
        });
      }
    });
  }
});

/**
 * The same speculative-vocabulary check, **at every tier**.
 *
 * It needs its own sweep because the block above samples
 * `firstLeaf(game.presets())` — each game's *easiest* preset — and a trial rung
 * is tier-gated, so it never fires there. Proved rather than assumed: planting
 * "further along" in Bricks' lookahead narration left the block above green,
 * because Bricks' first preset is Easy and Easy never reaches that arm. The
 * check was therefore guarding nothing on precisely the tiers it exists for.
 */
describe("no hint leaves a chain for the player to carry, at any tier", () => {
  for (const [name, game] of HINT_GAMES) {
    const contract = game.difficulty;
    if (!contract) continue;
    it(`${name}: every tier`, () => {
      const base = firstLeaf(game.presets());
      let checked = 0;
      for (let tier = 0; tier < contract.tiers.length; tier++) {
        const params = contract.withTier(base, tier);
        if (game.validateParams(params, true)) continue; // tier refused at this size
        for (const seed of SEEDS) {
          let desc: string;
          let aux: string | undefined;
          try {
            ({ desc, aux } = game.newDesc(
              params,
              randomNew(`${name}-${tier}-${seed}`),
            ));
          } catch {
            continue; // ungenerable at this size; difficulty-contract.test.ts owns that
          }
          const res = game.hint?.(game.newState(params, desc), aux);
          if (!res?.ok) continue;
          checked++;
          for (const step of res.steps) {
            expect(
              SPECULATIVE.test(step.explanation),
              `${name} tier ${tier} ("${contract.tiers[tier]}")/${seed}: "${step.explanation}" — asks the player to carry a chain it never lays out`,
            ).toBe(false);
          }
        }
      }
      // The "how many did I actually look at?" guard: without it, a game whose
      // every tier failed to generate would pass while asserting nothing.
      expect(checked, `${name}: no tier produced a hint to check`).toBeGreaterThan(0);
    });
  }
});
