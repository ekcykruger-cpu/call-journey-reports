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

## Later phases
- Add a **MySQL** service to the project and reference its connection variable from the web service
  (check Railway docs for the exact variable names, e.g. "MySQL" and "Variable references").
- Check your Railway plan's rules on outbound network traffic (we use HTTPS only: CXone API and Gmail API).
