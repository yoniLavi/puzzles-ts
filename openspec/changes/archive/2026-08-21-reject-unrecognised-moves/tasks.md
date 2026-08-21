# Tasks — reject-unrecognised-moves

## 1. The helper

- [x] 1.1 `src/engine/assert-never.ts` — `assertNever(value: never, context: string): never`,
      throwing with the context and the JSON of the value. Required `context`,
      not derived: the message is read in a player's console (design D1).
      Ships a second export, `rejectMove`, for the move types with no union to
      narrow — see design D1a for why a cast to `never` was the wrong answer.
      `describe()` truncates at 200 chars and never throws (a solve move carries
      a whole grid; a reporter that throws replaces the one legible error).
- [x] 1.2 Its own test, including the **type-level** one — a deliberately
      unhandled union member is an `@ts-expect-error` at the `assertNever` call.
      A runtime-only test would not cover the guarantee D1 is about.
      **Proved to fire**: widening the parameter to `unknown` makes `tsc` report
      `TS2578: Unused '@ts-expect-error' directive`, exit 1.

## 2. The survey (do this before editing, and record it)

- [x] 2.1 Classified all 57 by **running** them, not grepping — recorded in
      `survey.md`. 8 return `undefined`, 20 silently return a different board,
      29 throw about something else. Matches the proposal's counts exactly.
      The finding that mattered: **four of the twenty silent games are `switch`
      games** (magnets, net, undead, blackbox) — they `break` and then run shared
      tail code, so shape does not predict behaviour.
- [x] 2.2 No game's tolerance is load-bearing, as expected. One game was already
      *stricter* than the rest: Pegs parses at the save boundary (design D3).

## 3. Apply, by shape (design D2)

- [x] 3.1 Exhaustive `switch` games: `default: return assertNever(move, "<game>: executeMove")`.
- [x] 3.2 `if/else` games: **chain completed and terminated in `assertNever`**,
      not converted to `switch` — the narrowing is identical and the diff is a
      fraction of the size (design D2, corrected during implementation). Every
      per-game suite green with **no snapshot re-baselining**.
- [x] 3.3 Non-union games: `rejectMove` on the fields the dispatch reads
      (bridges, galaxies, lightup, map, pearl, tracks, range, singles, cube,
      pegs, samegame, sokoban, untangle). Where the discriminant is a *field* on
      one interface, `assertNever(op.kind, …)` still applies — design D1a.
- [x] 3.4 Salad's `default` was a working arm; it is now `case "set": case "pencil":`
      and the `default` below it is only a guard.

## 4. Tighten the cross-game guard

- [x] 4.1 `save-round-trip.test.ts` no longer accepts either camp. It requires
      `^Could not restore this saved game: <id>: .*unrecognised` — three
      assertions in one: refused, named itself, and *from its own guard* rather
      than from whatever a misread broke first. The two-camp comment is gone,
      replaced by what the measurement found.
- [x] 4.2 Proved it fails: with `src/games/` stashed, **57 of 57 fail**, up from
      the 37 the loose form caught.

## 5. Verify

- [x] 5.1 Full gate green; every per-game suite green with no snapshot changes.
- [x] 5.2 `npm run probe -- --verify` green — no probed engine module moved.
- [x] 5.3 Browser spot-check, one game per shape, Chrome via `playwright-cli`,
      **0 console errors** in all three: **ABCD** (`switch` + `default`) — click,
      keyboard letter entry, autosave written, page reload restores the board
      *and* the placed letter; **Bricks** (`if/else` chain) — cell painted, undo
      armed; **Galaxies** (op list) — wall toggled on and back off.

## 6. Close out

- [x] 6.1 Spec delta into `ts-engine`.
- [x] 6.2 `docs/games/mechanics.md` — the `executeMove` section gains the rule,
      the helper, the two awkward shapes, and the put-it-before-the-bounds-check
      trap.
- [x] 6.3 Owner acceptance — **accepted 2026-08-21**, both flagged points
      included. **Flag explicitly at acceptance**: (a) in the ~20
      formerly-tolerant games a save with an unplayable move now gets *refused*
      where it previously loaded a subtly different board — intended, endorsed in
      principle, but the one player-visible consequence; (b) Sixteen's unwired
      `serialiseMove`/`deserialiseMove` pair was deleted rather than wired,
      because wiring it would change every existing Sixteen save's bytes — say so
      if a compact encoding is actually wanted (`survey.md`).
