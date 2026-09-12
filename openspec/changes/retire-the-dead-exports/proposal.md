# 373 exports nothing imports

## Why

`guard-the-debt-the-tidy-pass-cleared` set out to wire knip into the gate on the
premise that it "reports zero unused exports, which is the good state the pass
just produced by hand". knip's zero turned out to be a scan of nothing — it does
not follow this tree's `.ts` import specifiers — and the check written to replace
it reports **373**.

They are real. Five spot-checks, each with zero references anywhere outside its
declaring file:

- `src/games/solo/state.ts` — `SYMM_ROT4`, a private copy shadowing the engine's
  live one in `symmetric-blacks.ts`. Two constants with one name and one meaning,
  and only one of them consumed.
- `src/engine/hint-mark.ts` — `MARK_TOP`, `MARK_LEFT`, `MARK_RIGHT`,
  `MARK_BOTTOM`.
- `src/games/undead/state.ts` — the whole `CELL_*` and `DIRECTION_*` vocabulary.
- `src/games/tents/state.ts` — `DIFF_NAMES`, which nine games still export and
  which `adopt-conventional-tier-names` made derivable.
- `src/utils/timing.ts` — `debounce`, named only in comments.

The shape of the backlog is itself the finding. `DIFF_NAMES` (9),
`DIFF_CHARS` (9), `DIFFCOUNT` (5) and `HINT_PLAN_MAX` (4) alone are 27 of the
373, which says a convention landed and the per-game copies it replaced were left
behind — the same pattern the tier-name work found and the same one
`AGENTS.md` § "N games sharing a defect means the layer below them is wrong"
describes.

## What changes

- The 373 are triaged and deleted, or kept with a reason in the check's
  `KEPT_UNUSED` ledger.
- The categories are taken as categories rather than one line at a time: a
  constant nine games export and nobody imports is one decision, not nine.
- `scripts/checks/unused-exports.mjs` moves from `npm run dead-exports` into the
  gate's fast prefix — one line in `scripts/gate.sh` — which is the act that
  closes this.

## What to check before deleting

The check counts an export as used only if another file imports it by name, the
file is an entry, or a non-`?raw` glob reaches it. Deleting a *type* that exists
to document a module's surface is a judgment call, not a mechanical one. And
`src/dialogs/*` exports Lit component classes reached from templates by tag
rather than by import — five of the 373 — so the ledger is the right answer
there, not deletion.
