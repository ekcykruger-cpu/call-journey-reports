# Metric definitions

A metric is a small JSON recipe saved in the `metrics` table (created in the Metric Builder, or seeded by a migration).
The engine (`server/src/metrics/`) turns it into one SQL query over the **journeys** table — never raw user SQL.

## How a value is calculated
For each interval: **value = numerator ÷ denominator** (denominator optional), over the journeys that
- started in that interval (first leg's Sydney start time), and
- match the metric's `filters`, and
- match the dashboard's skill filter (journey's **first / entry skill**), if one is chosen.

`format: "percent"` multiplies the value by 100. Division by zero gives an empty point, never 0.

## Example
"(PreQ + InQ time) / number of journeys, where the call was abandoned":
```json
{
  "name": "Avg PreQ+InQ for abandoned journeys",
  "chartType": "line",
  "xAxis": "timeline",
  "filters": [{ "field": "abandoned_final", "op": "=", "value": "Y" }],
  "numerator": "sum(sum_pre_queue + sum_in_queue)",
  "denominator": "count()",
  "format": "seconds",
  "decimals": 1,
  "emptyAs": "gap",
  "profileMode": "combined"
}
```

## Settings
| Key | Values | Meaning |
|---|---|---|
| `name` | text | Unique name |
| `description` | text | Shown under the chart |
| `chartType` | `line` / `bar` | Default chart type |
| `xAxis` | `timeline` / `profile` | Default view: every interval in the range, or all days folded into one 24-hour shape |
| `filters` | list | See below |
| `numerator` | formula | Required |
| `denominator` | formula or empty | Optional |
| `format` | `number` / `seconds` / `percent` | How values are shown; `percent` multiplies by 100 |
| `decimals` | 0-4 | Rounding |
| `emptyAs` | `gap` / `zero` | Intervals with no journeys: gap (averages) or 0 (counts) |
| `profileMode` | `combined` / `dailyAverage` | Profile view only: `dailyAverage` divides by the number of days (use for counts) |

## Formulas
- Arithmetic: `+ - * /`, brackets, numbers.
- Functions: `sum(x)`, `avg(x)`, `min(x)`, `max(x)`, `count()`, `countif(condition)`.
- Fields must be inside a function: `avg(sum_in_queue)` ✔, `sum_in_queue` ✘. Functions can't be nested.
- `countif` conditions: comparisons `= != < <= > >=`, joined with `and` / `or` (`and` first).
  Text values in quotes: `countif(abandoned_final = 'Y' and sum_in_queue > 60)`.

## Filters
`{ "field": ..., "op": ..., "value": ... }`, all must match.
- Ops: `=`, `!=`, `>`, `>=`, `<`, `<=` (single value); `in`, `not in` (list of values).
- Text fields only allow `=`, `!=`, `in`, `not in`.

## Fields (journeys table)
Numbers: `leg_count`, `transfer_count`, `sum_pre_queue`, `sum_in_queue`, `sum_agent_time`, `sum_post_queue`,
`sum_post_queue_excl_transfer`, `sum_acw`, `sum_hold`, `sum_abandon_time`, `sum_routing_time`, `sum_total`, `first_sla`.
Text: `abandoned_final`, `abandoned_any`, `first_skill_name`, `last_skill_name`, `last_agent_name`, `final_disp_name`.
All `sum_*` times are seconds summed over every leg of the journey. Source of truth: `server/src/metrics/fields.js`.

## Adding a new field
1. Add the column to `journeys` (new migration) and compute it in `server/src/import/stitch.js`.
2. Add it to `server/src/metrics/fields.js`.
3. Re-import data so existing journeys get the value.
