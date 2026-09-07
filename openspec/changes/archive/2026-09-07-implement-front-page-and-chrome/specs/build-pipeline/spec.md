# build-pipeline Specification Delta — implement-front-page-and-chrome

## ADDED Requirements

### Requirement: Every asset the build emits is precached, or the build fails

The production build SHALL verify that every file it writes to the output
directory appears in the service worker's precache manifest, and SHALL fail
otherwise. Files a page genuinely never loads MAY be excluded, and the
exclusions SHALL be shared with Workbox's own `globIgnores` rather than restated
beside them.

Offline is one of this app's two reasons for existing, and it rests on a single
extension allowlist. **An asset whose extension is missing from that list still
builds and still ships**; it is only absent from the manifest, so it loads
perfectly online and is silently missing offline. Nothing in the type checker,
the linter or the test suite can see it, because nothing is wrong with the file.

This is not hypothetical. `implement-front-page-and-chrome` self-hosted three
IBM Plex `woff2` faces *specifically* so that offline would match online, and
the allowlist had no `woff2` in it; the first run of this check also found that
`favicon.ico` had never been precached either. Two gaps, one of them years old,
neither visible from anywhere else.

The check SHALL run against the **built output** and the **generated service
worker**, not against the configuration, because the configuration is the thing
being checked. It SHALL report the offending file *extensions* rather than the
files, since the fix is always to the allowlist and a list of hashed filenames
buries it. It SHALL fail on its own input count, so a listing that matches
nothing cannot report health. Its exclusion ledger SHALL be held to being
exactly right — an unconditional entry matching no file fails — with entries
that are only emitted under some configurations marked as such, so the check
does not have to be weakened to survive an ordinary local build.

#### Scenario: A new asset type ships outside the offline cache

- **WHEN** the build emits a file whose extension is not in the precache
  allowlist and is not deliberately excluded
- **THEN** the build fails, naming the extension and an example file

#### Scenario: The exclusions are one list

- **WHEN** a file is deliberately kept out of the precache
- **THEN** the same declaration is what Workbox skips and what the check skips

#### Scenario: The check cannot pass over nothing

- **WHEN** the output listing finds implausibly few files
- **THEN** the build fails on the count rather than reporting coverage
