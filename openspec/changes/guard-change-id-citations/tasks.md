# guard-change-id-citations — tasks

## 1. Re-take the measurement rather than inheriting it

- [x] 1.1 Re-run the scan at implementation time. The figures in the proposal
      were taken on 2026-09-09 and this change's whole subject is that such a
      figure has a half-life measured in minutes. Report files scanned, tokens
      found, resolved, non-ids, dead. — **16 files, 85 tokens, 79 resolving, 6
      ledgered, 0 dead.** 85 rather than the proposal's 80 because
      `settle-the-framework-vision` added citations to the README on the way
      past; the dead one it found is fixed, which is why this run is clean.
- [x] 1.2 Confirm the three resolution homes are all still real: an open change
      directory, an archive entry (cited **with or without** its date prefix),
      and `openspec/postmortems/` for a withdrawn row. A resolver that knew only
      the second reported eleven false positives out of twelve on its first run.
      — All three carry live traffic: without the postmortem home the three
      withdrawn rows report dead; without the bare-id form, every undated
      citation does.

## 2. The check

- [x] 2.1 `scripts/checks/change-citations.mjs`. Scope: `docs/**/*.md` and
      `AGENTS.md`. Key: a backticked kebab-case token of three or more segments —
      accept the superset and classify, never narrow the key (`AGENTS.md`
      § "A scan that keys on a name").
- [x] 2.2 Resolve against all three homes. Postmortem filenames are *shortened*
      (`2026-09-05-gesture-table-withdrawal.md` for `declare-the-gesture-table`),
      so the mapping is not a substring match — decide it explicitly and say so
      at the site rather than leaving the next reader to infer it from a glob.
      — **Decided: a postmortem resolves every id it names**, keyed exactly as
      the docs are keyed, rather than by the filename or by a status phrase. See
      Finding 1 for the two rejected alternatives and what each would miss.
- [x] 2.3 The non-ids are a **ledger asserted equal** to the unresolved set, not
      a skip list: a token that starts resolving fails, and a new non-id must be
      added deliberately. `NO_KEYBOARD` is the shape.
- [x] 2.4 Vacuity floors: assert a minimum file count and token count, so a docs
      restructure that breaks the glob fails loud instead of reporting health.
      — Four floors: files, tokens, archive entries read, postmortems read. The
      last two matter because an empty *resolver* fails everything rather than
      nothing, which is loud but for the wrong reason.
- [x] 2.5 **`census-the-hintless-logic-games` will be the first entry, and it is
      not a non-id** — it is a *deliberately* dead id, cited once in
      `docs/framework-rdd/README.md` as the worked example of this exact failure.
      The ledger therefore holds two kinds of entry and must say which is which
      at each one, or the next reader deletes the wrong one. Decide the shape
      before writing the list: a second ledger, or one list with a per-entry
      reason, is a real choice and the reason belongs at the member either way.
      — **One map, reason per entry.** Two ledgers would need a rule for which
      one a new token joins, and that rule is exactly the sentence the reason
      already carries. The entry is marked `DELIBERATELY DEAD` and names the
      passage it dies with.

## 3. Prove it fails

- [x] 3.1 Rename a cited change directory, run the check, watch it go red on that
      id and nothing else, restore. **A guard nobody has seen fail is a guard
      nobody has seen work.** — Renamed `characterize-the-hint-assessment-corpus`;
      red on that id alone, at `AGENTS.md:350` — the same line that carried the
      real defect this guard exists for.
- [x] 3.2 Add a plausible non-id to the docs and confirm the ledger assertion
      catches it as *unledgered* rather than the scan silently passing. — Red on
      `docs/framework-rdd/presentation.md:2`.
- [x] 3.3 Delete an entry from the ledger while its token is still unresolvable,
      and confirm that fails too — the ledger must be exact in both directions.
      — Deleting `puzzle-key-unhandled` goes red. Both *stale* directions were
      proved separately, with distinct diagnostics: an entry nothing cites
      ("no longer cited anywhere scanned") and an entry that has started
      resolving ("now resolves").
- [x] 3.4 *(added)* **The floors were proved too.** Pointing the file glob at a
      renamed root scans 1 file and fails on the floor rather than reporting a
      clean tree over nothing. A floor nobody has seen fail is a floor nobody has
      seen work, and this one guards the failure mode that reports health.
- [x] 3.5 *(added, unplanned)* **The guard caught this change's own prose.** See
      Finding 2 — it is the sixth proof and the only one nobody set up.

