## 1. The type and the pilot

- [x] 1.1 Add `GridDrag` (a class, so the midend can find one by `instanceof`)
      and `newDrag` / `startDrag` / `moveDrag` / `endDrag` to
      `engine/pointer.ts`, beside `GridCursor`.
- [x] 1.2 Write its own test and prove it fails. Six mutations, all caught:
      `startDrag` not setting `live` (5 failures), anchoring only the far end
      (2), `moveDrag` always reporting a change (1), moving a drag that is not
      running (1), `endDrag` not clearing (1), and `GridDrag` ceasing to be a
      class (8 — the `instanceof` the midend will depend on).
- [x] 1.3 Convert **Tents**. Nothing moved: typecheck clean, all snapshots
      unchanged.
- [x] 1.3a Two cross-game guards caught the rest, and both were right.
      `capability-surface`'s snapshot records each game's `Ui` field names, so
      Tents' four loose coordinates collapsing to one `drag` is a one-line diff
      there — re-baselined, and the line reads exactly that, with `dragButton`
      and `dragOk` correctly staying. And `emittable-keys` found that
      **Galaxies already had a private `startDrag`**, which the new engine
      export now shadows. It is a genuinely different function (it remembers a
      source, a dot and a target, not an anchor and a current), so Galaxies is
      rightly not in the six; it is renamed `enterDrag`, which is what its own
      doc comment already called it. Expect this per batch: the engine claiming
      a generic verb collides with whatever a game called its own.
- [x] 1.4 **What the pilot taught, and it changes the plan.** Three things:

      (a) **The drag path had no test at all.** Swapping the two arguments of
      Tents' drag anchor passed all 27 of its tests. Its one "drag model" test
      does press→release on a single cell and never moves the pointer, so no
      motion, no axis snap and no off-grid release was exercised. So a drag
      test is **part of** each conversion, not a nicety: without one, converting
      a game's drag is a refactor with no net. Four plants in the converted
      code are now caught (anchor axes swapped, `moveDrag` never called, release
      not ending the drag, `dragOk` ignored).

      (b) **`dragOk` is not liveness and must not move into `GridDrag`.** In
      Tents and Boats it means "the pointer is over a valid cell right now" —
      false when the drag leaves the grid, true again when it returns, and a
      release while false commits nothing. Only the two line-drag games have it.
      The proposal's table said otherwise and is corrected.

      (c) **The four helpers are the right four, but `dragButton` stays.** Tents
      needs the button past the press (left paints tents, right paints grass),
      so the payload it picked at press time is its own; `drag.live` answers
      liveness and nothing else moved.

## 2. The rest of the six

**Measured first, 2026-09-12** — one plant per game, swapping the two
coordinates written at its drag anchor, run against that game's own tests:

| game | tests failed | reading |
| --- | --- | --- |
| tents | **0** of 27 | none (the pilot; now 4 plants caught) |
| pattern | **0** of 38 | none |
| rect | **0** of 32 | none |
| bridges | **0** of 72 | none |
| boats | 2 of 125 | some |
| tracks | 3 of 88 | some |

**Four of the six have no drag coverage at all**, and the worst of them is
Bridges — the most intricate drag in the set (a cone search, `updateDragDst`,
an `nlines` count) and 72 tests that all pass with its anchor's axes swapped.

So the rule for this change, stronger than 1.4(a): **where a game has no
coverage, the drag test lands _before_ the conversion, against the unconverted
code.** A test written afterward proves the new code self-consistent; one
written first and kept passing is an actual refactoring net. Tents got away with
the other order only because the plants stood in for it.

