# Design — retire-native-directory

## D1. Stale paths in the specs: sweep the live claims, leave the history

`src/native` appears ~55 times across 27 files under `openspec/specs/`. They are
not all the same kind of sentence, and the distinction decides what to do:

- **A live claim about where code is** — "The engine SHALL provide `Dsf` in
  `src/native/engine/dsf.ts`" (`ts-engine`, 23 of these). After the move this is
  simply false, and a spec that is false about the tree is worse than one that is
  silent.
- **Past-tense narration** — "the corpus was recorded by `puzzles/auxiliary/…`",
  "`puzzles/galaxies.c` was deleted when the port shipped". These were true when
  written and rewriting them would falsify the record.

**Decision:** sweep the first kind, leave the second. Precedent: after
`rehome-upstream-help-sources` deleted `puzzles/`, four specs still name
`puzzles/<game>.c` — deliberately, because each is narrating a deletion.

**How the sweep is carried, and why it is not 25 spec deltas.** Only requirements
whose *substance* changes get a `## MODIFIED Requirements` delta (`repo-layout`'s
three, `combi`'s two, `random`'s two-plus-two-removed, `ts-engine`'s one addition).
The remaining path mentions are edited directly in `openspec/specs/`, as a
mechanical string replacement of exactly two prefixes:

```
src/native/engine/ → src/engine/
src/native/games/  → src/games/
```

Issuing a full MODIFIED delta for 23 `ts-engine` requirements whose only change
is a directory prefix would produce a diff in which the real edits are invisible
among restated prose — the reviewer's job becomes proving that nothing *else*
changed, across a thousand lines, by eye.

The alternative is to **verify by shape instead**, which this repo has an
established method for: `consolidate-colour-palette` reviewed 44 moved snapshot
files by confirming that every changed line was an `rgb()` value, "which proves
no op was added, removed or moved, and beats eyeballing 44 files". Same here, and
it is a one-line check rather than a reading:

```sh
git diff openspec/specs | grep '^[-+]' | grep -v '^[-+][-+]' \
  | grep -v 'src/native/\(engine\|games\)/' ;# must print nothing
```

**Considered and declined: delete the paths from `ts-engine` altogether.** Those
23 requirements arguably shouldn't name a file — "the engine SHALL provide
`mkhighlight`" is a contract, and where it lives is an implementation detail. But
in practice those pointers are how a porting session finds the shared helper it
should be importing instead of re-deriving, which is the failure the requirements
exist to prevent. Keeping a pointer that can go stale beats removing a pointer
that works. Not this change either way: it is a semantic edit to 23 requirements
wearing the costume of a rename.

## D2. Two siblings (`src/engine/` + `src/games/`), not one parent

The obvious alternative is to keep a single subtree and just rename it —
`src/engine/` with the games *inside* it at `src/engine/games/`.

**Decision: two siblings.** The tiebreaker is measurable rather than aesthetic.
Games reach the engine as `"../../engine/grid.ts"`. Hoisting *both* directories
by one level preserves every one of those specifiers exactly — `src/games/x/f.ts`
resolving `"../../engine/grid.ts"` lands on `src/engine/grid.ts`, as it did
before. Nesting the games one level deeper rewrites every cross-tree import in
57 game directories to no purpose.

So the sibling layout makes the largest part of this change a pure `git mv`, and
that is worth more than the tidiness of one root. It also matches the vocabulary
everything already uses — `module-layering.test.ts`, the `repo-layout`
requirement and `docs/porting/` all say "engine/" and "games/" as if they were
siblings; only the filesystem disagreed.

**On `src/engine/` sitting next to `src/puzzle/`.** These are two different
things and the names do not make that obvious: `src/engine/` is puzzle logic that
runs *in the worker*; `src/puzzle/` is the main-thread runtime (the `Puzzle`
object, the Comlink host, the canvas `Drawing`) plus nine Lit components. Renaming
`src/puzzle/` as well was considered and declined here — its real problem is that
it holds two roles, not that it is badly named, and splitting it is
`group-crowded-source-directories`. Deciding its name before that split would be
deciding it with the wrong information.

## D3. `types.ts` moves down, `worker-adapter.ts` moves up

Both moves cross the same seam in opposite directions, and each is chosen by
asking *who defines this, and who merely uses it*.

`types.ts` declares `Colour`, `Point`, `Size`, `Rect`, `KeyLabel`,
`PresetMenuEntry`, `DrawTextOptions` and the change notifications. Every one of
them is part of a contract the **engine** states and a game implements: `Colour`
is the return type of `Game.colours()`. The app is a consumer. It goes to
`src/engine/types.ts`.

`worker-adapter.ts` (`TsWorkerPuzzle implements PuzzleEngineSurface`) is the
opposite: it exists to present the engine over Comlink in the shape the app's
`Puzzle` expects, and it is the only production module under `src/native/`
importing upward (`puzzle/drawing.ts`, `puzzle/engine-surface.ts`). An adapter
belongs with the thing being adapted *to*. It goes to `src/puzzle/`.

The pair is what makes D4's invariant expressible at all: with `types.ts` down
and `worker-adapter.ts` up, `src/engine/` and `src/games/` import **nothing**
above them, so the rule needs no exceptions and no allowlist.

## D4. The layering rule becomes an invariant, not a blocklist

Today's third rule reads: engine and games do not import `screens/`, `dialogs/`
or `components/`. It is green, and it has been green while 182 files imported
`src/puzzle/types.ts`.

**Decision:** replace the list with *the engine and games import nothing under
`src/` outside their own two directories*. A blocklist can only catch the
violations its author thought of; a directory added next year is permitted by
default, silently. The invariant has the opposite default and needs no
maintenance.

Two properties make this affordable rather than aspirational: after D3 the
violation count is **zero**, so it lands as a ratchet rather than a wish; and the
one named exception (`engine/testing/hint-games.ts` importing games) is unchanged
and stays named, per the existing requirement's insistence that it not be granted
by wildcard.

The rule must be verified to fail — introduce an import, watch it go red, revert
— per the existing `repo-layout` requirement. A layering rule that has never
fired may not work.

## D5. `combi` and `random` keep their directories, inside the engine

`random` is 4 files plus a corpus and has 255 importers; `combi` is one 81-line
class plus a 267-line test and a corpus, with exactly one consumer
(`games/lightup/solver.ts`).

The temptation with `combi` is to flatten it to `engine/combi.ts` and drop the
fixture next to the engine's other `__fixtures__/`. **Declined.** The corpus is
`combi`'s own C-recorded characterization data and the test that replays it is
its own file; a module with a private fixture directory is exactly what
`engine/random/` looks like too, and having the two behave differently to save
one directory is a worse trade than the directory costs. Both become
`src/engine/<name>/`, unchanged inside.

What *does* go is the doctrine that put them at the top level: `repo-layout`'s
"one folder per ported shared/leaf module under `src/native/`, with the bridge
(if any) at `bridge.ts`". There is no wasm to bridge to, no more leaf modules
coming, and the category's last two occupants are engine libraries. The
requirement is deleted rather than reworded — the same reasoning that deleted
`build/` from the root-layout requirement when it had no occupant.

## D6. Why this is one change and the rest are two more

The repo's rule is one change per coherent unit, bundling only where the design
reasoning is genuinely identical. Applied here that gives three, split by *why*
rather than by *when*:

- **This change** — everything whose reason is *the layout names a build that is
  gone*: the inversion, the hoist, the two seams, and the spec requirements that
  still describe a deleted bridge.
- **`group-crowded-source-directories`** — *a directory holds more than one
  family, or more than one role*: the engine's 104 flat files (a `grid/` of 12
  and a `colour/` of 7 are the two unarguable ones), and `src/puzzle/`'s nine Lit
  components sharing a folder with the runtime. Different reason, different risk
  (it must teach `scripts/feedback-probe.mjs` about nested modules and re-anchor
  the probe corpus), and it must land *after* this one so files move once.
