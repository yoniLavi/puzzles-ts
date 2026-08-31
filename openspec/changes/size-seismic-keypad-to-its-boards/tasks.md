# Tasks — size-seismic-keypad-to-its-boards

- [x] 1.1 **Owner decision taken, 2026-08-31: size the panel to the generator.**
      The argument that settled it is in `design.md` D2 — removing those four
      keys removes **no capability**, because they already do nothing and a
      physical keyboard still sends the digits to the same rejection.
- [x] 1.2 **Measurement confirmed, and it turned out to be structural rather
      than empirical** (`design.md` D1): the largest region generated is 5
      across all 16 preset/mode combinations × 25 seeds — and `growRegions`
      caps growth at `drawRegionSize`, whose maximum is 5 in both modes, so no
      larger region is *constructible*. The stranded-pocket case is not an
      exception; a pocket is the next iteration of the same loop.
- [ ] 1.3 Implement per `design.md` **D3** — and note this is not `digitKeys(5)`:
      - [ ] export `maxGeneratedRegionSize(mode)` from `generator.ts`, computed
            as `Math.max(...)` over the distribution rather than written as `5`;
      - [ ] have `requestKeys` call it, deleting the inline
            `p.mode === MODE_TECTONIC ? 5 : 9`, which is a copy of
            `maxRegionSize` — the *format* bound — where the *generator* bound
            was wanted, and is how this defect arose in the first place;
      - [ ] assert `maxGeneratedRegionSize(mode) <= maxRegionSize(mode)`, which
            also gives `maxRegionSize` the production-adjacent reader it has
            been missing (`design.md` D4).
- [ ] 1.4 **Empty the `INERT_PANEL_KEYS` entry for `seismic` in
      `src/engine/input-parity.test.ts`.** That list is a finding under
      management, not an exemption; leaving the entry behind after the fix turns
      it into one.
- [ ] 1.5 Pin the returned `KeyLabel[]` for both modes tier-1, per
      `docs/games/input.md` § "The on-screen keypad".
- [ ] 1.6 `seismic` spec: state what the keypad is sized to and why.
- [ ] 1.7 `openspec validate size-seismic-keypad-to-its-boards --strict`.
