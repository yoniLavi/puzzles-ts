# Testing a game

> How a game change is *verified*: which tier a test belongs in, what a new
> game must ship, what the frozen differentials still guarantee now that the C
> build is gone, and the rules that keep the suite deterministic and the gate
> affordable. **Writing tests is here; *assessing* them is
> [`docs/test-strength.md`](../test-strength.md)** — the five-minute mutation
> probe, `npm run probe`, and the instrument traps that make an assessment lie.
>
> Authoritative specs: [`repo-layout`](../../openspec/specs/repo-layout/spec.md)
> (the in-process tiers, the render harness, determinism under load, the
> differential helper) ·
> [`ts-migration`](../../openspec/specs/ts-migration/spec.md) (test discipline).
> Neighboring guides: [`rendering.md`](./rendering.md) (what to draw),
> [`hints.md`](./hints.md) (hint verification recipe),
> [`solver-and-generator.md`](./solver-and-generator.md) (when to diverge from a
> fixture, and what replaces it).

## The test tiers

**Reach for the lowest tier that fits; Playwright is visual/integration smoke
only.** The tiers are codified in the
[`repo-layout`](../../openspec/specs/repo-layout/spec.md) spec; in brief:

- **Tier 1** — pure logic (`Game` impl, solver, generator, codecs). Default
  `node` environment, no setup.
- **Tier 2** — render ops: drive `redraw` against the shared recording
  `GameDrawing` double and assert draw calls. Still `node`.
- **Tier 2.5** — render scenarios + snapshots via
  [`src/engine/testing/`](../../src/engine/testing/): a real `Midend` driven to
  a target frame. **New render code SHOULD ship one** (see below).
- **Tier 3** — components + persistence: opt a file into `happy-dom` for Lit
  components, import `src/test-setup/indexeddb.ts` for Dexie round-trips.

**A test that needs a specific board should find it deterministically, not by
scanning further.** The idiom for reaching a specific deduction or board state
without knowing its desc is a fixed-seed scan — loop ids, keep the first whose
state matches — pinned by a recorded first-hit (see "Right-sizing the gate").

**A game's own directory is not its coverage.** Its input paths, save
round-trip, params codec and even its source text (color literals, hint
wording, note vocabulary) are checked by cross-game guards that live outside
`src/games/`, so `vitest run src/games/<game>` can be green on a change the
commit hook then refuses. The hook's own list is
`node scripts/checks/select-tests.mjs` over what is staged; the guards name
their per-game cases after the game or its file path, so filter the list with
`-t <game>` and check the count is not zero. Pass the list through `xargs`:
zsh does not word-split an unquoted `$VAR`, and `vitest run $LIST` then finds
no tests at all.

## Render scenarios

**The default for any highlight / overlay / animation-frame work.**
[`render-scenario.ts`](../../src/engine/testing/render-scenario.ts) exposes
`renderScenario({ game, id, moves?, presses?, at?, settle?, showHint?,
hintUntil?, showMistakes? })`: it drives a real `Midend` to a target frame by
replaying game `Move`s directly (no pointer events, no coordinate maths),
optionally walks a hint plan to the step of interest, then captures `redraw`
through the shared
[`recording-drawing.ts`](../../src/engine/testing/recording-drawing.ts).

- **Assert what matters with targeted op checks** — these are the real
  guarantee.
- **Add `toMatchSnapshot` on the record** to catch unintended drift; a render
  regression is then a reviewable text diff. Re-baseline an intended change
  with `vitest -u` and **commit the regenerated `__snapshots__/*.snap`**. Pair
  every snapshot with targeted assertions so a careless `-u` can't erase the
  guarantee.
- **`toSvg(ops, size)`**
  ([`svg-drawing.ts`](../../src/engine/testing/svg-drawing.ts)) renders the
  record as a z-ordered SVG for the rare frame that needs eyeballing — keep it
  out of committed tests.

**`moves` reaches a board state; `presses` reaches a `Ui` state.** `moves` stays
the default — no coordinates, nothing a layout change can break. But a keyboard
cursor lives on the `Ui`, so **no `Move` can put it anywhere**, and "the frame
after one arrow press" was a frame this harness could not reach at all until
`presses` (a list of buttons sent through `Midend.processInput`, at `at`,
default the origin — a keyboard press ignores the coordinates). Pointer buttons
work through it too; prefer `moves` for those unless the *coordinates* are what
is under test. Exemplar: `tracks-render-scenario.test.ts`'s cursor frame.

