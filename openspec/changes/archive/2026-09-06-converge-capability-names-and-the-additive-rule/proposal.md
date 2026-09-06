# converge-capability-names-and-the-additive-rule

**Readiness: ready.** The first executed batch of `re-express-the-collection`,
whose route the owner settled on 2026-09-06 as the full sweep. Two small items
from `survey.md`'s B1 and B5, bundled because each is too small to be its own
change and both are the same finding: *one thing, said more than one way.*

## Why these two together

The sweep's acceptance test is *pick any two games that mean the same thing and
ask what still differs.* Both items are a difference nobody can defend as
belonging to the puzzle, and neither is big enough to carry a change alone.

### 1. Four games alias a capability into the game object (B5)

boats (`findBoatsMistakes`), crossing (`findCrossingMistakes`), salad
(`saladFindMistakes`) and netslide (`netslideHint` / `netslideHintKeepTrack`)
name the function one thing and wire it to the contract member under another.
Thirty-seven other games name the function for the member it implements.

A reader learning this collection from its corpus — which is how a new game gets
written here — meets two conventions for one thing. That is the fork in the road
the sweep exists to remove.

**`AGENTS.md` § "Method" lists exactly these names** as the reason its cross-game
scans must key on shape rather than on a name. That is not the argument for this
change (the fix for a scan keyed on a name is to key on shape, and the repo
already does), but it is a fair measure of how far the divergence had spread: the
project's own brief had to warn about it.

### 2. Nine copies of one correctness rule's rationale (B1)

The rule that mark-all is **additive** — *fill only the cells that have no notes
yet, never reset one the player has narrowed* — was written out in nine games'
`executeMove`, in two variant wordings, three of them naming the owner report and
its date. A correctness rule with nine statements of itself is one that lies in
eight places the day it changes.

The rule now lives once, beside the contract it belongs to
(`candidate-hint.ts`'s `adaptiveMarkAll`), with its history, its enforcement
(`mark-all.test.ts`) and — the part the games kept getting right — **what each
game still decides for itself**. Each game cites the heading in two lines, and
the three games whose loop genuinely differs say how in one more.

## What this change does not do

**It does not extract the `pencilAll` loop**, and `survey.md`'s B1 is closed as
dissolved rather than delivered. Re-measured and read, that batch's ~380 lines
were ~100 lines of import blocks (an instrument artifact — an import list is not
duplication), ~72 lines of the move literal that `note-taking-cell.ts` had
already declined with a reason, and loops whose bodies are the whole content:
Seismic's mask is per-cell, Salad's depends on the hole type, ABCD's notes are a
candidate cube, Undead's emptiness test is its own. A shared form needs three
callbacks and a count, and is longer at each call site than the four lines it
replaces.

**A clone cluster is a place to look, never a finding** — recorded in
`survey.md`, because that is the reusable half of the correction.

## Impact

- Affected specs: none. No behavior, format or contract changes.
- Affected code: `src/games/{boats,crossing,salad,netslide}/` (renames),
  `src/games/{abcd,group,keen,mathrax,seismic,solo,towers,undead,unequal}/index.ts`
  (comment citations), `src/engine/candidate-hint.ts` (the canonical statement).
- **Player-invisible by construction.** Renames and comments only; the frozen
  differentials, the render snapshots and the capability surface must not move.
- `src/engine/hint-refusal.test.ts`'s record of the `netslideHint` instrument
  failure is repointed, because the name it cites no longer exists — a record
  naming a vanished symbol is a small trap for the next reader.
