## 1. Take the categories first

- [ ] 1.1 `npm run dead-exports` and group the report by name rather than by
      file. The four largest groups — `DIFF_NAMES` (9), `DIFF_CHARS` (9),
      `DIFFCOUNT` (5), `HINT_PLAN_MAX` (4) — are one decision each, and each is
      evidence that a convention landed and left the per-game copies behind.
      Delete the group, or say what still reads it.
- [ ] 1.2 Check whether any of those names is a *shadow* rather than a leftover:
      Solo's `SYMM_ROT4` duplicates the engine's live constant, so deleting it
      removes a second spelling of one meaning, which is worth more than the
      four lines.

## 2. The rest, one file at a time

- [ ] 2.1 Sort each finding into the three answers to "who is meant to import
      this?" — nobody ever (delete), only this file (un-export), or a consumer
      the archive predicts (keep, ledgered with the change that predicts it).
      `hint-mark.ts`'s four band constants are the second and third at once, and
      the proposal says why.
- [ ] 2.2 A type that documents a module's surface and a Lit component class
      reached by tag (five in `src/dialogs/`) are ledger entries, not deletions.
- [ ] 2.3 Verify by shape, not by a green suite: every removed line is an export
      the report named, and nothing else moved. The typechecker cannot help —
      that is the whole reason these survived.

## 3. Close

- [ ] 3.1 With the report empty, move `scripts/checks/unused-exports.mjs` into
      the gate's fast prefix in `scripts/gate.sh`, beside the other node checks.
- [ ] 3.2 Prove it red: delete the last import of some export, watch the gate
      fail, restore.
- [ ] 3.3 Run the full gate.
- [ ] 3.4 Archive the change.
