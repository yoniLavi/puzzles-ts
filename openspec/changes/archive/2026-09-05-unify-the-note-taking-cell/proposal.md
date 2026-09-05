# unify-the-note-taking-cell

**Readiness: ready.** The exploration that gates it has already run — see
`openspec/postmortems/2026-09-05-gesture-table-withdrawal.md`, Finding 5, which
is where this change came from. There is no task 0.

## Why

**Eleven games implement the same input mechanic eleven times, and it is now the
largest cross-game duplication in the repository.**

The mechanic is one design: *a cell you highlight, type a value into, and pencil
candidate marks in.* Abcd, Crossing, Group, Keen, Mathrax, Salad, Seismic, Solo,
Towers, Undead and Unequal each carry their own copy — the sticky-pencil press
block, the symbol-entry block with its no-op guards, and the rule that a
mouse-driven entry puts the highlight away while a keyboard one keeps it.

Measured 2026-09-05 with `jscpd` over those eleven `index.ts` files (≥10 lines /
≥70 tokens): **514 duplicated lines in 26 exact clones**, 60% of the clone-sides
falling inside `interpretMove`. For scale, [`border-grid.ts`](../../../src/engine/border-grid.ts)'s
own doc comment records the 466 lines between Palisade and Separate as "the
largest cross-game duplication in the repository". **That sentence is now false**,
and this change is what makes it true again.

Two things say the figure is a floor, not a ceiling:

- **The flag has two spellings.** Eight games write `hpencil`, three write
  `cpencil`; the keyboard-cursor companion splits `hcursor` / `ckey` the same
  way. Fold the camps to one name and the same measurement returns 567 lines —
  53 that the naming alone was hiding. This is exactly the shape
  `unify-cross-game-vocabulary` fixed for the keyboard cursor (ten spellings of
  one flag) and for the completion vocabulary (one word meaning opposite things
  in three games). It did not catch this one because it was scoped to those two.
- **Salad and Group contribute zero clone-sides** and implement the same
  mechanic regardless — they restructured it enough to escape an exact-clone
  matcher. Reading all eleven bodies says the population is eleven; the tool can
  only see nine. **Read the population; do not let the instrument define it.**

## The decision this removes

Judged by AGENTS.md § "Convention over configuration" — *can we say what a game
would legitimately want to do differently?*

- **"What does a right-click do to the highlight?"** No game answers this about
  its puzzle. Eleven have answered it eleven times, in two vocabularies, and the
  answers agree. It is a convention somebody forgot to make.
- **"Does an entry hide the highlight?"** Same: every one of the eleven says
  *yes if the pointer drove it, no if the keyboard did*, and each says it in its
  own five lines.
- **"Where does sticky pencil mode live?"** It is a fork-wide preference
  (`docs/games/mechanics.md` § "Pencil marks: the full note-taking UX"), and its
  *behavior* is currently re-implemented per game — so a change to how sticky
  pencil behaves is an eleven-file change today, which is precisely
  `border-grid.ts`'s test for what belongs in shared code.

**This family has already had one unification round, and it stopped one layer
short.** [`engine/pencil-prefs.ts`](../../../src/engine/pencil-prefs.ts) already
shares the *preference* layer for the same games — `stickyPencilPref` (ten
games), `pencilKeepHighlightPref` (six), `autoPencilPref` (five) — with one field
name each and no camps, and its doc comment states this change's own criterion:
"Sharing only the keyword and plumbing is the honest amount to share." The two
flags that are still split in two vocabularies, `hpencil`/`cpencil` and
`hcursor`/`ckey`, are exactly the *transient* ones that round did not reach. So
the template is not hypothetical, and it is in this family.

**What must stay with the game**, and the reason this is a mechanic module and
not a framework:

- **Two predicates.** *Can this cell take a real entry?* (Solo and Towers ask
  `immutable`, Mathrax and Seismic ask a flag bit, Crossing asks `!walls[i]`,
  Abcd asks nothing at all) and *can this cell take a pencil mark?* (universally
  "is it empty", but "empty" is spelled differently in each). These genuinely
  differ, and they are what the game passes in.
- **The symbol vocabulary.** Digits to `w`, letters past nine (Solo, Group),
  circles and crosses (Salad), ghosts / vampires / zombies (Undead), Unequal's
  `'0'`-based keypad past order ten. A game decodes its own button.
- **Whether sticky pencil is offered at all.** Group is the one member with no
  `pencilSticky` field, so the shared arm must be correct for a game that never
  latches — derived from the game's own declaration, never from an exemption
  roster (AGENTS.md § "Convention over configuration").
- **Its own `Move` type.** As `border-grid.ts` puts it: the shared code reports
  *what the player did to which cell*, never a move. A shared move type would
  couple eleven save formats that have no reason to be identical.
- **Everything layered on top.** Crossing's across/down flip and auto-advance,
  Group's display-space-versus-element-space cursor, Undead's count blocks,
  Towers' 3D tower-top hit retarget, Unequal's clue-spent gap clicks, Salad's
  middle-click cycle. These sit outside the shared arm and are untouched.

## What changes

A new `src/engine/note-taking-cell.ts`, built the way `border-grid.ts` was:

- **One name for the mode flags.** `ui.pencil` and the keyboard-cursor
  companion, folded from `hpencil`/`cpencil` and `hcursor`/`ckey`, guarded
  structurally the way `cursor-vocabulary.test.ts` guards `ui.cursor` — so a
  twelfth spelling is caught as surely as the two that are there.
- **The press arm**, taking the two predicates and returning *what happened to
  the highlight*, not a move.
- **The entry arm**, taking a decoded symbol and returning *set / pencil / clear
  at this cell, or nothing* — with the no-op suppression and the
  hide-the-highlight rule in one place.
- Each game keeps its `interpretMove`, its move type, its `executeMove`, its
  solver, its renderer and its own answers.

## Impact

- Affected specs: `ts-engine` (the shared note-taking cell), `repo-layout`.
- Affected code: `src/engine/note-taking-cell.ts` (new); the eleven games'
  `index.ts` and their `Ui` types in `state.ts`; `render.ts` where it reads the
  renamed flags.
- **Player-visible, and the risk is asymmetric.** Behavior must not move at all:
  eleven games' pencil UX is exactly the kind of thing that shifts by one
  keystroke under a refactor and nobody notices until a player does. The
  assurance is that every one of the eleven has frozen differentials and render
  snapshots that must pass **byte-clean**; a re-baselined snapshot means the
  refactor changed behavior and is wrong. Owner acceptance on top, on at least
  one game from each naming camp.
- **No player data can see the rename**, checked rather than assumed:
  `Midend.saveGame` writes a `ui` field only when the game implements
  `encodeUi`, and **none of the eleven does** — so the `Ui` never reaches a save
  at all. Preferences persist under `GamePref.kw` strings
  (`"sticky-pencil-mode"`), which are decoupled from field names by
  construction. This is a stronger guarantee than the one
  `unify-cross-game-vocabulary` relied on, where Net's `encodeUi` had to be
  name-blind; here there is nothing serialized to be blind about. Re-check both
  facts before the rename lands rather than citing this line.