- [x] 2.1 **Pattern** — test first, then convert, and the order paid off: the
      four new tests passed against the unconverted code and kept passing
      across the conversion, which is a real refactoring net rather than a
      self-consistency check. Anchor plant 0 → 2 failures before the conversion
      even started; four plants in the converted code all caught (axes swapped,
      `moveDrag` never called, release not ending, axis snap inverted).

      **Why its existing drag tests missed it**, worth knowing for the rest:
      three of them call `executeMove` with a hand-built `fill`, and the one
      that reaches `interpretMove` **bypasses the press** — it `Object.assign`s
      the anchor onto the `Ui` and sends only the release. The press handler
      that writes the anchor was executed by no test at all. A test that starts
      from a hand-set `Ui` cannot see the code that builds one.

      **And a second name collision.** Pattern's `drag` was a `number` holding
      the drag's button code — which is what Tents calls `dragButton`. Renamed
      `dragButton`/`releaseButton` so `drag` can be the `GridDrag`, which
      unifies a second piece of vocabulary the two games had spelled apart.
- [x] 2.2 **Boats and Tracks**. Both converted; all 7 plants in the converted
      code are caught (they were 4 of 7 before the two tests below).

      **Boats had a latent bug the type removed.** Its liveness was
      `dragTo !== ""` and the release cleared `dragOk` but never `dragTo` — so a
      drag event arriving after a release re-entered the branch, set `dragOk`
      back to true, and the *next* release filled a line the player never
      dragged. `drag.live` ends with the release, which fixes it; a test now
      covers it, and a second covers the off-grid release, which nothing did.

      **Tracks' `dragging` was not liveness either, and is renamed `painting`.**
      It means "the drag has aligned to an axis and is laying track" — a press
      starts a drag that is live but not yet painting. Leaving a field called
      `dragging` beside `drag.live` is the ambiguity this change exists to
      remove, so it is now named for what it is. That makes **three** fields
      whose name suggested liveness and meant something narrower: Boats' and
      Tents' `dragOk`, and this.

      **The release path was the blind spot in both.** Of the seven plants,
      exactly the three on the release survived the first pass — including the
      behavior change in Boats. Worth checking first in the last two games.
- [x] 2.3 **Rect** — done, and it did prove the type assumes no coordinate
      space: Rect's pair stays half-grid throughout and `GridDrag` never learns
      of it. Four tests written first (against the unconverted code), all still
      passing after; five plants in the converted code all caught.

      **Why its existing drag tests were blind, which is a new shape.** Rect
      *does* drive press → drag → release through `interpretMove` — and still
      missed a transposed anchor, for two unrelated reasons. The edge-click test
      never reads the anchor (the edge comes from the release's own
      coordinates), and the rectangle test drags (2,2) → (4,4), which is its own
      transpose. **Exercising a code path is not discriminating within it: a
      symmetric fixture hides a transposition however thoroughly it is driven.**
      The same trap caught the far-edge rounding — an asymmetric drag between
      two *vertices* still can't see it, because `floor((x+1)/2)` and
      `floor(x/2)` agree on even coordinates; it needs a release over a cell
      center.

      **And the restructure found dead work.** Every reader of the derived cell
      rectangle is gated on `dragged`, which only a move sets — and every move
      recomputes the box. So computing it at the press wrote a value nothing
      could read. The old code did it too, as a side effect of sharing one block
      between the press and move paths; removing the `-1` sentinel is what made
      it visible.

      **Read ahead of converting, because `-1` is load-bearing here in a way it
      is not elsewhere.** Rect's press sets the anchor but leaves the far end at
      `-1` rather than at the press point, and two separate branches depend on
      that:

      - `if (dragStartX >= 0 && (xc !== dragEndX || yc !== dragEndY))` is true
        *at the press*, because `dragEndX` is `-1` and `xc` is not — which is
        how the derived cell rectangle `x1..y2` gets computed for a bare click.
      - `if (dragEndX !== -1) dragged = true` makes `dragged` true only from the
        second pass, so a click leaves it false and commits no rectangle.

      `startDrag` puts both ends at the press point, so a naive swap breaks
      both. The faithful restructure is to compute `x1..y2` in the press branch
      as well, and drive `dragged` off `moveDrag`'s return value — press:
      `startDrag`, `dragged = false`, compute; drag: `if (moveDrag(...))
      { dragged = true; compute }`. Trace it: today's press pass computes the
      rectangle with `dragged` false, and the first move to a different cell
      sets `dragged` — identical under the restructure, with the sentinel gone.

      Rect also keeps `x1,y1,x2,y2`, the **derived** cell rectangle (the
      half-grid pair floor-divided by two), and `cursorDragging` for its
      keyboard drag. Neither belongs in `GridDrag`: one is a projection the game
      computes, the other a mode.
