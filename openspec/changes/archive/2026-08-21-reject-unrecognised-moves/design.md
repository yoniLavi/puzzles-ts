# Design — reject-unrecognised-moves

## D1: `assertNever`, not a bare `throw` — the difference is a compile-time guarantee

The owner's instruction was "the catch-all case for a supposedly exhaustive
switch should throw a *this should be impossible* exception". Correct, and the
form matters more than it looks.

The `switch` games **already have compile-time exhaustiveness today**, by
accident of having no `default`: `executeMove` is annotated `: State`, every arm
returns, and TypeScript proves the switch covers the union. Add a union member
and forget an arm, and the function no longer returns on all paths — a type
error, at the right place, before anything runs.

Writing this:

```ts
default:
  throw new Error(`${id}: unrecognised move`);
```

**destroys that.** With a `default` present the function returns on all paths no
matter what the union says, so a newly-added move type that nobody handles
compiles cleanly and fails at runtime instead. The runtime guard would be bought
by giving up the compile-time one — a straight downgrade for the *far* more
likely mistake, which is us adding a move type, not a player loading a 2026 save.

So the catch-all binds the value to `never` first:

```ts
// src/engine/assert-never.ts
export function assertNever(value: never, context: string): never {
  throw new Error(`${context}: unrecognised move ${JSON.stringify(value)}`);
}

// in a game
default:
  return assertNever(move, "abcd: executeMove");
```

Now an unhandled union member is a **type error at the call** (`move` is not
`never`), and an off-union value at runtime throws with the move printed. Both
guarantees, no trade.

The `context` string is required rather than derived: the message is read in a
player's console and in a `loadGame` refusal, and "unrecognised move" with no
game name in it is the same class of unhelpfulness this change exists to remove.

## D1a: a second helper, `rejectMove` — because the alternative is a cast that defeats D1

**Added during implementation.** D1 covers the case where there *is* a union to
narrow. The survey found many where there is not: a move that is one object shape
with an op list inside it (`{ ops: Op[] }` — bridges, galaxies, lightup, map,
pearl, tracks), a coordinate list (`{ sets: … }` — range, singles), or a bare
field set (`{ dir }` — cube; `{ type: "jump", … }` — pegs, and note that a
*single-member* union does not narrow to `never` either).

Those cannot call `assertNever` without `assertNever(move as never, …)`, and that
cast is precisely the thing D1 exists to prevent: it makes the call compile
whatever the union later becomes, which is the bare-`throw` downgrade wearing the
safe helper's name. So there is a second export with the same message shape and a
different name:

```ts
export function rejectMove(move: unknown, context: string): never;
```

Same output, honest about carrying no compile-time guarantee. A reader is
entitled to see which of the two they are looking at.

**A third shape needs neither.** Where the discriminant is a *field on a single
interface* rather than a union of shapes — `LightupOp.kind: "light" |
"impossible"`, `TracksOp.kind`, `MineOp.op: "F" | "O" | "C"` — it is the *field*
that narrows to `never`, not the object. `assertNever(op.kind, …)` gets the full
guarantee, and the op goes in the context string:
``assertNever(op.kind, `lightup: executeMove op at (${op.x},${op.y})`)``. The
`context` parameter being a plain string rather than a static literal is what
makes this work.

## D2: The three shapes get three treatments, because the requirement is the behaviour

A survey of the 53 `executeMove` implementations (proposal table) found only one
game — Salad — with an existing `default`, and it is a *working* arm, not a
guard. The rest divide into exhaustive-switch and `if/else`-chain, and a handful
dispatch on something that is not a union at all.

- **Exhaustive `switch`** → add `default: return assertNever(move, "<game>: executeMove")`.
  Pure addition; no existing arm moves.
