# Generalise the hint sidecar to every render overlay

## Why

`unify-hint-framework` (archived 2026-07-14) extracted `HintSidecar` — the
`hintPacked`/`drawnHint` repack/stale/commit dance — and converted the five
candidate-family renders to it. The same five games (towers, unequal, keen, solo,
undead) still hand-write the **identical two-array dance a second time** for the mistake
overlay (`wrong`/`drawnWrong`), and that variant is the one that actually shipped its
bug: Towers' Check-&-Save highlighted nothing because `ds.wrong` was missing from the
diff key (playbook §3.2). The audit's follow-up recommendation (owner-endorsed at
session end) is to finish the job: one sidecar type, instantiated per overlay.

## What Changes

- `engine/hint-sidecar.ts` grows a list-pack entry point (pack a plain cell list, the
  `findMistakes` shape) alongside the highlights pack, and is renamed
  `overlay-sidecar.ts` / `OverlaySidecar` to say what it now is (`HintSidecar` remains
  as a deprecated alias only if the diff would otherwise churn call sites — prefer a
  clean rename; the five games are the only consumers).
- The five candidate-family renders replace `wrong`/`drawnWrong` with a second sidecar
  instance; render output stays byte-identical (snapshot-verified, as the hint
  conversion was).
- Galaxies' `wrongEdges` is **evaluated, not assumed**: it packs edges, not a
  mistake-cell list, and may already be a one-array compare — convert only if it fits
  without contortion, otherwise record the no-go in `design.md`.
- Micro-item riding along: the `noMarks`/`declaresNoMarks` predicate duplicated between
  `hint-overlay.test.ts` and `hint-quality.test.ts` hoists into `testing/hint-games.ts`.

## Non-goals

- No cross-game *guard* for the mistake overlay: a mistaken board cannot be built
  generically (the per-game paint-twice test remains the prescription, playbook §3.2).
- No key-bits overlay helper (declined in the audit: per-game topology makes it
  parameter soup; the cross-game hint-overlay guard covers the class).

## Impact

- Specs: `ts-engine` — the hint-mechanics requirement's overlay clause widens from
  hint-specific to overlay-general (one MODIFIED requirement).
- Code: `src/native/engine/{hint-sidecar → overlay-sidecar}.ts` (+ test),
  `src/native/games/{towers,unequal,keen,solo,undead}/render.ts`,
  `src/native/engine/{hint-overlay,hint-quality}.test.ts`, `testing/hint-games.ts`.
- Docs: playbook §3.2's mistake-overlay paragraph points at the sidecar instead of
  prescribing the hand-written `drawn<Overlay>` dance.
