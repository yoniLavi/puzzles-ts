# share-the-run-length-desc-scanner — tasks

Scaffolded 2026-09-06 by `declare-the-board-model`'s exploration, which measured
the duplication but did not extract it.

## 0. Size it on two games, then decide — **done; the answer is yes, for ten**

- [x] 0.1 Explored by implementing, which is what the sizing needed.
- [x] 0.2 **Scanner written and Palisade adopted.** Its three grammar functions
      went **43 lines → 25**, and the nested `while (run) { while (run > 26) }`
      that nobody could read at a glance became
      `encodeRunLength(wh, i => clues[i] === EMPTY ? null : String(clues[i]))`.
      Better to read, and the grammar now has one statement per game instead of
      two.
- [x] 0.3 **The heavy case fights it, and that decided the roster.** Towers'
      desc is two comma-separated sections holding multi-digit numbers and `_`
      separators, scanned by index so it can report "rubbish at end"; a token
      iterator would have to hand the index back and be re-entered, which is
      longer than the loop it replaces. Measured across the family: **ten games
      have the simple grammar** (bricks, bridges, crossing, filling, loopy, map,
      mosaic, palisade, pearl, slant) and **eleven have sections or multi-digit
      values** (boats, keen, mathrax, pattern, salad, solo, tents, towers,
      tracks, undead, unequal). The eleven are a *different grammar*, not a
      harder version of this one, and they keep their own parsers.
- [x] 0.4 **Decision: adopt, for the ten.** Recorded in `run-length.ts`'s own
      doc comment, including why the eleven are out.

## 1. If it goes ahead

- [x] 1.1a **Three adopted so far**, one at a time: palisade, slant, mosaic.
      Slant's and Mosaic's **frozen differentials are byte-clean**, which is the
      byte-level proof the encoders are unchanged.
- [x] 1.1b **Done — five of the seven, and the other two were never in this
      grammar.** bridges, filling, loopy, map and pearl adopted it on both
      sides; **bricks and crossing were misfiled by the survey** and are now
      recorded with the eleven (see the finding below). All five carry a frozen
      differential and all five are byte-clean, which is the proof the encoders
      did not move.
- [x] 1.1c **The "two will be neutral" prediction was wrong about Bridges.** It
      was filed on the grounds that Bridges and Map walk a cell index alongside
      the desc index, so the token loop would remove the arithmetic and little
      else. Reading them: that walk is real, but it is *fed* by the token loop
      rather than competing with it. Bridges' `validateDesc` kept its `lastRow`
      adjacency check and still lost its second index, and its `newState` lost
      the `run`/`di`/`"S"`-sentinel dance entirely — the line
      `i += c.charCodeAt(0) - 97; // plus the loop's i++` is exactly what the
      scanner exists to delete. Map was the neutral one, and for a different
      reason than predicted: only half its desc is this grammar.
- [x] 1.1d **Loopy's `validateDesc` tightened, deliberately.** Upstream's run
      test is a bare `c >= 'a'`, which reads `{`, `~` and every non-ASCII
      character as a run of 27 or more — lengths its own encoder can never
      write, and which `newState` then reproduced so the two agreed on
      nonsense. Reading the grammar Loopy documents (`a`–`z`) rejects those.
      No generated desc contains one, so no board moves.
- [x] 1.2 **Unruly declined, on reading rather than on the summary.** It is a
      real second dialect and a sharper one than "`'a'` = 0" suggested: the
      *case of the run letter* carries the value, so `a`–`y` advances by
      `c - 'a'` and then places a ZERO, `A`–`Y` the same and places a ONE, and
      `z`/`Z` advances 25 placing nothing. There is no value character to hand
      back, which is the whole shape `scanRunLength` yields. Bending it to cover
      this is the contortion the guardrails forbid.
- [x] 1.3 **Magnets / samegame / singles left alone here, and the finding filed
      rather than described.** They are value codecs, not run-length, and this
      sweep caught them only by keying on the character arithmetic. Checked
      before filing, and it is sharper than recorded: singles' and magnets'
      `c2n` are **behaviorally identical**, and their `n2c` differs by one
      line — magnets maps `-1` to `"."`. Magnets' own comment says "cloned from
      singles.c". Unequal's pair shares the names and nothing else (it is
      order-dependent and reads keypresses), so it is not a third member.
      Filed as `share-the-desc-digit-alphabet`.
