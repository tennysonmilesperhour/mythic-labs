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
const ical = await load('../lib/ical.ts', { './projectTypes': types.url });
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
t('paused and planned projects report their state, not a verdict', () => {
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

console.log(`unit checks passed (${n})`);
