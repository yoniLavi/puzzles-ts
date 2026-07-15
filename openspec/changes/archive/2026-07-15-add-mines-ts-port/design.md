# Design — Mines TS port

## D1. The mine layout is generated once per session and survives undo — the central decision

**This is the hard part of the port, and it is a correctness question, not a fidelity one.**

In the C, `mine_layout` is a **refcounted mutable object shared by every `game_state`**
(mines.c:62–84; `dup_game` copies the pointer and bumps the refcount, mines.c:2401). The
layout is generated exactly once — on the first click (`open_square`, mines.c:2139) — and
therefore **survives undo**. Undo back past the first click, click a *different* square,
and the *old* layout is used. You can die on your "first" click.

That reads like a wart. It is not: it is what stops the player **rerolling the board**. If
each "first" click regenerated the layout around itself, then dying, undoing, and clicking
elsewhere would deal a fresh board — repeatable until the board is easy. Upstream fixes the
layout and instead counts your `deaths` in the status bar forever. We keep that.

The problem is that it does not fit our pure-`executeMove` model. After undoing to the start
and clicking square B, the result depends on whether square A was clicked *earlier in the
session* — history, not `(state, move)`.

**Decision: mirror the C with one explicit, narrowly-scoped shared box.**

`newState(params, desc)` creates a `MineLayout` holder — an object with a `mines:
Uint8Array | null` field — and every cloned state shares it **by reference**. The first
`open` move fills it. `executeMove` therefore performs exactly one mutation, once per
session, on an object reachable from its input state.

This is a real, deliberate departure from "`executeMove` is pure", and it must be **called
out in the code, not smuggled in**. It is defensible because the mutation is a *memoisation
of a deterministic function*: the layout is `f(desc-embedded RNG state, first-click x, y)`,
so a replay of the move log from the same desc always produces the same bytes. What it is
*not* is a function of `(state, move)` alone — and that is precisely the upstream behaviour
we are choosing to keep.

**Consequences to handle, each one a task:**

- The engine's `executeMove`-purity expectations must be checked against this. If a generic
  engine guard trips, the guard is right and this design owes it an explicit exemption — do
  not weaken the guard for every other game.
- `Midend.playMoves` / `renderScenario` replay stays correct (same desc ⇒ same layout).
- Save/restore: state 0 is rebuilt from `privDesc`, which *names the layout* — so the box is
  filled at `newState` time and no generation happens on replay. This is the case the
  supersede hook's `privDesc` exists for.
- Restart-after-supersede rebuilds from the **public** desc, which bakes in the first click,
  so the restarted board already has it open. That is upstream's intent ("restart goes to
  after the first click so you don't have to remember where you clicked").

**Rejected: regenerate on whichever click is "first" from the current state.** It keeps
`executeMove` pure and it *would* stay coherent with the engine (the hook would simply
re-supersede to the new layout). It is rejected because it hands the player a board-reroll
button, which changes the game.

## D2. What `supersededDesc` returns

`supersededDesc(state)` returns `null` while `layout.mines === null`, and otherwise
`{ desc: "<x>,<y>m<hex>", privDesc: "m<hex>" }`, where `x,y` is the first click and `<hex>`
is the obfuscated bitmap (`obfuscateBitmap` + `bin2hex`, both already in `engine/`).

The first-click coordinates must be recorded **in the state on the first click, whether or
not the layout was generated there** — this is exactly the `clickedAt: s.clickedAt ?? m.click`
shape the hook's fake game already proves out, and it is why we declined to port upstream's
`set_public_desc` hook (`add-desc-supersede-hook` design D3). If it turns out Mines cannot
recover the click coords this way, that no-go was wrong and the hook needs its second half —
**say so loudly**; do not work around it in the game.

## D3. Mines is the first timed game — treat the timer as unproven

`isTimed: true` and a `timingState` that stops the clock before the first click, after death,
after a win, and once `ui.completed` was ever set (mines.c:3332). **No ported game sets
`isTimed`** — verified: zero hits across all 37. The midend has timer plumbing, but a real
game has never driven it.

