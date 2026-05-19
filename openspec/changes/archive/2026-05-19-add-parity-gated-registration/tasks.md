## 1. Spec deltas

- [x] 1.1 `ts-migration`: MODIFY "Per-game hybrid; C deleted per game"
      to require full behavioural+owner parity before a game is
      registered / its C deleted.
- [x] 1.2 `ts-engine`: ADD "The midend repaints on every transition
      and drives animation" requirement.

## 2. Docs

- [x] 2.1 `AGENTS.md`: add the parity-gated-registration rule to the
      doctrine; correct the "Flip landed" record to state it shipped
      broken, needed two follow-up fixes, and is owner-parity-gated.

## 3. Validate & archive

- [x] 3.1 `openspec validate add-parity-gated-registration --strict`.
- [x] 3.2 Full gate green (tsc → biome → vitest → vite build).
- [x] 3.3 Archive; `openspec validate --specs --strict`.
