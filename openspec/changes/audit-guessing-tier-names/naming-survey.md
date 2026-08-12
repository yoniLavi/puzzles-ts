# Collection-wide tier naming, surveyed

Owner-requested (2026-08-12), because the six renames in tasks 2c pick names for
six top tiers and that should not be done without knowing what the collection's
conventions actually are.

**The population is the registry**, read off `Game.difficulty.tiers` — the same
derivation `difficulty-contract.test.ts` uses. Not a `DIFF_*` grep and not a
hand-list: both have already missed a game in this repo's history (the grep
missed Bridges).

**29 tiered games; 28 untiered.** Note 29, not the 28 recorded by
`add-game-difficulty-contract` — the count has moved since and the stale number
is in that change's notes, not in any live assertion.

## 1. Every tiered game

| game | tiers |
| --- | --- |
| ascent | Easy · Normal · Tricky · Hard |
| boats | Easy · Normal · Tricky · Hard |
| bricks | Easy · Normal · Tricky |
| bridges | Easy · **Medium** · Hard |
| clusters | Easy · Tricky |
| dominosa | Trivial · Basic · Hard · Extreme · **Ambiguous** |
| galaxies | Normal · Unreasonable |
| group | Trivial · Normal · Hard · Extreme · Unreasonable |
| keen | Easy · Normal · Hard · Extreme · Unreasonable |
| lightup | Easy · Tricky · Unreasonable |
| loopy | Easy · Normal · Tricky · Hard |
| magnets | Easy · Tricky |
| map | Easy · Normal · Hard · Unreasonable |
| mathrax | Easy · Normal · Tricky · Unreasonable |
| pearl | Easy · Tricky |
| rome | Easy · Normal · Tricky |
| salad | **Normal** · Extreme |
| seismic | Easy · Hard |
| singles | Easy · Tricky |
| slant | Easy · Hard |
| solo | Trivial · Basic · Intermediate · Advanced · Extreme · Unreasonable |
| spokes | Easy · Tricky · Hard |
| subsets | Easy · Tricky |
| tents | Easy · Tricky |
| towers | Easy · Hard · Extreme · Unreasonable |
| tracks | Easy · Tricky · Hard |
| undead | Easy · Normal · Tricky |
| unequal | Trivial · **Easy** · Tricky · Extreme · Unreasonable |
| unruly | Trivial · Easy · **Normal** |

**The tiers and the custom-params dialog's choices agree in all 29** — no
mismatches. (Unequal's did not, until this change folded its hand-copied list
into `DIFF_NAMES`.)

## 2. Twelve distinct words, and what each one means depends on the game

| word | games | positions used (rung/total) |
| --- | --- | --- |
| Easy | 24 | 1/2 1/3 1/4 1/5 **2/3 2/5** |
| Tricky | 17 | 2/2 2/3 3/3 3/4 3/5 |
| Hard | 13 | 2/2 2/4 3/3 3/4 3/5 4/4 |
| Normal | 13 | **1/2** 2/3 2/4 2/5 **3/3** |
| Unreasonable | 9 | 2/2 3/3 4/4 5/5 6/6 — **always last** |
| Extreme | 7 | 2/2 3/4 4/5 5/6 |
| Trivial | 5 | 1/3 1/5 1/6 |
| Basic | 2 | 2/5 2/6 |
| Advanced | 1 (solo) | 4/6 |
| Ambiguous | 1 (dominosa) | 5/5 |
| Intermediate | 1 (solo) | 3/6 |
| Medium | 1 (bridges) | 2/3 |

**`Unreasonable` is the only word in the collection with a stable meaning**: nine
games use it, and in every one it is the last tier. That is what makes it usable
as the guessing marker — and what the six renames in 2c preserve.

## 3. Top-tier names — six different answers

| top tier | games |
| --- | --- |
| Tricky | 9 — bricks, clusters, magnets, pearl, rome, singles, subsets, tents, undead |
| Unreasonable | 9 — galaxies, group, keen, lightup, map, mathrax, solo, towers, unequal |
| Hard | 8 — ascent, boats, bridges, loopy, seismic, slant, spokes, tracks |
| Ambiguous | 1 — dominosa |
| Extreme | 1 — salad |
| Normal | 1 — unruly |

## 4. What this settles for the 2c renames

- **Salad** `Normal · Extreme` → `Normal · Unreasonable`. Joins the nine; no
  preset offers Extreme, so nothing in the preset menu moves.
- **Undead** `Easy · Normal · Tricky` → `Easy · Normal · Unreasonable`.
- **Clusters** `Easy · Tricky` → `Easy · Unreasonable`. Matches Galaxies'
  `Normal · Unreasonable` two-tier shape exactly.
- **Dominosa** `… Hard · Extreme · Ambiguous` → `… Hard · Unreasonable ·
  Ambiguous`. Reads oddly with `Ambiguous` after it, but `Ambiguous` is **not a
  difficulty** — it is the tier whose generator skips uniqueness altogether
  (`nonUniqueTiers`), a different promise rather than a harder one. Extreme is
  Dominosa's top *difficulty* tier, so the rule lands on it.
- **Bricks** and **Spokes** are the two the survey confirms cannot be swept:
  - Bricks is `Easy · Normal · Tricky` with the trial at **Normal** and Tricky
    declared-but-ungenerable. Renaming Normal gives `Easy · Unreasonable ·
    Tricky` — an ordering no player can read. Its own design pass.
  - Spokes is `Easy · Tricky · Hard` with the trial at **both** Tricky and Hard.
    Two tiers cannot share a name. Its own design pass.

## 5. Naming defects this survey found that are **not** about guessing

**Recorded here for scoping, deliberately not scaffolded** — item 6 below needs
an owner decision *before* a proposal exists, and a change directory for a
question nobody has answered is a stale pointer waiting to happen. They are a
distinct body of work with a distinct risk: every one is player-visible, and
none of them is a correctness question.

1. **A top tier called `Normal`** — Unruly is `Trivial · Easy · Normal`, so the
   hardest Unruly a player can pick is labelled the way most games label their
   *second* rung.
2. **A top tier called `Extreme` with nothing above it** — Salad; fixed here as a
   side effect, but the general shape (a word whose other 6 uses all have a
   harder tier above) is the same defect.
3. **`Easy` is not always the bottom tier** — Unequal puts `Trivial` below it
   (2/5), as do Solo and Group with `Basic`/`Normal`. Defensible per game;
   inconsistent across the collection.
4. **`Normal` spans bottom to top** — bottom in Salad (1/2), top in Unruly (3/3),
   middle in eleven others.
5. **`Medium` is a singleton synonym** for `Normal` (Bridges alone).
6. **`Tricky` and `Hard` are used interchangeably** for the same role — both
   appear as the rung above Normal *and* as a top tier, in 17 and 13 games.
7. **Three of Group's five tiers have no preset** (Trivial, Extreme,
   Unreasonable); Bricks' Tricky, Dominosa's Ambiguous, Loopy's Tricky, Mathrax's
   Unreasonable and Salad's Extreme are likewise custom-params-only. Not a naming
   defect, but it is what decides how player-visible any rename is, so it belongs
   with them.

**The one thing worth deciding before that change is scoped**: (6) is the big
one and it is not obviously a defect — a three-tier game reasonably calls its top
rung `Hard`, and a two-tier game reasonably calls it `Tricky`. A collection-wide
ladder vocabulary would be a large, purely cosmetic, entirely player-visible
sweep. It needs an owner decision on whether consistency is worth the churn
before anyone writes code.
