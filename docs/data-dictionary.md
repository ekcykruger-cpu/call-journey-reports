# Data dictionary — CXone report 540

Learned from `sample/EK_540_sample.xlsx` (9 legs, 2 journeys of 4 and 5 legs). An anonymised copy used by
the tests is in `server/test/fixtures/report540-anon.csv`. Unconfirmed items are marked **(verify)**.

## Grain
One row = one **contact leg**. A customer call that is transferred produces several legs.

## Journey stitching
- `Master_Contact_ID` = `Contact_ID` of the **previous (parent) leg**. The first leg's `Master_Contact_ID` equals its own `Contact_ID`.
- Example from the sample:
  `709320086206 → 709320089270 → 709320091624 → 709320094279` (4 legs, one journey).
- Journey root = the leg reached by following `Master_Contact_ID` until it points to itself (or to a leg we don't have).

## Columns
| Column | Type | Notes |
|---|---|---|
| Contact_ID | BIGINT | Unique per row |
| Master_Contact_ID | BIGINT | Parent leg (see above) |
| Contact_Code | INT | |
| Media_Name | text | e.g. `Phone Call` |
| Contact_Name | text | Looks like the dialled number (DNIS) **(verify)** |
| ANI_DIALNUM | text | Caller number — personal data |
| Skill_No, Skill_Name | INT, text | |
| Campaign_No, Campaign_Name | INT, text | |
| Agent_No, Agent_Name | INT, text | `0` / `N/A` when no agent (abandoned) |
| Team_No, Team_Name | INT, text | `0` / `N/A` when no agent |
| SLA | 0/1 | Met service level? **(verify meaning)** |
| Start_Date | date | `MM/DD/YYYY` |
| start_time | time | Excel day-fraction in xlsx (0.48118 = 11:32:54); API CSV format **(verify)** — parser accepts both |
| PreQueue | seconds | |
| InQueue | seconds | |
| Agent_Time | seconds | |
| PostQueue | seconds | Large on legs followed by a transfer — may overlap next leg **(verify)** |
| ACW_Time | seconds | After-call work |
| Total_Time_Plus_Disposition | seconds | = PreQueue + InQueue + Agent_Time + PostQueue + ACW_Time (verified on all sample rows) |
| Abandon_Time | seconds | Equals InQueue on the abandoned sample row |
| Routing_Time | seconds | Not part of the total |
| Abandon | Y/N | |
| Callback_Time | seconds | |
| Logged | Y/N | |
| Hold_Time | seconds | Probably inside Agent_Time **(verify)** |
| Disp_Code, Disp_Name | INT, text | Disposition (outcome) |
| Disp_Comments | text | |
| Tags | text | |

## CSV quirks
- CXone's export can contain **unescaped quotation marks** inside quoted text fields (seen 2026-10-08 for
  2026-06-16, line 2320: `Invalid Closing Quote`). The importer then falls back to a tolerant reader
  (`server/src/import/lenientCsv.js`) and adds a note to the import history.

## Timezone
Australia/Sydney (decision #5).
