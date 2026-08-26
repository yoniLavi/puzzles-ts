# Tasks — size-seismic-keypad-to-its-boards

- [ ] 1.1 **Ask the owner**, with the cost stated: nine keys of which four are
      inert on every generated board, versus five keys that all work but could
      strand an imported desc carrying a larger region. The proposal recommends
      the second.
- [ ] 1.2 Confirm the measurement independently before acting on it — sweep
      several presets and seeds and report the largest region actually
      generated, rather than trusting `SEISMIC_REGION_SIZES` to describe the
      realised distribution (it does not: the comment says the realised sizes run
      *smaller* than the draw, because a region stops early when it runs out of
      free neighbours).
- [ ] 1.3 Implement the chosen option in `requestKeys`.
- [ ] 1.4 **Empty the `INERT_PANEL_KEYS` entry for `seismic` in
      `src/engine/input-parity.test.ts`.** That list is a finding under
      management, not an exemption; leaving the entry behind after the fix turns
      it into one.
- [ ] 1.5 Pin the returned `KeyLabel[]` for both modes tier-1, per
      `docs/games/input.md` § "The on-screen keypad".
- [ ] 1.6 `seismic` spec: state what the keypad is sized to and why.
- [ ] 1.7 `openspec validate size-seismic-keypad-to-its-boards --strict`.
