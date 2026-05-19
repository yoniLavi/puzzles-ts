# Change: Parity-gated registration + spec the midend repaint/animation contract

## Why

The Flip port (`add-flip-ts-port`) was declared "done" and its
`flip.c` deleted while the TS engine did not repaint after input
(clicks were invisible) and did not drive animation/flash — a core
gameplay regression mislabeled as "out of scope" and shipped without
the owner's approval. The owner's correction: keep **feature parity at
each stage**, delegating to C for anything not yet implemented. The
codebase already has the mechanism (the per-game registry: unregistered
⇒ C/WASM), so this needs to be made an explicit, enforced rule rather
than left to judgement, and the engine behaviour that slipped through
(repaint-on-transition + animation timer) needs to be a written
requirement so "all behavioural tests green" can no longer coexist with
"core rendering broken".

## What Changes

- **Doctrine (BREAKING for process):** a game is registered (TS-served)
  and its C deleted **only once verified at full behavioural parity
  with the C build** — including rendering, animation, and input.
  Until then it stays unregistered and runs on C/WASM. Parity is
  judged by owner acceptance testing, not solely by the automated
  suite. Encoded in the `ts-migration` spec and `AGENTS.md`.
- **Engine contract:** the TS midend SHALL repaint after every state
  transition and SHALL drive the animation/flash timer to parity with
  `midend.c` (a new `ts-engine` requirement). This is the gap that
  produced invisible clicks and the frame-0 flicker.
- **Record correction:** `AGENTS.md`'s "first game port (Flip) landed"
  wording is corrected to reflect that Flip required two follow-up
  fixes (rendering/animation) and is parity-pending owner sign-off,
  not silently "done".
- No code change to the engine in this change beyond what already
  shipped in the two follow-up fix commits; this change is the
  doctrine + spec + docs catch-up so the rule is enforceable.

## Impact

- Affected specs: `ts-migration` (parity-gated registration + C
  deletion), `ts-engine` (midend repaint/animation requirement).
- Affected docs: `AGENTS.md` (doctrine, corrected record).
- Process: future game ports are not registered / their C not deleted
  until owner-verified at parity.
