# Design — add-sokoban-ts-port

## Context

Sokoban is the barrel-pushing warehouse game. Upstream ships it under
`puzzles/unfinished/` **not** because the game is incomplete — the whole frontend
is written and works — but because the header judges its random generator "too
simplistic to be credible." Everything else (`interpret_move`, `execute_move`,
`game_redraw`, `game_flash_length`, the pit/deep-pit/labelled-barrel machinery, the
win condition) is finished and correct.

The source is ~1481 lines, **self-contained** (no `grid`/`latin`/`dsf`/`tree234`
leaf dependencies), and much of it is a straight idiomatic transcription. The design
below records the few decisions that are not mechanical — chief among them the
generator — plus the frontend traps this fork's browser layer introduces that
upstream never warns about.

Two things the C settles that contradict a first guess, recorded so they aren't
re-litigated mid-port:

- **There is no animation.** `game_anim_length` returns `0.0F` unconditionally.
  The player and barrels move *instantly*; the only motion is the completion flash
  (`game_flash_length`, `FLASH_LENGTH = 0.3`, a three-blink highlight). Do not
  promise a walk/push animation in the baseline (D5).
- **There is no solver.** `solve_game` returns `NULL` and the game's `can_solve`
  flag is `false`. Sokoban has no Solve button, and building one means writing a
  Sokoban solver (a hard search — the decision problem is PSPACE-complete). Out of
  scope (D3).

## Decisions

### D1 — The generator: port the faithful reverse-move generator now; curate levels later (the central open question)

Upstream's `sokoban_generate` builds a level by starting from a blank walled grid
with the player placed at random, then making a sequence of **inverse** Sokoban
moves — pulling barrels (rather than pushing them), inventing new barrels-on-targets
out of untouched `INITIAL` squares, and carving corridors through `INITIAL` as
needed, chosen via a BFS priority queue (a hand-rolled binary heap) over reachable
squares. Leftover `INITIAL` squares become walls. Because the level is *constructed*
by reversing a real solution, **every generated level is solvable by construction** —
which is exactly why there is no solver to gate generation.

The header's complaint stands: the levels are playable but not elegant. So there is a
real product decision, and it is the owner's:

- **(A) Port the faithful generator (recommended).** Byte-for-byte reproduce
  `sokoban_generate` over `random.ts`. **Recommended baseline for this change.**
  - *Verifiable.* It yields a byte-match differential (§4.3 pattern) that validates
    the generator and the codec together — and that is the *strongest* check
    available here precisely because there is no solver to otherwise exercise the
    generation path.
  - *Consistent.* Every other port in this collection transliterates the upstream
    generator faithfully. Playbook rule 3 applies directly: a generator that is
    merely *weaker* than one would like is "the difficulty curve upstream shipped,"
    not a defect to fix.
  - *Scoped.* It is self-contained and finite; the whole generator is one function
    plus a heap.
  - *Cost:* ships the same "not credible" levels the C build shows. Honest, and the
    same experience the WASM Sokoban already gave.

- **(B) Curated hand-authored level packs.** Ship a set of classic Sokoban levels as
  descriptions and serve those instead of (or alongside) random generation.
  - *Better product*, genuinely — good Sokoban is authored, not generated.
  - *But new scope*: a level-source with a compatible licence (many public Sokoban
    sets are **not** freely redistributable), and a UX question this collection has
    no precedent for — every other game maps `params#seed` to a freshly generated
    board, whereas a curated pack is a *fixed enumerated list* of levels of varying
    sizes, which does not fit the "pick a size, get a random board" model without a
    level-selection surface. No byte-match oracle either.
  - **Belongs in a separate follow-up change** with its own design, exactly as
    hints and other enhancements are sequenced apart from the base port.

- **(C) Improve the generator.** Rejected as scope creep: credible Sokoban
  generation is an open research problem, and any change to the algorithm changes
  every board and forfeits the byte-match oracle. Playbook rule 3.

**Recommendation: (A) for this change, with (B) flagged as a compelling, separate,
owner-greenlit follow-up.** If the owner judges that shipping weak random levels is
below the product bar, the alternative is to *hold* the port until a curated-levels
design exists — but that couples a near-complete, verifiable transliteration to a
larger open question, so the recommendation is to ship (A) and let (B) follow. **This
is the decision to confirm before implementation.**

Whichever way it goes, the **gameplay** model (moves, pushes, pits, labelled
barrels, win) is faithful and unaffected — a curated pack is just a different source
of the same `desc` format.

### D2 — Move model: a discriminated union, not upstream's numpad-digit string

Upstream encodes a move as a single character `'5' - 3*dy + dx` (a numpad digit
1–9 minus 5) that `execute_move` re-decodes. Per the repo convention (Loopy D5,
Pearl, Tracks), model the move as a discriminated union — `{ kind: "move"; dx; dy }`
— that `interpretMove` builds directly and `executeMove` consumes. The push-vs-walk
distinction is *derived* in `executeMove` via the shared `moveType` helper (upstream
`move_type`: returns illegal / walk / push), exactly as the C does in both
`interpret_move` and `execute_move`. The digit string was a serialisation detail of a
C program with no other way to express a variant; the save format is ours.

Undo/redo is **entirely the midend's** — Sokoban stores no special undo state, and
push moves are ordinary history entries. Nothing to build; do not reach for
state-string equality (the phantom risk in the playbook §1 table). No-op moves are
suppressed *locally* by returning `null` from `interpretMove` when `moveType` is
illegal, as the C does.

