# CXone API notes

Only facts given by the project owner or confirmed in official docs belong here. Everything else is marked **(verify)**.

## Endpoints in use
Base: `https://api-na1.niceincontact.com/incontactapi/services/v34.0` (configurable via `CXONE_API_BASE`;
**verify** this cluster/host matches your Business Unit).

1. Run report 540 and save it as a file:
   `report-jobs/datadownload/540?fileName=EK_540_1.csv&startDate=2026-10-04&endDate=2026-10-05&saveAsFile=true&includeHeaders=true`
2. Fetch the saved file:
   `files?fileName=Reports%5C%5CEK_540_1.csv` (i.e. `Reports\\EK_540_1.csv`)
   Response contains the file **base64-encoded**.

## To verify in the CXone developer docs
- HTTP verb for the report-job call (GET vs POST).
- Whether `endDate` is inclusive, and the maximum date range per call.
- Exact JSON field that holds the base64 file in the `files` response.
- Whether the file is ready immediately or needs polling.
- Authentication flow for minting tokens automatically (grant type, token endpoint, token lifetime).

## Authentication (current)
Bearer token pasted into the app (held in memory) or set via `CXONE_BEARER_TOKEN`. Lost on restart by design.
