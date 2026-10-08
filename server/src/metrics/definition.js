import { z } from 'zod';
import { compileExpression, MetricError } from './expression.js';
import { fieldType } from './fields.js';

// A metric definition = the JSON saved by the Metric Builder. See docs/metric-dsl.md.

const filterSchema = z.object({
  field: z.string(),
  op: z.enum(['=', '!=', '>', '>=', '<', '<=', 'in', 'not in']),
  value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()])).min(1).max(200)]),
});

export const definitionSchema = z.object({
  name: z.string().trim().min(1, 'Give the metric a name.').max(150),
  description: z.string().trim().max(1000).optional().default(''),
  chartType: z.enum(['bar', 'line']).default('line'),
  xAxis: z.enum(['timeline', 'profile']).default('timeline'),
  filters: z.array(filterSchema).max(20).default([]),
  numerator: z.string().trim().min(1, 'Enter a formula.'),
  denominator: z.string().trim().optional().default(''),
  format: z.enum(['number', 'seconds', 'percent']).default('number'),
  decimals: z.number().int().min(0).max(4).default(1),
  emptyAs: z.enum(['gap', 'zero']).default('gap'),
  profileMode: z.enum(['combined', 'dailyAverage']).default('combined'),
});

function compileFilter(filter, index) {
  const label = `Filter ${index + 1}`;
  const type = fieldType(filter.field);
  if (!type) throw new MetricError(`${label}: unknown field "${filter.field}".`);
  const isList = filter.op === 'in' || filter.op === 'not in';
  const values = Array.isArray(filter.value) ? filter.value : [filter.value];
  if (isList !== Array.isArray(filter.value)) {
    throw new MetricError(`${label}: "${filter.op}" needs ${isList ? 'a list of values' : 'a single value'}.`);
  }
  if (type === 'number' && values.some((v) => typeof v !== 'number' && !/^-?\d+(\.\d+)?$/.test(String(v)))) {
    throw new MetricError(`${label}: "${filter.field}" is a number field - use numbers.`);
  }
  if (type === 'text' && !['=', '!=', 'in', 'not in'].includes(filter.op)) {
    throw new MetricError(`${label}: text fields can only use =, !=, in or not in.`);
  }
  const cast = (v) => (type === 'number' ? Number(v) : String(v));
  const column = `\`${filter.field}\``;
  if (isList) return { sql: `${column} ${filter.op === 'in' ? 'IN' : 'NOT IN'} (?)`, params: [values.map(cast)] };
  return { sql: `${column} ${filter.op === '!=' ? '<>' : filter.op} ?`, params: [cast(filter.value)] };
}

// Validates the definition and compiles it. Returns { definition, valueSql, valueParams, whereSql[], whereParams[] }.
export function compileDefinition(input) {
  const parsed = definitionSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new MetricError(`${issue.path.join('.') || 'definition'}: ${issue.message}`);
  }
  const definition = parsed.data;

  let numerator;
  try {
    numerator = compileExpression(definition.numerator);
  } catch (err) {
    throw new MetricError(`Numerator: ${err.message}`);
  }
  let valueSql = numerator.sql;
  const valueParams = [...numerator.params];

  if (definition.denominator) {
    let denominator;
    try {
      denominator = compileExpression(definition.denominator);
    } catch (err) {
      throw new MetricError(`Denominator: ${err.message}`);
    }
    valueSql = `(${valueSql}) / NULLIF(${denominator.sql}, 0)`;
    valueParams.push(...denominator.params);
  }
  if (definition.format === 'percent') valueSql = `(${valueSql}) * 100`;

  const whereSql = [];
  const whereParams = [];
  definition.filters.forEach((filter, i) => {
    const compiled = compileFilter(filter, i);
    whereSql.push(compiled.sql);
    whereParams.push(...compiled.params);
  });

  return { definition, valueSql, valueParams, whereSql, whereParams };
}
