# share-the-desc-digit-alphabet — tasks

Scaffolded 2026-09-06 by `share-the-run-length-desc-scanner`, task 1.3.

## 1. Extract

- [ ] 1.1 `src/engine/desc-alphabet.ts` with `n2c` / `c2n` and a doc comment
      saying what the alphabet is, that it is frozen into shipped game IDs, and
      why a game's sentinel does not live here.
- [ ] 1.2 Singles adopts it; Magnets adopts it and keeps its `-1 → "."` in a
      two-line local `n2c`.
- [ ] 1.3 Catalog entry in `docs/games/engine-catalog.md`, or the
      engine-catalog guard fails the commit.

## 2. Prove it

- [ ] 2.1 **Both frozen differentials byte-clean.** That is the acceptance test.
- [ ] 2.2 A round-trip property over the whole alphabet — `c2n(n2c(n)) === n`
      for every `n` the codec covers, and `n2c(c2n(c)) === c` for every
      character it accepts. The two games only ever exercise the low end of the
      range; nothing today would notice `A`–`Z` being off by one.
- [ ] 2.3 **Prove the guard fails**: break one branch, watch 2.2 go red,
      restore.

## Findings

*(to be written by the work)*