## 4. Wire and record

- [x] 4.1 Join the gate's fast prefix beside `spelling.mjs` and
      `openspec-version.mjs`. Time it; it must be in the same order of magnitude
      as those (hundredths of a second), or it belongs in vitest instead.
      — **0.06 s**, against engine-catalog 0.03 s, spelling 0.58 s,
      openspec-version 0.67 s. Placed at 1b-iii, after the catalog guard and
      ahead of the documentation-only shortcut, for the three reasons the two
      guards above it are there.
- [x] 4.2 Repoint `docs/framework-rdd/README.md`'s citation-guard passage: the
      decision is made, and the passage records the measurement and the outcome
      rather than an open question.
- [x] 4.3 Add the rule to the `repo-layout` spec delta. — Including the
      specs-scope decision, which the delta did not have when it was scaffolded;
      see Finding 3.

## 5. Close

- [x] 5.1 `npm run gate`.
- [x] 5.2 Archive under self-driven initiative.

## Findings

### Finding 1 — how a withdrawn change resolves, and the two shapes that were rejected

Task 2.2 flagged that postmortem filenames are shortened —
`2026-09-05-gesture-table-withdrawal.md` for `declare-the-gesture-table` — so no
filename rule maps one to the other. Three candidate resolvers:

- **A hand-written map** from id to postmortem file. Refused outright: that is a
  manifest, and `AGENTS.md` § "Convention over configuration" says every one this
  repo has tried has been reversed. It can be forgotten by the next withdrawal
  and *nothing notices*, which is the same defect class the guard exists to
  catch, one layer out.
- **A status phrase.** Three of the five postmortems say "`<id>` is deleted" in
  their `**Status:**` line, so a resolver could key on that. Rejected: it is a
  scan keyed on a *name*, and the next postmortem that writes "withdrawn" or
  "retired" instead is invisible to it. That is the repo's most-repeated
  instrument failure, and it would fail closed in the noisy direction — a real
  withdrawn id reported as a dead citation.
- **Every id a postmortem names** — chosen. Keyed exactly as the docs are keyed,
  so the two ends cannot drift apart.

**The cost, stated because it is real**: an id a postmortem merely mentions in
passing also resolves, so a rename whose old id happens to appear in a postmortem
would be masked. Accepted, because the property this guard actually asserts is
*"can a reader go and find this?"* — and an id named in a postmortem can be
found. The masking case additionally requires the renamed change to have been
written about in a postmortem, which is a different kind of change from one that
gets renamed.

### Finding 2 — the guard's running cost, discovered by it failing on this change's own prose

Writing the README passage that explains why `openspec/specs/` is out of scope
quoted four spec tokens as examples — and the guard went red on all four, because
in `docs/` **a backtick around a kebab token is a citation**. Nothing was wrong
with the guard; the prose was.

The fix was to stop backticking a word being *used as an example* rather than
*named as a thing*, which is the right trade and cost four characters. But it is
a tax on prose, and it is the 2026-09-04 decline's "an allowlist that grows with
the docs" arriving from a direction nobody predicted: not the docs growing, but
*writing about the guard* growing it. Recorded at the ledger, because the next
person to hit it will reach for a ledger entry, and a ledger entry is the wrong
answer.

### Finding 3 — the specs are out of scope on a measurement, and the ratio is the reason

The proposal left this open: "specs are in scope only if the same scan covers
them". The same scan does cover them, so it was run rather than argued.

**`openspec/specs/`: 71 files, 31 kebab tokens, 15 unresolved — and not one of
the fifteen is a change id.** They are preference keys (no-of-balls,
show-black-nums, show-lit-blobs, snap-to-grid, show-crossed-edges,
solved-with-help, check-and-save), DOM element and event names
(puzzle-view-interactive, puzzle-key-unhandled, status-bar-change,
puzzle-preferences-form), a web component (wa-button-group), and CSS.

Against `docs/` + `AGENTS.md`'s 6 unresolved of 85, that is a fifteen-fold
difference in density, and it is structural rather than incidental: **a spec
describes what the product is, in the product's own kebab-cased vocabulary;
`docs/` and `AGENTS.md` narrate what the project did, which is where changes get
named.** Widening would nearly triple the ledger, add fifteen entries that are
all product vocabulary, and catch nothing. Declined, with the measurement written
at the site so the next reader re-runs it rather than re-deciding it.
