/**
 * Cross-game guarantees on hint narration *form* (never content).
 *
 * `docs/games/hints.md` § "Writing the narration" is a list of narration rules
 * that were, until this file, enforced per-game or by review alone — and
 * narration quality is the broadest hint-defect class in the history (8 games;
 * see `unify-hint-framework` §0.2). Three of its rules are pure form, so
 * they are guarded here for every hinting game at once:
 *
 *  - **Every step shows something** (§ "Show the evidence as an area"): board
 *    marks, words, or both.
 *    A step with neither is invisible — a "hint" the player cannot see.
 *  - **Deductive conclusions use the necessity voice**
 *    (§ "Necessity for deductions, imperative for moves"): a
 *    deduction is narrated as what *must* / *can't* be, never a bare
 *    state of being. Movement games narrate imperatively instead and are
 *    exempt, as are the candidate games' mechanical populate/cleanup
 *    openers (procedure, not deduction) and each game's declared idioms
 *    (owner-endorsed phrasings whose necessity is carried by the words
 *    themselves — e.g. Filling's "fits exactly into").
 *  - **Narration stays readable at a glance** (§ "Keep the narration terse"):
 *    a limit every step is
 *    held to, with a ledger for the few sentences that genuinely need more
 *    room, and a hard ceiling even they cannot pass. Checked across every
 *    tier and every preset, and into the middle of the game, in its own
 *    block, because the first preset's opening plan is where the long
 *    sentences never are.
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
  codeLinesMatching,
  engineCodeLinesMatching,
  SCANNED_ENGINE_FILES,
  SCANNED_SOURCE_FILES,
} from "./testing/enrollment.ts";
import {
  type AnyGame,
  declaresNoMarks,
  firstLeaf,
  HINT_GAMES,
  leafPresets,
  SEARCH_PLANNING_GAMES,
} from "./testing/hint-games.ts";
import { SLOW_TESTS_ENABLED } from "./testing/slow.ts";

const SEEDS = ["hq-a", "hq-b", "hq-c"];

/**
 * How long a step may be — short enough to read at a glance (owner,
 * 2026-09-10: *"a character limit as a linter, and a way to override it for a
 * few particularly complex hints"*).
 *
 * Measured before it was set, over 15,132 steps in 30 games: median 84, p75
 * 110, p90 147. 120 is the line Netslide and Spokes had each already drawn for
 * themselves, and it flags the 139-character Tracks sentence the owner
 * shortened by hand when asking for this — a limit that would not have caught
 * the sentence that prompted it would not be the one asked for.
 */
const NARRATION_LIMIT = 120;

/** The hard ceiling: what a ledgered sentence is held to instead. */
const MAX_NARRATION_CHARS = 300;

/**
 * The override: sentences allowed past {@link NARRATION_LIMIT}, one entry per
 * sentence *template*, each saying why it needs the room.
 *
 * **Asserted in both directions**, the `NARRATES_MOVES` shape: a step over the
 * limit that no entry matches fails, and an entry that matches nothing over the
 * limit fails too — so shortening a sentence means deleting its entry rather
 * than leaving an exemption behind that silently stops guarding anything.
 *
 * `games` names every game the template reaches, because some are written once
 * in the engine and spoken by several games.
 */
