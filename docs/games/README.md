# Game development guides

This directory is the followable *how* of implementing and maintaining a game
in this collection. The *what* lives in the specs — links below are
authoritative and must not be trusted *less* than these files. Anti-drift rule:
a guide states a normative rule briefly and links it; it points at an exemplar
file rather than pasting code that rots (the owning requirement is "Developer
guides live under docs/ and link to specs" in
[`repo-layout`](../../openspec/specs/repo-layout/spec.md)).

**These are a live wiki, not frozen docs.** Whenever you work on a game and hit
something a guide didn't tell you, got wrong, or could say better, **update the
guide in the same change** — that is part of "done", not a separate chore. The
standing obligation is stated in [`AGENTS.md`](../../AGENTS.md).

**Where a guide offers you a choice, ask whether it should.** The collection's
goal is *convention over configuration: one obvious way to do it, and no
unnecessary decisions* ([`AGENTS.md`](../../AGENTS.md) § "Convention over
configuration"). So a guide passage that reads *"games do this in a few
different ways"* is describing accidental complexity, not documenting a feature —
and **the fix belongs in the same change that hit it**, either by unifying the
concern or by writing down what a game would legitimately want to do differently.
Decisions that are genuinely about the puzzle stay with the puzzle; the rest are
a convention somebody has not made yet.

**Cite sections by heading, never by position.** A citation reads
`docs/games/<file>.md § "Heading"`. Cited headings are grep-stable: renaming
one repoints every citation in the same change.

Authoritative specs:
[`ts-migration`](../../openspec/specs/ts-migration/spec.md) (strategy,
acceptance gate, test discipline) ·
[`ts-engine`](../../openspec/specs/ts-engine/spec.md) (the `Game` interface,
the `Midend`, the hint system) ·
[`repo-layout`](../../openspec/specs/repo-layout/spec.md) (where things live,
the in-process test tiers) · per-game specs under `openspec/specs/<game>/`.
Strategic narrative: [`AGENTS.md`](../../AGENTS.md). **Exemplar to read
end-to-end before starting:** [`src/games/galaxies/`](../../src/games/galaxies/)
(idiomatic six-file split, smaller than the C it replaced).

## The guides

| File | Concern |
| --- | --- |
| [`mechanics.md`](./mechanics.md) | Params, presets, custom-params and prefs; descriptions, state and codecs; moves and `executeMove` purity; capability hooks (`supersededDesc`, timed games, `encodeUi`); the difficulty contract; the affordance inventory (pencil marks, reference aid, mistake surface); bespoke geometry and multi-mode grids. |
| [`input.md`](./input.md) | Pointer, keyboard and touch; the frontend traps upstream never tells you about; drag models; the on-screen keypad. |
| [`rendering.md`](./rendering.md) | The redraw contract and doctrine; the per-tile cache and its diff key; overlay sidecars; the palette's three layers; animation, flashes and blitters. |
| [`solver-and-generator.md`](./solver-and-generator.md) | One deduction engine, two projections; difficulty grading; guess-free generation; generator patterns; `solve()`; `findMistakes`; the Latin family. |
| [`hints.md`](./hints.md) | The whole hint discipline: the quality bar, narration, plan mechanics, hint rendering, the candidate-elimination and heuristic families, the cross-game guards. |
| [`testing.md`](./testing.md) | The test tiers, render scenarios and snapshots, the frozen differentials, generation invariants, seed-determinism, metrics. |
| [`engine-catalog.md`](./engine-catalog.md) | The shared-helper reference: what exists in `src/engine/`, when to reach for each, and the promotion rule. |

Repo-wide and not game-specific: [`../test-strength.md`](../test-strength.md)
— assessing whether a test would actually catch anything (`npm run probe`, the
five-minute mutation probe, the instrument traps).

## The lifecycle of a game change

**One openspec change per coherent unit of work** — a new game is one change;
a cross-game feature is one change; a game's explained hint is normally its own
change. Scaffold the change and keep implementing in the same session (the
proposal-approval gate is off by default in this project; the gate that matters
is owner acceptance at the *end*). The workflow ships as the `openspec-*` skills
the pinned CLI installs (`propose`, `explore`, `apply`, `update`, `sync`,
`archive`), with the project's own rules for it in
[`AGENTS.md`](../../AGENTS.md) § "Work management".

For a new game:

1. **Open the change** (`add-<game>-ts-port`), decide the interface risks below
   in its `design.md`.
2. **Scaffold**: `scripts/new-game-port.sh <gameId>` stamps out
   `src/games/<gameId>/` with compiling typed `Game<…>` stubs in the file shape
   below, a starter test file (save round-trip + render smoke, both `it.skip`),
   and a generation-invariants stub — then prints the manual-edit checklist it
   deliberately won't do for you. The owning requirement is "A scaffolding
   script stamps out a new game-port skeleton" in
   [`repo-layout`](../../openspec/specs/repo-layout/spec.md).
3. **Implement**, one concern at a time — the guide files above are ordered the
   way the work usually goes: mechanics → input → rendering → solver/generator
   → hints → tests throughout.
4. **Register** the game — two edits, made together because
   `catalog-registry.test.ts` holds them to each other: import the game in
   [`src/games/index.ts`](../../src/games/index.ts) and add its catalog entry
   to [`src/puzzle/catalog-data.ts`](../../src/puzzle/catalog-data.ts). A game
   absent from the registry is simply unplayable.
5. **Icons**: two committed PNGs (`src/assets/icons/<gameId>-{64,128}d8.png`),
   captured from the running game via the dev-only `?screenshot` mode — see
   [`puzzle-icons`](../../openspec/specs/puzzle-icons/spec.md).
6. **Owner acceptance**, then close out (below).

## File anatomy

The file shape that has held across all 57 games (Galaxies is the reference;
small games may collapse files):

| File | Holds |
| --- | --- |
| `index.ts` | The `Game<…>` object + glue: move logic, `interpretMove`/`executeMove`, presets, `colors()`, optional `hint`/`findMistakes`, `registerGame(...)`. |
| `state.ts` | Immutable state type + params, encode/decode/validate desc + params, `newState`, `cloneState`, the move/UI types. |
| `solver.ts` | The deductive solver (used by the generator for uniqueness, by `solve`, and by `hint`/`findMistakes`). |
| `generator.ts` | `newDesc`: board generation + retry-to-target-difficulty. |
| `render.ts` | `redraw`, the palette indices, `computeSize`, the per-tile cache. |

A drag-preview game adds a small `moves.ts` so `render.ts` can simulate the
release move without an import cycle — see
[`rendering.md`](./rendering.md) § "A simulated-release preview lives in `moves.ts`".

## Definition of done

A game (or a change to one) is done when **all** of these hold:

- [ ] Interface risks checked *before* starting (§ "Before you start", below).
- [ ] Idiomatic TS, not a transliteration
      ([`mechanics.md`](./mechanics.md) § "Idiomatic state, not a C transliteration").
- [ ] Render cache keyed on `Int32Array`; every overlay in the diff key; the
      engine paints no pixels of its own ([`rendering.md`](./rendering.md)).
- [ ] Config-summary header renders; preferences go through the `prefs` hook;
      a custom-params form is wired ([`mechanics.md`](./mechanics.md)).
- [ ] A uniquely-solvable game ships `findMistakes` — Check & Save depends on
      it ([`solver-and-generator.md`](./solver-and-generator.md) § "The
      solvable-game contract").
- [ ] A pencil-mark game ships the full note-taking UX
      ([`mechanics.md`](./mechanics.md) § "Pencil marks: the full note-taking
      UX").
- [ ] Input read against the frontend traps; the collection-wide touch guard
      stays green ([`input.md`](./input.md)).
- [ ] A game with difficulty tiers declares `Game.difficulty` and passes the
      cross-game contract guards ([`mechanics.md`](./mechanics.md)
      § "Difficulty is a declared contract").
- [ ] Behavioral tests at the lowest fitting tier; new render code ships a
      tier-2.5 test; heavy tests are seed-deterministic and never clock-gated
      ([`testing.md`](./testing.md)).
- [ ] An explained hint meeting the quality bar ([`hints.md`](./hints.md)) —
      or its own follow-up change, opened, not implied.
- [ ] **Owner-accepted** full behavioral parity/quality — rendering,
      animation, input — never a green suite alone (§ "The acceptance gate").
- [ ] The openspec change kept current and archived on acceptance
      (§ "Close out").

## Before you start

**Read the game's history first — its author has usually written down what is
wrong with it, and it is not in the code.** For the third-party and unfinished
games, the author's own status notes (and their triage verdicts) are archived
in `audit-author-known-issues`'s `audit.md` under
`openspec/changes/archive/`; the original text, and every deleted `.c`'s
`TODO` block, is in git history (`git log --diff-filter=D`). The two candid
sources disagree in *both* directions — Crossing's best improvement was only in
its status page, Boats' only real defect only in its `.c` TODO — so when
history matters, read both. Triage each point into *fix now*, *ask the owner*,
or *record and decline* — in the change's `design.md`; a documented problem the
game silently reproduces is the one outcome to avoid.

**Check the long-tail interface risks before starting, not mid-change.** The
live list:

| Risk | Stance |
| --- | --- |
| A board not fully determined until play starts (upstream `midend_supersede_game_desc`) | Solved: implement `supersededDesc` — [`mechanics.md`](./mechanics.md) § "A board decided at first click". |
| "Did this move change anything?" via state equality | A phantom — no game needs it. Suppress no-op moves *locally* in `interpretMove` (return `null`); never deep-compare state. |
| Editor-only move letters (upstream `#ifdef EDITOR`) | Don't map them; say so in `design.md`. |
| "Print this puzzle" | No TS printing exists — don't promise it. |

## Greenfield games have no oracle

Path and Numgame (the two remaining greenfield changes,
[`add-path-ts-port`](../../openspec/changes/add-path-ts-port/proposal.md) /
[`add-numgame-ts-port`](../../openspec/changes/add-numgame-ts-port/proposal.md))
— and any future game — have no upstream build to check against. What replaces
the retired byte-match oracle is stated per game, normally "every generated
board is uniquely solvable at exactly its stated difficulty" as a property test
([`testing.md`](./testing.md) § "What a new game ships").

Lessons from finishing upstream's unfinished puzzles that still apply to any
new game:

- **Reuse a structurally-similar shipped game's frontend wholesale.** Find a
  game whose *task* matches and adopt its data model + input + render skeleton,
  changing only cell content and win rule (Separate took Palisade's wall model,
  input and cursor verbatim; only the win test and solver were new).
- **A new game has no fallback.** There is no second implementation to cover a
  smoke-test gap: the game is visible the moment it is registered, so its
  catalog entry is part of the first registration, and the acceptance gate
  below is the only gate.
- **Gate live-error checks on completeness.** A content check that fires on
  every cell of an untouched board (a duplicate-letter red when the whole grid
  is still one region) is pure noise — only flag provably-wrong state.
- **An unplayed game's own validation can admit sizes it cannot generate.**
  Code that was never played at its edges has load-bearing asserts: Slide's
  generator aborted on *every* board at two sizes its own `validate_params`
  accepted (a solubility check missing after the final singleton removal).
  Probe the parameter space's edges before trusting the advertised range;
  where a size provably cannot generate, reject it in `validateParams` and
  cover the boundary with a behavioral test
  ([solver & generator](./solver-and-generator.md) § "Unlucky, impossible,
  and load-bearing validation").

## The acceptance gate

**A game-facing change ships on owner-accepted behavioral quality —
rendering, animation, input — never on a green suite alone.** A suite
asserting only state transitions can be fully green while the game does not
render; that happened, and the doctrine is spec-enforced (the authoritative
rule is in [`ts-migration`](../../openspec/specs/ts-migration/spec.md)).
**Never call a shortfall "cosmetic", "out of scope", or defer it without
explicit owner approval.**

The two stages, kept from the porting era because the shape still fits any
substantial game change:

1. **Land it behind a green suite** and make it reachable for smoke-testing
   (`npm run dev`); commit — finished work is not held hostage to acceptance.
2. **Owner acceptance closes the change.** Iterate on top if rejected. During
   porting, stage 2 also deleted the game's C; since `retire-c-engine` the
   stage has no mechanical content — what survives is the rule that acceptance,
   not green, is the gate.

## Close out

Keep the openspec change current as you go (tasks ticked, decisions recorded in
`design.md`). The pre-commit gate — `tsc -b --noEmit` → biome → the
probe-anchor check → the spelling guard (American English; see `AGENTS.md`
§ "Code conventions") → `openspec validate` → `vitest run` → `vite build` —
must pass; **never bypass it**. On owner acceptance, archive the change
(`openspec archive <change-id> --yes`), committing work and archive together.
A follow-up the work surfaced gets its own change opened there and then, while
the measurement is in hand.

## Where the C went

This project ported all 57 games from C to TypeScript (2026), then deleted the
C engine, its build system, and finally the `puzzles/` tree entirely
(`retire-c-engine` → `rehome-upstream-help-sources`, 2026-08-01). The C is
readable in git history (`git show pre-ts-pivot:puzzles/<game>.c`); there is no
running build to ask new questions of, so a new question is answered
behaviorally. The 48 frozen JSON differentials still run and are the
refactoring net — do not delete them, and do not try to re-baseline one (you
cannot; see [`testing.md`](./testing.md) § "The frozen differentials").
Byte-parity with upstream was a porting tool, released on 2026-08-01: diverge
where it buys the player something, and say what replaces the oracle
([`solver-and-generator.md`](./solver-and-generator.md) § "Divergence and what
it costs").
