import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { compileExpression } from '../src/metrics/expression.js';
import { compileDefinition } from '../src/metrics/definition.js';
import { buildAxis, parseSeriesOptions } from '../src/metrics/engine.js';

describe('compileExpression', () => {
  it('compiles aggregates and arithmetic to parameterised SQL', () => {
    expect(compileExpression('sum(sum_pre_queue + sum_in_queue)')).toEqual({ sql: 'SUM((`sum_pre_queue` + `sum_in_queue`))', params: [] });
    expect(compileExpression('count()')).toEqual({ sql: 'COUNT(*)', params: [] });
    expect(compileExpression('100 * avg(sum_in_queue) / 60')).toEqual({
      sql: '((? * AVG(`sum_in_queue`)) / NULLIF(?, 0))',
      params: [100, 60],
    });
  });

  it('compiles countif conditions, with text as parameters', () => {
    expect(compileExpression("countif(abandoned_final = 'Y' and sum_in_queue > 30)")).toEqual({
      sql: 'SUM(CASE WHEN ((`abandoned_final` = ?) AND (`sum_in_queue` > ?)) THEN 1 ELSE 0 END)',
      params: ['Y', 30],
    });
    expect(compileExpression("countif(final_disp_name != 'N/A' or first_sla = 1)").sql).toContain('<>');
  });

  it('respects operator precedence', () => {
    expect(compileExpression('sum(sum_acw) + sum(sum_hold) * 2').sql).toBe('(SUM(`sum_acw`) + (SUM(`sum_hold`) * ?))');
  });

  it.each([
    ['sum_in_queue', /must be inside sum/],
    ['sum(bogus_field)', /Unknown field "bogus_field"/],
    ['sum(sum(sum_acw))', /can't be used inside another function/],
    ['median(sum_acw)', /Unknown function "median\(\)"/],
    ['sum(sum_acw', /Expected "\)"/],
    ['sum(sum_acw))', /Unexpected "\)"/],
    ["sum(first_skill_name)", /is a text field/],
    ["countif(first_skill_name > 'A')", /only be compared with = or !=/],
    ["countif(sum_in_queue = 'Y')", /Comparing text with a number/],
    ['sum(sum_acw); DROP TABLE users', /Unexpected character ";"/],
    ['', /empty/],
  ])('rejects %j', (formula, message) => {
    expect(() => compileExpression(formula)).toThrow(message);
  });
});

describe('compileDefinition', () => {
  const base = { name: 'Test', numerator: 'count()' };

  it('applies defaults', () => {
    const { definition } = compileDefinition(base);
    expect(definition).toMatchObject({ chartType: 'line', xAxis: 'timeline', format: 'number', emptyAs: 'gap', filters: [] });
  });

  it('builds the abandon-rate value as a guarded percentage', () => {
    const { valueSql, valueParams } = compileDefinition({ ...base, numerator: "countif(abandoned_final = 'Y')", denominator: 'count()', format: 'percent' });
    expect(valueSql).toBe("((SUM(CASE WHEN (`abandoned_final` = ?) THEN 1 ELSE 0 END)) / NULLIF(COUNT(*), 0)) * 100");
    expect(valueParams).toEqual(['Y']);
  });

  it('compiles filters with parameters', () => {
    const { whereSql, whereParams } = compileDefinition({
      ...base,
      filters: [
        { field: 'abandoned_final', op: '=', value: 'Y' },
        { field: 'first_skill_name', op: 'in', value: ['A', 'B'] },
        { field: 'leg_count', op: '>', value: '1' },
      ],
    });
    expect(whereSql).toEqual(['`abandoned_final` = ?', '`first_skill_name` IN (?)', '`leg_count` > ?']);
    expect(whereParams).toEqual(['Y', ['A', 'B'], 1]);
  });

  it.each([
    [{ filters: [{ field: 'nope', op: '=', value: 'x' }] }, /unknown field/],
    [{ filters: [{ field: 'leg_count', op: '=', value: 'abc' }] }, /number field/],
    [{ filters: [{ field: 'first_skill_name', op: '>', value: 'a' }] }, /text fields can only use/],
    [{ filters: [{ field: 'first_skill_name', op: 'in', value: 'a' }] }, /needs a list/],
    [{ denominator: 'sum(' }, /^Denominator:/],
    [{ name: '' }, /name/],
  ])('rejects %j', (change, message) => {
    expect(() => compileDefinition({ ...base, ...change })).toThrow(message);
  });
});

describe('parseSeriesOptions', () => {
  it('validates interval, dates and range length', () => {
    expect(() => parseSeriesOptions({ from: '2026-10-07', to: '2026-10-07', interval: 20 })).toThrow(/15, 30 or 60/);
    expect(() => parseSeriesOptions({ from: '2026-10-08', to: '2026-10-07', interval: 15 })).toThrow(/on or after/);
    expect(() => parseSeriesOptions({ from: '2026-01-01', to: '2026-12-31', interval: 15 })).toThrow(/at most 93 days/);
    expect(parseSeriesOptions({ from: '2026-10-07', to: '2026-10-08', interval: '30', skills: 'A, B' })).toMatchObject({ days: 2, interval: 30, skills: ['A', 'B'] });
  });
});

describe('buildAxis', () => {
  const start = DateTime.fromISO('2026-06-16');
  const fmt = { emptyAs: 'gap', profileMode: 'combined', decimals: 1 };

  it('timeline: one point per interval, gaps for empty intervals', () => {
    // Sample data: journey A starts 11:32:54 (slot 46 at 15 min), journey B 11:56:56 (slot 47).
    const rows = [
      { bucket_day: '2026-06-16', slot: '46', value: '73.0000' },
      { bucket_day: '2026-06-16', slot: 47, value: '96.0000' },
    ];
    const { labels, values } = buildAxis(rows, { start, days: 1, interval: 15, xAxis: 'timeline' }, fmt);
    expect(labels).toHaveLength(96);
    expect(labels[46]).toBe('2026-06-16 11:30');
    expect(values[46]).toBe(73);
    expect(values[47]).toBe(96);
    expect(values[45]).toBeNull();
  });

  it('profile: 24-hour shape, optional daily average and zero-fill', () => {
    const rows = [{ slot: 11, value: '4' }];
    const { labels, values } = buildAxis(rows, { start, days: 2, interval: 60, xAxis: 'profile' }, { emptyAs: 'zero', profileMode: 'dailyAverage', decimals: 1 });
    expect(labels).toHaveLength(24);
    expect(labels[11]).toBe('11:00');
    expect(values[11]).toBe(2);
    expect(values[0]).toBe(0);
  });
});
