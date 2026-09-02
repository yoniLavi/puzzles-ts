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
- [x] 1.3 Implemented per `design.md` **D3** (2026-09-02):
      - [x] `maxGeneratedRegionSize(mode)` exported from `generator.ts`, as
            `Math.max(...SEISMIC_REGION_SIZES)` in Seismic mode and the same
            `TECTONIC_REGION_SIZE` constant `drawRegionSize` draws in Tectonic —
            both bounds read the value the generator actually uses;
      - [x] `requestKeys` calls it; the inline `MODE_TECTONIC ? 5 : 9` is gone;
      - [x] `seismic.test.ts` asserts `maxGeneratedRegionSize(mode) <=
            maxRegionSize(mode)` for both modes, and the structural sweep now
            checks every generated region against the *generated* bound as well
            as the format one.
- [x] 1.4 `INERT_PANEL_KEYS` is empty; the comment says why it is meant to stay
      so. `input-parity.test.ts` green with Seismic on the sweep.
- [x] 1.5 Pinned literally for both modes (`["1".."5","Clear"]`). **Proved it
      fails**: widening the distribution to `[2,3,3,4,4,5,6]` turns the pin red
      with a `"6"` in the received panel; restored.
- [x] 1.6 `seismic` spec: the ADDED requirement states the relationship; a
      **MODIFIED** delta on "Seismic input, note-taking and completion" replaces
      its "(five numbers in Tectonic, nine in Seismic)" sentence, which would
      otherwise have contradicted it one requirement above. Grepped the live
      spec first; the sentence lives in that requirement and nowhere else.
- [x] 1.7 `openspec validate size-seismic-keypad-to-its-boards --strict` — valid.
- [x] 1.8 `docs/games/input.md` § "The on-screen keypad": the Seismic bullet now
      reads as the worked example rather than the open counter-example.
