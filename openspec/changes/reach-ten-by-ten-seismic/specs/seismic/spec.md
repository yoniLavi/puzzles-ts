# seismic Specification Delta — reach-ten-by-ten-seismic

## MODIFIED Requirements

### Requirement: Seismic ports the deductive solver and solver-gated generator

The generator SHALL build region partitions by a construction that succeeds
without relying on a low-probability accept, so that generation time does not
grow without bound with the board area. It SHALL be able to produce a 10×10
board — the size at which this puzzle is normally played — in both Seismic and
Tectonic modes, and `MAX_CELLS` SHALL be set to the measured reach of that
construction rather than to the point at which a rejection loop stops paying off.

Every generated board SHALL remain uniquely solvable at exactly the requested
difficulty under the ported solver. Because changing the fill changes every board
the game produces, the generator's byte-for-byte correspondence with the C
reference SHALL NOT be a requirement of this game; verification SHALL instead
rest on solvability and uniqueness of generated boards together with the solver's
own unchanged fixtures.

#### Scenario: A ten-by-ten board is generated in both modes

- **WHEN** a 10×10 board is requested in Seismic mode, and again in Tectonic mode
- **THEN** a uniquely solvable board of the requested difficulty is produced,
  within the generation-time budget

#### Scenario: The size bound reflects what the generator reaches

- **WHEN** a board size above `MAX_CELLS` is requested
- **THEN** it is refused with a reason, and `MAX_CELLS` is the measured limit of
  the shipped construction
