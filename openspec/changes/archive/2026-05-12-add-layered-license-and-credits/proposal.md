# Change: Layered LICENSE + CREDITS for the fork lineage

## Why

The current top-level `LICENSE` credits only Mike Edmunds, which understates the project's lineage: this codebase inherits substantial work from Simon Tatham + upstream contributors (the puzzles engine itself, MIT-licensed) and from Mike Edmunds (the puzzles-web PWA shell), and now adds new TypeScript work by Yoni Lavi. The fork should make all three layers visible — for legal cleanliness (MIT's "include in all copies" obligation applies to upstream as well) and as a graceful gesture toward the work we're building on.

## What Changes

- Rename top-level `LICENSE` → `LICENSE.md` and rewrite it as a layered version: chronological copyright lines for Simon Tatham + upstream contributors, Mike Edmunds, and Yoni Lavi (year range `2025-`, open-ended), sharing a single MIT body. Defer upstream contributor detail to `puzzles/LICENCE` to avoid drift.
- Add a top-level `CREDITS.md` file with explicit thanks and links to upstream and puzzles-web — the graceful gesture.
- Leave `puzzles/LICENCE` untouched. It remains the canonical record for the upstream subtree.

## Impact

- Affected specs: `licensing` (new capability)
- Affected code: `LICENSE` removed, `LICENSE.md` added (rewritten), `CREDITS.md` added. No source code touched.
