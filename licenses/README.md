# Upstream license notices

This project's own license is [`../LICENSE.md`](../LICENSE.md) — one layered MIT
notice covering all three lineages. The files *here* are the upstream notices it
defers to, kept verbatim to honor MIT's "shall be included in all copies"
condition for the material this project derives from.

They are reference material, not this project's words. **Do not edit them.**

## `sgt-puzzles-LICENSE`

Simon Tatham's Portable Puzzle Collection — the notice, and the canonical list
of upstream contributors that [`../LICENSE.md`](../LICENSE.md) and
[`../CREDITS.md`](../CREDITS.md) point at rather than duplicating.

Covers: every game and engine module ported from upstream C into `../src/games/`
and `../src/engine/`, and the per-puzzle help text adopted from upstream's
overview pages into `../help/games/`.

- Upstream: <https://www.chiark.greenend.org.uk/~sgtatham/puzzles/>

## `puzzles-unreleased-LICENSE`

Lennard Sprong's (x-sheep) `puzzles-unreleased`, the source of thirteen of the
games here — see [`../CREDITS.md`](../CREDITS.md) for the list.

- Upstream: <https://github.com/x-sheep/puzzles-unreleased>

Byte-identical to `sgt-puzzles-LICENSE` today, because x-sheep shipped Simon
Tatham's notice verbatim. It is kept as its own file regardless: they are two
projects' notices, and their being the same text is a fact about today rather
than a guarantee.

## Why they are not in `puzzles/` any more

They were, until `rehome-upstream-help-sources` (2026-08-01). `puzzles/` was the
frozen subtree of upstream's C collection; `retire-c-engine` deleted the C, and
this change moved the help sources it had been left holding to `help/`. What
these notices cover is now the whole of `src/engine/` and `src/games/`, not a
subdirectory — so a directory named for a source tree that no longer exists was
the wrong home for them, and a misleading one.
