import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseReportCsv, toTimestamps } from '../src/import/parseReport.js';

const sample = readFileSync(new URL('./fixtures/report540-anon.csv', import.meta.url), 'utf8');

describe('parseReportCsv', () => {
  const result = parseReportCsv(sample);

  it('reads all 9 legs and skips the blank separator row', () => {
    expect(result.rowsRead).toBe(9);
    expect(result.legs).toHaveLength(9);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('maps columns and types', () => {
    const leg = result.legs[0];
    expect(leg).toMatchObject({
      contact_id: '709320086206',
      master_contact_id: '709320086206',
      skill_name: 'Test_Voice',
      pre_queue: 40,
      in_queue: 6,
      post_queue: 124,
      total_time: 202,
      abandon: 'N',
      disp_name: 'AC01:General: Non-council Enquiry',
      start_local: '2026-06-16 11:32:54',
      start_utc: '2026-06-16 01:32:54', // June = AEST, UTC+10
    });
  });

  it('Total_Time_Plus_Disposition = PreQ + InQ + Agent + PostQ + ACW on every row', () => {
    for (const l of result.legs) {
      expect(l.pre_queue + l.in_queue + l.agent_time + l.post_queue + l.acw_time).toBe(l.total_time);
    }
  });

  it('rejects a file without the required columns', () => {
    expect(() => parseReportCsv('a,b\n1,2')).toThrow(/Missing required column/);
  });

  it('reports bad rows without failing the whole file', () => {
    const bad = sample.replace('06/16/2026,11:34:05', '06/16/2026,not-a-time');
    const r = parseReportCsv(bad);
    expect(r.legs).toHaveLength(8);
    expect(r.skipped).toBe(1);
    expect(r.errors[0]).toMatch(/Row 3/);
  });
});

describe('toTimestamps (Australia/Sydney)', () => {
  it('handles daylight saving (December = AEDT, UTC+11)', () => {
    expect(toTimestamps('12/01/2026', '10:00:00')).toEqual({ start_local: '2026-12-01 10:00:00', start_utc: '2026-11-30 23:00:00' });
  });
  it('accepts AM/PM times', () => {
    expect(toTimestamps('06/16/2026', '1:05:09 PM').start_local).toBe('2026-06-16 13:05:09');
    expect(toTimestamps('06/16/2026', '12:00:00 AM').start_local).toBe('2026-06-16 00:00:00');
  });
  it('accepts Excel day-fractions and ISO dates', () => {
    expect(toTimestamps('2026-06-16', '0.48118055555555556').start_local).toBe('2026-06-16 11:32:54');
  });
});