- [ ] 2.4 **Bridges** last and most carefully: no coverage (0 of 72), two
      sources of liveness, and the most logic behind the drag. Test first, and
      expect the test to be the larger half of the work.

      **Read before converting — the far end is derived, not the pointer.**
      Bridges' `dragxDst/yDst` is not "where the pointer is"; it is the *target
      island*, produced by a directional search from the source (`updateDragDst`
      picks an axis from the pointer offset, then resolves the island that way
      and computes `nlines`). Bridges never stores a raw pointer position at all.

      That is a difference of degree rather than kind, and the population
      supports it: **none** of the five converted games stores the raw pointer
      in `ex/ey` either. Tents and Boats snap it to an axis, Tracks clamps it to
      the grid, and only Rect keeps it (already rounded to half-grid). So `ex/ey`
      has always meant *the far end of the drag as the game understands it*, and
      Bridges' island fits that reading. Worth stating explicitly in the commit,
      because it is the one place where a reader might expect otherwise.

      **The two-stage shape is Tracks' and Rect's again**: the press sets the
      source with `dragging` false, and only a move off the source sets it. So
      `drag.live` is "a press landed on an island" and `dragging` is the
      narrower "has left it" — which makes it the fourth field whose name says
      liveness and means something else. Rename it for what it is, as Tracks'
      `painting`.

      `todraw`, `nlines` and `dragIsNoline` are payload the press and the search
      pick; they stay with the game, like Boats' `dragFrom`/`dragTo`.

      **Done.** Converted as analyzed; `dragging` is now `aiming`. Five tests
      written first (against the unconverted code), all still passing after, and
      five plants all caught. Two of the five survived a first pass because the
      tests asserted only the *emitted move* — and a drag that resolves to no
      island emits nothing either, so "no L op" could not tell a canceled press
      from a failed resolution. Asserting **what is armed** rather than what
      comes out is what discriminates.

## 3. The engine cancels it

- [x] 3.1 `Midend.stateReplaced` cancels every `GridDrag` on the `Ui`, derived
      by `instanceof`, with no declaration anywhere. The five `changedState`
      call sites now go through it, so the engine's half and the game's half
      cannot drift; the game's runs **after**, so a game that needs a drag to
      survive can re-arm it. `cancelDrags` treats a missing `Ui` as nothing to
      cancel — `newUi` is optional and two games have no state at all.
- [x] 3.2 Settled: canceling on every state replacement is right for all six,
      and none of them previously canceled at all (not one carried a
      `changedState`). No game has justified an override.
- [x] 3.3 **Not applicable, and worth saying why rather than ticking.** The five
      games whose `changedState` exists only to put a gesture down — Filling,
      Pegs, Signpost, Slide, Untangle — are all *outside* the converted six, so
      none is covered by the engine yet and none can lose that half. They are
      the natural next population (§4 already holds Pegs and Slide).
- [x] 3.4 Cross-game guard added (`engine/drag-cancel.test.ts`), population
      derived, vacuity floor asserted. Proven to fail three ways: the midend not
      canceling, the sweep losing its `instanceof`, and `endDrag` not clearing.

- [x] 3.5 **The guard was asserting the wrong thing, and fixing that found a
      real defect this change had introduced.** The first version asserted
      `drag.live === false` after a replacement, and passed everywhere — but
      ending `live` only protects a game that *asks* `live`, and three of the
      six did not: Tents gated its drag branch on `dragButton >= 0`, Tracks on
      `painting`, Bridges on `aiming`. All three would have committed a move
      from an anchor the undo invalidated, which is exactly the Pegs defect
      `fix-stale-ui-and-cache-state` opened with.

      The guard now drives a **real press**, replaces the state under it and
      releases, asserting no move is committed — and that caught two further
      layers after the first fix: Bridges' and Tracks' releases fall through
      from the drag path to a **click** path that commits from the remembered
      press point, so gating only the drag half was not enough. The whole
      release is gated now.

      **The rule this establishes:** a game carrying a `GridDrag` must gate
      every committing path on `drag.live`, not on a secondary flag of its own.
      A weak guard ("the flag is false") is satisfied by all three broken games;
      a strong one ("the player's next action commits nothing") is not.

