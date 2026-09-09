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
**45 resolved to a real change and the other four were not change ids at all** —
`prefers-color-scheme`, `pre-ts-pivot`, `color-dark-check`, `auto-mark-complete`.
So there was no dead citation to catch, and any guard keyed on "kebab-case token
in backticks" would need an allowlist for CSS features, git tags and script names
that grows with the docs. The decline named its own revisit condition: *worth
revisiting if a dead citation ever does appear.*

> **⏱ It appeared 46 minutes later, and nobody noticed for five days.** The
> measurement landed in `548594b4` at 15:21 on 2026-09-04; at 16:07 the same
> afternoon `dda81631` rescoped and **renamed** `census-the-hintless-logic-games`
> to `characterize-the-hint-assessment-corpus` — and left `AGENTS.md` § "Hint
> quality bar" saying the old name "exists to characterize that corpus". The
> directory it named had been deleted by the commit that wrote the sentence's
> replacement. Corrected 2026-09-09 by `settle-the-framework-vision`.
>
> This is `AGENTS.md` § "Method" — *a fact about the codebase rots exactly like a
> count* — at its sharpest yet. That entry's worked example took nineteen hours
> to expire. This one took forty-six minutes, and the thing that made it stale
> was not a distant change: it was the **rename of the very id the sentence
> cited**, which is the one mutation a prose citation cannot survive and the one
> a grep would have caught for free.
>
> **Re-measured 2026-09-09**, same key and same scope (`docs/` + `AGENTS.md`, 16
> files): **80 change-id-shaped tokens, of which 74 resolve** — 71 to an open
> change or a dated archive entry, and three to postmortems
> (`declare-the-gesture-table`, `declare-the-board-model`,
> `adopt-the-game-definition-adapter`, whose directories are gone *by design*
> because the rows were withdrawn). **Five are not change ids** — the original
> four plus `puzzle-key-unhandled`, a DOM event. **One was dead**, and it is the
> one above.
>
> *An instrument note, because it changed the number.* The first run of the
> re-measurement reported **twelve** unresolved, not one: its glob resolved
> `<id>` against `openspec/changes/archive/*-<id>` only, so it missed every
> citation written with the date already in it and every withdrawn row living in
> `openspec/postmortems/`. Eleven of the twelve were the instrument, not the
> docs — `AGENTS.md` § "Method", *check the instrument before the finding*, and
> the correction ran in the direction that makes a guard look *more* worthwhile,
> not less.
>
> **✅ The revisit condition fired, and the guard is built** —
> `guard-change-id-citations`, 2026-09-09.
> `scripts/checks/change-citations.mjs` runs in the gate's fast prefix (0.06 s,
> beside the spelling and catalog guards, ahead of the documentation-only
> shortcut) and fails a commit on a cited id that resolves to no open change, no
> archive entry — dated or bare — and no postmortem.
>
> **The decline's objection was right and is what shaped the guard.** An
> allowlist that grows with the docs *is* the cost, so the non-ids are a **ledger
> asserted exactly equal to the unresolved set**, with a reason per entry: it
> fails when an entry starts resolving and when one stops being cited, not only
> when a new dead citation appears. Six entries today — the five non-ids above,
> plus `census-the-hintless-logic-games` itself, which stays dead on purpose
> because this passage is the worked example and leaves the ledger when this
> passage does.
>
> **And the objection was measured where it is real: `openspec/specs/` is not
> scanned.** The same key covers it, so the question was taken rather than
> assumed — the specs cite 31 kebab tokens and **15 do not resolve, not one of
> them a change id**: preference keys (no-of-balls, snap-to-grid), DOM names
> (status-bar-change), a web component (wa-button-group). Widening would
> nearly triple the ledger with product vocabulary and catch nothing. A spec
> describes what the product *is*; `docs/` and `AGENTS.md` narrate what the
> project *did*, which is why only the second names changes.

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

**The order is the argument; it is not a scoreboard.** Each row is the lever the
previous row's lesson pointed at, which is the only reason the sequence is worth
reading. **What each row did — shipped, shipped differently, withdrawn,
completed — is stated in its own lesson block below**, at the claim it corrects,
and it stays correct without anybody maintaining this list.

1. `derive-difficulty-from-the-technique-ladder`
2. `declare-params-and-presets`
3. ~~`declare-the-gesture-table`~~
4. ~~`declare-the-board-model`~~
5. ~~`adopt-the-game-definition-adapter`~~
6. `re-express-the-collection`

**This list carried a Readiness column until 2026-09-09, and it is instructive
that it did.** Row 6's cell read *"survives, route changed — one owner question
decides its shape"* for three days after that question was answered, the change
was executed in eight batches and archived — so the page told a reader the last
live question in the definition end was open when the whole end had reported.
Nothing about completing `re-express-the-collection` required touching a table
two hundred lines from anything it changed, which is precisely the drift the
section above argues against and then reproduced. The lessons were never the
part that rotted; the column was.

