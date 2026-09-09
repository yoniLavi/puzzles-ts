# guard-change-id-citations

**Readiness: ready.** The decline this reverses named its own revisit condition,
the condition has fired, and the measurement was taken on 2026-09-09 by
`settle-the-framework-vision`. Nothing here needs a design.

## Why

**A change id cited in prose is a reference the tree cannot check, and one of
them was dead for five days.**

`docs/framework-rdd/README.md` considered a guard on these citations on
2026-09-04 and declined it, on a measurement: of the 49 change-id-shaped tokens
across `docs/` and `AGENTS.md`, 45 resolved and the other four were not change
ids at all. The reasoning was sound and the decline was explicit about what would
overturn it — *"worth revisiting if a dead citation ever does appear; not worth
speculative machinery before one has."*

**One appeared 46 minutes later.** The measurement landed in `548594b4` at 15:21
that afternoon; at 16:07 `dda81631` rescoped and **renamed**
`census-the-hintless-logic-games` to `characterize-the-hint-assessment-corpus`,
and left `AGENTS.md` § "Hint quality bar" telling every future session that the
old name "exists to characterize that corpus". The directory had been deleted by
the commit that wrote the sentence's own replacement. Nobody noticed until
2026-09-09.

That is `AGENTS.md` § "Method" — *a fact about the codebase rots exactly like a
count* — at the shortest half-life yet recorded here; the entry's own worked
example took nineteen hours. And the mutation that caused it is the one a grep
catches for free: **an id changed, and the prose that named it did not.**

**Re-measured 2026-09-09**, same key and same scope (`docs/` + `AGENTS.md`, 16
files): **80 change-id-shaped tokens, 74 resolving** — 71 to an open change or a
dated archive entry, 3 to postmortems — **5 not change ids**, and **1 dead**.

## What the decline got right, and what the guard therefore has to be

The decline's objection was not that a guard is hard; it was that a guard keyed
on "kebab-case token in backticks" **needs an allowlist that grows with the
docs** — CSS features, git tags, script names, DOM events. That objection is
correct and survives: the re-measurement's five non-change-ids are
`prefers-color-scheme`, `pre-ts-pivot`, `color-dark-check`, `auto-mark-complete`
and `puzzle-key-unhandled`.

So the guard is only worth building if the allowlist cannot rot into the thing it
replaces. Two rules make that true, and both are the repo's own:

- **The allowlist is a ledger, not a skip list** — the `NO_KEYBOARD` shape. It is
  asserted to be *exactly* the set of unresolved tokens, so a token that starts
  resolving must be removed and a new non-id must be added deliberately. An entry
  nobody can justify fails the same way a stale one does.
- **The scan carries a vacuity number.** An `import.meta.glob` that matches
  nothing, a regex that stops matching after a docs restructure, a file list that
  narrows — each makes every downstream assertion pass over nothing and report
  health. Count the files and the tokens, and floor both.

## The instrument correction, recorded because it changed the number

The first run of the re-measurement reported **twelve** unresolved, not one. Its
glob resolved `<id>` against `openspec/changes/archive/*-<id>` only, so it was
blind to every citation written with the date already in it
(`2026-08-01-right-size-the-test-gate`) and to every withdrawn row, whose change
directory is gone *by design* and whose record lives in `openspec/postmortems/`.
Eleven of the twelve findings were the instrument.

This is `AGENTS.md` § "Method" — *check the instrument before the finding* — and
it is a design input, not an anecdote: **the resolver has three legitimate homes
to check, not one**, and a guard that knows only the middle one convicts the
docs of 11 defects they do not have. A guard whose false-positive rate is 92% on
its first run gets switched off, which is worse than not building it.

## What Changes

- **A gate check** (`scripts/checks/change-citations.mjs`, joining the fast
  prefix beside `spelling.mjs` and `openspec-version.mjs`) scans `docs/` and
  `AGENTS.md` for change-id-shaped tokens and fails on one that resolves to no
  open change, dated or undated archive entry, or postmortem.
- **The non-ids live in a ledger** asserted equal to the unresolved set, so it
  cannot silently absorb a real dead citation.
- **Vacuity floors** on files scanned and tokens found, per the standing rule.
- **The guard is proved to fail before it is trusted** — rename a cited change,
  watch it go red, restore.
- `docs/framework-rdd/README.md`'s citation-guard passage stops saying the
  decision is open and points here.

## What this deliberately does not do

- **It does not scan `openspec/changes/archive/`.** An archived change is
  history: its citations were true when written, and a guard that forces them to
  track later renames would falsify the record. This is the existing asymmetry in
  repo-layout § "A change that moves or deletes a path updates the unarchived
  changes that name it", and it runs the same way here.
- **It does not scan `openspec/specs/` — measured, not assumed.** The same key
  covers them, so the question was taken: the specs cite 31 kebab tokens across
  71 files and **15 do not resolve, none of them a change id** — preference keys,
  DOM element and event names, a web component. Widening would nearly triple the
  ledger with product vocabulary and catch nothing, which is the decline's own
  objection arriving in the one place it is real. The ratio (6 of 85 against 15
  of 31) is structural: a spec describes what the product *is*, `docs/` and
  `AGENTS.md` narrate what the project *did*.

## Impact

- Affected specs: `repo-layout` (one added requirement).
- Affected code: `scripts/checks/change-citations.mjs` (new), the gate's fast
  prefix, `docs/framework-rdd/README.md`.
- Owner acceptance: not required — an internal guard, nothing player-visible.
