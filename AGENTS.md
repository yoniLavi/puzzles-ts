
# Notes for All Agents (also symlinked as CLAUDE.md)

`CLAUDE.md` is a symbolic link to this file. There is one source of truth for the project's strategic context and working conventions; both names read the same content.

## Project at a glance

PWA port of [Simon Tatham's Portable Puzzle Collection][sgt-puzzles]. **It is a
TypeScript project, end to end — no C, no build system, nothing compiled and
nothing generated, anywhere in the tree.**

- **All 57 games + the engine** in `/src/engine/` (the midend, the `Game`
  interface, the registry, the drawing/color contracts, and the `random/` and
  `combi/` leaf libraries) and `/src/games/<puzzleId>/` (one directory per
  game). Plain TypeScript, no build step of their own.
- **TypeScript web app** in `/src` using Lit web components and Vite. Targets Baseline 2023 (see `src/preflight.ts`).
- **Help** is this project's own markdown under `help/` — one directory, one
  format, one page per game in `help/games/`. The MIT notices are `licenses/`,
  and the two unbuilt `unfinished/` C files live with the changes that read them.
- **The product is Hintful Puzzles; the repository is `puzzles-ts`.** The name,
  the tagline and the support links have one source, `src/project-identity.ts`,
  read by the About dialog, the PWA manifest, the page templates and the home
  screen. The app presents itself as **maintained by** Yoni Lavi (never "by":
the puzzles are other people's designs) and credits its lineage in
  order (Simon Tatham, Lennard Sprong, Mike Edmunds' `puzzles-web`, then this
  project) **in the About dialog, and nowhere else**: the header, the page
  titles and the help pages speak in this project's own voice and name no
  other project, and every player-facing sentence outside the per-game help is
  this project's own writing rather than text inherited from puzzles-web. The
  per-game pages under `help/games/` keep upstream's wording on purpose.
  **Support links point home; attribution links point outward by design** — a
  link that exists to credit puzzles-web keeps pointing at it. The logo
  (`public/favicon.svg`, the source of every generated PWA icon) is this
  project's own drawing; no third-party logo ships. `src/project-identity.test.ts`
  reads the rendered About dialog and scans the other surfaces for the retired
  name and the predecessor's issue tracker.

The authoritative statement of the migration approach is the `ts-migration`
capability spec (`openspec/specs/ts-migration/spec.md`); this section is the
readable summary.

**The record of how the project got here is `openspec/changes/archive/` and the
git log** — one directory per change, with its proposal, tasks and design, plus
`openspec/postmortems/` for the directions that were tried and dropped. **Do not
write a summary of it anywhere.** A hand-maintained digest of a record the
workflow already produces is a second copy with a maintenance tax and no reader,
and second copies drift: the `openspec/project.md` that used to sit beside this
file ended up describing directories that had been deleted. If a completed change
established a rule, that rule belongs *here*, in the present tense, with no date
and no change id attached.

## Dev guides under `docs/games/` — consult *and* maintain them (live wiki)

**Whenever you work on a game — implementing one, adding or iterating a hint, fixing a render/input bug, or any other change under `src/games/` — read the relevant guide first and keep it current as you go.** The guides are the followable *how*; the specs remain the normative *what*. Start at [`docs/games/README.md`](docs/games/README.md) — the map, the game-change lifecycle and the definition of done — then the concern you're touching:

- [`docs/games/mechanics.md`](docs/games/mechanics.md) — the `Game` contract: params/codecs/presets, state immutability, moves, capability hooks, affordances (pencil UX, reference aid), bespoke geometry.
- [`docs/games/input.md`](docs/games/input.md) — pointer/keyboard/touch, the four frontend traps, drag models, the keypad, the input-parity bar.
- [`docs/games/rendering.md`](docs/games/rendering.md) — the redraw doctrine, tile cache + overlay sidecars, the palette's three layers, animation/flash, blitters.
- [`docs/games/solver-and-generator.md`](docs/games/solver-and-generator.md) — one deduction engine/two projections, difficulty tiers, guess-free generation, generator discipline, `findMistakes`, the Latin family.
- [`docs/games/hints.md`](docs/games/hints.md) — the full hint-authoring discipline (the Palisade bar, narration rules, plan mechanics, hint rendering, candidate-elimination and heuristic families, cross-game guards).
- [`docs/games/testing.md`](docs/games/testing.md) — test tiers, render scenarios, the frozen differentials, determinism rules, enrollment duties, metrics.
- [`docs/games/engine-catalog.md`](docs/games/engine-catalog.md) — the shared-helper reference: what exists, when to reach for it, byte-match sensitivities.
- [`docs/test-strength.md`](docs/test-strength.md) — **assessing** tests rather than writing them: the five-minute mutation probe, `npm run probe` (the committed corpus of it), coverage vs strength vs *feedback*, the boundary with the differentials, when full mutation testing is worth its cost, and the instrument traps that make an assessment lie. Not game-specific — it applies to the engine and the app shell too, which is why it sits outside `docs/games/`. **Read its §7 before quoting any number out of it**: eight instruments in this repo's recent history measured the wrong unit, and the most consequential pair reached a proposal and a spec before anyone checked them.

**Treat these as a live wiki, not frozen docs.** Every time you hit something the guide didn't tell you, get wrong because it was missing, or learn a better pattern, **update the guide in the same change** — that is part of "done," not a separate chore. Keep them link-only to the specs (state a normative rule briefly + link it; point at an exemplar file rather than pasting code that rots) so they can go stale but never silently contradict a spec. Cite guide sections by **file + heading name** (`docs/games/rendering.md § "Overlay sidecars"`), never by position — and if you rename a cited heading, repoint every citation in the same change (repo-layout spec, "Developer guides live under docs/ and link to specs"). The section pointers below ("TS port style", "Hint quality bar") are entry points into these guides. Separately, [`docs/framework-rdd/`](docs/framework-rdd/README.md) is **design fiction** — the target framework written readme-first — and it must never be cited as though it described shipped behavior. Parts of it *have* since shipped, so it is no longer uniformly false: what shipped is marked in place and, per the repo-layout spec, the shipped form always lives in the real guides and specs. **Read the shipped form there; read the fiction only for the argument.** [`docs/framework-rdd/README.md`](docs/framework-rdd/README.md) § "Where this stands" says how the vision is being turned into work, and why "what remains" is a question for `openspec list` rather than for a status column in a doc.

## Goal

A puzzle collection where **user-facing value comes first** and new games and
cross-game features are cheap to build. **Deliberate divergence from upstream is
the *point*, not a fidelity regression** — quick-save, mistake-checking,
explained hints and per-game gameplay aids are why this fork exists. Order work
so that value lands early, and judge a game by whether it plays correctly, not by
whether it reproduces a recorded corpus.

### Convention over configuration: one obvious way, and no unnecessary decisions

**A game's directory should contain what is essential to *that puzzle* — its
rules, its deductions, its look — and as little as possible of "how this codebase
does things".** Everything in the second category is **accidental complexity**,
and reducing it is a standing goal of every change that touches the framework,
not a separate project. Owner directive, 2026-09-04: *"I want consistency and
convention-over-configuration where it makes sense … I don't want every new game
to come up with names for its difficulty levels if we can avoid it, but to allow
override if required."*

**The bar for a new game: for most of what implementing one involves, there is
one obvious way to do it, and the porter makes no decision that is not about the
puzzle.** Naming its difficulty tiers was such a decision until
`adopt-conventional-tier-names`; 29 games had answered it 29 times, producing
twelve words and six different vocabularies among the six three-tier games, and
not one of those answers was about the puzzle. That is the shape to hunt.

**The test for whether a decision is real**: *can we say what a game would
legitimately want to do differently?* If two games could reasonably answer
differently — a nonogram's overlap deduction is nothing like a sudoku's hidden
single — it is a genuine decision and stays with the game. If they could not, it
is a convention somebody forgot to make, and N games are each paying to
re-answer it. **N games sharing a defect means the layer below them is wrong.**

**Every convention ships with an override**, and the override is first-class: a
game writes the explicit form and says why in its change. What a convention must
never become is a contortion — game-specific logic is never bent to fit a
contract, and an exemplar hint never loses a word to an abstraction. Two
conventions in the tree show the shape to copy: a tier a game declares
`nonUniqueTiers` is exempt from the tier-name guard *automatically*, because the
game already declared it for its own reasons; and `nonMonotone` **swaps** a
guard rather than skipping it. **Derive the exception from a declaration the game
already makes** — an exemption roster rots exactly as quietly as the membership
roster it replaced.

**A game joins a shared mechanic by *having* it, never by declaring that it
has it.** Carrying the `Ui` fields, calling the arm, declaring the method — that
*is* the enrollment, and a cross-game guard finds its population by reading what
the game is (the registered object, the `Ui` its `newUi` returns, its own
comment-stripped source; `src/engine/testing/enrollment.ts` asks all three).
Nothing in the tree enrolls from a manifest, and three attempts to build one have
been reversed — eighteen `needsRightButton` declarations deleted, the gesture
table withdrawn, the hint list derived. The reason is not taste: a manifest can
be forgotten by a new game, left behind by a changed one, or simply wrong, and
*nothing notices*.

**Two things wear the word "declaration" and only one of them is that.** A value
a mechanism **consumes** — a technique's tier, a `paramConfig` field list, a
presets menu — is an input, it is healthy, and the deduction end runs on it. A
statement **about** a game that only a guard reads is a manifest, and that is the
one to refuse. Before designing a declaration, ask which it is; then ask what the
consumer is already being sent, because twice now the declaration a concern
should have derived from was already crossing the boundary.

**Where intent genuinely cannot be observed, attach it to the derived member, not
to the enrollment.** The guard derives *who*, and carries a ledger saying *why* a
member is excused — one entry per member, with the derivation asserting the
ledger is exactly right. That is why `NO_KEYBOARD`, `INERT_PANEL_KEYS` and
`NO_CONSUMER` can be **empty and still assert something**. And where production
needs a boolean synchronously and cannot run the probe, the flag stays — held
equal to a derivation, so it cannot lie (`canMarkAll`, `ignoresSecondaryButton`,
`wantsStylusModifier` are the collection's only three, and each is now checked).
The followable form is [`docs/games/testing.md`](docs/games/testing.md) § "How a
cross-game guard finds its population".

**How this is done, in practice, is the rest of this file**: derive rather than
hand-maintain (`derive-hint-enrollment`, `difficultyTiers`), refactor as you go
(the DO list below), break an inherited assumption when it costs more than it
earns ("Nothing is sacred"), and remember that a framework-scale pivot still
needs a real downstream game pressuring it (the scene-graph postmortem). **This
section says what all of that is *for*.**

## Lineage

- **Upstream**: [Simon Tatham's Portable Puzzle Collection][sgt-puzzles]. ~40 puzzles, MIT-licensed, actively maintained by Simon and a long list of contributors.
- **Direct parent**: [medmunds/puzzles-web]. A PWA shell over upstream's C compiled to WASM via Emscripten, using a C++ `webapp.cpp` + Embind as a typed frontend adapter, running the WASM in a Web Worker (via Comlink), with a Lit/Web-Awesome/Vite TS app. The `puzzles/` directory is a git subtree of upstream with a small number of local patches.
- **This project**: forked from puzzles-web. Replaces the C engine with native TypeScript, top-down, eventually displacing it entirely while deliberately growing beyond upstream's feature set.

## Upstream policy: no merges, and no running C to ask

**There is no C engine, and there are no merges from upstream, ever.** This
project forked from medmunds/puzzles-web at a specific point, which forked from
Simon Tatham's puzzles at a specific point, and it does not track either.

**A new question about upstream behavior is answered behaviorally.** The C is
readable in git history (`git show <tag>:puzzles/<game>.c`, bracketed by
`pre-ts-pivot` and the per-port commits) and in the sibling clone at
`../puzzles/`, so it is still a priceless thing to *read* — it encodes years of
subtle generator/solver logic on uniqueness, difficulty grading and symmetry.
What is gone is a *running* build to interrogate, so there is no oracle to
re-baseline a fixture against. **A deliberate divergence therefore retires or
re-founds its fixture rather than re-recording it.**

**The upstream MIT notices stay intact** — an obligation independent of tracking
policy. They are `licenses/sgt-puzzles-LICENSE` and
`licenses/puzzles-unreleased-LICENSE`, and the About dialog `?raw`-imports both,
so they are live build inputs rather than archive material: moving one without
repointing that import breaks the production build.

## Method: make the check check the thing

These are the rules this project has rediscovered most often. Each has been
arrived at independently four to six times, in unrelated parts of the tree, which
is the argument for stating them somewhere they get read rather than leaving them
in the write-up of whichever incident found them last.

**A guard must measure the thing it claims to guard, not a neighbor of it.**
This is the single most repeated defect here, and it is always invisible: the
check passes, so nobody looks. `expect(d.edges.length).toBe(d.order)` ran across
eighteen tilings and *could not fail*, because `d.edges` was allocated
`new Array(d.order)` — halving every dot's degree passed all 151 tests in the
file. A touch sweep asserted the **catalog's** length while skipping every game
missing from the **registry**. A dead-link check grepped for the string
`help/manual` and returned zero while 42 dead links shipped, because the links
were written relatively. An archive-integrity check hashed `find` output whose
*order* is not stable. Ask what would have to break for this assertion to fail,
and if the answer names something other than the behavior you care about,
rewrite it. **Grep for the shape**: `x.length` against the thing that sized `x`,
a getter against its own field, a total against the sum it came from, a string
match standing in for a resolved reference.

**Prove a new guard fails before trusting it.** Break the thing deliberately,
watch it go red, restore. A guard nobody has seen fail is a guard nobody has seen
work — and several here silently did nothing until this step was applied.

**Carry a vacuity guard: "how many things did I look at?"** An unmatched
`import.meta.glob` yields `{}`, an empty directory yields no iterations, a filter
can exclude everything — and every downstream assertion then passes over nothing
and reports health. Count the inputs and assert the count.

**Verify a bulk edit by shape, not by a green suite.** Assert that every changed
line in the whole diff is the one intended kind of change, then read the
exceptions. This is what catches an import-rewriter that also rewrote prose in a
doc comment, and a comment-only sweep that swallowed a `describe` — the suite is
green either way, with fewer tests in it. For a pure move, the shape is "every
line removed appears verbatim in the destination, and nothing was added".

**Check the instrument before the finding**, and check it against something
*outside* the tool. Instruments here have measured the wrong unit repeatedly,
twice reaching a proposal and a spec before anyone checked; `docs/test-strength.md`
§7 catalogs them, and its numbers should not be quoted without reading it.
**This applies to dependencies too** — checking what the *installed* version of a
tool does and generalizing it to what the tool does is the same error aimed at a
package. When you find yourself building a workaround layer, an override of
generated content, or a guard that a guard survived, check the version first.

**A scan that keys on a name finds only the games that were named that way.**
The most common instrument failure here is not a wrong unit but a wrong *key*:
a sweep matches `hint` and never sees `netslideHint`; it matches `findMistakes`
and never sees `findBoatsMistakes`; it looks for a call to `solve*` and misses
`findUndeadSolution` and `fullSolve`. Each time the sweep reports a census of
the whole collection with games silently absent from every figure — and the
errors run both ways, so one such scan inflated a phrasing count while another
convicted three games of a defect none of them had. **Key on the shape**
(`{ ok: false, error: <literal> }` wherever it appears, a `?` on an interface
member, a rect that is thick in both directions), accept the superset that
gives you, and *classify* what it catches instead of narrowing the scan — the
narrowing is the error. **And when the population is small enough to read,
read it**: fourteen function bodies cost less than the two heuristics that
lied about them. **The key can also be the syntax after the name**: a grep for
`latinSolver(` returned one of six call sites, because the other five are
written `latinSolver<Ctx>(`. **And a grep for a constant's *name* is blind to a
copy that spells out its *value*** — sweeping `DIFF_NAMES` found all 25
definitions and missed the two games that had typed the tier words into their
preset titles, which is how a menu came to say "3x3 Intermediate" while the
dialog beside it said "Tricky", with the whole suite green. When you change what
a constant means, search for what it *said*, not only for what it is called.

**A count written in prose is a census nobody re-runs.** Three in one sitting:
`difficulty.ts` said twenty-eight tiered games where there were twenty-nine;
`deduction-fixpoint.ts` said "the eleven latin-family games" reach it through
`latinSolverTop` where six do; and a guard's own comment listed "the eleven that
write the names out twice", naming three games that had since stopped. The
middle one had already misled two handoffs. So **write the query, not its
answer** — "the games that call `latinSolver`" cannot go stale, "the eleven
latin-family games" silently does — and where a number really is the point,
assert it in a test so it fails when it drifts. A figure with a date and a
change id attached is a *measurement* and stays; a bare count in the present
tense is a claim, and it rots.

**A number a proposal argues from is a claim, and the size of a thing is not
the size of its ceremony.** `presentation.md` costed its whole design on "~80
lines of identical bookkeeping per game wrapped around ~10 lines that are
actually the game's". Measured 2026-09-09 across all 57 `redraw` bodies
(`explore-the-tile-loop-inversion`): the medians are **20 lines of bookkeeping
around 64 of the game's own** — inverted, and out by a factor of four. The 88
was right; what was never checked is which side of it was which. So **before
designing against a headline number, take it** — and take it against the
population, not against the one file that suggested it. The same posture applies
to a proposal's *deliverable list*: walk it item by item against what is already
on disk, because three of this vision's directions were withdrawn on finding
most of the block already served (`openspec/postmortems/`).

**And a fact about the codebase rots exactly like a count — sometimes in
hours.** A scaffolded change carried the constraint "this reaches no player,
because `processKey`'s return value is discarded at both call sites", correct on
the day it was written. Nineteen hours later a commit derived the app's
bare-letter shortcuts from that very value, and the "harmless" defect was
costing Ascent's players undo, redo, New game and Hint. The constraint was not
wrong when written and there was no way to write it better — what it needed was
a **date**, so the next reader knows to re-check rather than inherit. So date a
claim about the code the way you would date a count, and **re-verify a
constraint that says "don't bother looking" before obeying it**; that phrasing
is exactly the one that stops anyone from noticing it has expired.

**Don't repoint a dead recipe — retire it.** When an instruction has gone stale,
fixing the one part you noticed is the worst available outcome: every *other*
line is equally dead, so the result looks maintained and fails on its first step.
Thirty-seven differential headers here carried a build command naming a
directory, a toolchain, a flag and a script that had all been deleted; the fix
was to delete the recipe and keep the one fact still true. The same goes for a
generated file whose generator is gone — **check what the generator asserted
about its output before accepting the file as source**, because those assertions
may be the only statement of an invariant anywhere.

**An optimized artifact needs its bounds asserted**, because the objective will
never complain about what it traded away. A search maximizing color
distinguishability bought it with a lightness so high the result was a cream, and
with a "bold" step dimmer than its own base. Whatever the optimizer was not told
to preserve is exactly what it will spend.

## Acceptance bar: owner acceptance, not a green automated suite

**Game-facing work is done when the owner says it plays correctly — including
rendering, animation and input — not when the suite is green.** A suite asserting
only state transitions can be fully green while the game does not render; that is
not a hypothetical, and it is why the bar is where it is.

**A shortfall is never called "cosmetic", "out of scope", or deferred without
explicit owner approval.** Those three phrasings are the specific failure mode
this rule exists to block: each one converts "I did not finish" into "this was
not mine to do". Authoritative: the `ts-migration` spec.

**Run the app before declaring UI work done.** Tiers 1–2.5 reach further than
they look (see "Test discipline"), but nothing in them is evidence that a frame
composited correctly on a real canvas.

## Test discipline

There is **no inherited test suite**. We build the discipline from scratch, now without a byte-corpus layer:

1. **Behavioral tests per ported game / module.** Ordinary unit/integration tests asserting the thing behaves correctly (generates solvable boards, solver solves them, input transitions are right, serialize/deserialize round-trips). Property tests where there's a closed-form invariant ("combi emits exactly C(n,r) lex-ordered tuples") — cheap, additive, catches unrecorded-input regressions.
2. **Dev-time differential spot-check.** An advisory harness that generates N boards from both the C build and the TS port for the same seed and surfaces diffs for human review. Review signal, **not** a pass/fail gate. Per-game tightening (a stricter check for a generator with brutal uniqueness constraints) is allowed but is not the default.
3. **Pre-commit gate stays.** Its steps are written out once, in § "Git" below — a fail-fast prefix of cheap checks, then `vitest run` and `vite build` concurrently. Two properties matter here rather than the list: it **blocks on any failure**, and the production build is in it because nothing else exercises `vite build`, which is how two prod-only breakages once sat undetected on `main`.
4. NEVER EVER attempt to bypass pre-commit validation. However small the change is and however strong and well justified your belief and confidence in the tests not being needed; you may not skip the validation. These tests are critical to our code integrity and security. Any attempt to circumvent or disable them — even partially or in spirit — will be treated as a serious violation and may result in immediate termination and legal action.

**In-process testing tiers (reach for the lowest one that fits; Playwright is for visual/integration smoke only — not for logic you can assert in `vitest`).** Codified in the `repo-layout` spec by `add-in-process-ui-test-harness`:

- **Tier 1 — pure logic** (`Game` impls, `Midend`, solvers, generators, codecs): default `node` environment, no setup.
- **Tier 2 — rendering ops**: drive a game's `redraw` against a recording `GameDrawing` double and assert the draw calls (e.g. "a `COL_MISTAKE` rect is emitted for a flagged wall" — `galaxies.test.ts`), also in `node`. New render code should ship a tier-2 test rather than relying on eyeballing a browser. For the *shared, complete* recorder and for reaching a specific production frame, prefer tier 2.5 over an ad-hoc per-test double.
- **Tier 2.5 — render scenarios + snapshots** (`add-render-snapshot-harness`): `src/engine/testing/` ships a shared, deterministic recording `GameDrawing` (`recording-drawing.ts` — captures *every* primitive with all args, colors resolved through the game palette to stable `rgb()` labels, coords integer-rounded) and a `Midend`-backed scenario driver (`render-scenario.ts` — `renderScenario({ game, id, moves?, showHint?, hintUntil?, showMistakes? })` drives a real `Midend` to a target frame by replaying `Move`s directly via `Midend.playMoves` — no pointer events — optionally walking the hint plan to a step of interest, then captures `redraw`). Verify with targeted op assertions **plus** `toMatchSnapshot` on the record (a render regression is a reviewable text diff; `vitest -u` re-baselines an intended change — pair every snapshot with a few targeted assertions so a careless `-u` can't erase the guarantee). `toSvg(ops, size)` (`svg-drawing.ts`) renders the same record as a z-ordered SVG for the rare case a frame needs eyeballing — not part of the required flow. This reaches frames the browser harness couldn't (the Palisade `equivalentEdges` hint: no OffscreenCanvas `getImageData` block, no right-click-mark problem, no Auto-Hint timing); seed at `palisade-render-scenario.test.ts`. Still `node`, no DOM.

  *How to use it (the default for any highlight / overlay / animation-frame work):* (a) reach the frame — `renderScenario({ game, id: "<params>:<desc>" | "<params>#<seed>", … })`; set `moves` to a list of game `Move`s to reach a board state (not pointer events — no coordinate math), `showMistakes` for the mistake overlay, `showHint` for a hint, and `hintUntil: (step) => …` to walk a multi-step plan to the step you care about (it leaves that step *displayed but not applied*, and returns it as `result.hint` for assertions). (b) Assert what matters — `result.recording.ops.some(o => o.op === "rect" && o.color === COL_HINT)` and friends — these targeted checks are the real guarantee. (c) Add `expect(result.recording.ops).toMatchSnapshot()` to catch unintended drift; review the diff, `vitest -u` to re-baseline an intended change (and **commit the regenerated `__snapshots__/*.snap`** — it is the regression baseline). (d) Only when you genuinely need to *see* the composited frame, `toSvg(result.recording.ops, result.size)` and write it somewhere to open — keep that out of committed tests. New render code SHOULD ship a tier-2.5 test; reserve Playwright for genuine full-integration / real-canvas smoke. To reach a *specific deduction/board* deterministically when you don't have its desc, a fixed-seed scan (loop ids, keep the first whose `result.hint`/state matches) is the idiom — see `equivalentEdgesFrame()` in the seed.
- **Tier 3 — components + persistence**: opt a file into `// @vitest-environment happy-dom` for Lit components (`puzzle-screen.test.ts` invokes a command handler with a fake `Puzzle` + mocked deps — no worker/canvas), and import `src/test-setup/indexeddb.ts` for Dexie persistence (`saved-games.test.ts` round-trips against `fake-indexeddb`). `happy-dom`/`fake-indexeddb` are dev-only. Caveat: `fake-indexeddb` rejects Dexie's IDB2 array `maxKey` when it repeats in one compound `between` bound; the setup module forces the primitive sentinel — keep using it for any persistence test.

**A test earns its runtime, and porting-era tests no longer get a pass** (owner directive, 2026-09-08): *"I'm happy to retire any tests that aren't that useful for regression testing any more; many of these were just for the porting from C. So let's keep the things that are truly useful as we continue refactoring, but remove any tests (particularly slow ones) that are costly for no good benefit."*

This retires the "extensive by default" posture that governed the port. The bar is now **what a test would catch in a refactor that no cheaper test would**, and a test that cannot answer it is a candidate for retirement whatever it cost to write.

Four things keep the rule from becoming an excuse:

- **The gate is not what gets trimmed.** Every step of it stays (§ "Git" lists them), and NEVER bypass it (point 4 above is unconditional). What gets trimmed is *what vitest runs*, not whether it runs.
- **Retire by measurement, never by category.** "It was a porting test" is not by itself a reason — the frozen differentials are porting artifacts *and* the strongest net under solver refactoring, because a change to a solver's verdict changes which boards exist. `engine/testing/differential.ts` states that case; answer it per fixture rather than in bulk.
- **Say what still covers the configuration.** `testing/slow.ts`'s existing rule generalizes: deferring or deleting the *only* case covering a mode, grid type or difficulty silently removes it from every run. State the remaining coverage at the site.
- **A slow tier nobody invokes is not coverage — so invoke it targeted.** `npm run test:slow` re-runs the *entire* gate suite as well as the deferred cases, with the widened seed budgets on top; the deferred tier itself is six tests in three files (measured 2026-09-09). The bare command is therefore the wrong instrument for almost every question. **Pass a path** — `npm run test:slow -- src/games/seismic` — and run the slow tier for the games a refactor could have moved, at the moment you move them. A single file that takes tens of minutes has not been made thorough, it has been made unrunnable, and the honest fix is a cheaper configuration or a narrower invocation, never a longer wait. Measured 2026-09-08 on an idle machine: `hint-resume.test.ts` walking every preset once is **776 s**, and it was five seeds deep when the question was asked.
- **The expensive tests and the porting-era tests are close to disjoint** (measured 2026-09-09 over all 301 test files, `retire-tests-that-do-not-earn-their-runtime`). The frozen differentials are **10.1%** of suite time; half of it is three games whose hints plan by *searching*, amplified by cross-game guards that recompute a full hint after every move. So retire by measurement, and **attribute cost per game, not per directory** — a cross-game guard's per-game case belongs to the game it names, which is the difference between Sixteen reading as 17% and as 30%. **Ask which resource is scarce before you pick the instrument.** Three instruments were wrong in one session, each one level deeper: summed wall duration (5× off), then per-file CPU (1.7–1.8× off), then "quiet box" taken to mean low *load*. The box has **16 GB of RAM and sits ~24 GB into swap**, so the constraint is memory, not cores — and under paging `sys` time *is* page-fault time, which is how `user + sys` re-imports the contention that switching off wall clock was meant to escape. So record **free memory and swap** beside the load average, treat any figure taken under paging as an upper bound, and remember that **ratios taken under comparable conditions survive where absolute seconds do not**. `docs/test-strength.md` §7 checks an instrument's *unit*; the unit was right every time here.
- **Time a cost on an idle machine, and say which machine you timed.** The first figure recorded here was "50 minutes", taken while the box sat at load average **533** — the same gate that measured 216 s under that load measures 78 s idle. A contended timing is not a cost measurement, it is a measurement of the contention, and this is `AGENTS.md` § "Method" ("check the instrument before the finding") aimed at a stopwatch. The retirement decision it supported survived re-measurement; the number did not.

**Browser checks: Chrome only, via the `playwright-cli` skill** (owner directive, 2026-07-28). For this phase of the project, verifying in Chromium is sufficient evidence — do **not** treat "WebKit/Firefox untested" as an open gap, and do not spend a session downloading extra browser engines to close it. Cross-engine coverage is not where this phase's risk lives (the work is a C→TS port of game logic and rendering, checked far more cheaply at tiers 1–2.5), and a second engine costs ~10 min and hundreds of MB for evidence that isn't wanted yet. Drive the browser through the **`playwright-cli` skill** rather than a standalone `playwright` install — the standalone package drifts out of version sync with the cached browser builds, which is exactly how one such download got triggered. Revisit only if the fork starts targeting Safari/Firefox as a shipping constraint.

Bit-identical RNG (`random.ts`, already ported) is retained so *future* shared game IDs reproduce across builds. Old C-format saves and pre-pivot shared IDs are expendable by decision.

## Hint quality bar (exemplar: Palisade)

> **Followable how-to:** [`docs/games/hints.md`](docs/games/hints.md) — the procedure for adding an explained `hint()` to a game. This section is the bar; the guide is the steps.

Explained hints are a core deliberate-divergence product value of this fork, not a nicety. The **Palisade deduction hint** (`group-palisade-hint-deductions`, owner-endorsed 2026-06-15) is the **exemplar every game's `hint()` should meet** — it is not enough to point at the next move:

1. **Explain *why* the move is forced, not just *what* to do.** Narrate the actual deduction: *"Both edges border the same region, so they share a fate: both walls or both open. Walling both would exceed clue 2, so neither can be a wall."* — never just "set this edge". If a narration's conclusion doesn't follow from its own stated premises, the deductive coupling is missing; surface it (Palisade's `equivalentEdges` text was an unreadable non-sequitur until the "share a fate" premise was added). A *good* hint teaches the player the technique.
2. **One deduction firing = one journey.** A single deduction that forces several moves is emitted as one multi-leg `HintStep` journey (continuation legs flagged `continuesPrevious`), so it reads and auto-plays as one coherent hint rather than N disjoint ones. This is codified as a cross-game convention in the `ts-engine` Hint System requirement; the `Midend` mechanism (`continuesPrevious` + `executeHint`) is already generic — a game just emits grouped steps.
3. **Equivalent moves share a color.** When a firing's moves share a fate, render them identically (Palisade: all `COL_HINT` blue), not in distinct colors — a distinct color reads as "different roles" and misleads.
4. **Pace auto-hint uniformly.** `AUTO_HINT_STEP_MS` (1s) per step in `src/puzzle/puzzle.ts`, floored by the move's own animation so animated moves still play out fully.
5. **Claim only what you have checked, and make the plan recompute-stable.** Every sentence a hint utters is a claim; if it isn't verified in code, it is a lie waiting to be read by a player who trusts it ("no slide from here reaches it" was *assumed* in Inertia's design and is false — a plan can decline a grab it could take). And a *heuristic* plan must not merely be correct but **stable across recomputes**: a plan is recomputed whenever the player goes their own way, and Inertia's first cut sent the ball north-east, then — one move later, from a freshly-grown heuristic tour — south-west, for ever. The fix is a monotone potential (go for the nearest goal you can safely take), never "cache the plan", which only hides it. Guarded cross-game by `hint-resume.test.ts`; see [`docs/games/hints.md`](docs/games/hints.md) § "Recompute-stable plans".

**A non-deductive game is not exempt from the bar** — it is exempt only from *deduction*. Untangle has genuinely nothing to say and ships an empty explanation; **Inertia** (the non-deductive exemplar, `add-inertia-hint`, owner-endorsed 2026-07-13) shows the other pole: find the one thing the game can *prove* (there, "this gem can never be reached again") and lead with it, hold a stable subgoal and mark it when the game has no name for it, and narrate each move by the consequence it actually has.

**A new game implementation ships with a hint** (owner, 2026-09-04). That is the forward-looking bar, and it is not retroactive: **27 of the 57 games are hintless today and are deliberately being left that way for now**, because implementing those hints is how the framework work gets assessed — a target contract is tested by writing real hints against it, not by re-reading the games that already have one. So a hintless game is not a defect to be swept up, and `characterize-the-hint-assessment-corpus` exists to characterize that corpus rather than to close it. Enrollment in the six cross-game hint guards is derived from the `hint()` declaration itself (`src/engine/testing/hint-games.ts`), so a game acquires every guard the moment it acquires a hint, and none before.

Aspirational next step (owner-flagged 2026-06-15, not yet committed): lift Fifteen/Sixteen hints from "Slide tile 10 into the space" to a Palisade-grade *why* — does the move place a tile in its final home, or is it a helper/setup move toward sorting another tile? Inertia's stable-subgoal narration is the shape this wants.

## TS port style: idiomatic throughout

> **Followable how-to:** the [`docs/games/`](docs/games/README.md) guides — file layout and lifecycle in the README, idiomatic rules in `mechanics.md`, the cache-key pattern in `rendering.md`, the acceptance gate in the README, test tiers in `testing.md`. This section is the style bar; the guides are the steps.

Port to the most idiomatic TS shape — classes over handle-passing, `[Symbol.iterator]()` over `while (next())`, `boolean` over `0|1`, GC over explicit `free()`, modern data structures over C-array mirrors. Use the C as a *reference for the logic* (what deductions the solver makes, how the generator ensures uniqueness), not as a control-flow template to mirror line-for-line. There is no corpus that a refactor could break, so write it clean the first time; the dev-time differential spot-check catches gross divergence.

### Byte-parity was a tool, and the job it existed for is over

**Matching the C is not a reason to leave a game unimproved.** Owner: *"it was
only a temporary one for the porting, but now that we've finished porting, I'm
very happy to diverge in favor of a better play experience, wherever it's worth
it."* "It would change every board" is a **cost to weigh**, not an objection that
ends the discussion — and where the improvement is real, changing every board is
the point.

**Display code was never in scope at all**: rendering, layout, geometry,
animation and colors target *neat visuals and clean code*, not pixel-for-pixel
reproduction. Deliberate visual improvements are the point of the fork.

Worth understanding about what byte-parity *bought*, because it shapes what has
to replace it: on a solver-gated generator the desc depends on the solver's
verdict on every intermediate board, so **one byte-match assertion validated
generator, solver and codec together**. That is a lot of assurance in one line,
which is why dropping it leaves a hole that must be filled deliberately.

Three things this does **not** license:

1. **Churn.** "Wherever it's worth it" is the whole test. A divergence still needs a stated player-visible benefit; tidiness is still not one (playbook §4 rule 3's second half survives its first half).
2. **Losing the assurance silently.** The byte-match was the strongest verification available, and dropping it leaves a hole that must be filled deliberately — normally "every generated board is uniquely solvable at exactly its stated difficulty" as a property test. Say what replaces the oracle, in the change.
3. **Assuming you must choose.** **Often you can diverge and keep the oracle as a test.** Spokes is the worked example (`spokes` spec, "grades its difficulty tiers honestly"): it ships a corrected acceptance check *and* retains upstream's original one, reachable by the differential alone, so the byte-match fixtures still pass against the old path while players get the better boards. Reach for that shape before retiring a differential.

Four rules, from `add-loopy-ts-port`; the followable form is [`docs/games/solver-and-generator.md`](docs/games/solver-and-generator.md) § "Divergence and what it costs":

1. **Divergence is free where C has no defined behavior.** Upstream aborts on a degenerate Penrose patch, so retrying with a fresh desc diverges *only* on the seeds where C crashes. Take those — there is nothing to match.
2. **Price the quirk before paying or refusing it.** "Bug-compatibility" sounds expensive and usually isn't: one quirk cost a single line plus a comment, another cost literally nothing (TS's `%` truncates exactly like C's). Don't narrate a sacrifice you aren't making.
3. **Diverge for a genuine player-visible defect, not for tidiness.** A solver that deduces *falsely* can generate a puzzle with no unique solution — fix it and record it. A solver that is merely **weaker** than intended is also fair game, when the stronger one makes the game better to play: that is the difference between a difficulty tier that means something and one that doesn't. "It changes every board" is a cost to weigh, not an objection that ends the discussion. *Tidiness remains not a reason* — don't strengthen a solver because you can.
4. **Diverge where the C shape doesn't fit a browser.** `grid_trim_vigorously`'s dense `O(numDots²)` matrix is ~576 MB at 50×50. Structure is not behavior — the replacement was exact, so this cost no fidelity at all; the trap would have been transcribing it faithfully *because* it was the C's shape.

## Nothing is sacred: break an assumption when keeping it costs more than it earns

The section above released the *C* as a fixed point. This one releases **our own past decisions**, and it is the more general rule: during the port, holding the design still was load-bearing — a moving target cannot be verified against an oracle. That phase is over.

**The standing instruction:** whenever abiding by the current design makes something unnecessarily complex, and there is an opportunity to simplify by breaking a previous assumption, **consider it actively** — do not route around it, and do not treat "that is how it works today" as an argument. An assumption is a decision somebody made under conditions that may no longer hold; re-derive it rather than inheriting it.

**Where the line is:**

- **Internal design assumptions — just do it**, with the reasoning recorded. Contracts between engine and games, helper shapes, invariants nothing outside the repo depends on, promises one part of the engine makes to another. These are ours; changing them costs a diff and a test.
- **Anything a player or their data can see — propose it and check first.** Save/game-ID formats, preference keys, shared-URL compatibility, a control that behaves differently. Backward-compatibility breakage is **absolutely on the table** — the owner said so — but it is the owner's call, not a judgment to make while mid-refactor. Ask with the cost stated, not as a yes/no.

**The guard rails from the byte-parity section survive intact**: a simplification still needs a stated benefit, tidiness alone is still not one, and dropping an assurance means saying what replaces it. "Nothing is sacred" licenses *reconsidering*, not churn.

**The smell to watch for — complexity spent preserving a promise nothing consumes.** A fix that inherits an existing guarantee and pays for it with a hand-maintained list (say, snapshot/restore of twelve `Midend` fields) has bought a list that rots the first time somebody adds a thirteenth, silently, in the one path nobody exercises. **Two reliable signals that a change is pushing against the grain**: it duplicates source lines the probe corpus anchors on, forcing unrelated re-anchoring; and the careful path it is preserving is one no caller actually reads.

Breaking the assumption collapsed it to **fourteen lines of logic**: rewind to the saved game's opening position and report. The promise was worth nothing because **the only caller that matters throws the save away and deals a new game regardless** — state was being preserved for a consumer that immediately discards it. Owner, asked: *"I'm perfectly ok with cleanly rejecting saved games that are no longer valid in a new version of the code."*

So the question to ask of any inherited invariant is not "is it true?" but **"who reads it, and what would they do differently without it?"** If the answer is nobody, its cost is pure.

## Build commands

- **There is no asset build.** `npm run build:assets`, `scripts/build-manual.sh`
  and `Brewfile` went with the manual (`retire-the-upstream-help-tree`); the
  wasm build — `npm run build:wasm`, `scripts/build-emcc.sh`,
  `scripts/build-native.sh`, the whole CMake tree and the `USE_TS_LEAVES` /
  `USE_TS_<MODULE>` / `VITE_USE_TS_*` flag family — went with
  `retire-c-engine`. **`npm install` is the entire setup, on any platform**, and
  no native tool is needed for anything. If you find a doc still mentioning one,
  it is stale.
- `npm run dev` — vite dev server.
- `npm run build` — production app build (tsc + vite). Needs no generated input of any kind: the game catalog is committed source (`src/puzzle/catalog-data.ts`), the icons are a committed snapshot, the help pages are committed markdown.
- `npm run preview` — preview production build.
- `npm run check` — biome format + lint with autofix.
- **The app is live at <https://hintful-puzzles.pages.dev>**, on Cloudflare
  Pages, and **nobody deploys it by hand**: `.github/workflows/ci.yml` runs the
  gate on push to `main` and a second job publishes **the gate's own build
  artifact**. A deploy is therefore always a commit that passed the full gate,
  and the bytes that shipped are the bytes that were checked — the deploy job
  downloads, it does not rebuild. Direct upload, deliberately **not** the Pages
  GitHub integration, which cannot wait on a check and would publish exactly
  the commits CI exists to catch.
  - **`_headers` is a real deploy artifact**, read verbatim by Cloudflare and
    carrying the CSP and the whole cache policy. It is **ten rules and must
    stay constant in the size of the catalog** — Cloudflare parses at most 100,
    on every plan and on Workers too, and drops the rest silently, so a rule
    per puzzle would make a parser limit a limit on the number of games. The
    build fails if a future edit reintroduces one. Adding a puzzle must not
    add a header rule.
  - **A build's environment changes its output**, and every variable is
    optional with a working empty state: no `VITE_CANONICAL_BASE_URL` means no
    `sitemap.xml` and no canonical links (`robots.txt` ships either way); no
    `VITE_SENTRY_DSN` means no Sentry origin in the CSP and no client hints.
    They are set on the CI job, not in a committed `.env`.
  - **Verify a deploy against the deployed origin, never against `dist/`.**
    Headers, clean URLs and service-worker scope are all host behavior, and
    each fails invisibly. Note that a browser tab registers **no** service
    worker by design — `settings.allowOfflineUse ?? isRunningAsApp` — so an
    offline check must enable it first or it measures nothing and reports
    health.
- `npm run test` / `npm run test:run` — vitest.
- `npm run probe` — the **local-feedback probe**: plants ~70 hand-chosen real
  defects in engine modules and runs only each module's own tests against them,
  answering *"would the file I am editing tell me I broke it?"*. A diagnostic,
  never a gate and never ratcheted (`npm run metrics` / `npm run mutation` have
  the same standing). `npm run probe -- --verify` is a ~0.2 s anchor check and is
  what to run after touching any of the probed modules; a full run is ~15 min.
  See [`docs/test-strength.md`](docs/test-strength.md) §2a.

Nothing under `src/assets/` is generated — it holds only committed files. `src/assets/icons/` is **committed** as a frozen snapshot of per-puzzle thumbnails; adding a new puzzle requires producing two PNGs by hand (see `openspec/specs/puzzle-icons/spec.md`). `src/asset-integrity.test.ts` asserts every catalog `puzzleId` has both its PNGs (64×64 and 128×128), that every `new URL(<path>, import.meta.url)` reference in `src/` resolves, and that no `.ts` file contains a raw C0 control character — a NUL makes git call the file binary and stop diffing it, which tsc, biome, vitest and `vite build` all pass silently. (`build/` is gone too — `prune-dead-toolchain-leftovers`; `dist/` is the only generated directory anywhere in the tree.)

## Code conventions

- **TypeScript**: strict mode, no `any` (use `unknown` + type guards).
- **Formatter / linter**: Biome (2-space indent, 88 char width).
- **Spelling**: American English, in identifiers, paths, comments, docs and specs — `color`, `center`, `gray`, `neighbor`, `behavior`, `initialize`, `serialize`, `license`, `artifact`. Upstream's C was British by design and the direct parent was American; the platform (`color`, `prefers-color-scheme`, `text-align: center`) is American and cannot be respelled, so only one spelling can be made consistent across the tree. Three things keep their words: the record (`openspec/changes/archive/`, `openspec/postmortems/`), the contents of the notices in `licenses/` and the C under a change's `reference/`, and a quotation of a name this project does not own (`game_colors`, `frontend_default_color`, Sentry's `behavior` option) — each allowed per file in `scripts/checks/spelling-table.mjs`, which is the stem table and the convention's one copy. `scripts/checks/spelling.mjs` is the guard, in the gate's fast prefix; `spelling-fold.mjs` folds stdin, which is how a respelling diff is proved to be nothing else.
- **UI**: Lit web components; explicitly register Web Awesome components by importing them (e.g. `import "@awesome.me/webawesome/dist/components/button/button.js"`).
- **Reactive state**: `@lit-labs/signals`; use `SignalWatcher` mixin where consuming.
- **Persistence**: IndexedDB via Dexie.js (`src/store/db.ts`).
- **WASM**: runs in a web worker, exposed via Comlink (`src/puzzle/`).
- **Styling**: Web Awesome design tokens.
- **`help/`**: every page the app serves, all of it this project's own markdown — site-level pages at the top level, one page per game in `help/games/`. Upstream's *wording* survives in the pages adopted from its overview fragments; what changed is who may fix them, which is a licensing question MIT already answers. A page describing a game this fork changes must be correctable by the change that alters it. (`help/upstream/` is gone — `retire-the-upstream-help-tree`; `/puzzles` before it — `rehome-upstream-help-sources`.)

## Constraints

DO NOT:
- Edit the notices in `licenses/` without cause — they are someone else's words, reproduced verbatim to honor MIT.
- Ship a help page that documents a platform this app is not. That is what got the halibut manual deleted: it told players of this PWA that the collection "deliberately do[es] not ever save information on to the computer", alongside Windows printing and two sections of Unix command-line options.
- Name a new help source directory after a URL subdirectory the build emits pages into. A real directory shadowing a generated page namespace fails `vite build` outright with `EISDIR`. Every source today renders to the top level (`/help/<name>`), which is why `help/games/` is free to be named for what it holds.
- Break Baseline 2023 browser compatibility.
- Use top-level await, dynamic `import()`, or `import.meta` in `src/preflight.ts` — preflight runs on older browsers to gate the rest of the app.
- Add dependencies without considering bundle size and offline (PWA) support.
- Commit generated assets in `dist/`. (`src/assets/icons/` is the exception — it's a committed snapshot maintained per `openspec/specs/puzzle-icons/spec.md`; add the two required PNGs by hand when a new puzzle joins the catalog.)
- Catch unrecoverable errors only to log them — let them propagate so Sentry records them.

DO:
- Test on touch devices and varying screen sizes when changing UI.
- Verify offline functionality still works (PWA / service worker).
- Check changes work with keyboard, mouse, and touch input.
- Consider accessibility.
- Take ownership of everything in this repo. Never describe a problem you observe as "pre-existing", "unrelated", or "out of scope" — that framing assumes a baseline blamelessness this project doesn't grant. If you see it, you own it: either fix it now, file it as a follow-up with a clear handoff, or surface it to the user with a recommendation. The framing matters because "unrelated" is also how a regression you actually caused gets misclassified and shipped.
- **Refactor as you go** (owner directive, 2026-07-14). Whenever you're working near code whose functionality is similar to something elsewhere in the repo, extract/unify it **if you believe the shared shape will stay stable indefinitely, or will need to evolve the same way across multiple games** — don't wait for a defect history to justify it; "makes the codebase noticeably cleaner" is sufficient on its own. The guardrails stay: an exemplar hint never loses a word to an abstraction, game-specific logic is never contorted to fit a contract, and framework-scale pivots still need real downstream pressure (see the scene-graph postmortem). When you evaluate a candidate and decline, record the no-go with its reason (the `unify-hint-framework` archive shows the pattern: `lazyPopulate`/`HintSidecar` extracted; recorder-vocab renaming declined as cosmetic churn with byte-match blast radius). **Extended 2026-08-21 — refactoring is not only extraction**: simplifying by *breaking* an existing assumption counts too, and is often the larger win. See "Nothing is sacred" above for the line between "just do it" and "ask first".
- Don't ask the user "should I continue?" or "want me to commit and move on?" at every checkpoint. Continue by default once a task is complete and the next step is obvious. Reserve `AskUserQuestion` (and inline questions) for *actual decisions* — choices where there's a real trade-off, the course is genuinely unclear, or an action carries non-trivial risk (destructive, irreversible, affects shared state, or could surprise the user). Status pings at every step are friction, not diligence.

## Repo layout

**There is no C anywhere in this repo**, and no `puzzles/` or `/build/`
directory. Two sibling clones hold what upstream material a question might need,
and neither is a place to put our work:

- **`../puzzles/`** — upstream's C, if a question genuinely needs to read it.
- **`../puzzles-web/`** — the pre-fork baseline, useful as a diff reference.

The two experimental C sources kept as *reading* references live with the changes
that read them (`openspec/changes/add-{path,numgame}-ts-port/reference/`), each
with a README stating that it does not compile and is not an oracle. **Don't
recreate a directory named for a source tree that no longer exists** — the name
is a false signal to the next reader even when the contents are legitimate.

The build output is `dist/` (gitignored), and it is the only generated directory
anywhere in the tree.

Source tree under `src/`:

- `src/screens/` — top-level screen components.
- `src/dialogs/` — modal/popover Lit components.
- `src/components/` — reusable leaf Lit components.
- `src/engine/` — the midend, the `Game` interface, the registry, the drawing/color/palette contracts, and the in-process test harness (`engine/testing/`). Mostly a **flat namespace of independent helpers**, deliberately: a grouping that has to be argued for is re-litigated at every addition. Two families are grouped, because their members have no readership apart from each other — `engine/grid/` (the grid builders, geometry, descriptions, trimming and the aperiodic `tilings/`; `grid/index.ts` is the barrel its doc comment tells callers to import from) and `engine/color/` (`colors.ts` the twelve-color palette, `palette.ts` the meanings, `palette-games.ts` the board-relative per-game colors, plus `color-token.ts` and `color-mkhighlight.ts`).
- `src/games/<puzzleId>/` — one directory per game (all 57).
- `src/engine/random/`, `src/engine/combi/` — the two leaf libraries with their own frozen C corpora. `random` is the bit-identical RNG port (`index.ts`, `sha1.ts`, fixtures), kept so shared game IDs reproduce across builds; `combi` is an 81-line combination enumerator with one consumer. Both were top-level `src/native/<module>/` folders until `retire-native-directory`, because the retired bottom-up doctrine gave every ported seam its own folder plus a `bridge.ts` slot for its wasm bridge. They are engine libraries; that category is gone.
- `src/puzzle/` — **two roles, two places** (`group-crowded-source-directories`): the directory root is the main-thread puzzle runtime (`puzzle.ts`, the Comlink `worker.ts` + `worker-adapter.ts`, `drawing.ts`, `engine-surface.ts`, `contexts.ts`, the committed `catalog-data.ts`), and `src/puzzle/components/` holds the nine puzzle-specific Lit components. Their **filenames** dropped the `puzzle-` prefix that only ever repeated the directory name (`components/view.ts`, `components/keys.ts`); their **custom element names did not** — `<puzzle-view>` and friends are the app's DOM vocabulary, used from `templates/*.html.hbs` and every component's templates.
- `src/assets/` (all committed — `icons/` plus a handful of SVGs and `privacy.html`; `manual/` went with `retire-the-upstream-help-tree` and nothing here is generated), `src/css/` (styles), `src/store/` (Dexie schema), `src/utils/` (general-purpose helpers).
- HTML page entries, main bootstrap (`main.ts`), preflight gate (`preflight.ts`), service worker (`sw.ts`), and cross-cutting modules (`routing.ts`, `color-scheme.ts`, `color-scheme-init.ts`, `icons.ts`) live at `src/` root.

## Special files

- `src/puzzle/catalog-data.ts` — the committed game catalog. Adding a game means editing this **and** `src/games/index.ts`; `catalog-registry.test.ts` holds them together.
- `src/puzzle/puzzle.ts`, `src/puzzle/worker.ts` — how the engine is exposed to the rest of the app.
- `templates/index.html.hbs`, `templates/puzzle.html.hbs` — handlebars templates for static page generation (handled by `vite-plugins/extra-pages.ts`).
- `src/preflight.ts` — Baseline 2023 capability checks.
- `src/store/db.ts` — Dexie schema.
- `src/sw.ts` — service worker (Workbox + vite-plugin-pwa).

## Work management

Tracked via **openspec**, pinned as a devDependency at `1.10.0` so the CLI's version is a fact this repo states rather than whatever a laptop happens to have installed. The workflow lives in the `openspec-*` skills it installs (`propose`, `explore`, `apply`, `update`, `sync`, `archive`) and the matching `/opsx:*` commands; the artifacts are unchanged — `proposal.md`, `tasks.md`, optional `design.md`, and spec deltas per affected capability under `openspec/changes/<id>/specs/`. **This `AGENTS.md` is the durable brief**, and `openspec/config.yaml`'s `context:` block points openspec at it rather than restating it — a second copy of the brief is a second thing to keep true, and the `openspec/project.md` it replaced had drifted into describing directories that no longer exist. The authoritative migration approach is the `ts-migration` capability spec. Change-scoped tasks live in `openspec/changes/`.

*There is no `openspec/OPENSPEC_AGENTS.md` any more, and no rename dance.* Versions before 1.0 generated an `openspec/AGENTS.md` that collided with this project's own, so it was renamed on every `openspec update` and a managed block in this file pointed at the renamed copy. 1.x stops generating it — the instructions ship as skills — so the collision, the rename and the managed block are all gone. That closes a "Known unresolved question" by removal rather than by the configurable filename it was hoping for.

**A decision or a follow-up is persisted by committing it to this repo, or it
did not happen.** Saying it in a reply, noting what you would "want to carry
into the next session", or filing it in an agent's own memory are all the same
thing: a wish. The next session starts from the repo. So a follow-up you found
becomes a scaffolded change under `openspec/changes/`, a rule you established
goes in this file in the present tense, and a *how* goes in the relevant
`docs/games/` guide — before the session ends, in a commit. **If it is not worth
a commit, it was not worth reporting as a finding**; say plainly that you
looked and found nothing, which is a result, rather than leaving a hint that
someone else is supposed to act on.

Two corollaries. **Verify a follow-up before filing one** — an audit proposed on
an unchecked suspicion costs the next reader a full investigation to discover
there was no defect, and this repo has produced a fictional three-game defect
from exactly that (see "A scan that keys on a name"). And **never cite an
agent-private note to the owner**: they cannot read it, and referring to one as
though it were a shared artifact misreports the work as tracked when it is not.

**One openspec change per coherent unit of work** — the TS midend is one change; each game port is one change; a cross-game feature (quick-save) is one change. Bundle only when several items share genuinely identical `design.md` reasoning (e.g. three trivially-similar small games after the pattern is well-trodden); keep separate when an item has its own non-obvious decisions. A game port that ships its C deletion does both in the one change.

**Don't wait for proposal approval before implementing.** openspec's generic workflow has an approval gate between proposal and implementation; in this project that gate is **off by default**. Scaffold the change, then keep going into the implementation in the same session.

**And don't ask to have your own work accepted.** Owner directive: *"there's no need to ask me to accept spec changes that I didn't actually create myself — if the spec itself is an implementation detail that you decided upon, then there's no need for me to go through accepting it, just archive it with the same self-driven initiative that you created it with."* A change you scoped, decided and implemented is yours to finish: implement it, verify it, commit it and **archive it**, in the one session, without a checkpoint.

Acceptance is for work whose *correctness the owner is the only judge of* — which is a narrow, concrete set, not a vibe:

- **Anything a player sees or feels.** How a game plays, renders, animates or responds to input; wording a player reads; a hint's explanation. This is the "Acceptance bar" section above, and it is unchanged.

  **But player-visible does not automatically mean "stop and ask"** (owner, 2026-09-06): *"I'd prefer to do acceptance testing only on any particular pieces, where you're genuinely unsure what's better."* A refactor that unifies a behavior the collection was inconsistent about is still yours to decide when one answer is plainly better — make the call, say what you decided and why, and run the app yourself. **What earns the owner's time is genuine uncertainty**, not the player-visible label. This is a refinement of the bullet, not a hole in it: still run the app, still never call a shortfall cosmetic, and still ask *before* for anything that breaks a player's data.

  During a run of framework refactoring the owner may also defer testing to the end of the arc rather than per change. Take that as said only when it is said.
- **Anything the owner asked for by name.** If they described the outcome, they decide whether you hit it.
- **Anything that breaks compatibility with data a player already has** — save formats, preference keys, shared game IDs. Ask *before*, with the cost stated, not after.

Everything else — an internal contract, a helper's shape, a test harness, a doc restructure, a spec requirement recording a decision you made and can defend — is an implementation detail wearing a spec's clothing. **Archiving it yourself is not a shortcut; asking is the error**, because it converts a decision you already own into a queue item on someone else's desk.

Stop and ask only for a **genuinely difficult decision**: a real trade-off with no clear winner, an ambiguity where two readings produce materially different work, or something irreversible/user-visible (dropping save compatibility, changing a shipped format). A design decision that the C survey already determines is not a difficult decision — write it down in `design.md` and implement it. Surfacing a settled call as a question is the friction this directive exists to remove.

**`ADDED`, `MODIFIED`, `REMOVED` and `RENAMED` are all available, and the tool keeps `MODIFIED` honest.** A `MODIFIED` delta replaces the whole requirement at archive time, so it must reproduce every scenario that survives — and `openspec validate` reports a delta that omits one *at authoring time*, naming the scenarios to copy back, while `openspec archive` refuses to apply it. The commit gate runs `openspec validate --all --strict`, so a stale delta blocks a commit rather than surfacing at archive. **Prefer `ADDED` when the change adds a concern rather than altering an existing rule** — upstream advises it, it cannot delete anything, and it is usually the honest shape anyway.

**The one hazard the tool cannot see: a delta can be faithful to the wrong original.** `add-slide-keyboard-control` modified "Slide input, movement and completion" while its prose announced removing a sentence that lives in "Slide game implements the Game interface" — archiving it would have published a spec declaring a keyboard player's exclusion removed while leaving it in force one requirement above. Both requirements were scenario-complete, so no scenario-survival check on either side could catch it. **Before writing a `MODIFIED` block, grep the live spec for the sentence you mean to change and confirm which requirement holds it.**

*Why the gate carries a version floor:* below openspec **1.6.0** the archiver applies a stale `MODIFIED` copy unconditionally, which once deleted 134 lines of a live requirement here; **1.8.0** is where `validate` reports it at authoring time. `scripts/checks/openspec-version.mjs` enforces the floor and reads it from `package.json`, so the pin and the floor are one number. **An unpinned tool makes "has this been fixed upstream?" unanswerable from inside the repo** — see "Method" on checking a dependency's version before building around its behavior.

Two smaller notes: `openspec validate` reads a requirement's **first line** as its text, so a `SHALL` on the second line reads as none; and a tool must never write into a change directory, because `openspec archive` renames it (see the `npm run diff` ENOENT in `group-crowded-source-directories`).

## Traps that catch new game work

- **A desc that changes mid-game** is a supported feature, not a hazard:
  `Game.supersededDesc(state)`. The engine **pulls** the desc from state after
  every committed move, so `executeMove` stays pure; `null` means "nothing to
  say" and never "revert"; an optional `privDesc` is what a save rebuilds state 0
  from; restart rebuilds from the public desc. Exemplar: `src/games/mines/`, plus
  `desc-supersede.test.ts`.
- **Suppress a no-op move locally, in `interpretMove`** — out-of-grid, gutter,
  already-in-that-state — and return `null`, exactly as Galaxies does. That is
  the whole technique. **Never reach for `Object.is` or a deep compare on state**
  to ask "did this move change anything?"; no game needs it, and re-deriving the
  local predicate is always the answer.
- **Don't map editor-only move letters from input.** Upstream guards them behind
  `#ifdef EDITOR`; a port simply doesn't wire them. Say so in the port's
  `design.md` so it isn't re-decided each time.
- **Printing has no implementation here.** A "print this puzzle" cross-game
  feature would need one written from scratch — don't promise it without
  designing it.

## Known unresolved questions

- **Whether the Web Worker still earns its place.** It exists to keep heavy WASM
  off the main thread, and there is no WASM. Light TS games may not need it; the
  `ts-migration` spec flags the re-evaluation.
- **Whether any single game warrants a stricter, corpus-like differential.** A
  generator with brutal uniqueness constraints might. A per-game tightening
  option, never a global default.

## License & attribution

- **Web app code**: MIT (`LICENSE.md`).
- **Upstream puzzles**: MIT (`licenses/sgt-puzzles-LICENSE`) — kept byte-identical. Satisfies MIT's "include in all copies" obligation. Lennard Sprong's `puzzles-unreleased`, the source of thirteen games, is `licenses/puzzles-unreleased-LICENSE` (identical text today; kept as its own file because it is a second project's notice). Both are `?raw`-imported by the About dialog, so moving one without repointing that import breaks the production build.
- **Top-level `LICENSE.md`** carries a layered MIT notice crediting, in chronological order: Simon Tatham + upstream contributors (deferring to `licenses/sgt-puzzles-LICENSE` for the full list), Lennard Sprong (puzzles-unreleased), Mike Edmunds (puzzles-web), Yoni Lavi (this project). Single MIT body covers all four.
- **`CREDITS.md`** is the graceful gesture with explicit thanks and links to upstream, puzzles-unreleased and puzzles-web. Legal compliance is satisfied by the layered MIT notice alone.

## Documentation

The in-app help system is assembled from two sources, **both under `help/`**, both this project's own markdown:
- `help/*.md` — site-level pages (this fork's features, differences, install, the puzzle index).
- `help/games/<puzzleId>.md` — one page per game, all 57, rendered to `/help/<puzzleId>.html`.

**Never split help by authorship.** A page the app serves is a build input this
project owns, whoever originally wrote the words, and a page describing a game
this fork deliberately changes has to be correctable by the change that alters
it. `src/help-coverage.test.ts` holds the directory and the catalog to each other
in **both** directions — one direction alone once hid a game with no help page at
all.

**A game's help page names every mode its ‘Type’ menu offers.** The 43 pages
adopted from upstream were its *short* overview fragments, and a fragment
describes the game's headline rule only — upstream put the rest in the halibut
manual, which documented a different program and is gone. So Unequal's page
explained `<` signs and never mentioned Adjacent, a mode sitting in three of its
twelve presets. An omission inherited from a fragment is ours to fix; "keeps
upstream's wording" protects the words that are there, not the ones that never
were.

**Do not try to guard this by sweeping preset-title vocabulary against the
page.** It was measured: filtering out sizes and tier names still flags 18 games
— Loopy's fifteen grid names, Cube's solids, Pegs' board shapes, "free ends",
"multiplication only" — for the one real gap, and nothing mechanically separates
a rule mode from a board shape without a manifest. Cube's page passes on the
merits while failing the sweep, because it says "other regular solids" rather
than "Octahedron". Read the presets menus instead; 57 of them is a readable
population, and reading them is what found the one.

Update `/help` when adding features that diverge from upstream.

## Git

- Main branch: `main`.
- **This is the one place the gate's steps are written out.** `scripts/gate.sh` is the executable definition — `.husky/pre-commit` and `npm run gate` both run it, so they cannot drift — and this list exists because the *rationale* per step is worth reading. Everywhere else in the tree says "the gate" and links here. It was five transcriptions once, no two agreeing, all five naming a compiler the gate had stopped running a month earlier (`state-the-gate-steps-once`); a sequence with one executable definition does not get five prose ones.

  In order, blocking on any failure — `npm run gate` runs the lot, `npm run typecheck` runs just the two `tsgo` passes:

  1. **`tsgo -b --noEmit`** — the browser project. `tsgo` (`@typescript/native-preview`), **not** `tsc`: it checks this tree in ~2.5 s against ~13 s, and the same binary backs the editor/agent language server, so the gate and the LSP agree on what a type error is. `typescript` 5.x is still installed for the ten packages needing its programmatic API.
  2. **`tsgo --noEmit -p tsconfig.node.json`** — the build-side project (`vite.config.ts`, `vitest.config.ts`, `vite-plugins/`, `scripts/checks/`). Separate because it runs in Node while `tsconfig.json` is deliberately browser-shaped. Not optional: the file that renders every help page went unchecked while it sat outside `include`.
  3. **biome** — the read-only form of `biome check` (lint rules, formatting, **and** import order — so a lint-clean-but-unformatted file can't land and re-open the drift that once made `npm run check` reformat ~150 untouched files). It is **scoped by role**: the per-commit hook checks only the *staged* files (`biome check --staged`, via `GATE_BIOME_STAGED=1`), while CI and a manual `npm run gate` check the *whole tree* (`biome ci .`) as the backstop for `--no-verify` bypasses and biome-upgrade restyles. `npm run check` remains the fixer.
  4. **`scripts/feedback-probe.mjs --verify`** (0.02 s) — the probe anchor. Fails when a refactor moves a line the local-feedback corpus quotes as an anchor; otherwise the harness measures a smaller corpus and *reports success*. Only that the corpus **applies** is gated; its rate never is.
  5. **`scripts/checks/spelling.mjs`** — American English, every tracked file outside the record and other people's words.
  6. **`scripts/checks/engine-catalog.mjs`** — every shared engine module is named in `docs/games/engine-catalog.md`. Five had gone uncataloged before this ran.
  7. **`scripts/checks/change-citations.mjs`** — a change id cited in `docs/` or `AGENTS.md` still resolves to an open change, an archive entry or a postmortem.
  8. **`scripts/checks/openspec-version.mjs`**, then **`openspec validate --all --strict`** — the version floor is load-bearing, not hygiene: below openspec 1.6.0 the archiver applies a stale `MODIFIED` delta silently, which once cost 134 lines of a live requirement.
  9. **`vitest run`** alongside **`vite build`**. They share no inputs or outputs, so they run concurrently and the gate's wall clock is ~max of the two. `vite build` is in the gate because nothing above it exercises the production build, and two prod-only breakages once sat undetected on `main`; it needs no generated assets (the catalog is committed source since `retire-c-engine`).

  **Steps 5–7 sit ahead of the documentation-only shortcut deliberately** — they read `docs/` and `AGENTS.md`, a change to those is exactly what the shortcut skips vitest for, and `src/gate-scope.test.ts` forbids a *test* from reading those roots at all (which is what keeps the shortcut safe). That is why they are node scripts rather than vitest files.

  **Two scopings by role, both narrowing what a *commit* costs and never what protects the branch**: biome (staged in the hook, whole tree in CI) and the heavy branches (the hook may take the documentation-only shortcut, or run only the tests `scripts/checks/select-tests.mjs` selects; CI and a manual `npm run gate` always run everything). See `.husky/pre-commit`.

[sgt-puzzles]: https://git.tartarus.org/?p=simon/puzzles.git
[medmunds/puzzles-web]: https://github.com/medmunds/puzzles-web