- **`if (move.kind === "x") … else …`** (Clusters, Bricks and kin) → ~~convert to a
  `switch` on the discriminant~~ **complete the chain and terminate it in
  `assertNever`.** This is the case that *gains* the most: an `if/else` chain over
  a union has **no** compile-time exhaustiveness at all, so these games have never
  had the guarantee the switch games are merely at risk of losing.

  **Corrected during implementation, and the correction shrank the diff by most
  of its size.** The conversion to `switch` is not what buys the guarantee —
  *terminating the chain* is. TypeScript narrows a discriminated union through
  `if / else if / else` exactly as it does through `switch`, so

  ```ts
  if (move.kind === "solve") { … }
  else if (move.kind === "paint") { … }
  else return assertNever(move, "bricks: executeMove");
  ```

  gives `never` in the final `else` and fails to compile when a member is added.
  What these games were missing was never the `switch` keyword; it was the last
  branch. Rewriting ~28 working dispatchers into a different control-flow shape
  would have been risk taken for nothing, and several of them (Crossing, Rome,
  Subsets) share a prologue between two arms that a `switch` would have had to
  duplicate or restructure around.

  Where a game is already switch-shaped it keeps its `switch`; where the chain
  falls through to a shared tail rather than nesting (Crossing, Rome, Subsets,
  Loopy, and every two-member `if (solve) { … return }` game), the guard is a
  single narrowing line placed after the early returns —
  `if (move.kind !== "set") return assertNever(move, "…")` — which is both the
  smallest edit and the clearest statement of what the code below assumes.

  **And it must go before any bounds check it could hide behind.** Subsets'
  `pos < 0 || pos >= w * h` is *both* false for a missing `pos`, so a range test
  waves a foreign move through rather than catching it (survey.md).
- **Not a union** (Cube's single move shape) → no catch-all is meaningful;
  validate the fields the dispatcher relies on and throw with the same message
  shape. Cube already throws `"cube: illegal move"` for an undeliverable
  direction, so this is mostly making the existing habit uniform.

**Do not contort a game to fit the syntax.** The `ts-engine` requirement is
written as "an unrecognised move is rejected with an error naming the game",
which all three satisfy; the switch/`assertNever` pairing is the *recommended*
implementation, not the spec.

## D3: Why not parse at the boundary instead

The alternative considered — and rejected as the *primary* fix — is a
`Game.parseMove(raw: unknown): Move | null` hook that `loadGame` runs before
replay, leaving `executeMove` alone.

It is genuinely attractive: one hook, applied at the exact seam where untrusted
data enters, instead of touching 53 files. But:

1. **It defends one caller.** `executeMove` is also reached by `processInput`,
   hint execution and `playMoves` (the render-scenario driver). The dispatcher
   is where the assumption lives, so the dispatcher is where it should be
   asserted.
2. **It is 53 files either way**, just with more ceremony — a real parser per
   game is *more* code than a `default` arm, and a generic one could only check
   the discriminant, which is what the `switch` already does.
3. **It does not fix the second and third shapes.** A tolerant `else` branch
   still misreads a move that a shallow parse waves through.

Boundary parsing stays available if a *future* need appears (a save format that
must survive a genuine move-type migration, say), and would compose with this
change rather than replace it.

**One game already does it**, which the survey found and this section had not
known: **Pegs** ships `serialiseMove`/`deserialiseMove`, so its foreign move is
refused at the boundary and never reaches `executeMove`. That is a *better* place
to catch it, and it is left exactly where it is — only its message shape is
brought into line (`rejectMove(raw, "pegs: deserialiseMove")`; it previously
stringified the raw value to `Invalid pegs move: [object Object]`). It is the
concrete evidence for "would compose rather than replace": Pegs has both guards
now, and the boundary one wins.

## D4: What the safety net already covers, so this change does not claim it

`0d097c2` shipped the engine-level containment: `commitMove` refuses a non-state
before it can enter `history`, `loadGame` catches a failed replay and rewinds to
the saved game's opening position, and `restoreAutoSavedGame` drops an unplayable
autosave rather than rethrowing. **That is what stops the crash**, and it stays.

This change is therefore *not* "fix the crash". It is: make the 20 silent games
honest, make the confusing errors legible, and put the assumption under the
compiler so game 54 cannot quietly introduce a fourth shape. Worth stating
plainly, because a change that re-narrates an already-fixed bug as its
justification is how a repo ends up with two mechanisms for one problem.
