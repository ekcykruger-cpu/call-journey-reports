---
name: cxone-import
description: Run, debug or change the CXone report 540 data import (run report job, fetch base64 file, parse CSV, upsert legs, rebuild journeys), including bearer-token problems. Use when an import fails or the CXone integration needs changing.
---

# CXone import

## Flow
1. `TokenProvider.getToken()` — currently `ManualTokenProvider` (token pasted in Settings, in memory).
2. Run report job: `report-jobs/datadownload/540?fileName=EK_540_<importId>.csv&startDate&endDate&saveAsFile=true&includeHeaders=true`
3. Fetch file: `files?fileName=Reports\\EK_540_<importId>.csv` → base64 → CSV text.
4. Parse CSV (accept `start_time` as `HH:MM:SS` or Excel day-fraction), upsert `contact_legs` by `Contact_ID`.
5. Rebuild `journeys` for every root touched (follow `Master_Contact_ID` parent chain).
6. Record status/counts/error in the `imports` table.

## Debugging checklist
- **401/403** → token missing or expired. Ask the user to paste a fresh token in Settings. Never log the token.
- **File not found** right after the job → file may not be ready; check retry/backoff settings.
- **Row count mismatch** → compare with the same report run in the CXone UI for the same dates and timezone.
- **Journeys split oddly** → a parent leg may be outside the fetched range; fetch the previous day too.

## Rules
- Read `docs/cxone-api.md` first. Anything not documented there is unverified: tell the user what to check in the
  official CXone developer docs rather than guessing endpoints, fields or limits.
- Never print customer phone numbers (ANI_DIALNUM) in logs or test output.