Flip shipped broken because a green suite proved the state machine and nobody looked at the
screen. The timer is in exactly that position now. So: an explicit browser task — the clock
does not run before the first click, starts on it, stops on death and on win, does not
restart when you undo a win, and survives a save/restore with the elapsed time intact.
Expect to find a bug here; budget for it.

## D4. No `findMistakes` — Check & Save would be a cheat

Every other uniquely-solvable game ships `findMistakes`, and the playbook says a
uniquely-solvable game should. Mines is the exception, and the reason is not technical: the
mistake it could compute — *this flag is on a safe square* — **is the deduction the player is
trying to make**. Surfacing it turns Check & Save into a solver. The information is hidden
*by design* in Mines in a way it is not in Towers or Galaxies, where the mistake overlay tells
you that you contradicted a solution you were always able to derive.

So Mines ships no `findMistakes`, and Check & Save degrades to a plain quick-save — the same
carve-out Sixteen / Fifteen / Netslide already take, for a different reason.

(The same argument will apply to the eventual Mines *hint*: it may narrate a deduction the
player could make, but it must never leak a square the deduction does not reach. Out of scope
here; note it in the hint change.)

## D5. Guess-free policy: satisfied by `unique`, and that is not an accident

All 6 presets generate with `unique = true`, which runs `minesolve` in a loop and *perturbs
the board* until it is solvable by pure deduction (mines.c:1937–1968). Non-unique boards
(the `a` params flag / `a` desc flag) skip the solver entirely and may require guessing —
they are reachable only via custom params. That matches the fork's guess-free policy: every
preset is deducible; guessing is opt-in and explicitly named.

## D6. Byte-match differential is feasible — with three traps

Unlike Undead (whose `qsort` tie-order is impl-defined), Mines' `squarecmp` is a **total
order** (type, random bits, y, x), so the sort is deterministic and a byte-match differential
is achievable. Three things must be ported verbatim or the layouts diverge:

1. **The two burned RNG draws.** `new_game_desc`'s interactive branch calls `random_upto`
   twice for x/y and *discards the results* — "to harmonise random number usage between
   interactive and batch use" (mines.c:2047). Skip them and every desc diverges.
2. **The double-increment livelock guard** (mines.c:1465):
   `if (ctx->nperturbs_since_last_new_open++ > ctx->w || ctx->nperturbs_since_last_new_open++ > ctx->h)`
   — the counter increments **twice** when the first test fails. It is almost certainly a
   typo upstream. Port the typo.
3. **`ss_overlap`'s scan order** (mines.c:543) feeds deduction order, and the perturb target
   is chosen by *in-order index* into the set store (mines.c:1244) — so the set container
   must be sorted by exactly `setcmp` = `(y, x, mask)`.

The differential records `(preset, seed, first-click) → layout bitmap`, since the desc alone
carries no layout.

## D7. Input, and the one place `interpretMove` peeks at the layout

Buttons: left = open (on release), right = flag, middle/both = chord, cursor keys + select /
select2. Move grammar is a `;`-separated list of `F x,y` / `O x,y` / `C x,y`, plus `S` for
solve.

The subtle one: a chord on a number whose flags are *wrong* would open a mine. Upstream's
`interpret_move` peeks at the real layout and, instead of the chord, emits **only the mined
squares** as `O` moves — "to reveal as little additional information as we can"
(mines.c:2700). So `interpretMove` reads hidden state to decide what move to emit. That is
legitimate (it is the frontend deciding *what the player did*, not the engine leaking), but it
must be ported knowingly, and it bumps `ui.deaths`.

`ui.deaths` and `ui.completed` are the only two fields upstream serialises into the ui string
— they must survive a save, or the death counter resets.

## D8. Ui-derived render state

The "too many flags" wrong-number highlight and the mouse-down highlight radius are derived
from `ui.hx/hy/hradius` at draw time, not from the state. They are per-cell overlays that do
not live in the tile value ⇒ playbook §3.2 ⇒ they go in the cache key or through an
`OverlaySidecar`. (The sidecar generalisation landed 2026-07-14; Mines is a natural consumer.)

