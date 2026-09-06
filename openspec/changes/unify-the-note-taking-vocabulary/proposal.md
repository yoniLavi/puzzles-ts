# unify-the-note-taking-vocabulary

**Readiness: measured, and deliberately filed with its counter-argument.** The
measurement is done and is below; what is not settled is whether the payoff
clears the bar, and the honest reading is that it is a *cleanliness* refactor
rather than a defect fix. Task 0 says so explicitly rather than leaving the next
session to discover it.

Found by `audit-declared-versus-derived-capabilities` while classifying the
cross-game guards: `mark-all.test.ts` is the one guard in the tree that still
carries a hand-written adapter row per game, and it carries one *because the
games spell the same field three ways*.

## The measurement

The eleven note-taking games keep their pencil candidates in a typed array, and
name it three different things:

| Spelling | Games |
| --- | --- |
| `pencil` | Towers, Keen, Unequal, Solo, Group, Abcd |
| `marks` | Mathrax, Seismic, Salad, Crossing |
| `pencils` | Undead |

The element type genuinely differs (`Int32Array`, `Uint8Array`, `Uint16Array`)
and so does the arity (Abcd's notes are a candidate *cube*, `n` contiguous slots
per cell). **Neither of those is the name.** Applying this repo's own test — *can
we say what a game would legitimately want to do differently?* — there is no
answer for the noun: all eleven mean "this cell's candidate marks".

Precedent: `unify-cross-game-vocabulary` did exactly this twice, for the
completion flags (25 restatements, and Magnets had spelled `cheated` as `solved`
— one word meaning opposite things in three games) and the keyboard cursor (50
games, ten spellings of the flag and eight of the position). Its recorded lesson
applies directly here and should be re-read before trusting the table above:
**it counted *spellings* and thereby under-measured the population both times.**
So the first task is to re-derive the eleven from the `Ui`/`State` shape rather
than from the three words, exactly as `note-taking-cell.test.ts` derives its own.

## The payoff, stated at its real size

- `mark-all.test.ts`'s ten hand-written `Row`s collapse into a derived
  population, which is the last hand-maintained per-game roster in the guards
  after `audit-declared-versus-derived-capabilities`.
- One noun for one concept, which is the standing convention-over-configuration
  goal, and the owner's bar is explicit that "makes the codebase noticeably
  cleaner" is sufficient on its own.

## The counter-argument, which a future session should weigh rather than skip

**No shared engine code reads the notes array today**, which is what makes this
weaker than the two vocabularies already unified: `winFlash` reads the completion
flags and the shared `GridCursor` helpers read the cursor, so those renames
removed a real obstacle. This one removes a test adapter.

And the obvious "then lift the entry block too" follow-on is **already considered
and declined**, for a reason the rename does not touch: `note-taking-cell.ts`
records that the residual ~28-line clone across Keen, Solo, Towers and Unequal is
the *move literal* plus its predicates, and lifting it would mean a shared `Move`
— which `border-grid.ts` refused on the grounds that a shared move type couples
save formats that have no reason to be identical. **Do not file this change as
unblocking that; it does not.**

## Impact

- Affected specs: `ts-engine` (a vocabulary requirement, alongside the existing
  cursor and completion ones).
- Affected code: eleven games' `State` (and whatever reads the field within each
  game), plus `mark-all.test.ts`.
- **Not player-visible, and not a compatibility question** — checked, not
  assumed. `SaveEnvelope` is `{ v, puzzleId, params, desc, privDesc?, moves,
  pos, … }`: a versioned **move log**, with no state dump in it, so a `State`
  field name is never on the wire. The one path that *could* put a name there is
  `encodeUi`, and the notes array is on `State` rather than `Ui` in all eleven
  games. That is the same check `unify-cross-game-vocabulary` ran on the cursor
  rename, where the worry turned out to be unfounded for exactly this reason —
  Net's `encodeUi` emits `C<x>,<y>`, so the wire never knew the field's name.
  **Re-run it anyway** if the rename reaches a `Ui` field.
