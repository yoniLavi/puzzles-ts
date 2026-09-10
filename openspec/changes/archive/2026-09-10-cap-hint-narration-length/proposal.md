# cap-hint-narration-length

## Why

Owner, 2026-09-10, shortening one Tracks sentence by hand (139 → 104
characters): *"I'd like to shorten this hint text, and do a pass to see if we can
shorten others too; in general, I'm thinking we should have a character limit
as a linter, and perhaps a way to ignore/override it for a few particularly
complex hints."*

The only length rule was a 300-character ceiling, checked on each game's
easiest preset's opening plan — the one place long sentences are rarest. Three
games had already drawn a tighter line for themselves (Netslide and Spokes at
120, Boats at 170), which is the shared rule being too loose.

Measured before a limit was chosen, over 15,132 steps in 30 games walked into
the middle game: median 84 characters, p75 110, p90 147, longest 280. At 120,
229 sentence shapes in 24 games were over. The owner chose 120.

## What changes

- **A limit of 120 characters on every step**, checked in `hint-quality.test.ts`
  across every tier (every preset, for an untiered game) and as deep into each
  game as the census walked, since a sentence that needs room usually needs the
  board to be further along first.
- **A ledger for the sentences that genuinely need the room**, one entry per
  sentence template with its reason, held to the old 300 ceiling instead. It is
  asserted in both directions: an unlisted long step fails, and so does an
  entry that matches nothing over the limit, so shortening a sentence means
  deleting its entry.
- **The pass.** Most long sentences were long for reasons the guide already
  names: a rules preamble in the step (Undead's 280-character sightline was
  mostly a restatement of how each monster shows, which its help already
  teaches), a premise the picture already shows, or verbal fat. Those were
  rewritten under 120, keeping every premise. What went to the ledger is chain
  Tactics whose form the spec mandates, owner-endorsed exemplar wordings,
  two-premise deductions and one owner-requested second sentence.
- **Boats' per-game 170 cap is retired**: its stated premise ("the shared guard
  is 300") no longer holds, and the shared limit is tighter for every sentence
  it does not ledger.

## Impact

- `ts-engine`: one ADDED requirement.
- Player-visible: narration wording in 24 games, plus the shared populate,
  cleanup, hidden-single and fixed-set sentences.
- Follow-up scaffolded by the owner's request in the same session:
  `extract-hint-strings`.
