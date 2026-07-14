# Add the desc-supersede hook (the Mines blocker)

## Why

Upstream's `midend_supersede_game_desc` lets a game replace the stored game description
mid-play: **Mines** generates its real mine layout on the first click
(first-click-never-a-mine), then supersedes the desc so that game-ID sharing, restart and
serialisation refer to the *actual* board (plus a `privdesc` — a private, layout-only desc
used for save files, so a saved mid-game doesn't leak the obscured full desc shape).
The TS engine has no equivalent — flagged as a long-tail migration risk in `AGENTS.md`
since Galaxies punted it (design D5) — and a Mines port cannot ship without it.

Grounding note (verified against the C, 2026-07-14): **Mines is the only upstream
caller.** The `AGENTS.md` long-tail note also naming Net was wrong — Net's centre-shift
is a UI/serialisation concern that never supersedes the desc; corrected alongside this
change's scaffold.

## What Changes

- `Game` gains an optional way for `executeMove` (or the first-move path) to signal
  "this move superseded the desc" — exact shape decided in `design.md` (leading option:
  a game-provided `supersededDesc(state)` hook the midend consults after a transition,
  keeping `executeMove` pure; alternative: a richer move-result type).
- `Midend` updates its stored desc (and optional private desc) when superseded, and
  emits the existing id-change notification so the app shell's shareable game ID and
  window/URL state refresh — mirroring upstream's `game_id_change_notify_function`.
- The clean-JSON save codec records the superseded/private desc so a mid-game save
  restores against the real layout.
- Engine-level behavioural tests against a fake supersede-using game (tier 1); the
  Mines port itself is **out of scope** — it consumes this hook in its own change.

## Impact

- Specs: `ts-engine` — one ADDED requirement (desc supersession).
- Code: `src/native/engine/{game,midend,save}.ts` + tests; `src/puzzle/` id-change
  plumbing only if the existing notification turns out not to fire on desc change.
- Docs: playbook gains a note for desc-superseding games; `AGENTS.md` long-tail entry
  updated (done with this scaffold).
