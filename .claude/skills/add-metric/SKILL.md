---
name: add-metric
description: Define, validate and test a new chart metric (e.g. average InQueue per interval, abandon rate) as a JSON metric definition. Use when the user wants a new graph or calculation from the call-journey data.
---

# Add a metric

Metrics are JSON definitions stored in the `metrics` MySQL table and compiled to parameterised SQL over the
**journeys** table. No code change is needed for a new metric — only for a new *field* or *function*.

## Steps
1. Restate the metric in words: numerator, denominator, filters, unit (seconds / count / percent), chart type.
2. Confirm every field used is in the whitelist (see `docs/metric-dsl.md`, source: `server/src/metrics/fields.js`).
   If a needed field is missing, propose adding it to the journeys table + whitelist and ask before doing it.
3. Write the definition, e.g.
   ```json
   {
     "name": "Avg PreQ+InQ for abandoned journeys",
     "chartType": "line",
     "filters": [{ "field": "abandoned_final", "op": "=", "value": "Y" }],
     "numerator": "sum(sum_pre_queue + sum_in_queue)",
     "denominator": "count()",
     "format": "seconds"
   }
   ```
4. Validate it with the metric validator (unit test or the Metric Builder "Validate" button).
5. Hand-calculate the expected value for the sample data and add a vitest case comparing it to the engine output.
6. Remind the user they can paste the JSON into the Metric Builder page — no redeploy needed.

## Rules
- Metrics are always **per journey**, bucketed by the journey's first-leg `start_local` (Australia/Sydney).
- Division by zero yields `null` (gap in chart), never 0.
- Never put raw SQL in a definition.
