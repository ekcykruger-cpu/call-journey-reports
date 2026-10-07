import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseReportCsv } from '../src/import/parseReport.js';
import { stitchJourneys } from '../src/import/stitch.js';

const sample = readFileSync(new URL('./fixtures/report540-anon.csv', import.meta.url), 'utf8');
const freshLegs = () => parseReportCsv(sample).legs;

describe('stitchJourneys on the sample', () => {
  const legs = freshLegs();
  const journeys = stitchJourneys(legs);
  const byId = Object.fromEntries(journeys.map((j) => [j.journey_id, j]));

  it('finds exactly 2 journeys', () => {
    expect(journeys).toHaveLength(2);
  });

  it('journey 1: 4 legs, answered, totals summed', () => {
    expect(byId['709320086206']).toMatchObject({
      start_local: '2026-06-16 11:32:54',
      start_utc: '2026-06-16 01:32:54',
      leg_count: 4,
      transfer_count: 3,
      sum_pre_queue: 40,
      sum_in_queue: 73,
      sum_agent_time: 96,
      sum_post_queue: 208,
      sum_post_queue_excl_transfer: 0,
      sum_acw: 19,
      sum_hold: 12,
      sum_abandon_time: 0,
      sum_routing_time: 6,
      sum_total: 436,
      abandoned_final: 'N',
      abandoned_any: 'N',
      final_disp_name: 'AC01:General: Non-council Enquiry',
      first_sla: '0',
    });
  });

  it('journey 2: 5 legs, ends abandoned', () => {
    expect(byId['709320149547']).toMatchObject({
      leg_count: 5,
      sum_pre_queue: 37,
      sum_in_queue: 96,
      sum_agent_time: 55,
      sum_post_queue: 227,
      sum_acw: 54,
      sum_hold: 11,
      sum_abandon_time: 15,
      sum_routing_time: 32,
      sum_total: 469,
      abandoned_final: 'Y',
      abandoned_any: 'Y',
      final_disp_name: 'N/A',
      last_agent_name: 'N/A',
      first_sla: '1',
    });
  });

  it('numbers legs and flags transferred legs', () => {
    const chain = legs.filter((l) => l.journey_id === '709320086206').sort((a, b) => a.leg_seq - b.leg_seq);
    expect(chain.map((l) => l.contact_id)).toEqual(['709320086206', '709320089270', '709320091624', '709320094279']);
    expect(chain.map((l) => l.has_next_leg)).toEqual([1, 1, 1, 0]);
  });
});

describe('stitchJourneys edge cases', () => {
  it('a leg whose parent is missing starts its own journey, and re-links once the parent is present', () => {
    const all = freshLegs();
    const withoutFirst = all.filter((l) => l.contact_id !== '709320086206');
    const partial = stitchJourneys(withoutFirst);
    expect(partial.map((j) => j.journey_id).sort()).toEqual(['709320089270', '709320149547']);

    const full = stitchJourneys(freshLegs());
    expect(full.map((j) => j.journey_id).sort()).toEqual(['709320086206', '709320149547']);
  });

  it('does not loop forever on circular parent links', () => {
    const [a, b] = freshLegs();
    a.master_contact_id = b.contact_id;
    b.master_contact_id = a.contact_id;
    const journeys = stitchJourneys([a, b]);
    expect(journeys).toHaveLength(1);
    expect(journeys[0].leg_count).toBe(2);
  });
});
