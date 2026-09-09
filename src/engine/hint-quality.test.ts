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
import { difficultyTiers } from "./difficulty.ts";
import { randomNew } from "./random/index.ts";
import {
  declaresNoMarks,
  firstLeaf,
  HINT_GAMES,
  leafPresets,
} from "./testing/hint-games.ts";

const SEEDS = ["hq-a", "hq-b", "hq-c"];

/** Hard ceiling on one step's narration. Longest shipped today: 281. */
const MAX_NARRATION_CHARS = 300;

/** The shared necessity vocabulary a deductive conclusion draws from.
 *
 * `nowhere` is in it because *"can go nowhere but this cell"* is the same claim
 * as *"can only go in this cell"*, written in ordinary English rather than a
 * game's private idiom — there is no game that would want it read as anything
 * weaker, which is the test for whether a word belongs to the shared vocabulary
 * or to {@link IDIOMS}. */
const NECESSITY =
  /\bmust\b|\bcan(?:no|')t\b|\bcannot\b|\bcan only\b|\bcan never\b|\bhas to\b|\bhave to\b|\bneeds?\b|\brul(?:e|es|ed|ing)\b.{0,40}\bout\b|\bno other\b|\bnowhere\b|\bonly\b|\bnever\b|\bforce[sd]?\b|\bimpossible\b|\bneither\b/i;

/** The candidate-elimination games' mechanical openers — procedure the
 * player is walked through, not a deduction, so no necessity modal. */
const MECHANICAL = /^Start by penciling|^Now clear the easy ones/;

/**
 * Games whose hints narrate **moves** rather than deductions, with the reason
 * each is exempt from the necessity-voice rule — the ledger, not the roster.
 *
 * **The population is derived and the exceptions are declared**, which is the
 * way round this repo settled on (`audit-declared-versus-derived-capabilities`;
 * `docs/games/testing.md` § "How a cross-game guard finds its population").
 * It was the other way round until then: an opt-in set of eighteen names, which
 * had silently missed **six** hinting games — Boats, Bricks, Group, Salad,
 * Sticks and Subsets — every one of them deductive, and five of them passing
 * this check across 72–153 steps the whole time nothing ran it. That is
 * `testing/hint-games.ts`'s own defect one level down, and it has the same fix:
 * a guard blind to a game cannot fire on it, so a game must have to be
 * *removed* rather than added.
 */
const NARRATES_MOVES: Record<string, string> = {
  fifteen: "sliding-tile: a step names the tile to slide, not a forced fact",
  sixteen: "sliding-tile: a step names the row or column to rotate",
  netslide: "sliding-tile: a step names the row or column to rotate",
  flood: "objective: a step names the color to flood with",
  inertia:
    "movement: the one thing it can prove is a gem's unreachability, and its " +
    "steps narrate the consequence a slide has (`add-inertia-hint`)",
  untangle: "non-deductive: it has genuinely nothing to say and ships no words",
};

/** The games the necessity-voice rule applies to — every hinting game the
 * ledger above does not exempt. */
const DEDUCTIVE = new Set(
  HINT_GAMES.map(([id]) => id).filter((id) => !(id in NARRATES_MOVES)),
);

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

/** As much of a step as an idiom is allowed to look at. */
interface NarratedStep {
  readonly explanation: string;
  readonly continuesPrevious?: boolean;
}

/**
 * Owner-endorsed per-game idioms that carry necessity in their own words rather
 * than a modal. Adding here is a deliberate, reviewable act — the list is the
 * legend of endorsed exceptions, not a loophole.
 *
 * A predicate over the **step** rather than a regex over its text, so an idiom
 * that belongs to one *leg* of a journey can say so and be held to it. Subsets
 * is why: exempting its continuation legs by their wording alone would have
 * exempted a lead leg that happened to open the same way.
 */
const IDIOMS: Record<string, (step: NarratedStep) => boolean> = {
  // Filling's grouped region step: "The shaded region of N fits exactly
  // into these squares." — the exactness *is* the forcing claim
  // (docs/games/hints.md § "Group one firing into one step"; owner-endorsed with the Filling hint).
  filling: (s) => /fits exactly into/.test(s.explanation),

  // Subsets' continuation legs, and only those: the firing's necessity is
  // stated once in the lead ("The highlighted set can go nowhere but this
  // cell"), and each leg then reports one consequence of it — "Still filling
  // this cell — the highlighted set has no A either, so clear A here." Making
  // every leg restate the modal is the flattening this file's header forbids.
  // Scoped to `continuesPrevious` because a lead leg gets no such inheritance
  // (owner-endorsed, `audit-declared-versus-derived-capabilities`).
  subsets: (s) =>
    s.continuesPrevious === true && /^Still filling this cell —/.test(s.explanation),
};

describe("the necessity rule reaches every hinting game it should", () => {
  it("drew from a populated registry, and exempts a minority of it", () => {
    // Vacuity: an empty `HINT_GAMES` would exempt nothing and check nothing,
    // and every narration assertion below would pass over no games at all.
    expect(HINT_GAMES.length).toBeGreaterThan(25);
    expect(DEDUCTIVE.size).toBeGreaterThan(20);
    expect(Object.keys(NARRATES_MOVES).length).toBeLessThan(HINT_GAMES.length / 3);
  });

  it("ledgers only games that ship a hint, each with its reason", () => {
    const hinting = new Set(HINT_GAMES.map(([id]) => id));
    for (const [id, why] of Object.entries(NARRATES_MOVES)) {
      expect(hinting.has(id), `${id} is exempted here but ships no hint()`).toBe(true);
      expect(why.length, `${id}'s exemption states no reason`).toBeGreaterThan(40);
    }
  });

  it("endorses an idiom only for a game the rule applies to", () => {
    for (const id of Object.keys(IDIOMS))
      expect(
        DEDUCTIVE.has(id),
        `${id} has an endorsed idiom but is not necessity-checked — the entry does nothing`,
      ).toBe(true);
  });
});

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
              NECESSITY.test(step.explanation) || (IDIOMS[name]?.(step) ?? false),
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
 * The same speculative-vocabulary check, **across everything a game varies**.
 *
 * It needs its own sweep because the block above samples
 * `firstLeaf(game.presets())` — each game's *easiest* preset — and a trial rung
 * is tier-gated, so it never fires there. Proved rather than assumed: planting
 * "further along" in Bricks' lookahead narration left the block above green,
 * because Bricks' first preset is Easy and Easy never reaches that arm. The
 * check was therefore guarding nothing on precisely the tiers it exists for.
 *
 * **Tier is only one axis, and this used to walk off the end of games that have
 * no tiers at all.** `if (!contract || !tiers) continue` skipped the whole case,
 * so twelve of the thirty hinting games — Sixteen, Netslide, Palisade, Inertia,
 * Pattern, Range and the rest — were outside it entirely, and the per-game
 * vacuity guard below could not say so because it only ran for the games that
 * got as far as running. A game with no tiers varies by *preset* instead, and is
 * walked that way. (`hint-resume.test.ts` had the same blind spot in a milder
 * form, sampling one preset rather than none; both were found by
 * `fix-sixteen-endgame-stranding`. If you add a sweep over games, the question
 * to ask is what axis each game varies, not what axis you keyed on.)
 */
describe("no hint leaves a chain for the player to carry, at any tier", () => {
  for (const [name, game] of HINT_GAMES) {
    const contract = game.difficulty;
    const tiers = difficultyTiers(game);
    it(`${name}: every tier`, () => {
      const base = firstLeaf(game.presets());
      // One params per tier where the game has tiers; one per preset where it
      // does not, which is the axis such a game actually varies.
      const cases: { label: string; params: unknown }[] =
        contract && tiers
          ? tiers.map((tierName, tier) => ({
              label: `tier ${tier} ("${tierName}")`,
              params: contract.withTier(base, tier),
            }))
          : leafPresets(game.presets()).map((e) => ({
              label: `preset "${e.title}"`,
              params: e.params,
            }));
      let checked = 0;
      for (const { label, params } of cases) {
        if (game.validateParams(params, true)) continue; // refused at this size
        for (const seed of SEEDS) {
          let desc: string;
          let aux: string | undefined;
          try {
            ({ desc, aux } = game.newDesc(
              params,
              randomNew(`${name}-${label}-${seed}`),
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
              `${name} ${label}/${seed}: "${step.explanation}" — asks the player to carry a chain it never lays out`,
            ).toBe(false);
          }
        }
      }
      // The "how many did I actually look at?" guard: without it, a game whose
      // every case failed to generate would pass while asserting nothing. It
      // now also covers the games that used to be skipped before reaching it.
      expect(checked, `${name}: nothing produced a hint to check`).toBeGreaterThan(0);
    });
  }
});
