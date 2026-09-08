# build-pipeline Specification Delta — enable-crash-reporting

## ADDED Requirements

### Requirement: A stated reporting rule matches what the build does

Where this project states that errors reach an error-reporting service, a
deployed build SHALL actually send them, or the statement SHALL be amended to
say that it does not. A rule enforced against nothing is worse than no rule: it
reads as a guarantee, code is written to satisfy it, and nobody discovers it is
inert until the failure it exists for is the one nobody heard about.

`AGENTS.md` has carried "let them propagate so Sentry records them" since before
there was anywhere to deploy, and `VITE_SENTRY_DSN` has never been set. That
cost nothing while no one could reach the app. It costs something the moment the
app is public: the first outside failure — a stale chunk on the About dialog —
reached the developer only because a player read the error off their own screen
and retyped it.

#### Scenario: A reporting rule is stated but no build implements it

- **WHEN** the project documents that unrecoverable errors reach a reporting
  service
- **THEN** either the deployed build sends them, or the documentation records
  that reporting is deliberately off

### Requirement: Turning on error reporting settles its side effects deliberately

Enabling error reporting SHALL NOT be treated as setting one variable. Setting
`VITE_SENTRY_DSN` also widens the Content-Security-Policy's `connect-src` and
turns on high-entropy client hints via `Accept-CH` and `Permissions-Policy` —
`Sec-CH-UA-Platform-Version`, `-Full-Version-List` and `-Model`.

Client hints are a **fingerprinting surface** adopted for the convenience of
reading stack traces, not a requirement of error reporting, and SHALL be decided
on their own merits rather than inherited from the variable that happens to
carry them.

A client-side DSN is public by construction: it is compiled into the shipped
bundle and readable from the deployed assets. Whatever it is stored in, the
controls that restrict use are the reporting service's own allowed-domains list
and rate limits, and both SHALL be configured — an unrestricted public DSN
accepts traffic from anywhere.

Reporting SHALL be verified by observing a deliberately triggered error arrive,
since a DSN that is set but wrong is indistinguishable from an app that never
crashes.

#### Scenario: Error reporting is switched on for a deployment

- **WHEN** a deployment enables error reporting
- **THEN** the service's allowed domains and rate limits are configured
- **AND** the client-hint headers are a recorded decision rather than a side
  effect
- **AND** a deliberately triggered error is observed arriving

### Requirement: What a crash report carries matches what the privacy notes promise

The privacy notes a player can read SHALL describe what a crash report actually
contains. Before reporting is enabled, one real payload SHALL be read against
those notes, and any excess SHALL be turned off or the notes amended in the same
change.

`src/assets/privacy.html` promises a report describes "the error, the version of
the app, and the browser and screen it happened on", carries neither the
player's identity nor their games, and has "personal information switched off in
the reporting on purpose". That last clause is `sendDefaultPii: false` in
`src/utils/sentry.ts`, and it is a sentence in the product rather than only a
setting.

#### Scenario: A crash report would carry more than the notes describe

- **WHEN** the payload a deployment would send exceeds what the privacy notes
  promise
- **THEN** the excess is disabled, or the notes are corrected in the same change