> **Row 1 — SHIPPED 2026-09-04, and not as this document predicted
> (`derive-difficulty-from-the-technique-ladder`). What it actually taught,
> since it is the first evidence this ordering has produced.**
> Its readiness line was *"the ladder now declares `tier`, and
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

> **Row 2 — SHIPPED 2026-09-05, again not as predicted
> (`declare-params-and-presets`). What it taught, and it is the same lesson
> twice.** Its readiness line
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
> no adapter and no definition object. **That question is now answered** — rows
> 3 and 4 were withdrawn, row 5 with them, and row 6 is the survivor. See the
> row 5 note below.

> **Row 3 — WITHDRAWN 2026-09-05; the exploration ran and the falsifier fired.
> What it taught, by being wrong.** It is the first row to be *withdrawn*
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

> **Row 4 — WITHDRAWN 2026-09-06; the exemplar could not break it because it
> had already been served on another axis. What it taught: check whether the
> thing you are proposing is already in
> the tree.** Row 4 was the largest declaration in the vision and the one this
> document predicted would break. It did not break on contortion. It broke
> because **a general board model already ships** — `src/engine/grid/` models any
> planar graph as faces, edges and dots, carries all eighteen tilings,
> `gridNearestEdge` for input hit-testing and `gridNewDesc`/`gridValidateDesc`
> for the codec — and **55 of the 57 games decline it**, having voted with their
> imports that `y*w+x` into a typed array is the right representation for a
> square board. `openspec/postmortems/2026-09-06-board-model-withdrawal.md`.
>
> Three lessons, and the first two are rows 1–3's, at the highest price yet.
> **The declaration a concern should be derived from is not always the one the
> vision named** — for Palisade, the exemplar this document chose to break the
> model, four of the five deliverables had already arrived from
> `border-grid.ts`, keyed on the mechanic. **The axis decides everything**: two
> games can share a topology and share nothing else, which is why Slant and
> Palisade are both square grids with sub-cell entities and share not one line,
> while `border-grid.ts` serves its two completely. And the new one: **a
> deliverable list is a checklist, so walk it**. Of the five things row 4
> promised, three had shipped, one is frozen by the migration invariants and can
> only be re-expressed byte-identically, and the fifth — cloning — is 466 lines
> whose entire content is a per-field judgment (*copy this layer or share this
> reference*) that a topology does not know.
>
> What the exploration found instead is two measured duplications, both
> `border-grid.ts`-shaped: `unify-the-board-origin` (eight games compute the
> board's pixel origin twice, once for input and once for paint) and
> `share-the-run-length-desc-scanner` (one desc grammar, four spellings, and
> every game writes it twice — once to validate, once to decode).

> **Row 5 — WITHDRAWN 2026-09-06; its own criterion came back "no" four times
> out of four. What it taught: the trick it existed to perform was never
> needed.** Row 5
> held the criterion for the whole definition end — *did a declaration need to
> know about any other declaration to do its job?* Four rows reported and the
> answer was no every time: rows 1 and 2 shipped as helpers a game calls, rows 3
> and 4 were withdrawn. So the adapter was a manifest reader, not an adapter,
> and its last argument — the capability diff — needs no manifest either:
> `testing/enrollment.ts`'s `builtGames()` already hands back every game's live
> object and real `Ui`, and a *derived* set cannot be forgotten by the
> re-expression that drops a member.
> `openspec/postmortems/2026-09-06-game-definition-adapter-withdrawal.md`.
>
> **The premise had failed earlier than the criterion did.** Row 5's
> load-bearing claim was that without it, adopting the framework is a 57-game
> commitment taken on faith. Rows 1 and 2 had already disproved that by
> shipping: a helper nobody calls is abortable at zero cost, one game at a time,
> with the other 38 untouched and playing. **The property the adapter existed to
> buy arrived for free the moment the declarations stopped being declarations.**

> **Row 6 — DONE 2026-09-06, archived as
> `2026-09-06-re-express-the-collection`. It was the survivor, and it is the
> part that was always doing the work.** Its argument — the corpus is the documentation, so a mixed
> tree manufactures a fork in the road at every reading — never mentioned a
> definition object, and its acceptance test is `AGENTS.md`'s dictum written as
> a procedure: *pick any two games that mean the same thing and ask what still
> differs.*
>
> **What it settled, and how it knew it was finished.** The route was the row's
> one open question — continuous per-concern convergence, which was already
> running, against a bounded sweep with a moment somebody can declare done — and
> the owner answered it on 2026-09-06: *"Let's do a full sweep."* A sweep needs
> an end, so the change's `survey.md` **enumerated one first and then exhausted
> it**: the differences across all 57 games that nobody can defend as belonging
> to the puzzle, measured by five named instruments each carrying its own
> vacuity number, with the games named rather than counted. That list was the
> definition of done, and batches **B1–B8 all reported** against it — B1
> dissolved on measurement, B8 ratcheted rather than closed, the other six done
> — with the instruments re-run at the end to prove it rather than to assert it.
> Five earlier passes (`adopt-conventional-tier-names`,
> `unify-cross-game-vocabulary`, `unify-the-note-taking-cell`,
> `unify-the-note-taking-vocabulary`, `unify-the-board-origin`) were the same
> convergence archived one concern at a time.
>
> **So the definition end has reported in full.** Two rows shipped — as helpers
> a game calls, not as declarations — three were withdrawn with postmortems, and
> one completed. There is no open question left in it. What remains anywhere in
> this vision is what `openspec list` says remains, which is the only place that
> answer has ever been safe to keep.

**Presentation has now reported too, and it is withdrawn** (2026-09-09).
`explore-the-tile-loop-inversion` read all 57 `redraw` bodies and found its
headline number inverted: the medians are 20 lines of framework-ownable
bookkeeping around 64 lines of the game's own, not 80 around 10, and no game in
the collection reaches 80. The defect the inversion was to kill by construction
has zero live instances, and is structurally impossible in any game that folds
its overlay bit into the packed key. The scene-graph postmortem's bar — real
downstream pressure — was never even reached; the claim failed on its own
arithmetic first.
[`presentation.md`](./presentation.md) is struck through and kept for the
argument; the record is
`openspec/postmortems/2026-09-09-tile-loop-inversion-withdrawal.md`, and what
the exploration found instead is `widen-the-mistake-overlay-coverage-key`.

**So every part of this vision has now reported.** Two rows shipped as helpers,
four directions were withdrawn with postmortems, one completed — and on
2026-09-09 **the deduction end was measured too**
(`explore-the-deduction-engine-reach`), which was the last part with substance
left. Its answer is the only one in the set that is neither "shipped
differently" nor "withdrawn": **the shared thing already exists and is already
correct; it has simply never been wired to two thirds of its population.**
Sixteen of the 46 games with a solver use it; seven more fit by rewiring alone,
and one of them writes the runner's exact signature out eight times by hand.

**The line saving is 21 lines a game and that is the wrong measure** — it would
have withdrawn this end the way it withdrew the tile renderer, and lines were
never this end's argument. What is: two instances of the wiring drift this
document predicts surfaced in four days, in Undead and in Solo, neither found by
a framework and one of them a Solve that corrupted every generated board. See
[`deduction.md`](./deduction.md)'s banner.

**Which is why hints stop being "after the declarations" and become the
measurement.** Five of the seven adoptable games are hintless, so
`characterize-the-hint-assessment-corpus`'s corpus is exactly the population
this adoption would serve — and what a hint costs *after* adoption is the honest
test of whether this end's argument is true. If it does not get cheaper, that
closes the vision for good.

> **✅ It reported, 2026-09-10 (`add-tracks-hint`).** The falsifier fired on its
> stated terms: Tracks' recording projection cost **+536 lines against the
> control's +387**. It did *not* need a second walk — the hint runs the same
> eight technique objects through one `runDeductionFixpoint` call, zero engine
> lines, on two hooks the runner already had — so the wiring claim is real and
> stronger than the tree had shown. What is gone is the **cost** claim: the loop
> is about ten lines and was already shared, while a recording projection's cost
> is the per-premise *why*, the evidence it captures, and a per-premise early
> return the runner structurally cannot supply. The replacement sentence, and
> the finding that a **rung is not a premise** (8 rungs, 12 premises, which is
> also why `find`/`apply`/`narrate` would not have helped), are marked at the
> claims they correct in [`deduction.md`](./deduction.md); the table is that
> change's `findings.md`.
>
> **With that, this document has nothing further to report.** Every end has now
> shipped, completed, been withdrawn, or — this one — reported a number. Per the
> table above, what remains anywhere is a question for `openspec list` and for
> the markers at the claims, never for a status line here.

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
| [`migration.md`](./migration.md) | The path from today's `Game` interface: which engine modules become framework organs, the order of adoption, and the invariants that must not regress. (Its adapter story is withdrawn in place; the invariants are the part that survives and they are not the adapter's.) |

## Adding a game, in one paragraph (the target experience)

You run the scaffolder and fill in five declarations: ~~a **board model** (grid
topology, cell domain, what an edge/vertex means — the desc codec, state
cloning, coordinate maps and cursor movement fall out)~~ — **that one is
withdrawn too** (2026-09-06): a game gets its board by importing `grid/` when it
is a planar graph and by indexing a typed array when it is not, its cursor from
`pointer.ts`, and its coordinate pair from `geometry.ts` curried with its own
border; ~~a **gesture table**
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