- **`refile-misplaced-artefacts`** — *a committed non-code artefact sits in a
  directory whose stated role does not cover it, and inherits the wrong
  obligation as a result*: a finished round's metrics snapshots at the root,
  reading as current measurement; and upstream's tiling diagrams filed in
  `docs/`, where the standing instruction is to keep the contents current.

The three are deliberately ordered so that no file is touched by two of them.

## D7. Sequencing inside the change: the probe gate is a hard edge

`scripts/feedback-probe.mjs` hardcodes `ENGINE = "src/native/engine"` and derives
each module's own-test set by scanning that directory; `npm run probe -- --verify`
runs in the pre-commit gate specifically to fail when a refactor moves a line the
corpus quotes as an anchor. A commit that moves the engine without repointing the
probe **cannot land**, and must not: a probe that silently finds no modules would
measure a smaller corpus and report success, which is the exact failure
`gate-the-probe-corpus` exists to prevent.

So the probe repoint, the `stryker.config.mjs` paths and the move go in **one
commit**. The anchors themselves are quoted source lines, not paths, so a pure
rename leaves them valid — `--verify` passing after the repoint is the evidence
that the move was pure. If it fails, something changed that shouldn't have.

## D8. What "no behaviour changes" is checked against

There is no golden output for a directory rename, so the check is that the
existing evidence is bit-identical across the move:

- The 48 frozen per-game differentials still pass — they are the net for exactly
  this, and they assert generated descriptions byte-for-byte.
- Every `__snapshots__/*.snap` is unchanged. A render snapshot that moves during
  a rename means something other than a rename happened.
- `npm run probe -- --verify` passes (D7).
- `git log --follow` walks through the move on a spot-checked file per moved
  root, confirming `git mv` rather than delete+add.