- [x] 3.6 **The same rule applies to the preview, and only playing the game
      found it.** Undoing mid-drag in the browser (the rail's Undo is reachable
      with the button still down) left Tents painting the preview of a canceled
      drag until the player let go. **Five of six** had it, each keyed off the
      flag the engine does not touch: Tents `dragButton` (in two places), Tracks
      `painting`, Bridges the stored coordinates, Boats `dragOk`, Rect
      `dragged`. Only Pattern was already right. All six now ask `drag.live`.

      **A collection-wide guard for this was attempted and withdrawn.** Driving
      a press and a drag at generic probe points and diffing the frame only
      works when that pair happens to produce a preview, and *which* regressions
      it can then see moves with the board: ten probe points caught Tents' two
      gates and Boats, fourteen caught Tents' cell loop plus Boats and Rect, and
      exhausting the pairs over ten caught a third set. Closing the gap needs
      per-game gesture knowledge, which is the manifest this collection refuses,
      so it is a recorded no-go in `drag-cancel.test.ts` rather than a guard
      that reports coverage it does not have.

      Guarded per game instead, where the coordinates are known: `tents.test.ts`
      covers the cell-loop gate (proven: reverting it fails the test). The
      *second* Tents gate — the errGrid transform that gives instant "that would
      be wrong" feedback — is fixed but **not** guarded, and the note at the
      site says why: mutating it alone leaves the cell loop correct, so the cell
      still renders blank and the stray error flag has nothing to show on. A
      test that passes either way is decoration.

## 4. The three that are shaped differently

- [x] 4.1 Assessed against the contract the six produced. **Two no-goes and one
      deferral**, all three already protected or harmless, so none is urgent:

      **Slide — no-go.** `grabAnchor` and `grabCurrpos` are single cell
      *indices*, and so is everything around them: `reachable` is a `Uint8Array`
      indexed the same way, and the slide planner works in indices throughout.
      Converting would mean either rewriting that machinery in x/y or widening
      `GridDrag` to carry an index — the first is a real refactor of logic that
      is correct, the second bends a shared type for one game. Both are the
      contortion the guardrail forbids. Slide already cancels its grab in
      `changedState`, so it loses no protection.

      **Sixteen — no-go.** Its drag is a *slide-follow*, which
      `docs/games/input.md` § "Other drag shapes" already classifies apart: the
      meaningful state is an **axis plus an offset** (`dragAxis`, `dragIndex`),
      not two positions, and it keeps a pixel pair *and* a cell pair for
      different jobs. There is no far end in cell space to put in `ex`/`ey`.
      Sixteen carries no `changedState`, so it is unprotected — but its release
      builds a row/column slide, which is legal on any board, so the exposure is
      a slide the player may not have intended rather than an invalid move.
      Worth a look if it ever grows a move that can be illegal.

      **Pegs — deferred, not refused.** Its anchor is grid coordinates and its
      far end is *pixels* (the dragged sprite's position); the release re-derives
      the target cell from the pointer rather than reading a stored far end. So
      a `GridDrag` here would carry an `ex`/`ey` that is either unused or in the
      wrong unit. An anchor-only drag would be honest and would earn the
      engine's cancel — but Pegs already has the `changedState` that started all
      of this, so the gain is vocabulary alone.

      **The natural next population is these plus the five whose `changedState`
      exists only to put a gesture down** (Filling, Pegs, Signpost, Slide,
      Untangle — §3.3). Doing them together is what would let the engine's
      cancel replace those hooks rather than sit beside them; doing Pegs alone
      would not.

## 5. Close

- [ ] 5.1 Run the full gate, then play a drag in each converted game in the
      running app, including an undo mid-drag.
- [ ] 5.2 Archive the change.
