# Railway setup (step by step)

Railway's UI changes over time — if a step doesn't match what you see, follow the official docs at https://docs.railway.com.

## 1. Push the code to GitHub
Create an empty private repo on GitHub, then from the project folder (PowerShell):
```powershell
git remote add origin https://github.com/<you>/call-journey-reports.git
git push -u origin main
```

## 2. Create the Railway project
1. In Railway, **New Project → Deploy from GitHub repo** and pick the repo.
2. Railway detects Node.js. Check the service settings so that:
   - Build command: `npm run build`
   - Start command: `npm start`
   (Check Railway docs on how it detects Node and runs `npm install` for workspaces.)
3. Under **Settings → Networking**, generate a public domain.
4. Set a healthcheck path of `/healthz` (see Railway docs: "Healthchecks").

## 3. Variables (Phase 1)
- `NODE_ENV=production`
- `APP_BASE_URL=https://<your-railway-domain>`
Railway sets `PORT` itself — the app already reads it.

## 4. Check it works
Open `https://<your-railway-domain>/healthz` → should show `{"status":"ok",...}`.
Then open the domain root → should show the "Call Journey Reports" page with API health ok.

## 5. Database (Phase 2)
Checked against Railway docs (MySQL guide, Variables guide) on 2026-10-07.

### 5a. Add MySQL
1. On the **Project Canvas** click **+ New** (or press **Ctrl + K**) → **MySQL**.
2. Wait until the new **MySQL** box shows as running.

### 5b. Connect the web service to MySQL (inside Railway)
The MySQL service provides `MYSQL_URL` (internal, for services in the same project).
1. Click the **web service** box → **Variables** tab → **New Variable**.
2. Name `DATABASE_URL`, value exactly: `${{MySQL.MYSQL_URL}}`
   (`MySQL` must match the database box's name; the `${{` autocomplete helps).
3. Variable changes are **staged** — review and **deploy** them from the banner.
4. Check: `https://<your-railway-domain>/healthz` shows `"db":"ok"`. Tables are created automatically on startup.

### 5c. Connect your laptop (for local development)
1. **MySQL** box → **Settings → Networking** → enable **Public Access**.
   Railway bills network egress through this public TCP proxy.
2. MySQL box → **Variables** → copy **`MYSQL_PUBLIC_URL`**.
3. In the project folder create `.env` (copy of `.env.example`) and set `DATABASE_URL=<MYSQL_PUBLIC_URL value>`.
   Never paste it into chat or commit it.
4. Run `npm run migrate` → `applied N migration(s)` or `database is up to date`.

## 6. Login (Phase 3)

### 6a. Session secret — do this BEFORE pushing Phase 3
The app refuses to start in production without it.
1. Generate a random value (PowerShell):
   ```powershell
   $b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
   ```
2. Web service → **Variables** → **New Variable**: `SESSION_SECRET` = that value → deploy the staged change.
   (Changing it later logs everyone out.)

### 6b. Create your admin account
From your laptop (needs 5c), replacing the email, name and domain:
```powershell
npm run create-admin -- you@example.com "Your Name" --base-url https://<your-railway-domain>
```
It prints a one-time link — open it, choose a password (12+ characters), then log in.
Run it again any time to get a fresh link (e.g. if you're locked out).

## Later
- Check your Railway plan's rules on outbound network traffic (we use HTTPS only: CXone API and Gmail API).
