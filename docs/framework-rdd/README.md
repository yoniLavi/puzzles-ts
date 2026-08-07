# The puzzle framework — vision

> **⚠️ STATUS: design fiction.** Nothing in `docs/framework-rdd/` exists.
> These documents describe a *target* architecture, written readme-first so the
> design can be debugged before any code moves (authored by the
> `rewrite-game-dev-docs` change, 2026-08-07). The current architecture is
> documented in [`docs/games/`](../games/README.md); where the two disagree,
> `docs/games/` is the truth. When part of this vision ships, the shipping
> change moves the now-true material into the real guides and updates or
> retires the fiction — no file here may claim unshipped behaviour in the
> present tense (see the repo-layout spec, "Design-fiction docs are labelled
> and quarantined").

This collection stopped being a port in 2026-08. What it is now is a body of 57
worked examples of the same five-part shape — mechanics, input, rendering,
solving, hinting — plus an engine that grew, helper by extracted helper, most
of the way toward a framework without ever being designed as one. This
directory designs it as one.

## What the framework is for

**Implementing and maintaining most types of puzzle game with as little
per-game machinery as the game's own logic permits — and no less.** The
"no less" is load-bearing: the framework never contorts a game to fit a
contract (that rule already cost one withdrawn architecture; see the
scene-graph postmortem, `openspec/postmortems/2026-05-21-scene-graph-withdrawal.md`).
Every derived layer has a bespoke escape hatch, and every escape hatch carries
an explicit obligation in its place.

Three commitments shape everything here:

1. **One deduction engine per game, everything else is a projection.** A logic
   game declares an ordered list of *techniques* — each knowing how to find one
   forced firing, apply it, and **narrate it to a player**. The solver, the
   difficulty grader, the generator's acceptance test, the explained hint and
   the mistake checker are five projections of that one list. There is no
   separate solver to keep in sync with the hint, because there is no separate
   solver. See [`deduction.md`](./deduction.md).

2. **Every game has a full explained hint, by construction.** Narration is
   required by the type system, not by review: a technique without `narrate`
   does not compile, and the generator only accepts boards its declared
   techniques solve — so a board that cannot be narrated to completion cannot
   be generated. Guess-free generation (the existing `ts-migration` policy) and
   hint totality are the same constraint seen from two sides. Non-deductive
   games declare a *planner* instead, with the recompute-stability contract the
   collection already learned the hard way. Nothing may ship hintless.

3. **AI-native, by design rather than by accident.** Nearly all work here is
   done by AI sessions, and the framework optimises for that reader — see the
   principles below.

## The document set

| Doc | Answers |
| --- | --- |
| [`game-definition.md`](./game-definition.md) | What a game *declares* — the manifest: params, board model, moves, gestures, presentation, techniques — and what the framework derives from each declaration. |
| [`deduction.md`](./deduction.md) | The technique contract and its five projections; planners for non-deductive games; escape hatches and their obligations; how the known no-gos of the shared fixpoint are accommodated instead of denied. |
| [`presentation.md`](./presentation.md) | The tile renderer the framework owns (cache, diff keys, overlays, animation — inverted from today's per-game loops), why this is *not* the withdrawn scene graph, and the bespoke-`redraw` escape hatch. |
| [`guarantees.md`](./guarantees.md) | The conformance suite: what is asserted for every game automatically, enrolment-free, the moment a capability is declared. |
| [`migration.md`](./migration.md) | The path from today's `Game` interface: which engine modules become framework organs, the adapter story, the order of adoption, and the invariants that must not regress. |

## Adding a game, in one paragraph (the target experience)

You run the scaffolder and fill in five declarations: a **board model** (grid
topology, cell domain, what an edge/vertex means — the desc codec, state
cloning, coordinate maps and cursor movement fall out); a **gesture table**
(click cycles a cell, drag paints, right-click marks — keyboard and touch
equivalents are derived, which is what the input-parity bar demands); a
**presets/params declaration** (the custom-params dialog, the type summary and
the difficulty contract fall out); a **technique list** (solve, grade,
generate, hint, refuse all fall out); and a **tile painter** (the cache, diff
keys, overlays and animation bookkeeping fall out). What is left in your hands
is exactly the two things that make your game *your game*: the deduction logic
and the words the player reads. The conformance suite enrols you in every
cross-game guard the moment the manifest exists; nothing about correctness
depends on remembering to sign up for it. A worked re-expression of Towers —
today ~2,600 lines across seven files — is the running example through these
docs, landing near ~1,100 with not one narration string changed.

## AI-native principles

These bind every design decision in this directory:

- **Convention over configuration, because agents navigate by grep.** Every
  game answers the same question in the same file under the same heading. A
  session that has seen one framework game has seen the file layout of all of
  them.
- **Contracts are enforced by machines, not remembered by sessions.**
  Declaring a capability auto-enrols its guards (the way
  `difficulty-contract.test.ts` and `touch-input.test.ts` already work, made
  universal). Hand-maintained enrolment lists (`testing/hint-games.ts`) are
  retired: a list a session must remember to edit is a defect class, not a
  convention.
- **Totality over vigilance.** Where today a rule lives in a guide ("every
  hint must explain why"), the framework makes the compliant shape the only
  one that type-checks. Review attention is spent on wording and judgement,
  never on remembering.
- **Lessons live as assertions.** The repo already converts war stories into
  guards (colour bounds, vacuous-assertion sweeps, the probe corpus). The
  framework continues this: a session should benefit from a lesson without
  having read its story, because the lesson bites as a red test, not as a
  paragraph.
- **Bounded context per question.** One concern per file, per game; heavy
  material referenced by path, not inlined; every doc section that states a
  contract names the guard test asserting it, and vice versa. A session should
  never need more than one game directory plus one framework doc in context to
  do a day's work.
- **Docs are the interface.** These files are written for the next session,
  not the next human hire — front-loaded rules, greppable named anchors,
  decision tables, and "Tell:" lines for every trap with a symptom.

## What this vision must not break

Constraints inherited from paid-for experience, honoured explicitly in the
detail docs:

- **The scene-graph postmortem.** No retained render tree, no reconciler, no
  framework-scale render pivot without a real game pressuring it. The tile
  renderer is the *existing* imperative pattern with its bookkeeping inverted,
  not a new rendering model ([`presentation.md`](./presentation.md)).
- **"An exemplar hint never loses a word to an abstraction."** Shared
  machinery owns loops and lifecycles; narration wording stays per-game,
  verbatim, always ([`deduction.md`](./deduction.md)).
- **The fixpoint's recorded no-gos.** The ladder shape is near-universal; the
  bookkeeping around it is per-game and often decides which puzzles exist.
  The framework accommodates bespoke loops rather than pretending they fit
  ([`deduction.md`](./deduction.md), "Escape hatches carry obligations").
- **Frozen differentials and byte-stable game IDs.** Existing games keep
  their hand-written codecs and their fixtures; derived codecs are for new
  games ([`migration.md`](./migration.md)).
