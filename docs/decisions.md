# Decision log

Short record of design decisions and why. Add a new entry rather than editing old ones.

| # | Date | Decision | Why |
|---|------|----------|-----|
| 1 | 2026-10-07 | React SPA (Vite) + Chart.js served by the same Express service | Interactive charts/filters without page reloads; one Railway service keeps hosting simple |
| 2 | 2026-10-07 | Metrics defined in an admin UI, stored as JSON in MySQL, compiled to parameterised SQL | New graphs without code changes or redeploys; whitelist + parameters prevent SQL injection |
| 3 | 2026-10-07 | Admin invites users; roles Admin / Viewer; no public sign-up | Small audience; avoids exposing registration |
| 4 | 2026-10-07 | All metrics count **per journey** (first leg's start time decides the interval) | A transferred call is one customer contact |
| 5 | 2026-10-07 | Data and charts in Australia/Sydney time | Source tenant is Australian |
| 6 | 2026-10-07 | PostQueue stored as-is with a `has_next_leg` flag | Meaning on transferred legs unconfirmed; metrics can choose |
| 7 | 2026-10-07 | Password-reset email via Gmail API (OAuth2 refresh token over HTTPS) | Avoids possible outbound SMTP restrictions on Railway |
| 8 | 2026-10-07 | CXone bearer token pasted into memory for now, behind a `TokenProvider` interface | Lets us add automatic token minting later without touching the import code |
| 9 | 2026-10-07 | `sample/` is gitignored | Sample contains phone numbers that may be real |
