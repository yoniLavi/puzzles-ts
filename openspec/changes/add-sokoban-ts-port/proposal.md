# add-sokoban-ts-port

## Why

**Sokoban is a well-known, fully-playable upstream game whose only weakness is its
generator.** It lives in `puzzles/unfinished/`, but unlike a stub-only unfinished
puzzle (Separate) its *entire* frontend — movement, push mechanics, pits, labelled
barrels, win detection, rendering — is written and works. The header's own verdict:
*"Random generation is too simplistic to be credible, but the rest of the gameplay
works well enough to use it with hand-written level descriptions."*

So this port is a near-complete transliteration of a working game, gated on one
genuine product decision: **what to do about the weak generator.** Ship it
faithfully (verifiable via byte-match, consistent with every other port, infinite
play), curate hand-authored levels (better quality, but new UX + licensing scope),
or improve it (a hard open research problem). That is the crux, and it is
owner-facing — see `design.md` D1.

Porting it also removes another `unfinished/` entry on the way to retiring the C
engine.

## What Changes

- **`src/native/games/sokoban/`** — the game, following the established multi-file
  port shape (`state` / `generator` / `render` / `index`; no `solver` — see below).
- **The move + push model**: orthogonal pushes, NetHack-style diagonal *movement*
  (never pushing), pits (a barrel fills a `PIT` and is consumed; a `DEEP_PIT` eats
  the barrel and stays), and labelled capital-letter barrels — all faithful to the
  C, so hand-typed level game IDs keep working even though the random generator
  never emits pits or labels.
- **The generator decision** (D1): recommendation is to **port the faithful
  reverse-move generator** now and treat curated levels as a *separate* follow-up
  change. Surfaced as the central open question for the owner.
- **The desc codec**: the run-length grid encoding, with validation (area equals
  `w*h`, exactly one player).
- **Win detection**: upstream's "cannot become any *more* complete" rule, which
  correctly handles spare barrels and pits.
- **Rendering**: walls with a bevel, targets/pits/deep-pits/player/barrels as
  discs, barrel labels, grid lines, and the three-blink completion flash. Moves are
  instant (upstream has **no** walk/push animation); a slide animation is noted as
  an optional enhancement, not shipped here.
- **No `solve()`, no `hint()`, no `findMistakes()`** — upstream ships no solver
  (Sokoban solving is a hard search), the game is non-deductive, and it has no
  wrong-but-legal cell state. All three omissions are correct, not gaps (D3, D4).
- **Registration** in `ts-ported-ids.ts` + `games/index.ts` (stage 1).
- **A byte-match differential** against a new `puzzles/auxiliary/sokoban-trace.c`,
  validating generator + codec (there is no solver to gate).
- **Stage 2, on owner acceptance**: flip to `TS_PORTED` (move `puzzle(sokoban …)`
  from `puzzles/unfinished/CMakeLists.txt` into the main catalog), delete
  `puzzles/unfinished/sokoban.c`, and rebuild.

Explicitly **not** in this change: curated hand-authored level packs, a Sokoban
solver, an explained hint, and any push/walk animation. Each is its own change if
the owner wants it.

## Impact

- Affected specs: new `sokoban` capability; `ts-migration` (one more game reaches
  full TS coverage, one more `unfinished/` entry retired).
- Affected code: new `src/native/games/sokoban/`, registration in
  `ts-ported-ids.ts` + `games/index.ts`, new `puzzles/auxiliary/sokoban-trace.c`.
- No icon work: `src/assets/icons/sokoban-{64,128}d8.png` already exist from the
  WASM era, so the `puzzle-icons` obligation is already met. The
  `augmentation.ts` `sokoban` entry (`{width}x{height}` summary) also already
  exists.
