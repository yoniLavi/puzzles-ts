# derive-the-type-menu-summary — tasks

## 0. Decide how the tier list crosses the worker boundary — done

- [x] 0.1 `/opsx:explore`. **It already crosses**: `getCustomParamsConfig()`
      returns a `ConfigDescription` whose `choices` items carry `choicenames`,
      built by the midend from the game's `paramConfig` — the same array
      `difficultyTiers` reads, and the reason the Custom dialog was right all
      along. No new message and no change to `ConfigValues`. See `design.md`,
      including why sending the resolved name in `ConfigValues` was rejected.
- [x] 0.2 Confirm the blast radius. **The proposal's premise was wrong** and the
      measurement corrected it: six non-difficulty tokens also name `choices`
      fields, and five spell the declared names *exactly* — the same copy
      waiting to rot. Only Samegame's reshapes them (`, alt. scoring` for
      `(n-1)²`), which is presentation. So the line is not "only difficulty" but
      **"identical to the declared names ⇒ a copy"**.

## 1. Derive it — done

- [x] 1.1 A bare `{field}` on a choices field resolves from `choicenames`;
      `describeConfig` takes them as a second argument; `Puzzle.getChoiceNames`
      reads them off the config the dialog already fetches.
- [x] 1.2 Delete the hand-typed lists: 21 inline `{difficulty:…}` tokens, 3
      `difficulty: [...]` entries in `customFormats` objects, 5 identical
      non-difficulty lists, and 2 lists hidden **inside `describeConfig`
      function bodies** (Solo, Mathrax). The last two were invisible to a scan
      keyed on `difficulty: [` and were caught by the new guard, not the sweep —
      AGENTS.md § "A scan that keys on a name", again.
- [x] 1.3 Fix the two stale doc comments: the British-spelling instruction and
      the "isn't currently possible in the C code" framing.

## 2. The guard that was missing — done

- [x] 2.1 Assert the rendered difficulty word equals the declared tier, for
      every tier of every tiered game. Wrong word, wrong order and wrong count
      all fail.
- [x] 2.2 Prove it fails: re-spelled Tents as `{difficulty:Easy|Tricky}`, watched
      it report *tier 1 should read "Normal" but rendered "8x8 Tricky"*, restored.
- [x] 2.3 Vacuity guard on how many tiers were rendered (floor 40).

## 3. What the guard found that the sweep had not

- [x] 3.1 **Loopy** rendered a raw tier index: its `paramConfig` spelled the
      field `diff` while `describeParams` emitted `difficulty`, so the lookup
      missed. Renamed to `difficulty`, matching the other 28. Recorded as a
      `ts-engine` requirement.
- [x] 3.2 **Solo and Mathrax** kept tier lists inside `describeConfig` function
      bodies (Solo: `Trivial|Basic|Intermediate|…`, Mathrax:
      `Easy|Normal|Tricky|Recursive`). Both now read the declared names.
- [x] 3.3 **Clusters and Salad** never named the tier at all — a custom board
      gave the player no way to tell which tier they were on. Both now do.

## 4. Acceptance

- [x] 4.1 Ran the app. Tents: dialog offers Easy/Normal, picking Normal now
      gives **"12x9 Normal"** where it said "Tricky". Loopy: **"10x10 Squares -
      Easy"** where it rendered `0`, and its Custom dialog still shows Width,
      Height, Grid type and Difficulty after the `kw` rename. Solo: **"3x3
      Easy"** where it said "Trivial".
- [x] 4.2 **Owner acceptance, given 2026-09-05** on the before/after table (Tents
      `12x9 Tricky` → `12x9 Normal`, Bricks' three words for two tiers, Solo
      `Trivial` → `Easy`, Loopy's raw index → `Easy`, Lightup's lowercase, and
      the tier appearing at all for Clusters and Salad).

## Findings

**24 hand-typed option lists deleted**, of which 19 were provably wrong about
the game they described.

**The instrument lesson, twice in one change.** The pre-existing guard swept
every game and asserted no `{field}` token survived unsubstituted — and stayed
green through all 19, because substituting the wrong word is still substituting.
Then my own sweep, keyed on the shapes `{difficulty:…}` and `difficulty: [`,
missed two more lists sitting inside function bodies. **Both were caught by the
same thing: a check that compares the rendered output against the declaring
source.** Key on the output, not on the shape of the code that produces it.
