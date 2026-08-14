# Change: a hint's "this cell" must say which cell, whenever a second mark is on the board

## Why

Owner-reported, 2026-08-14, on a Clusters frame showing a solid purple target
**and** an orange-ringed tile side by side, under the sentence:

> *"If this cell were blue, the ringed red tile could never touch two red tiles —
> and every plain tile needs two of its colour. So this cell must be red."*

Two cells are marked, in two different ways, and *"this cell"* points at neither.
The reader has to guess the convention before the sentence parses — which is the
same defect `hints.md` already records twice, in Singles (*"It shares a line
with the ringed white square…"*, a pronoun with no antecedent) and in Galaxies
(*"painting both the action colour made every 'this cell' ambiguous"*).

**The collection's convention is sound and invisible.** Every hinting game uses
the same layout — `COL_HINT` is a solid fill on the cell being decided,
`COL_HINT_CELL` and any ring roles are the evidence — and the narrations
consistently name the *other* mark ("the **ringed** dot", "the **shaded**
squares", "the **highlighted** clue"). Only the target is left bare. So the
sentences are one word short, not wrong, and nothing tells the player which mark
the bare word means.

Clusters is fixed (see below); this change is the sweep.

## What Changes

- **Tie the target to the second mark whenever one is displayed**, per game.
- **Not by naming the colour.** *"the cell marked purple"* was the owner's own
  first suggestion and it is the one option ruled out: `hints.md` forbids colour
  as the only cue, a hue name is false the moment the scheme flips, and it is
  unreadable to a colour-blind player. The tie is **geometric or relational**,
  which the doctrine already prescribes ("for a square that is empty when acted
  on there is no value to name — anchor it on a concrete neighbour").
- **Per-game guards**, in the shape Clusters now carries: *if a second mark is
  displayed, the explanation must contain the tie.* Each proved to fail before
  being trusted.
- **The legend, once, in the help** — this is the other half and it is already
  scoped as `document-hint-feature` task 2.5. Prose that ties two marks together
  works in the moment; a player who has been told "the solid square is where the
  hint acts, the ring is what it is reasoning from" needs less of it. Neither
  substitutes for the other.

## Impact

- Affected specs: `ts-engine` (the hint-narration requirement gains the rule).
- Affected code: the `narrate` functions of the games in the table below, and
  their hint tests. **No solver, generator or highlight geometry changes**, so no
  board moves and no differential is touched — this is wording plus assertions.

## The sweep

Derived by grepping every game's narration for a bare deictic (`this
cell|square|tile|spot`) co-occurring with a second-mark word
(`ringed|shaded|marked|highlighted`), then reading each hit against that game's
hint-colour roles. 118 deictic uses across 26 games; the co-occurrence filter
leaves 25 sentences in 7 games, of which these are the genuine ones.

| game | sentences | verdict |
| --- | --- | --- |
| **clusters** | 4 of 6 branches | **fixed 2026-08-14** — the break is always the target's orthogonal neighbour (`contradictionAround` reports the cell or one of its four), so *"its ringed red **neighbour**"* / *"the ringed red dot **beside this cell**"* identify both at once. The chain branch's break is adjacent to the *last link* instead, so it ties differently: *"forced in turn **from it**"*. Guarded, and the guard was proved to fail on the reported sentence. |
| **bricks** | 3 rule branches + the `localBreak` pair | **flagged** — target fill plus a `COL_HINT_CELL` evidence ring, and *"Shading this cell would make three shaded bricks in a row"* never says the ring is the row. Note `363` is already correct and shows the fix: *"The shaded brick **above** rests only on this cell"*. |
| **range** | 4 branches | **flagged** — target, a shaded run, and a `COL_HINT_BLACKREF` ring; the sentences name the run and leave the target bare. |
| **lightup** | 2 of 3 | **flagged** — *"A bulb **here** would rule out every one of them"* against a shaded set plus a ringed dark square or a highlighted clue. `325` is already fine (*"…except **this one**"* has its antecedent in the same clause). |
| **filling** | 1 | **no change** — *"The shaded region of N can't fully grow **without this square**"* already relates the two: the square is what the region needs. |
| **subsets** | 5 | **no change** — already carries two distinct role words, *"this cell"* against *"the highlighted cell"*, and the set branches read *"can go nowhere but this cell"*. |
| **galaxies** | 3 | **no change, but re-check at acceptance** — this exact report was made against Galaxies before and answered by *weight* (the deduced cell solid, its 180° partner an outline of the same hue) rather than by wording. That was owner-accepted. If the same complaint recurs there, the answer is a word, not more weight. |

**One limitation, stated rather than implied.** The co-occurrence grep finds a
sentence that mentions a second mark. It cannot find a sentence that is bare
while a second mark is *displayed but unmentioned* — the frame would still show
two marks. Catching those needs the render harness (count distinct hint-role
colours in a tier-2.5 frame, flag steps with more than one and a bare deictic),
which is the honest instrument and is task 4.
