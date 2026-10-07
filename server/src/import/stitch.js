// Groups legs into call journeys and computes the per-journey totals that metrics use.
// Pure logic (no database) so it can be unit-tested; see docs/data-dictionary.md for the rules:
//   - Master_Contact_ID points to the PARENT leg; the first leg points to itself.
//   - A leg whose parent we don't have is treated as the start of its own journey (re-linked when the parent arrives).

// Ids are numeric strings: compare by length first, then text, to get numeric order.
const compareIds = (a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
const byStart = (a, b) =>
  a.start_utc < b.start_utc ? -1 : a.start_utc > b.start_utc ? 1 : compareIds(a.contact_id, b.contact_id);

// Mutates each leg (journey_id, leg_seq, has_next_leg) and returns the journey rows.
export function stitchJourneys(legs) {
  const byId = new Map(legs.map((l) => [l.contact_id, l]));

  const parentIds = new Set();
  for (const leg of legs) {
    if (leg.master_contact_id !== leg.contact_id && byId.has(leg.master_contact_id)) parentIds.add(leg.master_contact_id);
  }

  // Follow parent links up to the first leg (guarding against loops in bad data).
  const rootCache = new Map();
  function rootOf(leg) {
    const path = [];
    const visited = new Set();
    let current = leg;
    while (true) {
      if (rootCache.has(current.contact_id)) break;
      path.push(current);
      visited.add(current.contact_id);
      const parent = byId.get(current.master_contact_id);
      if (!parent || parent === current || visited.has(parent.contact_id)) break;
      current = parent;
    }
    const root = rootCache.get(current.contact_id) ?? current.contact_id;
    for (const p of path) rootCache.set(p.contact_id, root);
    return root;
  }

  const groups = new Map();
  for (const leg of legs) {
    const root = rootOf(leg);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(leg);
  }

  const journeys = [];
  for (const [journeyId, group] of groups) {
    group.sort(byStart);
    group.forEach((leg, i) => {
      leg.journey_id = journeyId;
      leg.leg_seq = i + 1;
      leg.has_next_leg = parentIds.has(leg.contact_id) ? 1 : 0;
    });
    journeys.push(summarise(journeyId, byId.get(journeyId), group));
  }
  return journeys;
}

function summarise(journeyId, first, group) {
  const last = group[group.length - 1];
  const sum = (field, filter = () => true) => group.filter(filter).reduce((total, leg) => total + (leg[field] || 0), 0);
  return {
    journey_id: journeyId,
    start_local: first.start_local, // a journey belongs to the interval of its first leg
    start_utc: first.start_utc,
    leg_count: group.length,
    transfer_count: group.length - 1,
    sum_pre_queue: sum('pre_queue'),
    sum_in_queue: sum('in_queue'),
    sum_agent_time: sum('agent_time'),
    sum_post_queue: sum('post_queue'),
    sum_post_queue_excl_transfer: sum('post_queue', (leg) => !leg.has_next_leg),
    sum_acw: sum('acw_time'),
    sum_hold: sum('hold_time'),
    sum_abandon_time: sum('abandon_time'),
    sum_routing_time: sum('routing_time'),
    sum_total: sum('total_time'),
    abandoned_final: last.abandon === 'Y' ? 'Y' : 'N',
    abandoned_any: group.some((leg) => leg.abandon === 'Y') ? 'Y' : 'N',
    first_skill_no: first.skill_no,
    first_skill_name: first.skill_name,
    last_skill_name: last.skill_name,
    last_agent_name: last.agent_name,
    final_disp_name: last.disp_name,
    first_sla: first.sla,
  };
}