const LONG_NARRATIONS: { games: string[]; match: RegExp; why: string }[] = [
  {
    games: ["group", "keen", "salad", "solo", "towers", "unequal"],
    match: /has just two \w+s left, so each forces the next/,
    why:
      "The Latin chain Tactic (`latin-hint.ts`). ts-engine requires a narrated " +
      "chain to name both ends, cite its links by position and say when the " +
      "conclusion rests on a case split, and that is three clauses.",
  },
  {
    games: ["singles"],
    match: /^There's a pair of \d+s in one (?:column|row)/,
    why:
      'The owner-endorsed indication-first offset narration (hints.md § "Lead ' +
      'with the indication"): its opener alone, the pattern the player learns ' +
      "to spot, is 65 characters.",
  },
  {
    games: ["lightup"],
    match: /would leave each of them lit or beside a full clue/,
    why:
      "Two premises and a quantifier: one of a set must light the ringed square " +
      "or fill the clue, and a bulb here disqualifies every member. The reach " +
      "relation is also the deixis tie: the driving clue is never adjacent to or " +
      "in line with the target (lightup/index.ts, measured).",
  },
  {
    games: ["palisade"],
    match: /so they share a fate: both walls or both open/,
    why:
      "The collection's hint exemplar, quoted verbatim in AGENTS.md § \"Hint " +
      'quality bar" and owner-endorsed: the "share a fate" premise and its ' +
      "gloss are what made the conclusion follow.",
  },
  {
    games: ["palisade"],
    match: /^Two 3s each keep just one side open/,
    why:
      "A proof by contradiction over two clues at once: opening their shared " +
      "edge would spend each 3's only open side and seal a region of the wrong " +
      "size, and each of those clauses carries weight.",
  },
  {
    games: ["boats"],
    match: /so one of these must be a boat segment; either way/,
    why:
      "A two-case argument: the line's water budget forces a boat segment into " +
      "one of the marked squares, and the conclusion holds whichever it is, " +
      "which the sentence has to say to be true.",
  },
  {
    games: ["subsets"],
    match: / For instance, /,
    why:
      "The owner's 2026-07-21 enhancement (subsets/index.ts, narrateExclusion): " +
      "a collapse names one competitor set and the visible rule that blocks it, " +
      "a second sentence on purpose.",
  },
  {
    games: ["salad"],
    match: /^This (?:row|column)'s [\w-]+ clue sees \S+ first/,
    why:
      "Salad's border-clue deductions carry two premises each: the symbol the " +
      "clue sees first, and either the line's empty-square budget or the marked " +
      "gap before this square. The strike list follows, so the long cases are " +
      "the ones where the budget or the gap has to be counted out.",
  },
  {
    games: ["clusters"],
    match: /^Suppose this cell were (?:red|blue):/,
    why:
      "A Tactic chain. ts-engine requires the narration to name both ends and " +
      'cite the links by their numbers on the board, and "from it" is the ' +
      "deixis tie clusters-hint.test.ts checks.",
  },
  {
    games: ["towers"],
    match: /already sees all but one of its towers/,
    why:
      "The line-full rule strikes the shortest heights from the cell nearest the " +
      "clue without placing anything, and the guide records a first cut that " +
      "implied a placement: the wording that stops that misreading needs both " +
      'sentences (hints.md § "Conclude with the action the move makes").',
  },
  {
    games: ["singles"],
    match:
      /^(?:A touching pair of \d+s sits at the corner|This (?:corner|inner) \d+ matches)/,
    why:
      'The owner-directed corner family (hints.md § "Name a square by its ' +
      'value": concrete values read far clearer): each arm is a proof by ' +
      "contradiction whose links are values the player can check, and the " +
      "box-in step is the one a shorter sentence would drop.",
  },
];

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
    s.continuesPrevious === true && /^Still filling this cell:/.test(s.explanation),
};

/**
 * The em-dash, retired from narration (owner, 2026-09-09).
 *
 * It was the collection's default connective before this rule — **141 of them
 * across 26 files**, almost all standing in for the comma or the sentence break
 * before a concluding `so …` clause. Nothing about the teaching depended on the
 * character, so the rewrite cost no reasoning; what it must never buy is a
 * *shorter* hint, since deleting the clause is the flattening this file's header
 * forbids.
 *
 * **Not the en-dash.** Dominosa writes its dominoes `3–5`, where the dash is
 * notation rather than punctuation, and a guard that swept both would convict a
 * label for the sin of a connective.
 */
