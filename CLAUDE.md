# Call Journey Reports

Login-protected reporting website for NICE CXone call data. Pulls CXone **report 540** (one row per contact leg) via API,
stitches transferred legs into **call journeys**, and charts metrics by 15/30/60-minute interval.
Hosted on **Railway** (one Node web service + one MySQL service).

## Architecture
- `server/` — Node.js (ESM) + Express 5. Serves `/api/*`, `/healthz`, and the built React app from `client/dist`.
- `client/` — React + Vite SPA, charts with Chart.js. In dev, Vite (:5173) proxies `/api` to Express (:3000).
- `docs/` — data dictionary, metric DSL, setup guides, decision log. Read `docs/decisions.md` before changing design.
- npm workspaces: run commands from the repo root.

## Commands (PowerShell, from repo root)
- `npm install` — install all workspaces
- `npm run dev:server` and `npm run dev:client` — run in two terminals; open http://localhost:5173
- `npm run build` — build the client; `npm start` — run production server on :3000
- `npm test` — run tests

## Data rules (do not break)
- One CSV row = one **leg**. `Contact_ID` is unique per row; re-imports **upsert** by `Contact_ID`.
- `Master_Contact_ID` is the **parent leg's** `Contact_ID` (first leg points to itself). Walk the chain to find the journey root.
- All metrics are **per journey**: a journey is placed in an interval by its **first leg's start time**; leg times are summed.
- Source data and charts are in **Australia/Sydney** time (handle DST via Luxon, never hand-rolled offsets).
- `Total_Time_Plus_Disposition = PreQueue + InQueue + Agent_Time + PostQueue + ACW_Time`.
- Journey abandon has two meanings: `abandoned_final` (last leg) and `abandoned_any` (any leg).
- PostQueue stored as-is; `has_next_leg` lets metrics exclude PostQueue on transferred legs.
- Metrics are JSON definitions stored in MySQL and compiled to **parameterised SQL** over a whitelist of journey fields.
  Never concatenate user input into SQL.

## External systems — never invent details
- CXone: if an endpoint, auth flow, field name or limit is not in `docs/cxone-api.md`, say what to check in the
  official CXone developer docs instead of guessing.
- Railway / Google (Gmail API): same rule — point to the official docs.

## Security
- Secrets only in `.env` (local) or Railway Variables. Never commit `.env` or `sample/` (may contain real phone numbers).
- Passwords: argon2id. Reset/invite tokens: store only SHA-256 hash, short expiry, single use.

## Working with the owner
- The owner is new to cloud hosting and APIs: after each change, explain in plain English (3-5 sentences) what changed and why.
- Give PowerShell commands (Windows), not Bash.
- Propose a plan and wait for approval before editing files. Ask before installing any package.
- Offer 2-3 options with trade-offs and a recommendation when there is a real choice.
