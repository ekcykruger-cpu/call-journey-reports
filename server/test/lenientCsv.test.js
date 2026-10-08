import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsvLenient } from '../src/import/lenientCsv.js';
import { parseReportCsv } from '../src/import/parseReport.js';

describe('parseCsvLenient', () => {
  it.each([
    ['plain', 'a,b\n1,2\n', [['a', 'b'], ['1', '2']]],
    ['quoted comma', '1,"Smith, John",3', [['1', 'Smith, John', '3']]],
    ['escaped quotes', '1,"said ""hi""",3', [['1', 'said "hi"', '3']]],
    ['unescaped quotes inside a quoted field', '1,"said "cancel" now",3', [['1', 'said "cancel" now', '3']]],
    ['quote inside an unquoted field', '1,a "b" c,3', [['1', 'a "b" c', '3']]],
    ['CRLF line endings and BOM', '﻿a,b\r\n1,2\r\n', [['a', 'b'], ['1', '2']]],
    ['never-closed quote stops at the line end', '1,"open,2\n3,4\n', [['1', 'open,2'], ['3', '4']]],
  ])('%s', (_, text, expected) => {
    expect(parseCsvLenient(text)).toEqual(expected);
  });
});

describe('parseReportCsv with CXone-style unescaped quotes', () => {
  const sample = readFileSync(new URL('./fixtures/report540-anon.csv', import.meta.url), 'utf8');
  // Put an unescaped-quote comment into one row's Disp_Comments column (2nd last column).
  const broken = sample.replace(
    'AC04:Other Council-related:No Action,,',
    'AC04:Other Council-related:No Action,"Customer said "cancel" now",',
  );

  it('falls back to tolerant mode, keeps every row and says so', () => {
    const result = parseReportCsv(broken);
    expect(result.legs).toHaveLength(9);
    expect(result.skipped).toBe(0);
    expect(result.errors[0]).toMatch(/tolerant mode/);
    expect(result.legs.find((l) => l.contact_id === '709320089270').disp_comments).toBe('Customer said "cancel" now');
  });
});