const EM_DASH = /—/;

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

          // A step the player cannot see is not a hint.
          expect(
            step.explanation.length > 0 || !declaresNoMarks(step.highlights),
            `${at} — shows nothing: no words, no board marks`,
          ).toBe(true);

          // Length is checked in "hint narration stays readable at a glance"
          // below, across every tier and into the middle game.

          // A deduction concludes in the necessity voice.
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

          // The runtime half of the em-dash rule. Strictly weaker than the
          // source scan below for anything written as a literal, and strictly
          // stronger for a narration *assembled* from pieces at run time —
          // two nets with different holes, and this one costs nothing.
          expect(
            EM_DASH.test(step.explanation),
            `${at} — narration uses an em-dash; rewrite with a comma, a semicolon or a sentence break`,
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
/**
 * The cases an **untiered** game contributes: its presets, which is the axis
 * such a game actually varies (a sweep keyed on tier alone collapses them all
 * to one and walks a single board — the blindness `hint-resume.test.ts` paid
 * for first).
 *
 * **A game that plans by searching walks its three smallest presets in the
 * gate.** The property under test here is the *wording* of an explanation, and
 * a planner's narration vocabulary does not change with board size — but a
 * search's cost does, steeply. Three is not arbitrary: it is what reaches every
 * mode Netslide varies (its nine presets are three barrier/wrapping modes at
 * each of three sizes, ordered smallest-first), and it keeps Sixteen's 3×3, 4×3
 * and 4×4 while dropping the two boards that carry the search cost. The slow
 * tier walks all of them.
 *
 * Measured 2026-09-09 (`retire-tests-that-do-not-earn-their-runtime`): the two
 * members of `SEARCH_PLANNING_GAMES` were 62% of this file's test time.
 */
function untieredCases(
  id: string,
  game: AnyGame,
): { label: string; params: unknown }[] {
  const all = leafPresets(game.presets()).map((e) => ({
    label: `preset "${e.title}"`,
    params: e.params as unknown,
  }));
  if (SLOW_TESTS_ENABLED) return all;
  return SEARCH_PLANNING_GAMES.includes(id) ? all.slice(0, 3) : all;
}

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
          : untieredCases(name, game);
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

/**
 * How many plans each board is walked through. The opening plan alone is
 * where long sentences are rarest: a firing that needs more room to explain
 * usually needs more of the board decided first.
 *
 * **As deep as the census that set the limit, not shallower.** The first cut
 * walked eight plans to save time, and the ledger's own two-way check caught
 * it: Light Up's two discount arms fired nowhere in eight plans, so their
 * entry matched nothing and read as dead while the sentences were still being
 * spoken deeper in the game. A shallow walk turns a live ledger entry into a
 * false "delete me", which is the rot the check exists to stop.
 *
 * **And as wide as the modes a player can pick.** The first walk took every
 * tier of each game's *easiest preset* only, and a review of the text files
 * (2026-09-10) found thirty-odd sentences over the limit that it never heard:
 * Unequal's Adjacent mode, Solo's Killer and X, Salad's Number Ball are each
 * reached by a preset and by no tier of the first one. So every leaf preset is
 * walked too, on one seed, beside the tiers' three; the search-planning games
 * keep their sliced preset list, which is what their cost is sliced for.
 *
 * Cost, 2026-09-10: 43 s of test time for this block, measured at load
 * average 19–41 with 34% memory free — an upper bound, not a cost. The same
 * walk as a standalone census measured 16 s. Spokes, Palisade, Crossing and
 * Sticks hold most of it; slicing those four is the lever if it ever matters.
 * Walking every preset on every seed measured 103 s as a census against 49 s
 * for the tiers alone (load 12, swap 22 GB used: upper bounds both); one seed
 * per extra preset is the middle of that.
 */
const LINT_ROUNDS = 30;

/** The boards the length walk plays: every tier of the first preset on every
 * seed, then every other preset once. Deduplicated by params, since a tier of
 * the first preset is often a preset too. */
function lintCases(
  id: string,
  game: AnyGame,
): { label: string; params: unknown; seeds: readonly string[] }[] {
  const out: { label: string; params: unknown; seeds: readonly string[] }[] = [];
  const seen = new Set<string>();
  const add = (label: string, params: unknown, seeds: readonly string[]): void => {
    const key = JSON.stringify(params);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label, params, seeds });
  };
  const contract = game.difficulty;
  const tiers = difficultyTiers(game);
  if (contract && tiers) {
    const base = firstLeaf(game.presets());
    for (const [tier, tierName] of tiers.entries()) {
      add(`tier ${tier} ("${tierName}")`, contract.withTier(base, tier), SEEDS);
    }
  }
  // A tiered game already plays three seeds of each tier, so its other presets
  // play once; an untiered game's presets are all it has, so they keep all three.
  const extra = contract && tiers ? SEEDS.slice(0, 1) : SEEDS;
  for (const c of untieredCases(id, game)) add(c.label, c.params, extra);
  return out;
}

/** Ledger entries that matched a step over the limit, by index. Filled by the
 * per-game cases, read by the last one. */
const ledgerUsed = new Set<number>();
let linted = 0;

