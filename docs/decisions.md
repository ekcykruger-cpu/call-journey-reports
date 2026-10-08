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
| 10 | 2026-10-07 | Own MySQL session store (`server/src/auth/sessionStore.js`) instead of `express-mysql-session` | That package pins `mysql2@3.10.2`, which has known high-severity vulnerabilities |
| 11 | 2026-10-07 | First admin created via `npm run create-admin`, which prints a set-password link | No default password ever exists; no password typed into a terminal |
| 13 | 2026-10-07 | Import = upsert legs + reload all connected legs from the DB, re-stitch, upsert journeys, delete stale journeys — one transaction | Transfers that span two imports link up correctly; a failed import changes nothing |
| 14 | 2026-10-07 | Tests use an anonymised fixture (`server/test/fixtures/report540-anon.csv`) | Real sample stays out of Git |
| 15 | 2026-10-08 | CXone fetch = one request per Sydney day, run in the background, one fetch at a time; unverified API details are env settings + runtime detection, with response *shape* logged | CXone docs couldn't be read automatically; overlap-safe and correctable without code changes |
| 16 | 2026-10-08 | Imports left queued/running are marked failed at startup | A redeploy mid-fetch would otherwise leave them "running" forever |
| 17 | 2026-10-08 | Each chart chooses timeline or 24h-profile x-axis; global skill filter uses the journey's first (entry) skill | Owner's choice; entry skill = where the call was offered |
| 18 | 2026-10-08 | Dashboard choices (dates, hidden charts, per-chart line/bar and axis) remembered per browser in localStorage | Convenience only; nothing breaks if storage is blocked |
| 19 | 2026-10-08 | "Clear call data" deletes journeys/legs (all, or by start date range) and keeps users, logins and metrics; typed DELETE confirmation | Owner asked to clear the DB; wiping users would lock everyone out |
| 20 | 2026-10-08 | Chart colour #2a78d6 (light) / #4a90e8 (dark), validated with the dataviz palette checker | Contrast and lightness pass on both surfaces |
| 12 | 2026-10-07 | Until Gmail is set up, invite/reset emails are written to the server log and invite links are shown to the admin | Lets login work end to end before the Google Cloud setup |
