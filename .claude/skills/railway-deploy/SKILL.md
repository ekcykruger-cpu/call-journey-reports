---
name: railway-deploy
description: Pre-deploy checklist and troubleshooting for deploying this app to Railway (env variables, build/start commands, MySQL connection, healthcheck, logs). Use when deploying or when the Railway deployment fails.
---

# Deploy to Railway

## Before pushing to `main`
1. `npm test` passes locally.
2. `npm run build` then `npm start` works locally; `http://localhost:3000/healthz` returns ok.
3. Any new environment variable is added to `.env.example` **and** the user is told to add it in Railway → service → Variables.
4. New DB changes are a new migration file (never edit an applied migration).
5. No secrets or `sample/` data staged: `git status`, `git diff --cached`.

## Deploy
Push to `main` → Railway builds (`npm run build`) and starts (`npm start`). Migrations run on start.

## If it fails
- Ask the user to copy the **Build logs** or **Deploy logs** from the Railway dashboard.
- Healthcheck failing → app must listen on `process.env.PORT`; `/healthz` must not need the DB to respond.
- DB connection errors → check the web service references the MySQL service's connection variable.

## Rules
- Follow `docs/railway-setup.md`. Don't invent Railway settings — point to https://docs.railway.com.
- Give the user PowerShell commands.
