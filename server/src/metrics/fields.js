// The only journey fields a metric may use (whitelist). Adding a field here (and to the journeys
// table + stitch.js) makes it available in the Metric Builder - see docs/metric-dsl.md.

export const NUMERIC_FIELDS = {
  leg_count: 'Number of legs',
  transfer_count: 'Number of transfers',
  sum_pre_queue: 'PreQueue time (s)',
  sum_in_queue: 'InQueue time (s)',
  sum_agent_time: 'Agent time (s)',
  sum_post_queue: 'PostQueue time (s)',
  sum_post_queue_excl_transfer: 'PostQueue time, excluding transferred legs (s)',
  sum_acw: 'After-call work time (s)',
  sum_hold: 'Hold time (s)',
  sum_abandon_time: 'Abandon time (s)',
  sum_routing_time: 'Routing time (s)',
  sum_total: 'Total time (s)',
  first_sla: 'SLA met on first leg (1 = yes, 0 = no)',
};

export const TEXT_FIELDS = {
  abandoned_final: 'Abandoned on last leg (Y/N)',
  abandoned_any: 'Abandoned on any leg (Y/N)',
  first_skill_name: 'First (entry) skill',
  last_skill_name: 'Last skill',
  last_agent_name: 'Last agent',
  final_disp_name: 'Final disposition',
};

export function fieldType(name) {
  if (Object.hasOwn(NUMERIC_FIELDS, name)) return 'number';
  if (Object.hasOwn(TEXT_FIELDS, name)) return 'text';
  return null;
}

export function listFields() {
  return [
    ...Object.entries(NUMERIC_FIELDS).map(([name, label]) => ({ name, label, type: 'number' })),
    ...Object.entries(TEXT_FIELDS).map(([name, label]) => ({ name, label, type: 'text' })),
  ];
}
