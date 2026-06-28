# Tasks: Extract a shared win-flash helper

> Trivial, behaviour-preserving. Gate: existing flash-overlay tests (e.g. Flip's
> flash-isolation test, the games' completion-flash assertions).

- [ ] 1.1 `engine/flash.ts` `winFlash(from, to, flashTime)` — `flashTime` on a fresh,
  un-cheated unsolved→solved transition, else `0`; reads `completed`/`cheated`
  structurally. Unit test (the four state combinations).
- [ ] 1.2 Delegate `flashLength` in the games whose flash is exactly the canonical shape
  (Keen/Towers/Unequal/Solo and any other match); leave bespoke-flash games (Flip) alone.
- [ ] 1.3 Full gate green → owner acceptance → commit + archive. (Or fold 1.1–1.2 into the
  next game port and drop this standalone change.)
