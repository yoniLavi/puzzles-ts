# fix-sixteen-endgame-stranding — tasks

## 0. What was measured before implementation

From `fix-sixteen-hint-recompute-stability` (2026-09-08), with the exact search
already running on every board.

- [x] 0.1 **Frequency** — and it was worse than the proposal said, on a preset
      the proposal never measured. Walking **forty** games of each preset one
      recomputed hint at a time: **5×5 stranded 5 of 40**, **5×4 stranded 12 of
      40** (30%), 4×4 stranded none. The proposal had 5×5 only.
- [x] 0.2 **Shape** — one shape per preset, and both are the same thing.
      Every 5×5 stranding is `outOfPlace = 4`, permutation cycle type `[2,2]`
      (two swapped pairs); every 5×4 stranding is `outOfPlace = 2`, cycle type
      `[2]` (**one** swapped pair). The refusal is `NO_MOVE_WORTH_MAKING` on a
      solvable board.
- [x] 0.3 **Distance**: nine moves, measured against a referee search.
- [x] 0.4 **Reach**: the state-bounded search solves scrambles of 4–8 in under
      0.5 s and never returns a plan longer than 8.
- [x] 0.5 **Cost of reaching 9 by storing states**: fails at 6/10/14/18 M states,
      succeeds at 24 M in 10 s. Distance 8 costs 2.5 M and 0.5 s.
- [x] 0.6 **Not a regression**: the pre-fix code refuses on the same boards.

## 1. The mechanism

- [x] 1.0 **Candidate 3 priced, and adopted.** Memory is what rules out the ninth
      ply, not time — and the two halves of the search are not alike. The
      **goal side** is identical for every hint of a puzzle, so four plies of it
      are built once and kept: **835 k boards, 0.3 s, tens of MB**. The **board
      side** walks five plies depth-first, sliding a line in place and sliding it
      back, so it holds one board at any depth. Reach 9 for a few seconds and no
      gigabyte.

      Getting it fast enough took three passes, and the numbers are worth
      keeping: the obvious version repacked and rehashed every board (39 M nodes,
      **21 s**); Zobrist hashing updated a line at a time and slides done in
      place took it to 11 s; flattening the move tables and removing a per-node
      object allocation from the undo path, to **7 s**; and the stronger pruning
      below to **~4 s**.
- [x] 1.1 Pattern database not built — unnecessary once candidate 3 worked.
- [x] 1.2 Constructive endgame not built, and **it would not have worked**: the
      resume walk applies only a plan's *first* move and recomputes, so a
      maneuver whose potential only falls at the *end* of it is walked into the
      middle and abandoned. Only mechanisms returning shortest — or otherwise
      per-move monotone — plans survive that walk. Recorded because it looks like
      the obvious answer.
- [x] 1.3 Lives in `slide-planner.ts` as `deepSearch`, declared by the game as
      two depths and never as a condition. Sixteen sets `{ forwardDepth: 5,
      databaseDepth: 4 }`.
- [x] 1.4 **The rule that makes gating it safe, which is not the same rule the
      previous change removed.** A gated search is safe when an *ungated* one
      covers everything it hands off to: this one reaches exactly one ply further
      than the ungated search, so the plan it opens is one move longer than that
      search can finish, and playing that move hands back a board the ungated
      search handles. Two plies further and the cycle returns. Stated in the
      contract and in the spec, because it is a rule for whoever tunes it next.
- [x] 1.5 **The stronger pruning, derived not declared.** Where a game's slides
      of one line compose into one legal slide, a shortest path can never contain
      two of them inside a run of same-axis moves, so the canonical ordering
      tightens from non-decreasing to strictly increasing indices — a third of
      the search. `sameLineMovesCompose` reads that off the move set: true for
      Sixteen (deltas 1…w−1), false for Netslide (±1 only, where `+1` twice is
      legitimate and `+2` is not a move). A game that changed its move set would
      change the answer in the same commit.

## 2. Netslide, measured rather than assumed

- [x] 2.1 **It does not strand.** 108 walked games — all nine presets × 12 seeds,
      recomputing after every move — all solved, none refused, worst single hint
      1.5 s. Its move set is ±1 only, so its branch factor at 5×5 is 16 against
      Sixteen's 40 and its state-bounded search reaches far deeper for the same
      budget; its win condition is weaker besides. It configures no deep search
      and nothing about its spec changes.