## D10. Two engine additions — surfaced loudly, and NOT supersede-hook failures

The proposal said "Engine: expected to be zero-change. If the port needs an engine edit, that
is a signal the supersede hook got something wrong." **The supersede hook needed zero
changes** — `supersededDesc` + the midend's existing `applySupersede`/`descSuperseded`/
restart-from-public-desc/save-privDesc machinery carried Mines end-to-end (verified by
`mines.test.ts` and the pre-existing `desc-supersede.test.ts`, whose fake game is Mines'
shape exactly). So the "zero-change" expectation held *for the thing it was about*.

Two **other**, orthogonal engine gaps surfaced — neither about supersession — because Mines
is the first game to exercise a capability no prior port needed. Both are additive optional
hooks; every other game is untouched. Recorded here loudly as the proposal instructed:

1. **Ui serialisation (`Game.encodeUi`/`decodeUi` + save-envelope `ui` field).** Mines' death
   counter and `completed` flag live on the `Ui`, *outside* the undo history, and are set in
   `interpretMove`. A save replays the move log through `executeMove`, which never calls
   `interpretMove` — and an undone death is gone from the log entirely — so the counter cannot
   be reconstructed. Upstream serialises exactly these two fields (`encode_ui`/`decode_ui`);
   the TS engine had no equivalent because no prior game had save-surviving ui state. Added as
   optional hooks (`ts-engine` spec, "serialises Ui state a move-log replay cannot
   reconstruct").
2. **Timed-game status-bar clock (`[M:SS]` prefix).** Mines is the first `isTimed` game, so the
   midend's port of upstream `midend_rewrite_statusbar` (the `[M:SS] ` prefix on a timed game's
   status text) had never been written. Added to `Midend.emitStatusBar`, gated on
   `isTimed && wantsStatusbar` (`ts-engine` spec, "displays a timed game's elapsed clock").

If a *future* reviewer reads these as supersede-hook breakage: they are not. They are the
first-timed-game and first-persistent-ui gaps, and would have been needed by Mines with or
without the desc-supersede design.

## D11. Left-click chording shows no false-uncover preview (owner report 2026-07-15)

Mines makes a plain **left-click on a satisfied number chord** (upstream: a `LEFT_BUTTON`
press over a number sets `validradius = hradius = 1`, and the release clears around it). A
side effect was that the same press also painted the 3×3 **mouse-down preview** (`hradius = 1`
→ each covered neighbour drawn in the "pressed" style). That pressed style renders
**pixel-identical to an opened cell** (both a flat `COL_BACKGROUND2` fill with a top/left
shadow — faithful to upstream `draw_tile`). So while solving by left-clicking numbers, every
click on a **not-yet-fully-flagged** number flashed a false "uncover" of its 3×3 that snapped
back on release — the owner read this as *"uncovered blocks got re-covered."* A satisfied
number chords cleanly (the preview cells become real opens with no revert), which is why it
was intermittent.

**Fix:** decouple the preview (`hradius`) from the chord intent (`validradius`) on a **left**
press. A left press over a number now sets `hradius = 0` (no 3×3 preview) but keeps
`validradius = 1`, so the release still chords — matching MS Minesweeper, where a plain
left-click shows no preview. The deliberate chord gesture (middle button / Shift+left, which
this frontend maps to `MIDDLE_BUTTON`) keeps `hradius = 1`, so a held chord still previews.
A left press over a *covered* cell keeps its single-cell "about to open" highlight
(`hradius = 0` lights only the pressed cell). Guarded by the `mines chord preview` tests and
dev-verified in the browser (no flash on an unsatisfied-number press; left-click still
chords; Shift+left still previews; 0 console errors).

## D9. Not in scope

Printing (no print path in this fork). `game_request_keys` is NULL. No preferences upstream.
No editor letters. The `STANDALONE_OBFUSCATOR` main is not ported.