describe("hint narration stays readable at a glance", () => {
  for (const [name, game] of HINT_GAMES) {
    it(`${name}: every step within ${NARRATION_LIMIT} characters, or ledgered`, () => {
      for (const { label, params, seeds } of lintCases(name, game)) {
        if (game.validateParams(params, true)) continue;
        for (const seed of seeds) {
          let desc: string;
          let aux: string | undefined;
          try {
            ({ desc, aux } = game.newDesc(
              params,
              randomNew(`${name}-${label}-${seed}`),
            ));
          } catch {
            continue;
          }
          let state = game.newState(params, desc);
          for (let round = 0; round < LINT_ROUNDS; round++) {
            if (game.status(state) === "solved") break;
            const res = game.hint?.(state, aux);
            if (!res?.ok) break;
            for (const step of res.steps) {
              const text = step.explanation;
              linted++;
              expect(
                text.length,
                `${name} ${label}/${seed}: "${text}" is over the hard ceiling of ${MAX_NARRATION_CHARS}`,
              ).toBeLessThanOrEqual(MAX_NARRATION_CHARS);
              if (text.length <= NARRATION_LIMIT) continue;
              const entry = LONG_NARRATIONS.findIndex(
                (e) => e.games.includes(name) && e.match.test(text),
              );
              expect(
                entry,
                `${name} ${label}/${seed}: "${text}" is ${text.length} characters, over ${NARRATION_LIMIT}. Shorten it, or add it to LONG_NARRATIONS with the reason it needs the room.`,
              ).toBeGreaterThanOrEqual(0);
              ledgerUsed.add(entry);
            }
            // Walk on through the whole plan, not just its first step: the
            // aim is the sentences deeper in the game, cheaply.
            for (const step of res.steps) state = game.executeMove(state, step.move);
          }
        }
      }
    });
  }

  it("ledgers only sentences that still need the room", () => {
    // Registered last, so it runs after every per-game case has filled
    // `ledgerUsed`. Vacuity first: an unpopulated walk would find every entry
    // "unused" for the wrong reason.
    expect(linted, "the length walk looked at almost nothing").toBeGreaterThan(2000);
    const hinting = new Set(HINT_GAMES.map(([id]) => id));
    LONG_NARRATIONS.forEach((e, i) => {
      for (const g of e.games)
        expect(hinting.has(g), `${g} ships no hint()`).toBe(true);
      expect(e.why.length, `${e.match} states no reason`).toBeGreaterThan(60);
      expect(
        ledgerUsed.has(i),
        `${e.match} matched nothing over ${NARRATION_LIMIT}: the sentence got shorter, so delete the entry`,
      ).toBe(true);
    });
  });
});

/**
 * The em-dash rule, checked at the **source** rather than only at run time.
 *
 * The runtime sweeps above walk each game's first preset and one board per tier,
 * so they only ever see the arms that *fire* on those boards — and a narration
 * arm can be genuinely hard to reach. Palisade's `cluesVersusRegionSize`
 * counting arm is the worked example: it needs a region size below 6, which one
 * of the four shipped presets has, and across twelve seeds of every preset it
 * never fired once. A rule enforced only where a hint happens to land is a rule
 * enforced on the easy tiers.
 *
 * So the population is the hinting games (derived, as everything in this file
 * is), and the net is each one's comment-stripped code. That is a **superset**
 * of narration — a preset title or an error string would be caught too — and
 * that is deliberate: the collection has repeatedly been bitten by a scan
 * narrowed to where the authors expected to find the thing. There is nothing
 * else in these directories writing an em-dash today, and if something appears,
 * classifying it is cheaper than having missed it.
 */
describe("no hinting game writes an em-dash", () => {
  it("scanned a populated source tree", () => {
    // Vacuity: an unmatched `import.meta.glob` yields `{}`, and the assertions
    // below then pass over nothing at all while reporting health.
    expect(SCANNED_SOURCE_FILES).toBeGreaterThan(100);
    expect(SCANNED_ENGINE_FILES).toBeGreaterThan(50);
    expect(HINT_GAMES.length).toBeGreaterThan(25);
  });

  it("uses a comma, a semicolon or a sentence break instead", () => {
    const hits = codeLinesMatching(
      HINT_GAMES.map(([id]) => id),
      EM_DASH,
    );
    expect(
      hits.map((h) => `${h.id}: ${h.line}`),
      "em-dash in a hinting game's code; rewrite the sentence rather than dropping the clause",
    ).toEqual([]);
  });

  // The engine writes narration on behalf of whole families of games, so a
  // sweep that stopped at `games/**` would report a clean collection while the
  // sentence those games actually show carried the character.
  it("holds the engine's shared narration to the same rule", () => {
    const hits = engineCodeLinesMatching(EM_DASH);
    expect(
      hits.map((h) => `${h.id}: ${h.line}`),
      "em-dash in shipped engine code; rewrite the sentence rather than dropping the clause",
    ).toEqual([]);
  });
});