## 3. The guard

- [x] 3.1 **Pinned by shape, not by sampling — and that is the finding.** A seed
      sweep is what the proposal asked for, and it is the wrong instrument: the
      defect appears on about a fifth of boards, so catching it reliably needs
      ~8 seeds per preset, and this repo has already priced that (five seeds over
      every preset was 50 minutes and was withdrawn; the file's own comment says
      the seed count is not the dial to turn). But every instance is the *same
      recognizable shape*, so a test that names one board of each shape asserts
      the same property deterministically in five seconds.

      It asserts **plan length > 8**, not merely that a plan came back: the
      state-bounded search never returns more than eight moves at this size, so
      only a longer plan proves the deep search ran. Without that, disabling the
      deep search would leave the test green on any board reachable another way.
- [x] 3.2 **Proved to fail**: commenting out Sixteen's `deepSearch` turns it red
      on the 5×4 board, with "the hint gave up".
- [x] 3.3 **And a guard for the mechanism, at the level it broke.** The index
      narrowed its Zobrist hash into an `Int32Array` and compared it against an
      unsigned copy, so half of every database was unmatchable. It did not fail —
      it went half blind and returned "no plan" on boards it held, which reads
      exactly like a search that cannot reach far enough, and it produced a
      confident wrong conclusion that survived a whole round of measurement.

      What caught it was a referee with no hash table in it. What guards it now
      is a direct membership assertion: with `forwardDepth: 0` the search probes
      the board against the database and nothing else, so every board within the
      database's depth must come back with a plan. **The end-to-end agreement
      check does not catch this** — measured, not assumed: it passed with half
      the database invisible, because at test-sized depths losing half the
      entries changes no answer. That is exactly why the bug survived.

## 4. Close

- [x] 4.1 **116 walked games finish**, across every preset: 5×5 16/16, 5×4 40/40,
      4×4 20/20, 4×3 20/20, 3×3 20/20 — against 35/40 and 28/40 before. Worst
      single hint 3.7 s (5×5) and 3.2 s (5×4), which is the one deep search a
      stranded game needs; typical worst is ~1.5 s.

      **That sample was not wide enough, and the app said so** — see the finding
      below. Read it as "the shape this change targets is gone", not as "the hint
      never strands".

      **The comparable number, measured afterwards on the census's own forty 5×5
      seeds: 5 stranded → 0.** All five that stranded before (#1, #23, #26, #28,
      #39) now walk to solved, in 45, 47, 41, 54 and 40 moves. That is the claim
      this change is entitled to: it converts the boards it was aimed at, every
      one of them. It is *not* a claim that no board strands — the app found one
      that does, on a shape four times deeper.

      Three attempts at that measurement were killed for system memory before one
      finished; it is a forty-game walk with a deep search in most of them. If it
      needs repeating, walk the five seeds above rather than all forty — they are
      the ones that carry the signal, and they cost a tenth as much.
- [x] 4.2 `npm run gate` green (301 files, 8502 tests).
- [x] 4.3 **Ran the app.** Five 5×4 games followed to "COMPLETED!" — 5×4 is the
      preset that stranded 12 of 40 before. A 5×5 game then stranded, on a deeper
      shape: see below.
- [x] 4.4 **Owner acceptance given, 2026-09-09**, on the change as described here
      — the improvement together with its named remainder. Accepting it is not
      accepting the remainder as fine: `fix-sixteen-deep-local-minima` stays open
      and carries it.

## Findings — a second sweep with the same blind spot, fixed here

`hint-quality.test.ts`'s "no hint leaves a chain for the player to carry, at any
tier" sweep opened with `if (!contract || !tiers) continue`, so the **twelve
untiered hinting games were outside it entirely** — not sampled thinly, as in
`hint-resume.test.ts`, but skipped before its own vacuity count could notice. A
game with no tiers varies by preset, and is now walked that way; the shared
preset enumeration both sweeps needed now lives with the other cross-game hint
helpers rather than in one of them.

Free, and measured before it was done: 112 hints across those twelve games, zero
speculative phrasings, so closing the gap changed nothing but coverage.