### D3 — No `solve()`, no `hint()`

`solve_game` returns `NULL` upstream; do not offer a Solve button. Sokoban is a
non-deductive movement puzzle, so there is no deductive hint to author either; and
with no solver there is nothing to search a hint plan from. This is the Untangle
pole of the hint bar (genuinely nothing to prove cheaply), and — as with every
port — a hint would in any case be a separate change. None ships here.

### D4 — No `findMistakes()` (correctly)

Sokoban has **no wrong-but-legal cell state**: any legal position is reachable and
none is "a mistake" in the `findMistakes` sense (a *deadlocked* barrel is a dead
position, but detecting deadlock is the same hard solver problem as D3). Per the
playbook §3.5, a game with no notion of a wrong-but-legal state correctly omits
`findMistakes`. Consequence, stated plainly so it isn't mistaken for a bug: Check &
Save degrades to a plain **Quick-save** for Sokoban (`canFindMistakes` is false),
which is the correct behaviour for a non-uniquely-solvable movement puzzle.

### D5 — Rendering: faithful baseline, instant moves + completion flash

Port `game_redraw`/`draw_tile` faithfully: per-tile cache keyed on an `Int32Array`
(playbook §3.2 — the packed value is small: the cell char plus the flash-highlight
bit), grid lines drawn once in the `!ds.started` branch, walls with the
highlight/lowlight bevel, targets/pits/deep-pits/player/barrels as discs, and
capital-letter barrel labels. The engine paints no pixels of its own; Sokoban fills
its own background (playbook rendering doctrine).

**Border geometry:** `cmake/platforms/webapp.cmake` defines `NARROW_BORDERS`, so the
compiled arm is `BORDER = 0`, **not** a full tile — check this rather than porting
the desktop default (playbook §3.2). `computeSize` = `2*BORDER + 1 + w*TILESIZE`.

**Flash:** three blinks of a highlighted background over `FLASH_LENGTH`, gating on
`(int)(flashtime * 3 / FLASH_LENGTH) % 2`, faithful to the C.

Moves are **instant** in the baseline (matching upstream). A smooth walk/push slide
animation is a plausible deliberate-divergence enhancement (the fork improves
visuals), but it adds scope and per-frame animation state; it is explicitly deferred
to a possible follow-up, not shipped here.

### D6 — Input: bind bare digits, not just `MOD_NUM_KEYPAD` (frontend trap)

Upstream binds the four diagonal *movement* keys to `MOD_NUM_KEYPAD | '7'|'9'|'1'|'3'`
and the orthogonal ones to the cursor keys (with `MOD_NUM_KEYPAD` `'8'|'2'|'4'|'6'`
aliases). **This web frontend never sets `MOD_NUM_KEYPAD`** (playbook §3.8a): a
number-pad `7` arrives as the bare character `'7'`. A faithful transliteration of the
modified-only bindings would therefore make the diagonal moves unreachable by
keyboard (and the C/WASM build has the same dead binding, so it doesn't even show as
a parity difference). So: accept the **bare digits** `1`–`9` (except `5`) as well as
the cursor keys, mapping each to its `(dx, dy)`. The diagonals remain reachable by
mouse too.

**Click-to-move:** `LEFT_BUTTON` computes a direction from the click position
*relative to the player's cell* (`< COORD(px)` → left, `> COORD(px+1)` → right, and
likewise vertically), which can be diagonal. Port it. No drag. Diagonal *movement*
requires one of the two shared-adjacent squares to be free (NetHack rule) and can
never push — `moveType` enforces this.

### D7 — Codec, pits, and labelled barrels: faithful, for hand-authored IDs

Port the full character alphabet and run-length codec even though the random
generator only ever emits walls/spaces/targets/barrels/player: `PIT` (`p`),
`DEEP_PIT` (`d`), capital-letter barrels `A`–`Z` (labelled), and their on-target
control-character forms (`1`–`26`). This keeps hand-typed level game IDs — the very
use case the header names as Sokoban's reason to exist — fully working, and it is a
prerequisite for a future curated-levels change (D1 B). `validateDesc` reproduces
upstream's checks: area equals `w*h` (distinguishing too-much from too-little) and
exactly one player.

### D8 — `textFormat` returns undefined

`game_text_format` returns `NULL` upstream (while `game_can_format_as_text_now`
returns `true` — an inconsistency in the unfinished source). The `Game` interface's
`textFormat` returning `undefined` is the faithful, already-supported behaviour
(Loopy widened `Game.textFormat` to `string | undefined`; the share dialog treats
absent text as "no text panel"). No new hook.

## Risks

- **The generator decision (D1) is the one real risk**, and it is a product call,
  not a technical one. Shipping (A) ships known-weak levels; deferring for (B)
  couples a finished transliteration to an open question. The recommendation
  manages this by shipping (A) and sequencing (B) separately, but it needs owner
  confirmation before implementation.
- **Small, self-contained, well-understood otherwise.** No leaf dependencies, no
  solver, no aperiodic geometry — the lowest-risk port since the small games. The
  frontend traps (D6) are the only place a faithful transliteration silently
  breaks, and they are enumerated.
- **Stage 2 deletes one file** (`sokoban.c`) and moves one CMake entry; far smaller
  than a leaf-bearing port. Still gated on owner acceptance per the parity gate.
