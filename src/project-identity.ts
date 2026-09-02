/**
 * How this project names itself and where it sends players for support.
 *
 * The **product** is Hintful Puzzles; the **repository** is `puzzles-ts`. They
 * are different names for different things, and only the product name reaches
 * a player. Every surface that shows it — the About dialog, the PWA manifest
 * (the label under an installed icon), the front page's title and heading —
 * reads it from here, so a rename is one edit and the copies cannot drift.
 *
 * The support links point at *this* project's repository. Links that exist to
 * credit a predecessor (puzzles-web, Simon Tatham's site, `puzzles-unreleased`)
 * are attribution, not support, and live beside the credits that use them.
 *
 * Imported by `vite.config.ts` as well as the app, so it must stay a leaf:
 * constants only, no browser or Node imports.
 */

/** The name a player sees: dialog titles, the front page, the installed icon. */
export const APP_NAME = "Hintful Puzzles";

/** The short label for a home-screen icon, where the full name would wrap. */
export const APP_SHORT_NAME = "Hintful";

/** Source code. */
export const REPO_URL = "https://github.com/yoniLavi/puzzles-ts";

/**
 * Bug reports and questions. The repository has Issues enabled and Discussions
 * off, so there is deliberately no separate forum link: a link to a disabled
 * tab is worse than none.
 */
export const ISSUES_URL = `${REPO_URL}/issues`;
