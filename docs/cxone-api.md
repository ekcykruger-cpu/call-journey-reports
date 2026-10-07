# CXone API notes

Only facts given by the project owner or confirmed in official docs belong here. Everything else is marked **(verify)**.
The CXone developer portal renders with JavaScript, so it can't be read by Claude's fetch tool — the owner must check it.

## Endpoints in use (code: `server/src/cxone/`)
Base: `CXONE_API_BASE`, default `https://api-na1.niceincontact.com/incontactapi/services/v34.0`
(**verify** this cluster/host matches your Business Unit).

1. Run report 540 and save it as a file:
   `report-jobs/datadownload/540?fileName=CJR_540_<importId>.csv&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&saveAsFile=true&includeHeaders=true`
   HTTP method: `CXONE_REPORT_JOB_METHOD`, default `POST` **(verify)**. A 405 response tells you to switch it.
2. Fetch the saved file: `GET files?fileName=Reports%5C%5CCJR_540_<importId>.csv` (i.e. `Reports\\<name>`).
   Response contains the file **base64-encoded**. The code prefers a JSON field named `file`, otherwise the longest
   base64-looking string **(verify field name)**. Retries on 404/5xx for ~1 minute in case the file isn't ready.

Every call logs `[cxone] <step>: HTTP <status>; response shape: {...}` — field names and sizes only, never data —
so the real response structure can be confirmed from Railway's Deploy Logs.

## How fetching works
- The Data page's From/To dates (Sydney, both included) are split into one request per day:
  `startDate = day`, `endDate = next day`. This is safe whether or not CXone treats endDate as inclusive,
  because re-imported rows are updated, not duplicated.
- One fetch runs at a time; days run one after another. Each day is a row in the import history.
- A token problem (401/403/expired) stops the remaining days.
- Files are left in CXone's file storage under unique names (`CJR_540_<importId>.csv`) **(verify whether to clean up)**.

## Settings (Railway → web service → Variables; all optional)
| Variable | Default | Purpose |
|---|---|---|
| `CXONE_API_BASE` | api-na1 v34.0 URL above | API host/version |
| `CXONE_REPORT_ID` | `540` | Report to run |
| `CXONE_REPORT_JOB_METHOD` | `POST` | HTTP method for the run-report call |
| `CXONE_FILE_FOLDER` | `Reports\\` | Folder prefix for the file fetch |
| `CXONE_FILE_PREFIX` | `CJR_540_` | Prefix for generated file names |
| `CXONE_MAX_DAYS_PER_FETCH` | `31` | Largest date range per fetch |
| `CXONE_BEARER_TOKEN` | — | Token loaded at startup (otherwise paste on Settings page) |

## To verify in the CXone developer docs
- HTTP method for `report-jobs/datadownload/{reportId}`.
- Whether `endDate` is inclusive; maximum range per call; which timezone startDate/endDate use (BU timezone or UTC).
- Exact JSON field that holds the base64 file in the `files` response.
- Whether saved files should be deleted afterwards (and the endpoint for it).
- Authentication flow for minting tokens automatically (grant type, token endpoint, token lifetime).

## Authentication (current)
`ManualTokenProvider` in `server/src/cxone/tokenProvider.js`: token pasted on the Settings page (or `CXONE_BEARER_TOKEN`),
held **in memory only**, lost on restart/redeploy. Never returned by the API or logged. Expiry shown if the token is a JWT.
Automatic minting = add an `OAuthTokenProvider` with the same `getToken()`/`status()` methods once the auth flow is confirmed.
