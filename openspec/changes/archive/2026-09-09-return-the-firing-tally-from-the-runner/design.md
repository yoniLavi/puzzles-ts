# design — return-the-firing-tally-from-the-runner

## D1. Sink, not return value — and the proposal's own verb is the wrong one

The proposal left one decision open: *"a `countFirings` flag, or a
caller-supplied sink"*. **It is the sink, and the reason is that the other shape
does not do the job the change exists for.**

The duplication being removed is not "the runner cannot count". It is this,
seven times:

```ts
techniques: onFiring
  ? ladder.map((t) => ({ ...t, run: () => { const did = t.run(); if (did > 0) onFiring(t.id); return did; } }))
  : ladder,
```

Ten lines of wrapper, plus one parameter on the game's solver. **A returned
tally deletes the wrapper and keeps — indeed enlarges — the parameter**, because
`runDeductionFixpoint` is called *inside* the game's solver and its result is
consumed there. To get a returned tally out to `ladder-equivalence.ts`, every one
of the seven solvers would have to widen its own return type with a field only a
test reads, and each of the seven return shapes is different (`{ ret, maxDiff }`,
a bare `number`, a status enum). That is seven bespoke edits to production
signatures, traded for seven identical wrappers.

A sink passes straight through:

```ts
runDeductionFixpoint({ techniques: ladder, firings, maxTier: diff, … })
```

One line, identical in all seven, and the game's parameter changes type rather
than disappearing — which is honest, because **the game genuinely must forward
something**. There is no shape in which the harness observes a rung firing
without the game handing it a channel; the only alternative is a module-level
hook, which is a global and worse.

**So the change's name is now slightly wrong and that is fine.** Renaming an
open change costs a citation (`docs/framework-rdd/README.md` is the tree's worked
example of exactly that mutation stranding a reference), and the id is a handle,
not a claim. Recorded here rather than repaired.

## D2. `Map<string, number>`, reusing the map the runner already keeps

The runner already allocates `firings` for the step budget's non-termination
attribution, and already obeys the rule that matters:

> the generator path allocates nothing and runs the loop it always ran

So the resolution is one line:

```ts
const firings = opts.firings ?? (opts.budget ? new Map<string, number>() : null);
```

Three cases, all correct and all preserving that rule:

| caller | behavior |
| --- | --- |
| generator (no budget, no `firings`) | `null` — no allocation, loop unchanged |
| hint path (budget, no `firings`) | allocates internally, exactly as today |
| test / hint path (`firings` given) | writes into the caller's map; a budget trip **also** attributes through it |

The third row is a small bonus rather than the point: a hint path that supplies
a tally now gets budget attribution and a firing census off one map, instead of
the budget owning a map the caller cannot see.

**Counts rather than a `Set`.** The harness only needs membership, but the budget
attribution needs counts and the two must not be different objects. A `Map` is
the superset and it is what already exists.

## D3. Where the seam's *documentation* goes

Tracks' seam carries the only doc comment of the seven — *"test seam — called
with a rung's id each time it fires"*. That sentence is about **why a game
forwards a tally at all**, which is not Tracks-specific, so it belongs on the
runner's `firings` option and in `ladder-equivalence.ts`'s header, not deleted.

## D4. What must not move, and how it is checked

- **Every frozen differential byte-unchanged.** The generator path is untouched
  by construction (D2 row 1), but the differentials are the proof rather than
  the argument.
- **The census must still name the same two unreached rungs** — Tracks'
  `check-single`, Rome's `naked-pairs`. This is the failure mode with teeth: a
  tally that quietly stopped being written would leave `fired` empty, `missing`
  would become *every* rung, and the ledger comparison would fail loudly — but a
  tally written for rungs that never fire would empty the ledgers and **read as
  progress**. Task 1.6's deliberate break is what distinguishes them.
- **`viaRunner`'s third parameter changes type, not existence** —
  `(board, cap, firings: FiringTally) => unknown`. The harness stops building a
  `Set` from a callback and reads the map's keys instead.
