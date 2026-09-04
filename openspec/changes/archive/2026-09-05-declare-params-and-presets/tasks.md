# declare-params-and-presets — tasks

Rewritten 2026-09-05 from what the exploration found (task 0.4). The original
list was scaffolding around an unanswered question; the Findings section below
is the answer, and these tasks are what it implies.

## 0. Explore before proposing anything concrete — done

- [x] 0.1 `/opsx:explore`.
- [x] 0.2 Measure how many games' params codecs a shared parser could serve, by
      reading them. **Answer: the shared *parser* already existed and was
      already adopted; the unshared half was the encoder and the pairing.** See
      Findings.
- [x] 0.3 Decide whether the "declares `paramConfig` iff it has varying params"
      guard splits out as its own change. **No — it already exists**, as the
      `ts-engine` requirement "No game ships an empty custom-params dialog",
      and all 57 games declare one today. Nothing to split out.
- [x] 0.4 Rewrite this task list from what the exploration finds.

## 1. The byte-stability guard — the safety net, built first

- [x] 1.1 `engine/testing/params-corpus.ts`: a params corpus derived from the
      registry — every preset, every tier through the game's own `paramConfig`
      item, one perturbation per field of the default params. 57 games, 612
      cases, vacuity-guarded on both counts.
- [x] 1.2 Derive the cardinality-field exclusion from the record's shape rather
      than a game roster (Boats' `fleet`/`fleetData` found it).
- [x] 1.3 `engine/params-stability.test.ts`: encode/decode are mutual inverses
      over all 612 cases (property, no exemption roster — it held for all 57 on
      day one), plus a per-game byte-stability snapshot.
- [x] 1.4 Prove the guard fails: break a codec deliberately, watch both halves
      go red, restore. (Tents `d` → `D`; the inverse property *and* the
      snapshot both fired.)

## 2. The declared codec

- [x] 2.1 `engine/params-codec.ts`: `paramsCodec` plus the `dims` / `size` /
      `num` / `choice` / `flag` segments, with `full`, `invalid`, `means`,
      `omitWhen` and `whenAbsent`.
- [x] 2.2 Segments name a `paramConfig` field by `kw` and reuse its accessors;
      an unknown `kw` throws rather than encoding nothing.

## 3. The proving set — 19 games, chosen to exercise every segment kind

- [x] 3.1 `dims` only: Fifteen, Filling, Pattern, Range, Sokoban.
- [x] 3.2 `dims` + `choice`: Tents, Bricks, Clusters, Rome, Slant, Singles,
      Undead. (Singles and Undead store a tier as a string union — converted
      without changing their representation, which is the accessor-reuse
      property doing its job.)
- [x] 3.3 `num`, including `whenAbsent`: Palisade, Separate.
- [x] 3.4 `flag`: Magnets, Tracks (`means: false`), Signpost.
- [x] 3.5 `size`: Towers.
- [x] 3.6 `omitWhen`: Sixteen.
- [x] 3.7 Verify by shape, not by a green suite: every added line in the
      37-file diff is a codec declaration, a moved `paramConfig`, an import or
      a comment. Net −100 lines; `index.ts` files lost 240 and gained 45.
- [x] 3.8 The byte-stability snapshot is **unchanged** through all 19
      conversions — which is the whole proof that they were safe.

## 4. Documentation

- [x] 4.1 `docs/games/mechanics.md` § "Codecs and validation": the declaration,
      the six segment kinds, the accessor-reuse property, the bespoke hatch and
      the stability guard.
- [x] 4.2 `Game.paramConfig` doc comment: say that it is the field list two
      other things derive from, and drop the stale "correct for a preset-only
      game like Flip" (Flip declares one; all 57 do).

## Standing constraints

- [x] C1 **Existing games keep byte-stable params encodings.** Held by
      assertion now, not only by policy — and no encoding moved.
- [x] C2 Check which fixtures would catch an encoding change. **They would
      not**: the frozen differentials cover descs, not params. That gap is what
      task 1 closes, and it is why the guard was built before the first
      conversion rather than after.
- [x] C3 Both shapes coexist: a game with a bespoke codec stays first-class,
      and is held to the same byte-stability guarantee.

## Findings

**The measurement task 0.2 asked for, run by reading all 57 encoders and a
sample of the decoders.**

| Shared helper | Adoption | Status before this change |
| --- | --- | --- |
| `dimensionParamConfig()` | 47 / 57 | already extracted, already adopted |
| `parseDimensions()` | 26 / 57 | already extracted |
| `paramConfig` declared at all | 57 / 57 | trap closed, and already guarded |
| a shared **encoder** | 0 / 57 | did not exist |

So the change's premise moved: the shared `WxH` *parser* it hoped to build was
already in `engine/params.ts` and broadly adopted. What no game shared was the
**encoder** — 57 hand-written template strings — and the **pairing** between
encoder and decoder, held to be inverses by discipline with nothing asserting
it. `d<DIFF_CHARS[diff]>` alone was written out about twenty times, beside five
different local idioms for consuming a digit run (`eatNum`, `readInt`,
`digits`, `parseLeadingInt`, `parseInt(slice)` + a `while`).

**This is row 1's lesson repeating.** *The declaration a concern should be
derived from is not always the one the vision named.* The vision named the
codec; the declaration that actually holds the field list is `paramConfig`,
which already carries every field's `kw`, type and accessors. Deriving the
codec from it collapses three hand-synced copies of one list to one.

**The vision's named escaper does not escape.** `game-definition.md` conceded a
bespoke hatch for Blackbox's `w<W>h<H>m…M…`. Read as *a sequence of tagged
segments* rather than *dimensions plus a suffix*, that is inside the grammar —
it simply does not lead with `WxH`. The genuine escapers are five shapes, named
in the `ts-engine` delta, and "omit when default" turned out to be a declarable
predicate rather than an escape.

**Two malformed-input behaviors converged, deliberately.** Range decoded a
string with no leading digits to its first preset's width, and Singles to its
default width; every other game yielded 0, which `validateParams` then rejects
with a real message. The converted form yields 0 everywhere. This is
strictly better — a corrupt game ID is now refused rather than silently dealing
a playable board that is not the one the link named — and it is unreachable
from any encoder, so no shared ID changes.

**Bricks encoded an out-of-range tier as the literal `undefined`** (no `?? "?"`
fallback, unlike its siblings). The declared form writes `?`. Both are invalid
ids; the convergence is on the majority spelling.

## Follow-up found, not filed as a defect

`dimensionParamConfig()` + a difficulty `choices` item is written out
identically in roughly 29 games — twelve lines each, differing only in the
accessors. That is the next `paramConfig`-shaped convention, and it is a
separate change: it belongs with the params *form*, not with the codec, and
bundling it here would have made the codec's proving set unreadable.
