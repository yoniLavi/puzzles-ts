# Design

## Why not a codemod

The doubles differ: some record `{ op, x, y, color }`, some record a string, some
only capture the calls the test asserts on. The assertions are written against
whatever shape the author chose. A mechanical rewrite would produce eighteen
tests that compile and assert less than they did, which is the failure this
change exists to remove.

So: one file at a time, and for each, the test's assertions must still name the
same behavior after the move.

## Prove each file still asserts what it claimed

The tidy pass's method applies directly. For each migrated file, plant the defect
the test's title claims to catch, see it red, restore. A file whose test cannot be
made red by the defect it names was not migrated correctly, or was already
vacuous, and either way that is the finding.

This doubles as the answer to "did the new recorder change what we assert" —
before and after, the same planted defect must be caught.

## The snapshot question

`RecordingDrawing` is what the tier-2.5 snapshots are recorded through. A test
moving to it may reasonably gain a snapshot, but this change SHALL NOT add one
where the targeted assertions are the point: a snapshot that nobody reads is a
diff that gets `-u`'d. Add a snapshot only where the frame is genuinely worth
reviewing as a whole.

## Order

Mosaic and Flood first, because their doubles reduce the op shape and so cost the
most to move. If those two are cheap, the remaining sixteen are mechanical. If
they are expensive, the estimate for the rest is known before the work is
committed to, rather than after.
