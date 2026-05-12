# Tasks

## 1. Layered LICENSE.md

- [x] 1.1 `git mv` existing top-level `LICENSE` to `LICENSE.md` (preserves history; the shield correctly blocked an outright deletion).
- [x] 1.2 Rewrite `LICENSE.md` with three chronological copyright lines (Simon Tatham + upstream contributors → Mike Edmunds → Yoni Lavi, year range `2025-`) and a single MIT body.
- [x] 1.3 Reference `puzzles/LICENCE` for the full upstream contributor list rather than duplicating it (which would drift).

## 2. CREDITS.md

- [x] 2.1 Add top-level `CREDITS.md` with explicit thanks and links to upstream Simon Tatham puzzles and medmunds/puzzles-web.

## 3. Verification

- [x] 3.1 Confirm `puzzles/LICENCE` is unchanged.
- [x] 3.2 Confirm both files render readably (UTF-8 with the © character; markdown headings render).
- [x] 3.3 Re-run `openspec validate add-layered-license-and-credits --strict`.