**On an animated game, `moves` lands you on animation frame *zero*, not the
settled frame.** The move armed an animation, so the previous state is still on
screen, and anything drawn only once the move has landed (Inertia's dead-player
splat) is absent from the capture. Pass `settle: true` to run the
animation/flash clock out first. Asserting both frames from the same `moves` is
the cheap way to pin an animation's endpoints, and costs one extra scenario
call.

Seed exemplar:
[`palisade-render-scenario.test.ts`](../../src/games/palisade/palisade-render-scenario.test.ts)
— reaches a mid-plan hint frame in-process that no browser harness could.

## Render-op vocabulary

**Know which primitive records as which op, or your assertion silently never
matches.** The shared `RecordingDrawing` records a *filled* `drawRect` as
`op === "rect"`, but `drawRectOutline` — a stroked box: hint ring, error
outline, cursor frame — records as `op === "line"` segments. A test checking a
ring color must match `"line"`, not `"rect"` (asserting Range's premise ring
cost a debug cycle on exactly this). A `drawCircle` records with
`fill`/`outline` fields, **not** `color` — matching
`o.op === "circle" && o.color === …` type-errors and always misses (Light Up's
bulb assertions hit this). Prefer the shared recorder over ad-hoc doubles — a
local recorder that names ops differently is a second vocabulary to misremember.

**An op carries both forms of its color**: `op.color` is the palette index
the game passed; `op.rgb` the resolved `"rgb(r, g, b)"` label. Assert against
the game's own constant (`o.color === COL_HINT`); the resolved label exists so
a *snapshot* diff stays readable when a palette index moves, not for tests to
match on. Narrowing note: `DrawOp` is a discriminated union, so a chained
`.filter(o => o.op === "rect").filter(o => o.w …)` doesn't narrow — put the
whole predicate in one `filter`, or write a type guard.

## What a new game ships

**A new game has no oracle; its assurance is behavioral, and the standard
floor is a generation-invariant property test**: every generated board is
uniquely solvable at *exactly* its stated difficulty, across a fixed-seed
sweep. `scripts/new-game-port.sh` scaffolds a `<game>-generation.test.ts` stub
for exactly this (the scaffold deliberately emits no differential stub — see
the [`repo-layout`](../../openspec/specs/repo-layout/spec.md) scaffolding
requirement). Beyond that floor:

- Tier-1 behavioral tests: input→move mapping, `executeMove` purity,
  serialize/deserialize round-trips, completion detection.
- A tier-2.5 scenario for anything the game renders beyond plain tiles.
- Property tests wherever a closed-form invariant exists — cheap, additive,
  and they catch inputs no fixture recorded.

**Drive `executeMove` to completion in a unit test — no differential exercises
the interactive completion path.** A generator/solver check runs the solver's
verdict-only completion; the *interactive* completion path (error marking,
loop/path marking, flash labeling) is different code. Tracks shipped an
infinite loop confined to it: the connectivity `Dsf` build dropped an in-grid
guard, an out-of-bounds merge corrupted the union-find, and `canonify` hung —
behind a green 22-fixture differential. It surfaced only when a
`solve()` → `executeMove` → completed unit test hung. Always pair generation
checks with a tier-1 test that plays a move (or the solve move) through to a
completed board. Exemplar: [`tracks.test.ts`](../../src/games/tracks/tracks.test.ts).

## The frozen differentials

**48 games carry `<game>-differential.test.ts` against a frozen
`__fixtures__/*.json` recorded from the C build before `retire-c-engine`
(2026-08-01). The fixtures cannot be regenerated — ever — and that is by
decision, not accident.** There is no C build to ask "what would upstream have
produced?", so a deliberate divergence *retires or re-founds* its fixture
rather than re-recording it. What a fixture still does, and why all are kept:
**it is the net under refactoring**. A change that alters a solver's verdict
alters which boards exist, which is exactly what these catch — nothing else in
the suite would notice a solver that got quietly stronger.