- [x] 1.4 **The encoder is fuzzed against the code it replaced** — 4,000 trials
      biased hard toward blanks so runs past 26 and 52 occur constantly, with
      Palisade's prior nested-`while` encoder kept in `run-length.test.ts` as
      the oracle. That check exists because Palisade, the first game converted,
      has **no frozen differential**: nothing else in the suite would have
      noticed the encoder rounding a 27-blank run differently, and a desc is a
      player promise.

## 2. The guard that matters more than the extraction

- [x] 2.1 **Built: `src/run-length-desc.test.ts`.** Membership is derived from
      who imports the module, with the ledger asserted equal to the derivation
      and two vacuity numbers. **Its two halves are worth different amounts, and
      the file says so rather than implying they are equal.** The pristine half
      — every generated desc validates and builds — has teeth: flipping
      `keepTrailingBlanks` in Pearl's encoder turns it red. The mutation half is
      a *crash sweep*, not a proof of agreement, because a typed array swallows
      an out-of-range write: a desc that shifts a game's clues by one is parsed
      silently and nothing notices. **Two deliberate breaks were tried against
      it and neither was reachable**, which is what "prove a guard fails before
      trusting it" is supposed to surface, so the file records the limit instead
      of the file claiming the invariant.

## Findings

- **The trailing run is load-bearing, and two games disagree about it.**
  Palisade drops the run that reaches the last cell; Slant and Mosaic keep it,
  because their `validateDesc` rejects a desc that does not fill the grid
  *exactly* ("Not enough data to fill grid", "Desc size mismatch"). Encode a
  Slant desc without it and the game refuses to load its own board. So
  `encodeRunLength` takes `keepTrailingBlanks` — one option carrying one real
  per-game fact, not a style knob. **Assuming either behavior would have
  corrupted descs silently in half the family.**
- **The decode side unifies cleanly; the encode side has three shapes.** Mosaic
  iterates its clue array, Bricks walks to a sentinel index, and Filling exposes
  a standalone `encodeRun(n)` used from inside a larger encoder — which
  `encodeRunLength(count, emit)` cannot express at all. Expect the scanner to
  reach further than the encoder.
  - **Wrong about Filling, and wrong in an instructive way.** `encodeRun(n)` as
    a *signature* is indeed inexpressible. But it had one caller, and that
    caller was the whole-desc encoder — which is the shape exactly. The finding
    had measured the helper rather than what the helper was for, and deleting
    it removed both. The encode side has **five** shapes across the eight, not
    three, and every one of them writes the same bytes: Loopy tests `> 25`
    before the increment, Map and Bridges test `=== 26` after it, Pearl grows a
    run by **incrementing the letter it already wrote** and starts a fresh `a`
    at `z`. Five spellings, one grammar — which is the argument for the module
    rather than an obstacle to it.
- **The roster was ten and is eight: Bricks and Crossing were misfiled.** The
  survey keyed on the letter-run arithmetic, which both have. What decides the
  grammar is the *other* token. Bricks' is a multi-digit clue with `_`
  separating two adjacent ones, walked over a padded grid whose `F_BOUND` cells
  advance the cell index and not the desc index. Crossing has no value
  character at all — its decimal numbers are a second kind of *run*, of open
  cells, alternating with the letter runs of walls. Same instrument failure as
  the four before it, in its sharpest form yet: **the key matched the half of
  the grammar the two families share.**
- **Bricks' two scans disagreed, and this is where that was found — and
  fixed.** Its `validateDesc` counted `A`–`Z` as blank runs; its `newState`
  ignored them, so a hand-typed desc using one validated and then built a board
  with every later clue shifted. Checked against the C before touching it
  (`git show a4053b67^:puzzles/unreleased/bricks.c`): the disagreement is
  upstream's own, faithfully ported, `validate_desc` line 449 against
  `new_game` line 503. The branch is dropped rather than mirrored into
  `newState`, because nothing emits an uppercase letter — the encoder writes
  digits, `_` and lowercase only, so removing it moves no desc and adds no
  dialect the encoder cannot write. Bricks' frozen differential is byte-clean.
  Bricks is not adopting the scanner, but it is the concrete instance of the
  invariant task 2.1 is about, which is how a sweep pays for itself twice.
- **Ten in, eleven out, and the eleven are not escapers.** They parse a
  different grammar — multi-digit numbers, `_` separators, two comma-separated
  sections — rather than a harder version of this one. That is the distinction
  the gesture-table and board-model withdrawals turned on, checked here before
  building rather than after.
