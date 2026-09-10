# show-only-informative-hint-steps — tasks

## 1. Measure before designing

- [x] 1.1 Classify every step a player following the Tracks plan is shown:
      **671 of 2,059 redundant with the board, all one premise**; 36% edge-only,
      91% of those that premise. Re-measured after: 1,388 steps, 0 redundant,
      every other premise's count unchanged.
- [x] 1.2 Read the three existing filters (Spokes, Galaxies, Crossing's note)
      and the Galaxies two-cap history before choosing a shape.

## 2. The shared mechanism

- [x] 2.1 `deduceHintPlan`'s `showable`: hidden firings advance the board, are
      not pushed, do not count against the cap; `hidden` reported; the budget
      ticks for them. Tested on the toy board, including a hidden firing that
      changes nothing throwing.
- [x] 2.2 `engine-catalog.md` and `hints.md` § "Show only what the board does
      not already say".

## 3. Adopters

- [x] 3.1 Galaxies: `showable` from its existing `Planned`; `FIRING_CAP` and the
      hand-counted cap removed; its 108 tests pass, the reported-board probe
      reading `hidden`.
- [x] 3.2 Tracks: every change recorded; `trackComplete` reason-less; `evident`
      from board facts; `showable` = reason and not all-evident.
- [x] 3.3 Spokes: no-go recorded (design D4).

## 4. Guards, each proved to fail

- [x] 4.1 Reason-less ⇒ evident by legality, judged before the firing. Proved
      red by stripping `onlyOneSideLeft`'s reason: it names the hidden square.
- [x] 4.2 Production `evident` ⇔ legality on every firing, both classes seen.
      Proved red by dropping the finished-piece clause from `evident`; the two
      player-facing guards stayed green, so each failure is attributable.
- [x] 4.3 No shown step is evident, per op — the owner's report as a guard.
- [x] 4.4 The reported board reconstructed: a finished entrance piece beside
      squares marked empty gets no step about its sides.
      Both proved in layers (design D3): reinstating the reported bug in full
      turns both red on the reported shape; reinstating only its first half
      leaves them green, because the board check hides it on its own.

## 5. Close

- [x] 5.1 `add-tracks-hint`'s spec delta, findings and tasks updated to the new
      mechanism, and its delta gains a scenario for the reported shape.
- [x] 5.2 Ran the app (Chrome). A fresh 8x8 board's first hint is now "This
      column's clue is 8 and it is 8 squares long, so every square in it must
      carry track", where it used to open on the redundant premise about the
      given pieces; marking the square beyond the entrance piece's free side
      empty, the reported shape, no longer produces a step about that side.
- [x] 5.3 `openspec validate --all --strict`, then the gate: green in
      4154ee9f.
- [x] 5.4 Owner acceptance, 2026-09-10.
