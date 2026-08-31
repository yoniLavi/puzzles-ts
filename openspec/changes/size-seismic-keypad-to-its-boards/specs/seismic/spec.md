# seismic Specification Delta — size-seismic-keypad-to-its-boards

## ADDED Requirements

### Requirement: The on-screen keypad offers only digits a board can accept

Seismic's `requestKeys` SHALL NOT offer a digit that no board the generator
produces could accept. Entry is capped at the pressed cell's region size, and the
generator draws region sizes from a bounded distribution, so a panel sized to the
*format*'s maximum leaves keys that are inert on every board a player will ever
see. On touch the panel is the only digit-entry route there is, so an inert key
is not a cosmetic surplus — it is a control that does nothing when pressed.

The requirement is on the *relationship*, not on a number: whichever bound the
generator's distribution has, the panel SHALL match it, and widening one SHALL
widen the other. The panel SHALL therefore **derive** that bound from the
generator's own size distribution rather than restate it as a literal — a
restated bound is what produced this defect, when the generator's distribution
changed and a hand-written copy three files away had no way to hear about it.

The bound the panel derives from SHALL be the **generator's**, not the format's.
The two differ (the format admits up to nine in Seismic mode; the generator
produces at most five), they are adjacent enough to be confused, and the panel
confused them.

#### Scenario: No offered digit is unreachable

- **WHEN** the collection-wide on-screen-key guard sweeps Seismic
- **THEN** every button `requestKeys` returns is one `interpretMove` accepts
  somewhere on a generated board, and Seismic carries no entry in the
  inert-panel-key findings list

#### Scenario: Widening the generator widens the panel

- **WHEN** the generator's region-size distribution is changed to admit a larger
  region
- **THEN** the keypad admits the corresponding digits
