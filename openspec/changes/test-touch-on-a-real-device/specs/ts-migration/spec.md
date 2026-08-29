# ts-migration Specification Delta — test-touch-on-a-real-device

## ADDED Requirements

### Requirement: Touch acceptance happens on a device, and a synthesised pointer is not one

Work whose correctness is *how it feels under a finger* SHALL be accepted on a
real touch device against a deployed build. The in-process tiers and a
synthetic-pointer browser pass SHALL NOT be offered as that acceptance.

The distinction is not pedantry, and the boundary is exact. A Chrome pass driving
`PointerEvent`s with `pointerType: "touch"` exercises the frontend's own decision
logic faithfully — it is how the seven-game long-press defect was demonstrated
and its repair confirmed, in both directions. It says nothing whatever about a
hand: whether a fingertip can hit the target, whether a hold window matched to
a mouse suits a thumb, whether a repaired gesture feels responsive or merely
stops swallowing input. Those need hardware, and no further in-process work
produces them.

A change may therefore be **archived on the code's evidence with device
acceptance carried forward**, provided the carry is explicit: the deferral is
recorded in the change, and it names the change that will discharge it. What is
forbidden is the silent version, where a browser pass is written up in a way that
reads as a device pass.

#### Scenario: A touch fix is accepted

- **WHEN** a change repairs or alters behaviour under touch
- **THEN** its acceptance is performed on a real device against a deployed
  build, or is explicitly carried forward by a named change

#### Scenario: A browser pass is not written up as a device pass

- **WHEN** a change reports a Chrome pass using synthesised touch pointers
- **THEN** it states what that evidence covers — the frontend's decision — and
  what it does not: hit targets, gesture timings suited to a hand, and how the
  result feels

### Requirement: A device pass records a verdict per item, not an overall impression

A device pass SHALL enumerate what it checked and give each item a verdict, in
the shape of a sweep rather than a summary — the same discipline the input-mode
audit applied to 57 games × 3 modes.

The failure this prevents is a pass that means nothing: a few minutes of tapping,
followed by a conclusion covering everything nobody happened to try. A device is
the scarcest instrument this project has, and an unenumerated pass spends it
without leaving a record of what it bought.

A finding SHALL distinguish **"the input was not delivered"** from **"the input
was delivered and the result feels wrong"**. They have different causes and
different fixes, and blurring them sends the next person to the wrong layer.

#### Scenario: A device pass is recorded

- **WHEN** a device pass completes
- **THEN** its report names each game, gesture and platform capability checked,
  with a verdict for each — including the ones that passed
