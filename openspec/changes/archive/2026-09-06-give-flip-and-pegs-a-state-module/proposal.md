# give-flip-and-pegs-a-state-module

**Readiness: ready.** `re-express-the-collection`'s B7.

## The finding, after its first write-up was corrected

B7 was filed while doing B5 as "a weaker case than B5", on the grounds that the
state/generator split "is looser" across the collection. **That was asserted,
not measured.** Measured:

| File | Games that have it |
| --- | --- |
| `render.ts` | **57** (since `move-renderers-into-render-ts`) |
| `state.ts` | **55** — every game except flip and pegs |
| `solver.ts` | 46 |
| `generator.ts` | 45 |

`state.ts` at 55–2 is as settled as the renderer was at 53–4, and flip and pegs
are the same two holdouts for the same reason: they were never split at all.
What genuinely varies is `generator.ts` and `solver.ts`, and that variation is a
real per-game judgment — a game with no generated boards has nothing to put in
one.

Both of these do have real generation, so both get a `generator.ts` as well.
Neither has a solver, so neither gets one.

## What it fixes beyond consistency

**It undoes a workaround B5 had to invent.** When the renderers moved out,
`pegs/render.ts` needed Pegs' grid vocabulary — `GRID_HOLE`, `GRID_PEG`,
`GRID_OBST` — and importing those *values* from `index.ts` created a runtime
import cycle that `module-layering.test.ts` caught. With no state module to hold
them, they went into `render.ts` with a comment explaining that they were only
there because "Pegs has no `state.ts`".

Now they are in `state.ts`, where they belong, and `render.ts` imports them from
it. The cycle is impossible rather than avoided: `render.ts` imports no value
from `index.ts` at all.

## Impact

- Affected specs: none. Files moved; no behavior, format or contract changes.
- Affected code:

  | | before | after |
  | --- | --- | --- |
  | flip | `index.ts` 944 | index 457 + state 78 + generator 240 + render 249 |
  | pegs | `index.ts` 1,114 | index 315 + state 251 + generator 278 + render 345 |

- **Player-invisible**, and both games carry a frozen differential that would
  catch a desc byte moving. Both pass.
- `index.ts` re-exports each game's types, as Galaxies and others already do, so
  the tests and the registry see the same surface.
