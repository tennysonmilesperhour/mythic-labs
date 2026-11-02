// Unit checks for the client-safe libraries. Transpiles the TypeScript sources
// in place, so there is nothing to build first:  node scripts/unit.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function load(rel, deps = {}) {
  let source = await readFile(new URL(rel, import.meta.url), 'utf8');
  // Rewrite relative imports to the data: URLs of modules loaded earlier.
  for (const [spec, url] of Object.entries(deps)) source = source.replaceAll(`from "${spec}"`, `from "${url}"`);
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  const url = `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
  return { url, mod: await import(url) };
}

const types = await load('../lib/projectTypes.ts');
const { addDays, nextOccurrence, projectHealth, computeStats, computeAttention, weekStart, daysBetween, renderDigestMarkdown, EMPTY_HUB } = types.mod;
const quick = await load('../lib/quick.ts', { './projectTypes': types.url });
const { parseDate, parseQuick, matchProject, fuzzyScore } = quick.mod;
const taskMap = await load('../lib/taskMap.ts', { './projectTypes': types.url });
const ical = await load('../lib/ical.ts', { './projectTypes': types.url, './taskMap': taskMap.url });
const { calendarEvents, renderIcs } = ical.mod;

let n = 0;
const t = (name, fn) => { fn(); n++; };

// ── dates ──
t('addDays crosses months and years', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});
t('weekStart is Monday', () => {
  assert.equal(weekStart('2026-11-01'), '2026-10-26'); // a Sunday
  assert.equal(weekStart('2026-10-26'), '2026-10-26');
});
t('daysBetween is signed', () => assert.equal(daysBetween('2026-11-05', '2026-11-01'), -4));

// ── recurrence ──
t('recurrence advances from the due date', () => {
  assert.equal(nextOccurrence('daily', '2026-11-06'), '2026-11-07');
  assert.equal(nextOccurrence('weekdays', '2026-11-06'), '2026-11-09'); // Friday to Monday
  assert.equal(nextOccurrence('weekly', '2026-11-06'), '2026-11-13');
  assert.equal(nextOccurrence('biweekly', '2026-11-06'), '2026-11-20');
  assert.equal(nextOccurrence('monthly', '2026-01-31'), '2026-02-28'); // clamps to month end
  assert.equal(nextOccurrence('quarterly', '2026-11-30'), '2027-02-28');
  assert.equal(nextOccurrence('yearly', '2028-02-29'), '2029-02-28');
});

// ── natural-language dates (anchored to a Thursday) ──
const from = '2026-11-05';
t('parseDate reads relative words', () => {
  assert.equal(parseDate('today', from), '2026-11-05');
  assert.equal(parseDate('tomorrow', from), '2026-11-06');
  assert.equal(parseDate('tmr', from), '2026-11-06');
  assert.equal(parseDate('next week', from), '2026-11-12');
  assert.equal(parseDate('in 3d', from), '2026-11-08');
  assert.equal(parseDate('2w', from), '2026-11-19');
  assert.equal(parseDate('eom', from), '2026-11-30');
});
t('parseDate reads weekdays as the next such day', () => {
  assert.equal(parseDate('fri', from), '2026-11-06');
  assert.equal(parseDate('thursday', from), '2026-11-12'); // never today
  assert.equal(parseDate('next fri', from), '2026-11-13');
  assert.equal(parseDate('mon', from), '2026-11-09');
});
t('parseDate reads month and day forms', () => {
  assert.equal(parseDate('nov 20', from), '2026-11-20');
  assert.equal(parseDate('20 nov', from), '2026-11-20');
  assert.equal(parseDate('jan 5', from), '2027-01-05'); // already passed this year
  assert.equal(parseDate('11/20', from), '2026-11-20');
  assert.equal(parseDate('2026-11-20', from), '2026-11-20');
});
t('parseDate rejects nonsense', () => {
  assert.equal(parseDate('whenever', from), null);
  assert.equal(parseDate('2026-02-30', from), null);
  assert.equal(parseDate('', from), null);
});

// ── quick capture ──
const projects = [{ id: 'p1', name: 'Mythic Labs' }, { id: 'p2', name: 'Brand Site' }, { id: 'p3', name: 'Lanternfish' }];
t('matchProject prefers exact, then prefix, then substring', () => {
  assert.equal(matchProject('mythic-labs', projects)?.id, 'p1');
  assert.equal(matchProject('bra', projects)?.id, 'p2');
  assert.equal(matchProject('fish', projects)?.id, 'p3');
  assert.equal(matchProject('zzz', projects), null);
});
t('parseQuick pulls every token and leaves a clean title', () => {
  const p = parseQuick('Fix login redirect #mythic-labs @claude-code !high due:fri ~3 +bug every week', projects, from);
  assert.equal(p.title, 'Fix login redirect');
  assert.equal(p.project?.id, 'p1');
  assert.equal(p.agent, 'claude-code');
  assert.equal(p.priority, 'high');
  assert.equal(p.due_date, '2026-11-06');
  assert.equal(p.estimate, 3);
  assert.deepEqual(p.labels, ['bug']);
  assert.equal(p.recurrence, 'weekly');
});
t('parseQuick plans the day from a trailing bare date and keeps dates inside the sentence', () => {
  const a = parseQuick('Write release notes tomorrow', projects, from);
  assert.equal(a.title, 'Write release notes');
  assert.equal(a.planned_for, '2026-11-06');
  const b = parseQuick("Call tomorrow's customer about renewal", projects, from);
  assert.equal(b.planned_for, null);
  assert.equal(b.title, "Call tomorrow's customer about renewal");
  const c = parseQuick('Ship it fri #brand', projects, from);
  assert.equal(c.planned_for, '2026-11-06');
  assert.equal(c.project?.id, 'p2');
});
t('parseQuick handles quoted projects, p-priorities, notes and unknown projects', () => {
  const p = parseQuick('Review copy #"Brand Site" p1 3pt\nSecond line\nThird line', projects, from);
  assert.equal(p.project?.id, 'p2');
  assert.equal(p.priority, 'critical');
  assert.equal(p.estimate, 3);
  assert.equal(p.notes, 'Second line\nThird line');
  const q = parseQuick('Think about pricing #nope', projects, from);
  assert.equal(q.project, null);
  assert.equal(q.unmatchedProject, 'nope');
  assert.equal(q.title, 'Think about pricing');
});
t('fuzzyScore ranks prefix over substring over subsequence', () => {
  assert.ok(fuzzyScore('lan', 'Lanternfish') > fuzzyScore('fish', 'Lanternfish'));
  assert.ok(fuzzyScore('fish', 'Lanternfish') > fuzzyScore('lfh', 'Lanternfish'));
  assert.equal(fuzzyScore('xyz', 'Lanternfish'), 0);
  assert.ok(fuzzyScore('brand site', 'Brand Site copy') > 0);
});

// ── health ──
const base = { id: 'p', name: 'P', status: 'active', priority: 'medium', next_action: 'x', agents: [], agent_instructions: '', last_reviewed_at: new Date().toISOString(), created_at: new Date().toISOString(), target_date: null };
const task = (over) => ({ id: Math.random().toString(36), project_id: 'p', title: 't', status: 'todo', priority: 'medium', depends_on: [], labels: [], estimate: null, planned_for: null, recurrence: null, snoozed_until: null, agent: null, due_date: null, claimed_at: null, done_at: null, sort_order: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), notes: '', acceptance: '', milestone_id: null, parent_id: null, ...over });
const health = (tasks, project = base) => {
  const d = { project, tasks, milestones: [], entries: [] };
  const stats = computeStats(tasks, []);
  return projectHealth(d, stats, computeAttention(d, new Date().toISOString()));
};
t('a moving project with ready work is on track', () => assert.equal(health([task({})]).level, 'on_track'));
t('one blocked task puts a project at risk', () => assert.equal(health([task({ status: 'blocked' }), task({})]).level, 'at_risk'));
t('two overdue tasks take a project off track', () => {
  const late = '2020-01-01';
  assert.equal(health([task({ due_date: late }), task({ due_date: late })]).level, 'off_track');
});
t('paused and planned projects report their state instead of a verdict', () => {
  assert.equal(health([task({})], { ...base, status: 'paused' }).level, 'paused');
  assert.equal(health([task({})], { ...base, status: 'planned' }).level, 'idle');
});
t('snoozed tasks do not raise attention', () => {
  const d = { project: base, tasks: [task({ due_date: '2020-01-01', snoozed_until: '2999-01-01' })], milestones: [], entries: [] };
  assert.equal(computeAttention(d, new Date().toISOString()).filter((a) => a.task_id).length, 0);
});
t('points default for unestimated tasks', () => {
  const s = computeStats([task({ estimate: 5, status: 'done' }), task({})], []);
  assert.deepEqual(s.points, { done: 5, total: 7 });
});

// ── digest and calendar ──
t('digest renders every section with an empty hub', () => {
  const md = renderDigestMarkdown(EMPTY_HUB, '2026-11-05');
  assert.ok(md.startsWith('# Brief for Nov 5, 2026'));
  assert.ok(md.includes('## Today (0)'));
});
t('calendar feed holds tasks, milestones and project targets as all-day events', () => {
  const detail = {
    project: { ...base, id: 'p', name: 'P', target_date: '2026-12-01', summary: 'S', status: 'active' },
    tasks: [task({ id: 't1', title: 'Due thing', due_date: '2026-11-20', agent: 'me' }), task({ id: 't2', title: 'Done thing', due_date: '2026-11-21', status: 'done' })],
    milestones: [{ id: 'm1', title: 'Beta', target_date: '2026-11-25', done: false, description: '' }],
    entries: [],
  };
  const events = calendarEvents([detail], 'https://x.test');
  assert.deepEqual(events.map((e) => e.uid), ['task-t1', 'milestone-m1', 'project-p']);
  const ics = renderIcs(events, 'Test', new Date('2026-11-05T00:00:00Z'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261120'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20261121'));
  assert.ok(ics.includes('SUMMARY:Due thing (P)'));
  assert.equal(calendarEvents([detail], 'https://x.test', { mine: true }).length, 1);
});


// ── insights ──
const insights = await load('../lib/insights.ts', { './projectTypes': types.url });
const { throughputByWeek, cycleTimes, median, percentile, velocity, forecastMilestones, byAgent, byProject, aging, estimateCoverage } = insights.mod;
const dayI = '2026-11-05'; // a Thursday; the current week starts 2026-11-02
const iso = (d, h = 12) => `${d}T${String(h).padStart(2, '0')}:00:00.000Z`;
const doneTask = (over) => task({ status: 'done', ...over });
const proj = (over, tasks, milestones = []) => ({ project: { ...base, id: over.id ?? 'p', name: over.name ?? 'P', status: over.status ?? 'active' }, tasks, milestones, entries: [] });
const details = [
  proj({ id: 'a', name: 'Alpha' }, [
    doneTask({ id: 'a1', estimate: 3, done_at: iso('2026-11-03'), claimed_at: iso('2026-11-01') }), // this week, 2 days
    doneTask({ id: 'a2', estimate: 5, done_at: iso('2026-10-28'), claimed_at: iso('2026-10-20') }), // last week, 8 days
    doneTask({ id: 'a3', estimate: 2, done_at: iso('2026-10-14'), claimed_at: iso('2026-10-13') }), // 3 weeks back, 1 day
    task({ id: 'a4', estimate: 8, milestone_id: 'm1' }),
    task({ id: 'a5', estimate: 5, milestone_id: 'm1', status: 'doing', claimed_at: iso('2026-10-30'), agent: 'claude-code' }),
  ], [{ id: 'm1', project_id: 'a', title: 'Beta', target_date: '2026-11-20', done: false, sort_order: 0, description: '', start_date: null, done_at: null, created_at: iso('2026-10-01') }]),
  proj({ id: 'b', name: 'Bravo' }, [
    task({ id: 'b1', estimate: 3, milestone_id: 'm2' }),
  ], [{ id: 'm2', project_id: 'b', title: 'Launch', target_date: '2026-12-01', done: false, sort_order: 0, description: '', start_date: null, done_at: null, created_at: iso('2026-10-01') }]),
  proj({ id: 'c', name: 'Charlie', status: 'paused' }, [task({ id: 'c1', status: 'doing', claimed_at: iso('2026-09-01') })]),
];
t('throughput buckets by ISO week and marks the current one', () => {
  const w = throughputByWeek(details, 4, dayI);
  assert.deepEqual(w.map((b) => b.week), ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']);
  assert.deepEqual(w.map((b) => b.points), [2, 0, 5, 3]);
  assert.equal(w[3].current, true);
});
t('cycle times run from claim to done', () => {
  const c = cycleTimes(details, 90, dayI);
  assert.deepEqual(c.map((x) => x.days), [1, 2, 8]);
  assert.equal(median(c.map((x) => x.days)), 2);
  assert.equal(percentile([1, 2, 8], 85), 8);
  assert.equal(median([]), null);
});
t('velocity excludes the partial current week', () => {
  // Last 4 full weeks before 2026-11-02: 5 (Oct 28) + 2 (Oct 14) = 7 points over 4 weeks.
  assert.equal(velocity(details[0].tasks, 4, dayI), 1.75);
});
t('forecast uses the project rate, falls back to the portfolio rate, and flags slips', () => {
  const f = forecastMilestones(details, dayI, 4);
  const beta = f.find((x) => x.milestone.title === 'Beta');
  assert.equal(beta.remaining_points, 13);
  assert.equal(beta.rate_source, 'project');
  assert.equal(beta.rate, 1.8); // 1.75 rounded to one decimal
  assert.equal(beta.weeks_left, 7.4);
  assert.equal(beta.status, 'late');
  assert.ok(beta.slip_days > 0);
  const launch = f.find((x) => x.milestone.title === 'Launch');
  assert.equal(launch.rate_source, 'portfolio');
  assert.equal(launch.status, 'on_time');
  assert.ok(!f.some((x) => x.project_name === 'Charlie'), 'paused projects are not forecast');
});
t('per-agent and per-project rollups count the window and the current load', () => {
  const agents = byAgent(details, 30, dayI);
  const cc = agents.find((a) => a.agent === 'claude-code');
  assert.equal(cc.doing_now, 1);
  const un = agents.find((a) => a.agent === 'unassigned');
  assert.equal(un.done, 3); // a1, a2 and a3 (22 days back) all fall inside the 30-day window
  const projects = byProject(details, 30, dayI);
  assert.equal(projects[0].project_name, 'Alpha');
  assert.equal(projects[0].open_points, 13);
  assert.ok(!projects.some((p) => p.project_name === 'Charlie'));
});
t('aging lists claimed open work oldest first and skips paused projects', () => {
  const rows = aging(details, new Date(iso('2026-11-05')).getTime());
  assert.deepEqual(rows.map((r) => r.id), ['a5']);
  assert.equal(rows[0].days, 6);
});
t('estimate coverage reports what the forecast assumes', () => {
  assert.deepEqual(estimateCoverage(details), { open: 3, estimated: 3, assumed_points: 0 });
});


// ── fixes from the review ──
const { isReady, isSnoozed } = types.mod;
const { fold } = ical.mod;
t('a snoozed task is not ready, so agents leave it alone until its day', () => {
  const a = task({ id: 'r1', snoozed_until: '2999-01-01' });
  assert.equal(isSnoozed(a), true);
  assert.equal(isReady(a, [a]), false);
  assert.equal(isReady(task({ id: 'r2', snoozed_until: '2000-01-01' }), []), true);
});
t('a project whose open work is all deferred is not flagged stuck', () => {
  const d = { project: base, tasks: [task({ snoozed_until: '2999-01-01' })], milestones: [], entries: [] };
  const kinds = computeAttention(d, new Date().toISOString()).map((a) => a.key.split(':')[1]);
  assert.ok(!kinds.includes('stuck') && !kinds.includes('empty'), kinds.join(','));
});
t('calendar folding counts octets and never splits a character', () => {
  const line = 'SUMMARY:' + 'é'.repeat(60); // 2 bytes each: 128 octets
  const folded = fold(line);
  const parts = folded.split('\r\n');
  assert.ok(parts.length >= 2);
  for (const part of parts) assert.ok(Buffer.byteLength(part, 'utf8') <= 75, `${Buffer.byteLength(part, 'utf8')} octets`);
  assert.equal(parts.slice(1).every((x) => x.startsWith(' ')), true);
  assert.equal(parts.map((x, i) => (i ? x.slice(1) : x)).join(''), line);
  const emoji = 'SUMMARY:' + '🙂'.repeat(30);
  assert.equal(fold(emoji).split('\r\n').map((x, i) => (i ? x.slice(1) : x)).join(''), emoji);
  assert.equal(fold('short'), 'short');
});
t('the personal calendar feed uses the same "mine" rule as Today and My tasks', () => {
  const detail = {
    project: { ...base, id: 'p', name: 'P', status: 'active', target_date: null, summary: '' },
    tasks: [
      task({ id: 'o1', title: 'Owner step by note', due_date: '2026-11-20', agent: null, notes: 'Owner step: paste the key' }),
      task({ id: 'a1', title: 'Agent work', due_date: '2026-11-21', agent: 'claude-code' }),
    ],
    milestones: [],
    entries: [],
  };
  assert.deepEqual(calendarEvents([detail], 'https://x.test', { mine: true }).map((e) => e.uid), ['task-o1']);
});

// ── fixes from the second review ──
const { nextOccurrenceAfter, endOfMonth } = types.mod;
const { esc } = ical.mod;
const templates = await load('../lib/templates.ts', { './projectTypes': types.url });
const { PLAN_TEMPLATES } = templates.mod;
t('month-based recurrence keeps month ends and catches up after a late finish', () => {
  assert.equal(endOfMonth('2026-02-10'), '2026-02-28');
  assert.equal(nextOccurrence('monthly', '2026-02-28'), '2026-03-28'); // without an anchor, the day of the date
  assert.equal(nextOccurrence('monthly', '2026-02-28', 31), '2026-03-31'); // the anchor the server keeps on the chore
  assert.equal(nextOccurrence('monthly', '2026-02-28', 30), '2026-03-30');
  assert.equal(nextOccurrence('yearly', '2026-02-28'), '2027-02-28');
  assert.equal(nextOccurrenceAfter('monthly', '2026-01-31', '2026-03-15'), '2026-03-31'); // within one call the anchor is the start day
  assert.equal(nextOccurrenceAfter('monthly', '2026-02-28', '2026-03-01', 30), '2026-03-30');
  // Across spawns the server passes the stored anchor, so a "30th" chore never turns into a month-end chore.
  const chain = [];
  let due = '2026-01-30';
  for (let i = 0; i < 4; i++) chain.push((due = nextOccurrence('monthly', due, 30)));
  assert.deepEqual(chain, ['2026-02-28', '2026-03-30', '2026-04-30', '2026-05-30']);
  assert.equal(nextOccurrenceAfter('weekly', '2026-10-01', '2026-11-01'), '2026-11-05'); // a month late: skip the missed weeks
  assert.equal(nextOccurrenceAfter('daily', '2026-11-01', '2026-11-01'), '2026-11-02');
  assert.equal(nextOccurrenceAfter('weekly', '', '2026-11-01'), '2026-11-08'); // no due date: count from today
  assert.equal(nextOccurrenceAfter('weekly', '2026-11-20', '2026-11-01'), '2026-11-27'); // finished early: one period on
});
t('parseDate reads only real weekday spellings', () => {
  assert.equal(parseDate('friend', from), null);
  assert.equal(parseDate('monitor', from), null);
  assert.equal(parseDate('sunk', from), null);
  assert.equal(parseDate('thurs', from), '2026-11-12');
  assert.equal(parseDate('tues', from), '2026-11-10');
  assert.equal(parseDate('next monday', from), '2026-11-16');
});
t('parseQuick reads dates of up to three words after due: and plan: and keeps the leftover words', () => {
  const a = parseQuick('Send invoice due:nov 20 #brand', projects, from);
  assert.equal(a.due_date, '2026-11-20');
  assert.equal(a.title, 'Send invoice');
  assert.equal(a.project?.id, 'p2');
  const b = parseQuick('Prep deck plan:next fri for the board', projects, from);
  assert.equal(b.planned_for, '2026-11-13');
  assert.equal(b.title, 'Prep deck for the board');
  const c = parseQuick('Renew cert due:in 3 days +ops', projects, from);
  assert.equal(c.due_date, '2026-11-08');
  assert.deepEqual(c.labels, ['ops']);
  assert.equal(c.title, 'Renew cert');
  const d = parseQuick('Call Bob due:fri 3 times', projects, from);
  assert.equal(d.due_date, '2026-11-06');
  assert.equal(d.title, 'Call Bob 3 times');
  const e = parseQuick('Meet my friend tomorrow', projects, from);
  assert.equal(e.planned_for, '2026-11-06');
  assert.equal(e.title, 'Meet my friend');
  const f = parseQuick('Fix the monitor', projects, from);
  assert.equal(f.planned_for, null);
  assert.equal(f.title, 'Fix the monitor');
  const g = parseQuick('Pay rent due:whenever it suits', projects, from);
  assert.equal(g.due_date, null);
  assert.ok(g.tokens.some((x) => x.kind === 'due?'));
  assert.equal(g.title, 'Pay rent it suits');
});
t('parseDate ignores inherited object keys and reads a year after month and day', () => {
  assert.equal(parseDate('constructor', from), null);
  assert.equal(parseDate('next constructor', from), null);
  assert.equal(parseDate('dec 1 2027', from), '2027-12-01');
  assert.equal(parseDate('1 dec 2027', from), '2027-12-01');
  assert.equal(parseDate('12/1/2027', from), '2027-12-01');
  assert.equal(parseDate('feb 30 2027', from), null);
});
t('parseQuick cuts tokens where they matched and reads every due: form', () => {
  const a = parseQuick('Plan wedding wed', projects, from);
  assert.equal(a.title, 'Plan wedding');
  assert.equal(a.planned_for, '2026-11-11');
  const a2 = parseQuick('Call monica mon', projects, from);
  assert.equal(a2.title, 'Call monica');
  assert.equal(a2.planned_for, '2026-11-09');
  const b = parseQuick('Dinner due:fri $& budget', projects, from);
  assert.equal(b.title, 'Dinner $& budget');
  assert.equal(b.due_date, '2026-11-06');
  assert.equal(b.tokens.filter((x) => x.kind === 'due').length, 1);
  const c = parseQuick('Pay rent due: fri', projects, from);
  assert.equal(c.due_date, '2026-11-06');
  assert.equal(c.planned_for, null);
  assert.equal(c.title, 'Pay rent');
  const d = parseQuick('Pay rent due:', projects, from);
  assert.equal(d.title, 'Pay rent');
  assert.ok(d.tokens.some((x) => x.kind === 'due?'));
  const e = parseQuick('Focus on: launch prep', projects, from);
  assert.equal(e.title, 'Focus on: launch prep');
  assert.equal(e.planned_for, null);
  const f = parseQuick('Release due:dec 1 2027 at noon', projects, from);
  assert.equal(f.due_date, '2027-12-01');
  assert.equal(f.title, 'Release at noon');
  const g = parseQuick('Review copy #café +déco', [{ id: 'p4', name: 'Café' }], from);
  assert.equal(g.project?.id, 'p4');
  assert.deepEqual(g.labels, ['déco']);
  assert.equal(g.title, 'Review copy');
  const h = parseQuick('Refactor the class due:constructor', projects, from);
  assert.equal(h.due_date, null);
  assert.equal(h.title, 'Refactor the class');
});
t('parseQuick leaves "due: " and "plan: " prose alone when no date follows', () => {
  assert.equal(parseQuick('Plan: holiday', projects, from).title, 'Plan: holiday');
  const a = parseQuick('Pay rent due: every month', projects, from);
  assert.equal(a.recurrence, 'monthly');
  assert.equal(a.title, 'Pay rent due:');
  const b = parseQuick('Pay rent due: +bills', projects, from);
  assert.deepEqual(b.labels, ['bills']);
  assert.equal(b.due_date, null);
  assert.equal(parseQuick('Review due: Q3 numbers', projects, from).title, 'Review due: Q3 numbers');
  const c = parseQuick('Plan: wedding fri', projects, from);
  assert.equal(c.title, 'Plan: wedding');
  assert.equal(c.planned_for, '2026-11-06');
  const d = parseQuick('Ship it due:whenever', projects, from);
  assert.equal(d.title, 'Ship it');
  assert.ok(d.tokens.some((x) => x.kind === 'due?'));
  const e = parseQuick('Pay rent due: fri due: sat', projects, from);
  assert.equal(e.due_date, '2026-11-07');
  assert.equal(e.title, 'Pay rent');
});
t('snoozed tasks are not counted as overdue or blocked', () => {
  const s = computeStats([task({ status: 'blocked', snoozed_until: '2999-01-01' }), task({ due_date: '2000-01-01', snoozed_until: '2999-01-01' }), task({ due_date: '2000-01-01' })], []);
  assert.equal(s.blocked, 0);
  assert.equal(s.overdue, 1);
});
t('calendar text escaping drops control characters and writes every line break as \\n', () => {
  assert.equal(esc('a\rb\u0007c'), 'a\\nbc');
  assert.equal(esc('one\r\ntwo\nthree'), 'one\\ntwo\\nthree');
  assert.equal(esc('x, y; z\\'), 'x\\, y\\; z\\\\');
});
t('plan templates are well formed', () => {
  assert.ok(PLAN_TEMPLATES.length >= 3);
  assert.equal(new Set(PLAN_TEMPLATES.map((x) => x.id)).size, PLAN_TEMPLATES.length);
  for (const tpl of PLAN_TEMPLATES) {
    assert.ok(/^[a-z0-9-]+$/.test(tpl.id) && tpl.name && tpl.summary && tpl.milestones.length, tpl.id);
    for (const m of tpl.milestones) {
      assert.ok(m.title && m.weeks > 0 && m.tasks.length, `${tpl.id}: ${m.title}`);
      for (const task of m.tasks) assert.ok(typeof task.title === 'string' && task.title.trim() && (task.estimate === undefined || task.estimate > 0), `${tpl.id}: ${task.title}`);
    }
  }
});

console.log(`unit checks passed (${n})`);
