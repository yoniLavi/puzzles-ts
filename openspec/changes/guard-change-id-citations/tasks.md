# guard-change-id-citations — tasks

## 1. Re-take the measurement rather than inheriting it

- [ ] 1.1 Re-run the scan at implementation time. The figures in the proposal
      were taken on 2026-09-09 and this change's whole subject is that such a
      figure has a half-life measured in minutes. Report files scanned, tokens
      found, resolved, non-ids, dead.
- [ ] 1.2 Confirm the three resolution homes are all still real: an open change
      directory, an archive entry (cited **with or without** its date prefix),
      and `openspec/postmortems/` for a withdrawn row. A resolver that knows only
      the second reported eleven false positives out of twelve on its first run.

## 2. The check

- [ ] 2.1 `scripts/checks/change-citations.mjs`. Scope: `docs/**/*.md` and
      `AGENTS.md`. Key: a backticked kebab-case token of three or more segments —
      accept the superset and classify, never narrow the key (`AGENTS.md`
      § "A scan that keys on a name").
- [ ] 2.2 Resolve against all three homes. Postmortem filenames are *shortened*
      (`2026-09-05-gesture-table-withdrawal.md` for `declare-the-gesture-table`),
      so the mapping is not a substring match — decide it explicitly and say so
      at the site rather than leaving the next reader to infer it from a glob.
- [ ] 2.3 The non-ids are a **ledger asserted equal** to the unresolved set, not
      a skip list: a token that starts resolving fails, and a new non-id must be
      added deliberately. `NO_KEYBOARD` is the shape.
- [ ] 2.4 Vacuity floors: assert a minimum file count and token count, so a docs
      restructure that breaks the glob fails loud instead of reporting health.
- [ ] 2.5 **`census-the-hintless-logic-games` will be the first entry, and it is
      not a non-id** — it is a *deliberately* dead id, cited once in
      `docs/framework-rdd/README.md` as the worked example of this exact failure.
      The ledger therefore holds two kinds of entry and must say which is which
      at each one, or the next reader deletes the wrong one. Decide the shape
      before writing the list: a second ledger, or one list with a per-entry
      reason, is a real choice and the reason belongs at the member either way.

## 3. Prove it fails

- [ ] 3.1 Rename a cited change directory, run the check, watch it go red on that
      id and nothing else, restore. **A guard nobody has seen fail is a guard
      nobody has seen work.**
- [ ] 3.2 Add a plausible non-id to the docs and confirm the ledger assertion
      catches it as *unledgered* rather than the scan silently passing.
- [ ] 3.3 Delete an entry from the ledger while its token is still unresolvable,
      and confirm that fails too — the ledger must be exact in both directions.

## 4. Wire and record

- [ ] 4.1 Join the gate's fast prefix beside `spelling.mjs` and
      `openspec-version.mjs`. Time it; it must be in the same order of magnitude
      as those (hundredths of a second), or it belongs in vitest instead.
- [ ] 4.2 Repoint `docs/framework-rdd/README.md`'s citation-guard passage: the
      decision is made, and the passage records the measurement and the outcome
      rather than an open question.
- [ ] 4.3 Add the rule to the `repo-layout` spec delta.

## 5. Close

- [ ] 5.1 `npm run gate`.
- [ ] 5.2 Archive under self-driven initiative.

## Findings

_(none yet — not started)_