The full statement lives once, in
[`differential.ts`](../../src/engine/testing/differential.ts) (the shared
helper's header), per the `repo-layout` requirement — **a differential test
file must not carry a regeneration recipe, because none can be executed.**

Two shapes, both live:

- **Byte-for-byte desc match** — a faithful generator over the bit-identical
  RNG reproduces the C desc exactly for the same seed. Don't re-roll the loop:
  call `describeDescDifferential` with your fixtures, a params mapper, your
  `newDesc`, and an optional `extra` follow-on (e.g. `validateDesc` returns
  null). Exemplar:
  [`unruly-differential.test.ts`](../../src/games/unruly/unruly-differential.test.ts).
- **Solver-agreement** — decode a recorded board, run the TS solver, assert
  the recorded difficulty verdict. Game-specific; stays inline. Exemplar:
  [`galaxies-differential.test.ts`](../../src/games/galaxies/galaxies-differential.test.ts).

**Not every game carries one, and that is a recorded decision, not a gap.**
Permutation / short-RNG games get their RNG-faithfulness transitively from
`random.ts`'s own corpus; each such skip is stated in that port's `design.md`.
Likewise finding no advisory `scripts/diff-*.test.ts` anywhere is expected —
that lifecycle is over (next section).

## Fixture lifecycle

**A differential had two lifecycles, and only one survives.** The gated,
committed, frozen-fixture test is the durable form. The advisory
`scripts/diff-<game>.test.ts` form earned its keep only while it shelled a live
C trace binary; the binaries, harnesses and build all went with
`retire-c-engine`, and every advisory script was deleted with its game's `.c` —
leaving one intact vestige, `npm run diff`, which no-ops (`--passWithNoTests`)
and exists for any future advisory-style check. **The trap this lifecycle rule
guards: a check that can no longer run its real comparison but still sits in
the tree reads as coverage while measuring nothing.** If you ever find an
advisory script that only re-reads the frozen fixture the gated test already
reads, delete it.

Historical residue worth knowing: some fixtures carry a `"genMs"` field — the
C's own wall-clock per board, recorded at capture time. It is evidence, not an
assertion (a wall-clock assertion measures the box, not the code): it settled
"is the port slow?" for Seismic by showing the C slower than the TS on the same
seed. The capture recipes themselves (`<game>-trace.c`, the pure-C build flag
dance) are in git history only — `git log --all -- 'puzzles/**'`.

## Byte-match: fidelity where there is a right answer

**Compressed history with a live core.** Byte-match was the porting era's
verification mechanism: on a solver-gated generator the desc depends on the
solver's verdict on every intermediate board, so one byte-match assertion
validated generator, solver and codec at once. The owner released the
constraint when porting finished — matching the C is no longer a reason not to
improve a game (the divergence policy and what must replace a retired oracle
live in [`solver-and-generator.md`](./solver-and-generator.md)). What stays
live here:

- **A byte-match proves a substitution changed no behavior — which makes it
  the safest possible ground for optimization.** Slide's key-encoding rewrite
  (35% of generation time → a hash + exact compare, 3.4× faster) was provable
  precisely because the differential pinned the output. When an optimization
  looks risky, check whether a fixture already pins its observable output.
- **Try to keep both.** Spokes ships a corrected difficulty-acceptance check
  *and* retains upstream's original one, reachable by the differential alone —
  fixtures still byte-match the old path while players get better boards.
  Reach for that shape before retiring a fixture (`spokes` spec, "grades its
  difficulty tiers honestly").
- **RNG draws are observable side effects.** A generator loop that *rejects* a
  candidate has already spent its draws; "pick only legal candidates in the
  first place" silently diverges the stream. Tell: a C-style loop whose counter
  increments conditionally, or any draw skipped "because n === 1". This governs
  refactors of any fixture-pinned generator today, including the RNG-bearing
  leaf libraries (`latin.ts`'s `matching`, `loopgen.ts`, `laydomino.ts`) — a
  fixture-pinned game's generator is byte-sensitive *through* them.
- **A recorded artifact with no right answer is a yardstick, not an answer
  key.** Inertia's recorded C solver routes stopped being a byte-match target
  (an approximate optimizer has many equally good outputs, and a byte-match
  welds the port to C's shape and forbids improvement) and became a quality
  bar: the test asserts the TS route is legal, complete, and **no longer than
  C's** — a regression bar a byte-match could never give, since a byte-match is
  equally satisfied by faithfully reproducing a bad answer. Exemplar:
  [`inertia-differential.test.ts`](../../src/games/inertia/inertia-differential.test.ts).
- **Read what the reader accepts before deciding what a writer owes it.** Two
  codec lessons that generalize: an encoder that never flushes its trailing run
  is a *format*, not a bug — "completing" it diverges every desc (Boats); and a
  writer can emit what its own reader mis-parses, in which case the undefined
  range is free to fix — validate the fix by round-tripping through a decoder
  written strictly to the *reading* rules, never encoder-vs-own-decoder
  (Seismic, [`seismic/state.ts`](../../src/games/seismic/state.ts)
  `encodeWalls`).
- **A sort that feeds only rendering does not threaten a fixture.** Only sorts
  and draws on the path that produces the desc matter; trace whether the result
  reaches the desc byte-stream before treating a `.sort()` as byte-match
  surface.

## Order-independent verdicts

**When a generator's output was never reproducible byte-for-byte (upstream
sorted with `qsort`, whose tie-order is implementation-defined), its fixture
records only verdicts that are provably independent of the ambient order** —
for Undead: uniquely solvable, iterative-solver-solved, post-fixpoint ambiguity
count, brute-force outcome. An order-*dependent* quantity ("passes to
fixpoint") is deliberately not recorded. The TS test decodes the same descs and
asserts its solver reaches identical verdicts — validating solver + codec
where the generator cannot be pinned. Exemplar:
[`undead-differential.test.ts`](../../src/games/undead/undead-differential.test.ts)
and its design D1. When asserting against such a fixture, keep the
order-independence argument in the test — it is the load-bearing part.

## Quirks are load-bearing — capped, not cleaned

**A preserved upstream quirk is part of which boards exist; a hygiene "fix"
diverges the fixture.** But a quirk whose safety depends on an unproven
invariant gets a belt: port the quirk faithfully *and* wrap the loop in a
generous throw-on-exceeded cap, so a faithful port stays correct while an
accidental divergence fails loudly instead of hanging (Singles'
`MAX_REGENERATE`; the shared form is
[`retry-limit.ts`](../../src/engine/retry-limit.ts)). The same shape guards
every generate-until-success loop, quirk or not.

## When a fixture goes red

**A red differential after a refactor means the set of boards that exist
changed — treat the fixture as the instrument and your change as the suspect.**
The debugging loop, retold for the post-C world: find the first fixture that
mismatches; if the game records intermediate verdicts, binary-search for the
first board whose solver verdict moved; toggle techniques off one at a time to
isolate which got stronger or weaker; then diff that technique against its
pre-change self. Two gotchas that have burned real time:

- **A sentinel imported from the wrong module reads as `undefined`** and
  silently weakens a `diff >= X` gate — a Tricky board "fails to solve" with no
  type error. When a difficulty-sentinel test misbehaves, check the import
  source before the solver.
- **Beware translated C loops whose increment clause had side effects** — an
  original `for (…; …; ++j, board[i] = 1)` also ran its side effect after the
  final iteration; a naive translation won't. If a fixpoint refactor touches
  such a site (they are commented at the sites that survived porting), the
  after-last-iteration effect is part of the behavior.

If the change is a *deliberate* divergence, the fixture is retired or
re-founded — never hand-edited to pass; see
[`solver-and-generator.md`](./solver-and-generator.md) for the policy and the
required replacement assurance.

## Seed-deterministic, never clock-gated

**A heavy test's work must be identical every run; only the clock may move.**
A retry-until-unique generation or an exhaustive solve legitimately takes 1–3 s
solo and stretches 5–10× under full-suite CPU saturation. Rules, all learned by
violating them:

- **Drive generation from a fixed seed** (`randomNew("…")`) so the work and
  the verdict are load-independent.
- **Never give a test its own timeout.** There is exactly one ceiling,
  `testTimeout` in [`vitest.config.ts`](../../vitest.config.ts), and it is a
  runaway backstop, not a gate. A per-test ceiling is a guess about contention:
  it can only be tighter than the global one, and it must be re-guessed forever
  (one game's went 30 s → 60 s → 120 s and still failed a green commit).
- **Never assert `elapsed < N ms`** as a proxy for "the algorithm is
  efficient" — that measures the box's spare capacity. Assert a
  load-independent proxy instead: a bounded expansion count, iteration count,
  or result shape.
- **A hang is not a slow test, and a timeout was never going to catch one.**
  These tests are synchronous; a runaway loop blocks the event loop, so the
  timeout's timer cannot fire (the same mechanism that orphans vitest workers —
  [`reap-orphaned-workers.sh`](../../scripts/reap-orphaned-workers.sh)). Bound
  non-termination **in the code**: [`step-budget.ts`](../../src/engine/step-budget.ts)
  for solver/hint fixpoints, [`retry-limit.ts`](../../src/engine/retry-limit.ts)
  for retries — opt-in/gated so a false trip can't hit the production hot path.
- **Don't judge a generator's real cost from a vitest run.** The vitest module
  runner plus suite contention has shown a ~7× gap against a plain `node`
  process on the same seeds. Re-measure outside the runner before designing a
  fix for a "slow" generator.

Normative: the `repo-layout` "deterministic under parallel load" requirement.
"Contention on work that terminates" is a complete diagnosis and its fix is
removing the clock gate — reach for the other causes (shared state, order
dependence, non-termination) only when evidence points there; re-run the file
alone, then the suite under `--sequence.shuffle.files=true` to localize a
cross-file leak.

## Right-sizing the gate

**The gate is paid on every commit; keep each test's cost proportional to what
it catches.** Three treatments, in order of how little they lose:

1. **Short-circuit a deterministic search.** A "scan seeds until a board shows
   technique X" loop finds the same hit every time — record the first find and
   start there, falling back to the full scan if the pin goes stale (never
   failing on it). Loses nothing: see `FIRST_FOUND_AT` in
   [`boats-hint.test.ts`](../../src/games/boats/boats-hint.test.ts), 63 s → 6.4 s.
2. **Turn a seed count down** with `seedBudget(gate, full)`
   ([`slow.ts`](../../src/engine/testing/slow.ts)) — only for a property whose
   violation would be *systematic*, and say at the call site how many
   assertions the reduced count still executes.
3. **Defer to `npm run test:slow`** (`slow: true` on `describeDescDifferential`,
   or `describeSlow`/`itSlow`) — only where the cost is board **size** rather
   than configuration. **Never defer the only fixture covering a
   configuration**, and state what still covers it. The slow tier runs once per
   refactoring round; a tier nobody runs is worse than a deleted test, because
   the file still reads as coverage.

**Run the slow tier targeted, not whole.** `npm run test:slow` re-runs all
~8,500 gate tests *as well*, with the widened seed budgets on top; the deferred
tier itself is six tests in three files. Pass a path and the script forwards it
to vitest — `npm run test:slow -- src/games/seismic`,
`npm run test:slow -- src/engine/hint-resume.test.ts`. That is the form to reach
for when a refactor moves a solver, a generator or a hint planner: run the slow
tier for the games it could have moved, when you move them.

### Where the cost actually is — measured 2026-09-09, so you need not re-derive it

`retire-tests-that-do-not-earn-their-runtime` ranked all 301 test files. Two
results are worth not rediscovering:

- **The frozen differentials are not the expense.** 50 files, **10.1%** of suite
  time; the heaviest single one is 11.5 s CPU. Keeping every one of them is
  cheap, so the question "can we afford the differential corpus?" has an answer
  and it is yes. They stay — see [The frozen differentials](#the-frozen-differentials)
  for why they are worth keeping on the merits.
- **The expense is search-based hints amplified by the cross-game guards.**
  Attributing each guard's per-game case to the game it names: Sixteen **30%**,
  Netslide **13%**, Spokes 8.5% — half the suite in three games. A hint that
  *searches* pays for board size twice over (one full search per move, and more
  moves to make), and the guards recompute a hint after every move. So the axis
  to slice for those games is **board size**, and `SEARCH_PLANNING_GAMES`
  ([`hint-games.ts`](../../src/engine/testing/hint-games.ts)) derives the
  population from each game's own source rather than listing it.

**Attribute cost per game, not per directory.** Ranking by file reports
`hint-resume.test.ts` and `hint-quality.test.ts` as undifferentiated "engine"
cost and hides which game makes them expensive — Sixteen reads as 17% by
directory and 30% once its cases inside the cross-game guards are counted. The
per-game `it` title is the join key; this is `AGENTS.md` § "A scan that keys on a
name" aimed at a cost model.

**Don't reach for "run only the affected tests".** It was measured
(`measure-test-impact-selection`, 2026-09-09) and it does not work here.
`vitest related` walks the static import graph, but 26 test files reach their
subjects through `import.meta.glob(..., "?raw")` — reading game source as *text*,
because a cross-game guard derives its population from what a game **is**. A
file read as text forms no import edge, so a game change omits five glob-only
guards and a `help/` change selects **nothing at all**. The rule that makes the
guards impossible to forget is what makes them invisible to the graph.

**Measure CPU rather than wall — and check what the box is short of first.**
Contention inflates wall several-fold and unevenly (5.2× on one file, 1.6× on
another in the same run), so even the *ranking* distorts. `/usr/bin/time`'s
`user + sys` is the better instrument but **not an immune one**: two untouched
files re-measured at 22.4 s and 14.8 s against 40.5 s and 25.2 s — inflation of
**1.7–1.8×**.

The reason is worth carrying, because it caught three instruments in a row.
**This box has 16 GB of RAM and sits ~24 GB into swap**, so the scarce resource
is memory, not cores; under paging `sys` time *is* page-fault time, and
`user + sys` therefore re-imports the contention that switching off wall clock
was meant to escape. Record free memory and swap beside the load average, treat
any figure taken under paging as an upper bound, and trust **ratios taken under
comparable conditions** rather than absolute seconds.

## Break the code under a new test

**Writing a test is not the same as the test working — flip the line it is
for, watch it go red, put it back.** This applies double to a test you just
made cheaper: the failure mode optimization causes is a test that still passes
and no longer catches anything. `wires.test.ts`'s both-sides check passed with
the checked code *deleted*, because its chosen case was caught by an unrelated
guard. Seconds of work; it is the only thing distinguishing an assertion from a
decoration. (The systematic version of this instinct is the mutation probe —
[`docs/test-strength.md`](../test-strength.md).)

## A shared module needs its own tests

**Extracting logic from a game into `src/engine/` moves the code but not its
tests** — the game's frozen differential still catches a defect in the shared
module, so nothing goes red and the module quietly ends up with no local
assertions. That is adequate *protection* but poor *feedback*: the failure
arrives as a differing desc string after a full generate-and-compare, not as a
named rule in 100 ms, and it is invisible to the run-just-what-I-touched habit.
**When you extract, write the extracted module's tests in the same change**,
stating the rules its doc comment claims rather than pinning values. Exemplar:
[`wires.test.ts`](../../src/engine/wires.test.ts).

## Enrollment duties

**The cross-game guards derive their populations mechanically; a game enrolls
by declaring, not by being remembered.**

- **Hints**: **declaring `hint()` *is* the enrollment.**
  [`hint-games.ts`](../../src/engine/testing/hint-games.ts) filters the registry
  for games that declare one, so a game is covered by all six guards at once —
  `hint-resume.test.ts` (plans resume from any position),
  `hint-overlay.test.ts` (the overlay reaches the render cache),
  `hint-quality.test.ts` (narration form), `hint-mark.test.ts`,
  `hint-ordinal.test.ts` and `scripts/checks/hint-deixis.test.ts` — with nothing
  to remember and nothing to add. It was a hand-maintained thirty-game array
  until `derive-hint-enrollment`; a game left off got **zero** of the six,
  silently. Recipe and rationale: [`hints.md`](./hints.md).

  *What guards a derived population is not the same as what guarded a list.*
  [`hint-enrollment.test.ts`](../../src/engine/hint-enrollment.test.ts) puts
  floors under both the registry it draws from and the set it produces, because
  the six consumers build their `it()` blocks in a loop and an empty array leaves
  them with nothing to run — and `npm run test:run` passes
  `--passWithNoTests`, under which "nothing to run" is **green**. Asserting the
  derivation against its own definition would have been a tautology; the floors
  are the part that can actually fail.
- **Difficulty tiers**: declaring `Game.difficulty`
  ([`difficulty.ts`](../../src/engine/difficulty.ts)) *is* the enrollment —
  [`difficulty-contract.test.ts`](../../src/engine/difficulty-contract.test.ts)
  derives its set from the registry, so a tiered game that fails to declare
  fails a test. The guards: cap-monotonicity (Boats shipped without it and it
  silently broke Check & Save on every Easy board), every tier generating or
  refusing with a reason, tier list matching the difficulty `paramConfig`
  choices, tiers surviving the params codec. Adapter gotchas (build the solver
  input from the desc, never reuse scratch, seed the givens, declare
  non-unique/non-monotone exemptions so the exemption is itself under test):
  [`solver-and-generator.md`](./solver-and-generator.md).
- **Registration**: [`catalog-registry.test.ts`](../../src/catalog-registry.test.ts)
  asserts catalog ≡ registry in both directions; adding a game is two edits
  (`src/games/index.ts`, `src/puzzle/catalog-data.ts`) and this test holds them
  together.
- **Layering**: [`module-layering.test.ts`](../../src/module-layering.test.ts)
  enforces that no game imports another game, the engine imports no game
  (except `testing/hint-games.ts`, the enrollment file), neither imports the app
  shell — and ratchets runtime import cycles at zero. Every rule there has been
  verified to fail when violated; a layering rule that has never fired may not
  work.
- **Mistake overlay**: the paint-twice per-game test obligation (a cold frame
  proves nothing — every cell misses the cache on frame 1) is owned by
  [`rendering.md`](./rendering.md) § "Overlay sidecars"; the testing
  half is: paint, `findMistakes()`, redraw the *same* drawstate, assert the
  highlight on the second paint, and ideally that a third frame without the
  overlay erases it.

### How a cross-game guard finds its population

The bullets above are instances of one rule, and writing a new guard means
following it rather than re-deriving it. Surveyed across every cross-game guard
in the tree by `audit-declared-versus-derived-capabilities`; the normative form
is the `ts-engine` spec, "A shared mechanic is joined by having it".

1. **Derive the population from what the game *is*** — the object it registers,
   a method's presence, the `Ui` its `newUi` returns, its own comment-stripped
   source. [`testing/enrollment.ts`](../../src/engine/testing/enrollment.ts) is
   the shared way to ask (`builtGames`, `enrolledIn`, `membersNotMentioning`),
   and it memoizes the 57 boards that used to be regenerated per guard. **Never
   a roster of opted-in names**: a game left off a roster gets none of the
   guard, silently, and nothing says so.
2. **Put a floor under the population you drew from**, not only under the set
   you filtered out of it (`Enrollment.population`). A filtered count can look
   healthy while the registry behind it is empty, and `--passWithNoTests` makes
   "nothing to run" green.
3. **State the exceptions as a ledger, never as the enrollment key.** Where the
   derived set legitimately has members the rule must not apply to, record them
   in the *guard* — one entry per member, each with its reason — and assert the
   ledger equals what the derivation found. The declaration then says *why*, and
   the derivation says *who*; the ledger cannot rot, because the derivation
   checks it. Exemplars: `input-parity.test.ts`'s `NO_KEYBOARD`,
   `completion-vocabulary.test.ts`'s `NO_FLAG`, `hint-quality.test.ts`'s
   `NARRATES_MOVES`, `contract-surface.test.ts`'s `NO_CONSUMER`. Several are
   **empty and meant to stay so**, which is a real assertion and not a stub.
4. **Where the game must declare a flag because production needs the answer
   synchronously, hold the flag to the behavior.** The `Game` contract carries
   exactly three boolean declarations, and each is now asserted equal to a
   derivation rather than trusted: `ignoresSecondaryButton` iff the game
   consumes `RIGHT_BUTTON` (`input-parity.test.ts`), `canMarkAll` iff its
   `interpretMove` answers `M` (`mark-all.test.ts`), `wantsStylusModifier` iff
   its code reads `MOD_STYLUS` (`touch-input.test.ts`). A flag that only turns a
   guard *off* is the one that most needs this — nothing else notices when it
   lies.
5. **Scan code, not text.** `membersNotMentioning` strips comments first,
   because a mention in prose is not a use: the check's first cut convicted Net
   for a comment explaining that it deliberately has no stylus branch. Key on
   the name and take the superset; narrowing the key is the error this repo
   makes most (AGENTS.md, "A scan that keys on a name"). When the population is
   *who uses a symbol*, skip the key altogether: `npm run refs -- <file> <Name |
   Type.member>` answers by reference, including the `latinSolver<Ctx>(` calls a
   grep misses. It is blind to source read as text, which is exactly what
   `membersNotMentioning` reads, so the two answer different questions.
6. **Ask a question the system is actually asked.** A guard that *synthesizes*
   its own inputs can pose one no code path ever poses, and then convict games of
   failing to answer it. `assert-that-tiers-bind`'s first cut asked "does a board
   generated with tier T applied to the collection's cheapest valid preset need
   tier T?" — and a 4×4 Solo board cannot be Hard however its params are labeled,
   so it reported **ten violations across four games**. Re-keyed on the presets a
   player can pick, reading each one's *own* tier: **three, in one game, and they
   were real.** `validateParams` accepting a params record is not evidence a board
   can carry what is in it.

   **Tell:** your guard builds its inputs with a `with*`/setter rather than
   reading them off something the game offers. The population is what the game
   presents — its presets, its registered object, its `Ui` — not what the guard
   can construct out of the parts.
7. **A coverage guard has a *second* key, and it needs the same discipline as
   the first.** Rules 1–6 are about finding *who*; a guard that reports a
   shortfall also has to decide who is already covered, and that side is the one
   nobody checks — an over-reported shortfall fails no commit. It sits in the
   tree looking like diligence until somebody tries to close it and finds the
   test already there. `mistake-overlay-coverage.test.ts` derived its population
   from the capability set, argued the point at length, and then keyed coverage
   on the string `showMistakes` — one harness's flag, and the newest of three
   ways to drive a mistake frame. **Six of the seventeen games it convicted
   already had the test**, including Galaxies, whose three-frame version this
   guide's `rendering.md` cites *by name* as the exemplar
   (`widen-the-mistake-overlay-coverage-key`, 2026-09-09).

   **And the fix's own first cut repeated the defect one layer down**: the
   widened key matched `\bredraw\w*\(` and still missed Galaxies, which calls
   `galaxiesRedraw(`. Take the superset on *both* keys and classify what it
   catches.

   **Tell:** the covered set is a single `includes("…")` while the population
   above it took twenty lines to derive.

### The divergence no clone detector can see

**One concept spelled several ways is not duplication, so jscpd is blind to it,
and it is the failure mode a 57-game collection produces most.**
`re-express-the-collection` said so in its own closing note; two convergences
then landed in exactly that blind spot. Nine games had a private
`drawPencilIndicator` and jscpd saw nothing, because each computed its own box.
Six games spelled a drag's anchor six ways and there was no duplication at all
to detect.

**The instrument for it is the capability snapshot**
([`capability-surface.test.ts`](../../src/capability-surface.test.ts)), which
records every game's field names — its `Ui` *and* its draw state — sorted, in
one file. It asserts nothing about which names a game may use; an approved
vocabulary would be the manifest this collection refuses. Its whole job is to
put the collection's vocabulary somewhere a person can **read** it, and to make
a change to that vocabulary a reviewable line in a text diff. Reading all 57
once is how the `dragType`/`dragtype` split, the `aiming` collision and a
`dragCol` that meant *color* next to a `dragColumn` that meant *column* were
all found — and, in the draw-state half the first reading could see,
`tilesize` against `tileSize` across 55 games.

Two limits to know before trusting it:

- **The `Ui` half sees only what `newUi` returned.** A field an interface
  declares `optional` and only a gesture assigns is invisible: Sixteen's
  `newUi` returns `{cursor, curMode}` and its nine drag fields — `dragX?`,
  `dragStartX?`, … — appear nowhere in the snapshot. So a census taken off the
  snapshot alone **under-counts**, which is the same wrong-key error as § "How
  a cross-game guard finds its population" rule 1, one level up. Read the
  interface when the count is the point.
- **Read the draw state *unsized*, and never "the way production builds it".**
  `setTileSize` assigns, so sizing puts back every field it writes; the first
  cut sized it and a deliberately deleted `tilesize` came back before
  `Object.keys` ran. The guard passed. What replaces sizing is an assertion
  that sizing adds no key for any game, so the hazard sizing was covering
  fails a test instead.

## Metrics and instruments

**`npm run metrics` records duplication (jscpd), runtime import cycles (madge,
calibrated), dead code (knip) and cognitive complexity (biome) into a dated
snapshot — deliberately not in the gate.** Its value is the diff between
refactoring rounds: run it at the start and end of a refactoring change and
quote the delta. File the snapshot **under your change** (`openspec archive`
then carries it with the work); a snapshot left at the repo root reads as a
current measurement of a tree that no longer exists. Top-level `metrics/` is
for live instruments only.

Three rules, each learned by getting it wrong:

1. **Thresholds are ratchets, never aspirations.** Lower a cap when a change
   earns it; never raise one to accommodate new code; never suppress without a
   specific reason — the suppression list *is* the work queue.
2. **Confirm every finding against the config the project actually runs.** An
   isolated measuring config once manufactured 35 phantom "unused suppression"
   deletions; the real count was 0.
3. **Know where your instruments clamp.** Biome's complexity counter saturates
   at 255 — a stable 255 does not mean "no regression"; it means unmeasured.

### Timing anything under vitest: two things to know first

**An imported constant costs real time under the test transform, and nothing in
the production build.** Vite's module-runner transform rewrites `DR[i]` to
`__vite_ssr_import_0__.DR[i]`, and it defines every export as a **getter**, so a
table read inside a hot loop pays an accessor call per access. Measured
2026-09-12 on Range's real generator, three arms rotated and interleaved, 21
reps, four runs: **imported / local = 1.62–1.73×**, against an A/A control (a
second, separately loaded copy that keeps its tables local) of **0.98–1.01**.
That is why `range/solver.ts` keeps `DR`/`DC` beside the loops that read them.

**It does not survive `vite build`.** Rolldown flattens both modules into one
scope and the read compiles to a direct `var` access, byte-identical to the
local form. So this is a fact about the suite, not about the game: it is a
reason to be careful when *timing* a refactor that hoists a hot table, and not a
reason to refuse the hoist. If the shared form is better, take it — and know
that the suite will report a slowdown the player will never see.

**A control does not need two module instances; it needs a warm-up.** It was
reported, twice and independently, that an A/A control timing one loaded
instance twice flatters itself (the second timing running an already-warm
function), and that an instance polluted by an equivalence fuzz runs ~40%
slower. Measured on the same harness: **one instance timed twice gives
0.98–1.02, and a fuzz-polluted instance gives 0.94–1.05** — both indistinguishable
from 1.00. What separates a tight control from a loose one here is not how many
instances you load but whether **every arm is exercised once before the clock
starts**; this harness warms all three, and the distinction vanishes. Warm every
arm, rotate their order, and report the minimum beside the median — on a loaded
box the minima are the least contended samples, and here the two agreed.

Two calibration notes that recur: a raw madge cycle count is **not** a runtime
cycle count here (`verbatimModuleSyntax` erases `import type`, which is the
standard cycle *fix*, so madge reports the fix as the problem —
`scripts/metrics-cycles.mjs` calibrates, and treats an unclassifiable edge as a
failure, not as clean); and `npm run probe` / `npm run mutation` are
diagnostics, never gates and never ratcheted — the full treatment is
[`docs/test-strength.md`](../test-strength.md).
