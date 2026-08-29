# test-touch-on-a-real-device

## Why

**This change owes `2026-08-29-audit-input-mode-parity` an answer.** That audit
repaired a touch defect in seven games — `detectSecondaryButton` promoting a
held finger to `RIGHT_BUTTON`, which destroyed the whole gesture in a game that
tests no right button, Pegs' entire interaction among them. It was archived on
the code's evidence, with the owner's acceptance explicitly *deferred to a real
device rather than skipped*, because there was nowhere to try it: *"I can't
actually test and accept touch here on my dev machine."*

**Be precise about what evidence already exists, because the gap is narrower and
sharper than "we haven't tested on a phone".** The audit's browser pass drove
synthetic `PointerEvent`s with `pointerType: "touch"` through Chrome, which
exercises the frontend's promotion decision faithfully — it proved the repaired
Pegs gesture completes with the fix and leaves the board bit-identical without
it. What a synthesised pointer cannot tell anyone is anything about a *hand*:

- whether a fingertip can hit a Loopy edge or an Untangle vertex at all;
- whether **350 ms** is the right hold window for a real thumb, and whether
  **8 px** is a wobble or a drag on a device whose pixels are not CSS pixels;
- whether the seven repaired games now feel like they respond, or merely no
  longer swallow input;
- whether a two-finger tap is discoverable, or whether the games that *keep* the
  promotion are the ones where players will trip over it.

Design D3 of that audit said this in advance — "not reachable in-process:
whether the resulting gesture is *usable* — hit targets big enough for a
fingertip" — and named the browser as the only instrument for it. The missing
half is a device, not another test tier, and no amount of further in-process
work will produce it.

**The PWA half has never been exercised honestly either.** The app ships a
service worker, an injected manifest, a `registerType: "prompt"` update flow and
a `preflight.ts` capability gate for older browsers. All of that is written and
none of it has met a phone: install to a home screen, launch from that icon,
work with the network off, notice an update and prompt for it, survive being
backgrounded mid-game. A `vite preview` on a laptop exercises none of those
paths in the way they will actually be used, and several of them fail silently
until the one moment they matter.

**Blocked on `deploy-the-web-app`**, which is the whole reason it exists as a
separate change: a phone needs a URL, and a service worker needs a real HTTPS
origin.

## What Changes

**This is an acceptance-and-discovery change, not a feature change.** Its output
is a verdict per item plus whatever defects it turns up — deliberately in the
shape of the input audit, whose method was to sweep, record a verdict for every
cell, fix what is cheap and file the rest with a clear handoff.

- **Accept (or reject) the seven repaired games on a real device.** Cube,
  Fifteen, Filling, Flip, Flood, **Pegs**, Sokoban. Pegs and Filling are the ones
  to weigh hardest: both are entirely press-and-drag, so they are where the
  repair either shows or does not.
- **Check the games that *keep* the promotion still behave** — the audit's
  "must not change what the other modes do" rule, carried onto hardware. Mines
  and Pattern are the controls; Pattern and Loopy are the two with bespoke touch
  handling and so the two most likely to surprise.
- **Sweep touch reachability the sweeps could not**: hit-target size, the
  on-screen keypad on a small screen, the drag games, and Untangle (arbitrary
  vertex positions — the game that defeated an early cut of the press sweep for
  exactly this reason).
- **Exercise the PWA properly**: install, offline, update prompt,
  backgrounding, and the preflight gate. Record what works before deciding what
  to add — *whether* more PWA functionality is needed is a finding of this
  change, not a premise of it. The likely candidates, none of which should be
  built before the device says they are wanted: an install prompt the app
  controls, orientation/viewport handling, safe-area insets on a notched screen,
  wake-lock for a timed game, share-target or shortcuts in the manifest.
- **Re-evaluate the gesture constants against a hand.** `secondaryButtonHoldTime`
  (350 ms) and `secondaryButtonDragThreshold` (8 px) are user-settable and their
  defaults were inherited, not measured. If the device says they are wrong, that
  is a finding with a cheap fix — and `src/utils/touch.test.ts` now pins the
  behaviour those numbers drive, so changing them is safe.
- **File, don't cram.** Anything needing an interaction designed gets its own
  change with the finding quoted.

## Impact

- **Affected specs**: `ts-migration`'s acceptance bar — the durable rule this
  change establishes is that touch acceptance is a device activity, and that the
  in-process tiers plus a synthetic-pointer browser pass are explicitly *not*
  it. `app-shell` if the PWA findings require it.
- **Affected code**: whatever the device convicts. Possibly none — a clean pass
  is a legitimate and valuable outcome here, and should be recorded as one
  rather than padded.
- **Player-visible**: entirely. That is the point.
- **Depends on**: `deploy-the-web-app`. Do not start it before there is a URL;
  there is nothing to do without one.
- **Risk**: the failure mode is a pass that means nothing — five minutes of
  tapping the home screen and declaring touch fine. The seven repaired games and
  the PWA items are listed individually in `tasks.md` so that a verdict has to
  be given for each, which is the same reason the input audit recorded 57 × 3
  cells rather than a summary.
