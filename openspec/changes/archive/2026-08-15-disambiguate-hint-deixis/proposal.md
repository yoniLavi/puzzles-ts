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

- Affected specs: `ts-engine` (the hint-narration requirement gains the rule)
  and `lightup` (a discount narration must count the set the way the deduction
  does — see the sweep note below).
- Affected code: the `narrate` functions of the games in the table below, their
  hint tests, and **one mark**: Range gains `RangeHint.clue`, whose digit draws
  `COL_HINT`. That is a highlight change the proposal did not plan and the
  running app demanded — "Clue 5" names nothing on a board whose shaded run
  holds two 5s, which is precisely the case the rule calls *"the marks need
  fixing, not the sentence"*. **No solver, generator or codec changes**, so no
  board moves and no differential is touched.

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

## What the frame-based sweep then found (task 4, and it is a negative result)

`scripts/checks/hint-deixis.test.ts` reads the frame instead of the words, over
every hinting game and **every tier**: 3,914 steps, 3,045 of them showing a
second mark. It caught the one sentence the grep structurally could not — Light
Up's *"every square that could light it … is crossed out or already lit"*, which
**shades that corridor and never says so** — and it flags 230 sentence shapes in
20 games, of which reading every one found nothing else to change.

**So it ships as a report, not a gate.** The false positives are four legitimate
ties no lexical rule recognises: by **value** (Singles), by **line context**
(Group), by a **continuation leg's antecedent** (Slant, Spokes), and above all by
**the marks being different kinds of thing** — Palisade marks an edge against
regions, Spokes a spoke against hubs, Sticks a square against a clue, and the
noun in "this edge" already picks the target out. Every genuine case marks a
**cell against another cell**, which is the cheap question a future port should
ask first, and is now the opening sentence of the `hints.md` section.

**Two defects that were not deixis, both found by writing the tie.** Light Up's
discount narration never stated the premise its conclusion needs (*one of them
must hold a bulb*), and said *"only the shaded squares"* can light the ringed
square — when the ringed square is **itself a member of the candidate set in
over half of those firings** (`litCells(…, true)` includes the source; a dark
square lights itself), and being ringed rather than shaded it was excluded by
the wording. The measurement that established each game's relation is what
surfaced both.
