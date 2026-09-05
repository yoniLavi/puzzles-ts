# The puzzle framework — vision

> **⚠️ STATUS: design fiction, except where a passage says otherwise.**
> These documents describe a *target* architecture, written readme-first so the
> design can be debugged before any code moves (authored by the
> `rewrite-game-dev-docs` change, 2026-08-07). The current architecture is
> documented in [`docs/games/`](../games/README.md); where the two disagree,
> `docs/games/` is the truth. When part of this vision ships, the shipping
> change moves the now-true material into the real guides and marks it here —
> no file may claim unshipped behavior in the present tense, and none may leave
> shipped behavior reading as future (see the repo-layout spec, "Design-fiction
> docs are labeled and quarantined"). **Parts have now shipped**; see
> [Where this stands](#where-this-stands).

This collection stopped being a port in 2026-08. What it is now is a body of 57
worked examples of the same five-part shape — mechanics, input, rendering,
solving, hinting — plus an engine that grew, helper by extracted helper, most
of the way toward a framework without ever being designed as one. This
directory designs it as one.

## Where this stands

**This directory is the *argument*, not the backlog.** It says why the framework
should look like this; it deliberately does not track how far along it is. Two
questions, two answers, and neither is a status column maintained by hand — the
`openspec/project.md` that once sat beside `AGENTS.md` drifted into describing
deleted directories, and a progress table here would drift the same way.

| Question | Where the answer lives |
| --- | --- |
| **What has shipped?** | `openspec/changes/archive/`. A change that realizes part of this vision carries a `Realizes:` line naming the doc and heading, so `grep -rl '^Realizes:' openspec/changes/archive/` is the precise list — and the shipped behavior itself is stated in `docs/games/` and the specs, never here. |
| **What remains?** | `openspec list`. Every piece the owner has committed to has a change; each states its **readiness** at the top of its proposal, and one that is not ready carries an `/opsx:explore` as task 0 rather than a design. |
| **Which passages are already true?** | Marked in place, inline, at the claim. Every marker cites the change that shipped it, which resolves to `openspec/changes/<id>` or `openspec/changes/archive/<date>-<id>`. |

**Inline markers rather than an index, deliberately.** A status table can be
accurate while the body beside it still reads as fiction; a marker cannot be
missed by someone reading the claim it corrects. The cost is that no single page
answers "how far along are we?" — and the answer to *that* is the two lookups
above, which cannot go stale because nothing maintains them.

*A guard on those citations was considered and declined (2026-09-04).* Measured
first: of the 49 change-id-shaped tokens cited across `docs/` and `AGENTS.md`,
**45 resolve to a real change and the other four are not change ids at all** —
`prefers-color-scheme`, `pre-ts-pivot`, `color-dark-check`, `auto-mark-complete`.
So there is no dead citation to catch today, and any guard keyed on "kebab-case
token in backticks" would need an allowlist for CSS features, git tags and
script names that grows with the docs. Worth revisiting if a dead citation ever
does appear; not worth speculative machinery before one has.

**A change may exist before it is ready, but it must say so.** The pieces that
have shipped were small, independently valuable, and provable against frozen
fixtures. Most of what remains is none of those things yet — so a not-yet-ready
change holds the *ordering and the constraints* that this conversation settled,
and defers the design to an exploration. It is not a plan pretending to be a
design. Read the readiness line before reading anything else in a proposal.

## The order, and why it is this one

**The deduction end has had three rounds of real pressure; the game-definition
end has had none** (owner, 2026-09-04). Marginal information is highest where
nothing has been tested, and the definition end is what gates the framework's
economic argument — "adding a game" only gets cheap if the declarations work.
The corpus that pressures it is **the 57 games already here**, which is the
README's own argument for refactoring before building.

| # | Change | Readiness |
| --- | --- | --- |
| 1 | `derive-difficulty-from-the-technique-ladder` | **SHIPPED** 2026-09-04 — but *not* as this table predicted; see below |
| 2 | `declare-params-and-presets` | **SHIPPED** 2026-09-05 — again not as predicted; see below |
| 3 | ~~`declare-the-gesture-table`~~ | **WITHDRAWN** 2026-09-05 — the exploration ran and the falsifier fired; see below |
| 4 | `declare-the-board-model` | exemplar-gated; pick an edge or vertex game, chosen to break it |
| 5 | `adopt-the-game-definition-adapter` | blocked on 2–4; co-developed with one re-expression, never built first |
| 6 | `re-express-the-collection` | last, and splits into family batches before any code moves |

> **What row 1 actually taught, since it is the first evidence this ordering has
> produced.** Its readiness line was *"the ladder now declares `tier`, and
> nothing reads it"* — and that lever turned out not to fit the lock. The tier
> list could not be projected from the ladder for three independent reasons (now
> a `ts-engine` requirement, so the survey is not repeated). What *could* be
> derived, and was, is the tier list from the game's own params form — reaching
> 29 games rather than the 12 the ladder route would have, and **removing** a
> field from the `Game` contract rather than adding a derivation to it.
> `adopt-conventional-tier-names` then followed it, on the owner's directive,
> replacing twelve hand-chosen vocabularies with one scale.
>
> Two things to carry into rows 2–6. **The declaration a concern should be
> derived from is not always the one the vision named** — check which
> declaration actually holds the information, at the time the consumer needs it.
> And **the win to look for is per-game surface removed**, not framework surface
> added; row 1 deleted 29 hand-written lists and shipped one function.

> **What row 2 taught, and it is the same lesson twice.** Its readiness line
> promised a shared `WxH` parser; the parser already existed and 47 of 57 games
> already called it. The declaration that actually held the field list was
> **`paramConfig`** — every field's key, type and accessors, already written —
> so the codec was derived from the params *form* rather than from anything
> new, and the encoder and decoder stopped being two hand-synced copies.
>
> Two further things to carry forward. **A declaration's escapers should be
> measured, not assumed**: this document conceded a bespoke hatch for
> Blackbox, and Blackbox turned out to be inside the grammar once the grammar
> was drawn at *tagged segments* rather than at *dimensions plus a suffix* —
> while five other shapes genuinely escape and keep hand-written codecs.
> And **build the guard before the migration, not after**: params encodings
> live in shared game IDs and nothing asserted them, so a byte-stability guard
> over all 57 games was shipped first and every conversion after it was proved
> safe by the snapshot not moving.
>
> It also raised a question about rows 5 and 6 that this document should not
> answer for them: rows 1 and 2 both shipped as **helpers a game calls**, with
> no adapter and no definition object. See
> `openspec/changes/adopt-the-game-definition-adapter/proposal.md`, which
> carries the criterion for settling it.

> **What row 3 taught, by being wrong.** It is the first row to be *withdrawn*
> rather than to ship differently, and the exploration that killed it is the
> most valuable thing this ordering has produced —
> `openspec/postmortems/2026-09-05-gesture-table-withdrawal.md`.
>
> Three lessons, and each is the previous rows' lesson at a higher price.
> **Check whether the benefit already shipped**: the parity bar this row
> existed to make a resting state *was already one*, derived from behavior by
> `audit-input-mode-parity` — the change row 3 cited as its evidence. Its two
> exemption lists are empty and asserted empty. **A declaration is a step
> backward from a derivation**: this project deleted eighteen hand-written
> `needsRightButton` booleans a week earlier precisely because deriving the
> property from each game's behavior was stronger, and a gesture table would
> have re-declared it. And **the axis a shared form is keyed on decides whether
> it cuts with the grain or across it**: the collection's input duplication is
> real and large, but it clusters by *puzzle family*, not by gesture — so a
> gesture-keyed table serves 14 games and is escaped by 43, while the
> mechanic-keyed module `border-grid.ts` already serves its two completely.
> `unify-the-note-taking-cell` is that finding, filed.
>
> **The falsifier working is the system working.** Row 3 named Sixteen up front
> and Sixteen killed it, before a line of framework was written. That is what
> the readiness lines and the named falsifiers are *for*, and it is why a
> not-yet-ready row carries an exploration rather than a design.

Presentation is **held**: the scene-graph postmortem's bar is real downstream
pressure, and none exists yet. Hints for the deliberately held-back games
(`characterize-the-hint-assessment-corpus`) sit *after* the declarations, because
they validate a framework and there needs to be more of one to validate.

## What the framework is for

**The owner's stated ambition (2026-08-07) is dozens to hundreds of new
games: a free, ad-free, offline reimplementation of every ad-ridden
micropayment puzzle game on the app stores.** Path and Numgame are the first
two greenfield games, not the last. That number is the framework's whole
economic argument: at N=2 its fixed cost dominates and incremental helper
extraction wins; at N=dozens the per-game marginal cost dominates, and every
declaration that turns a hand-built concern into a derived one compounds.
The fork's deliberate divergences — explained hints, mistake checking,
honest difficulty, endless procedural generation, offline PWA — are exactly
the differentiators against the games being reimplemented, and the framework
is what makes them per-game freebies instead of per-game projects.

## The order of work: refactor first, then build

**This is a deep refactoring of the existing 57 games, done *before* the new
ones start** — not a greenfield framework the old games migrate to at their
leisure, and not something the first new game bootstraps. The sequence is
deliberate and it is the whole plan (owner, 2026-08-26):

1. **Refactor the collection into the framework.** The 57 games are the only
   body of evidence for what a puzzle game actually needs; a framework designed
   without running them through it is a guess.
2. **The refactored games become the examples.** A new game is written by
   reading the nearest existing one, so the examples are the real interface —
   every accidental difference between two games that mean the same thing is a
   fork in the road for whoever reads them next, and a wrong turn that gets
   copied.
3. **Then build many, many new games** against a framework and a corpus that
   already agree with each other.

**What this implies, and it overrides a habit the guides had grown:**
*"it is a clean idiom, and unifying it would be churn"* **is not a reason to
leave the same concern implemented five ways.** That reasoning was correct
while the collection was a port being verified against an oracle, and it is
wrong now: the churn is the point of step 1, and an idiom repeated with six
different field names is not clean, it is six things to learn.

The bar for leaving something per-game is therefore **not** "would unifying it
be disruptive" but:

> **Do we positively believe this *should* be free to differ between games?**

Narration wording, deduction logic, a game's own clue semantics and any
genuinely player-visible choice — yes, and the framework must never take those.
A field name, a bookkeeping convention, the shape of a loop every game writes
identically — no. If the only argument for keeping it per-game is that changing
it would touch a lot of files, **it should be abstracted**, and the number of
files is a measure of how much the abstraction is worth.

So, concretely: **implementing and maintaining most types of puzzle game with
as little per-game machinery as the game's own logic permits — and no less.** The
"no less" is load-bearing: the framework never contorts a game to fit a
contract (that rule already cost one withdrawn architecture; see the
scene-graph postmortem, `openspec/postmortems/2026-05-21-scene-graph-withdrawal.md`).

### The dictum this all serves has a name now

**Convention over configuration: for most of what implementing a new game
involves, one obvious way to do it, and no unnecessary decisions.** The owner
named it on 2026-09-04, and **the governing statement is
[`AGENTS.md`](../../AGENTS.md) § "Convention over configuration" — read it there,
not here**, because this directory is fiction and a live rule must not have its
home in one.

It renames nothing above; it says what the argument above is *for*. Every
declaration in these documents is worth building exactly to the extent that it
converts a decision a porter must currently make — and that is not about the
puzzle — into one already made for them. The question to ask of any proposed
declaration is therefore not "could this be derived?" but **"which decision does
this take off the porter's desk, and would two games ever legitimately answer it
differently?"** If the answer to the second half is no, that decision is
accidental complexity being paid for N times.

And every convention ships with a **first-class override**, because the "no
less" above is the same rule seen from the other side: a game that genuinely
needs the explicit form writes it and says why.
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
   done by AI sessions, and the framework optimizes for that reader — see the
   principles below.

## The document set

| Doc | Answers |
| --- | --- |
| [`game-definition.md`](./game-definition.md) | What a game *declares* — the manifest: params, board model, moves, gestures, presentation, techniques — and what the framework derives from each declaration. |
| [`deduction.md`](./deduction.md) | The technique contract and its five projections; planners for non-deductive games; escape hatches and their obligations; how the known no-gos of the shared fixpoint are accommodated instead of denied. |
| [`presentation.md`](./presentation.md) | The tile renderer the framework owns (cache, diff keys, overlays, animation — inverted from today's per-game loops), why this is *not* the withdrawn scene graph, and the bespoke-`redraw` escape hatch. |
| [`guarantees.md`](./guarantees.md) | The conformance suite: what is asserted for every game automatically, enrollment-free, the moment a capability is declared. |
| [`migration.md`](./migration.md) | The path from today's `Game` interface: which engine modules become framework organs, the adapter story, the order of adoption, and the invariants that must not regress. |

## Adding a game, in one paragraph (the target experience)

You run the scaffolder and fill in five declarations: a **board model** (grid
topology, cell domain, what an edge/vertex means — the desc codec, state
cloning, coordinate maps and cursor movement fall out); ~~a **gesture table**
(click cycles a cell, drag paints, right-click marks — keyboard and touch
equivalents are derived, which is what the input-parity bar demands)~~ — **that
one is withdrawn**, and input stays a hand-written `interpretMove` over shared
*mechanic* modules (`border-grid.ts`, and the note-taking cell after
`unify-the-note-taking-cell`), because the keyboard equivalent of a drag is a
design and not a derivation; a
**presets/params declaration** (the custom-params dialog, the type summary and
the difficulty contract fall out); a **technique list** (solve, grade,
generate, hint, refuse all fall out); and a **tile painter** (the cache, diff
keys, overlays and animation bookkeeping fall out). What is left in your hands
is exactly the two things that make your game *your game*: the deduction logic
and the words the player reads. The conformance suite enrolls you in every
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
  Declaring a capability auto-enrolls its guards (the way
  `difficulty-contract.test.ts` and `touch-input.test.ts` already work, made
  universal). Hand-maintained enrollment lists (`testing/hint-games.ts`) are
  retired: a list a session must remember to edit is a defect class, not a
  convention.
- **Totality over vigilance.** Where today a rule lives in a guide ("every
  hint must explain why"), the framework makes the compliant shape the only
  one that type-checks. Review attention is spent on wording and judgment,
  never on remembering.
- **Lessons live as assertions.** The repo already converts war stories into
  guards (color bounds, vacuous-assertion sweeps, the probe corpus). The
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

Constraints inherited from paid-for experience, honored explicitly in the
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
