// End-to-end smoke test for the git-backed store and the agent API.
// Start the fake (node scripts/fake-github.mjs), then the app with
//   GITHUB_TOKEN=fake PM_GITHUB_API_URL=http://localhost:4010 PM_DATA_OWNER=o PM_DATA_REPO=r PM_DATA_BRANCH=main \
//   PM_AGENT_API_ENABLED=true PM_AGENT_TOKEN=smoke-token npm run build && npm start
// and run: node scripts/smoke.mjs [http://localhost:3000]
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const identitySource = await readFile(new URL('../lib/importIdentity.ts', import.meta.url), 'utf8');
const identityJs = ts.transpileModule(identitySource, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { sameResolvedOwner, nameMatchCompatible, validImportProjectKey, safeImportSourceUrl, importEntryIdentity, validImportDate, projectNameIsAmbiguous } = await import(`data:text/javascript;base64,${Buffer.from(identityJs).toString('base64')}`);
const B = (process.argv[2] || 'http://localhost:3000') + '/api';
const json = { 'content-type': 'application/json' };
const agent = (a) => ({ ...json, authorization: 'Bearer smoke-token', 'x-agent': a });
const call = async (path, method = 'GET', body, headers = json) => {
  const r = await fetch(B + path, { method, headers, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
let failed = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ` (${extra})` : ''}`);
  if (!ok) failed++;
};

check('new category does not suppress its task or entry rows', !sameResolvedOwner(undefined, undefined) && !sameResolvedOwner(undefined, { id: 'new-project' }));
check('existing task and entry dedupe only within the resolved project', sameResolvedOwner({ id: 'same' }, { id: 'same' }) && !sameResolvedOwner({ id: 'one' }, { id: 'two' }));
check('explicit repo mismatch blocks same-name category fallback', !nameMatchCompatible('owner', 'repo-b', 'owner', 'repo-a') && nameMatchCompatible(undefined, undefined, null, null));
check('malformed project keys are rejected before mapping', !validImportProjectKey(undefined, 'Name') && !validImportProjectKey(' key ', 'Name') && validImportProjectKey('key', 'Name'));
check('import evidence links accept HTTPS and reject unsafe schemes or embedded credentials', safeImportSourceUrl('https://drive.google.com/drive/folders/example') && !safeImportSourceUrl('javascript:alert(1)') && !safeImportSourceUrl('https://user:pass@example.com/path'));
check('stable entry source key is independent of shared evidence URLs', importEntryIdentity('entry-a') !== importEntryIdentity('entry-b') && importEntryIdentity('entry-a') === importEntryIdentity('entry-a'));
check('import entry dates require valid YYYY-MM-DD strings', validImportDate('2026-10-27') && !validImportDate(20261027) && !validImportDate({}) && !validImportDate('2026-02-30'));
check('unique source or repository match wins over duplicate display names', !projectNameIsAmbiguous(true, 3) && projectNameIsAmbiguous(false, 2));
const logTabsSource = await readFile(new URL('../app/projects/[id]/LogTabs.tsx', import.meta.url), 'utf8');
check('evidence links render on decision and note cards as well as changelog', (logTabsSource.match(/<EvidenceSource href=\{e\.evidence_url\} \/>/g) || []).length === 2);

const stamp = Date.now().toString(36);
// Dates relative to today (UTC, like the server), so the checks hold on any day.
const dayPlus = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const commitCount = async () => (await (await fetch('http://localhost:4010/__stats')).json()).commits;
const fileAtHead = async (path) => (await (await fetch(`http://localhost:4010/__test/file?path=${encodeURIComponent(path)}`)).json()).content;
const sourceKeyOne = await call('/projects', 'POST', { name: `Life one ${stamp}`, source_key: ' life:inventory-1 ' });
const sourceKeyDuplicate = await call('/projects', 'POST', { name: `Life duplicate ${stamp}`, source_key: 'life:inventory-1' });
check('repo-less project source keys are trimmed and deduplicated', sourceKeyOne.body.created?.length === 1 && sourceKeyDuplicate.body.created?.length === 0 && sourceKeyDuplicate.body.failed?.length === 1);
const sourceKeyTwo = await call('/projects', 'POST', { name: `Life two ${stamp}`, source_key: 'life:inventory-2' });
const changedSourceKey = await call(`/projects/${sourceKeyTwo.body.created[0].id}`, 'PATCH', { source_key: ' life:inventory-1 ' });
check('project update cannot claim another source key', changedSourceKey.status === 409);
const idem = `smoke-${stamp}`;
const idempotentPayload = { name: `Receipt ${stamp}`, status: 'active' };
const firstReceipt = await call('/projects', 'POST', idempotentPayload, { ...json, 'Idempotency-Key': idem });
const replayReceipt = await call('/projects', 'POST', idempotentPayload, { ...json, 'Idempotency-Key': idem });
check('same idempotency key replays the original result', firstReceipt.body.created?.[0]?.id === replayReceipt.body.created?.[0]?.id);
const reusedKey = await call('/projects', 'POST', { ...idempotentPayload, name: `Different ${stamp}` }, { ...json, 'Idempotency-Key': idem });
check('same key with different payload is rejected', reusedKey.status === 409);
const receipts = JSON.parse(await fileAtHead('operations.json')).items;
check('receipts carry the time they were written, so old ones can be dropped', typeof receipts[idem]?.at === 'string' && !Number.isNaN(Date.parse(receipts[idem].at)));
const { body: made } = await call('/projects', 'POST', { name: `Smoke ${stamp}`, status: 'active', agents: [] });
const pid = made.created[0].id;
const { body: importProject } = await call('/projects', 'POST', { name: `Import smoke ${stamp}`, status: 'active', agents: [] });
const importPid = importProject.created[0].id;
const importKey = `inventory:${stamp}:batch-1`;
const importedPayload = { items: [
  { source_key: `inventory:${stamp}:one`, title: 'Imported one', status: 'todo' },
  { source_key: `inventory:${stamp}:two`, title: 'Imported two', status: 'blocked', notes: 'Needs owner review' },
] };
const imported = await call(`/projects/${importPid}/tasks`, 'POST', importedPayload, { ...json, 'Idempotency-Key': importKey });
const importedReplay = await call(`/projects/${importPid}/tasks`, 'POST', importedPayload, { ...json, 'Idempotency-Key': importKey });
check('task batch writes atomically and idempotent replay returns original IDs',
  imported.body.created?.length === 2 && importedReplay.body.created?.map(t => t.id).join(',') === imported.body.created.map(t => t.id).join(','));
const importedConflict = await call(`/projects/${importPid}/tasks`, 'POST', { items: [{ source_key: `inventory:${stamp}:changed`, title: 'Changed' }] }, { ...json, 'Idempotency-Key': importKey });
check('task batch rejects reused idempotency key with different payload', importedConflict.status === 409);
const importedDedup = await call(`/projects/${importPid}/tasks`, 'POST', { items: [{ source_key: `inventory:${stamp}:one`, title: 'Would overwrite' }] });
check('stable task source key prevents duplicate on a new import operation', importedDedup.body.created?.length === 0 && importedDedup.body.skipped === 1);
const crossProjectKey = await call(`/projects/${pid}/tasks`, 'POST', { items: [{ source_key: `inventory:${stamp}:one`, title: 'Wrong mapping' }] });
check('task source key cannot be silently mapped into a second project', crossProjectKey.status === 409);
const taskCountBeforeInvalidImport = (await call(`/projects/${importPid}`)).body.tasks.length;
const invalidBatch = await call(`/projects/${importPid}/tasks`, 'POST', { items: [
  { source_key: `inventory:${stamp}:three`, title: 'Must roll back' },
  { title: 'Missing source key' },
] });
check('invalid task batch writes nothing', invalidBatch.status === 400 && (await call(`/projects/${importPid}`)).body.tasks.length === taskCountBeforeInvalidImport);
const freshCategory = await call('/projects', 'POST', { name: `Fresh import category ${stamp}`, source_key: `category:fresh-${stamp}`, status: 'planned' });
const freshCategoryId = freshCategory.body.created?.[0]?.id;
const freshTaskImport = await call(`/projects/${freshCategoryId}/tasks`, 'POST', { items: [{ source_key: `inventory:${stamp}:fresh`, title: 'Fresh category task', status: 'todo' }] }, { ...json, 'Idempotency-Key': `fresh-task-${stamp}` });
const freshSourceUrl = `https://drive.google.com/drive/folders/${stamp}`;
const entryA = importEntryIdentity(`entry-a:${stamp}`);
const entryB = importEntryIdentity(`entry-b:${stamp}`);
const freshEntryImport = await call(`/projects/${freshCategoryId}/entries`, 'POST', { items: [
  { kind: 'note', title: 'Fresh category report A', body: 'Report preview import check', source_url: entryA, evidence_url: freshSourceUrl },
  { kind: 'note', title: 'Fresh category report B', body: 'Second record with same evidence folder', source_url: entryB, evidence_url: freshSourceUrl },
] }, { ...json, 'Idempotency-Key': `fresh-entry-${stamp}` });
const changedEvidenceRetry = await call(`/projects/${freshCategoryId}/entries`, 'POST', { items: [
  { kind: 'note', title: 'Fresh category report A revised', body: 'Same import identity with updated evidence', source_url: entryA, evidence_url: `${freshSourceUrl}/revised` },
] }, { ...json, 'Idempotency-Key': `fresh-entry-retry-${stamp}` });
const freshCategoryReadback = await call(`/projects/${freshCategoryId}`);
check('new category accepts its task and report entry and reads both back',
  freshTaskImport.body.created?.length === 1 && freshEntryImport.body.created?.length === 2 &&
  freshCategoryReadback.body.tasks?.some((t) => t.source_key === `inventory:${stamp}:fresh`) &&
  freshCategoryReadback.body.entries?.filter((e) => e.evidence_url === freshSourceUrl).length === 2 &&
  freshCategoryReadback.body.entries?.some((e) => e.source_url === entryA));
check('replaying a stable entry key with changed evidence does not duplicate it', changedEvidenceRetry.body.created?.length === 0 && changedEvidenceRetry.body.skipped === 1 && (await call(`/projects/${freshCategoryId}`)).body.entries.filter((e) => e.source_url === entryA).length === 1);
await call(`/projects/${importPid}`, 'DELETE');
const { body: paused } = await call('/projects', 'POST', { name: `Paused ${stamp}`, status: 'paused', agents: [] });
const { body: pausedTask } = await call(`/projects/${paused.created[0].id}/tasks`, 'POST', { title: 'Must not be claimed' });
const pausedClaim = await call(`/agent/tasks/${pausedTask.task.id}/claim`, 'POST', undefined, agent('a1'));
check('paused project task cannot be claimed', pausedClaim.status === 409);
const { body: dep } = await call(`/projects/${pid}/tasks`, 'POST', { title: 'First', acceptance: 'exists', source_key: `should-ignore:${stamp}` });
check('manual task creation cannot claim an import source key', !dep.task.source_key);
const { body: after } = await call(`/projects/${pid}/tasks`, 'POST', { title: 'Second', depends_on: [dep.task.id] });

const statsBeforeAgentTask = await (await fetch('http://localhost:4010/__stats')).json();
const atomicAgentTask = await call(`/agent/projects/${pid}/tasks`, 'POST', { title: 'Agent-created' }, agent('a1'));
const statsAfterAgentTask = await (await fetch('http://localhost:4010/__stats')).json();
check('agent task and progress entry use one Git commit', atomicAgentTask.status === 200 && statsAfterAgentTask.commits === statsBeforeAgentTask.commits + 1);
const tasksBeforeInvalidParent = (await call(`/projects/${pid}`)).body.tasks.length;
const invalidAgentTask = await call(`/agent/projects/${pid}/tasks`, 'POST', { title: 'Invalid child', parent_id: 'not-in-this-project' }, agent('a1'));
check('invalid agent parent is rejected without creating a task', invalidAgentTask.status === 404 && (await call(`/projects/${pid}`)).body.tasks.length === tasksBeforeInvalidParent);

const next1 = await call(`/agent/next?project=${pid}`, 'GET', undefined, agent('a1'));
check('next returns the unblocked task', next1.body.task?.id === dep.task.id, next1.body.task?.title);

const claims = await Promise.all(['a1', 'a2', 'a3', 'a4', 'a5'].map((a) =>
  call(`/agent/tasks/${dep.task.id}/claim`, 'POST', undefined, agent(a))));
const wins = claims.filter((c) => c.status === 200).length;
check('exactly one of five parallel claims wins', wins === 1, `${wins} won`);
check('losers get 409', claims.filter((c) => c.status === 409).length === 4);

const early = await call(`/agent/tasks/${after.task.id}/claim`, 'POST', undefined, agent('a2'));
check('claiming a task with an open dependency is 409', early.status === 409);

const { body: restrictedProject } = await call('/projects', 'POST', { name: `Restricted ${stamp}`, status: 'active', agents: ['allowed-agent'] });
const { body: restrictedTask } = await call(`/projects/${restrictedProject.created[0].id}/tasks`, 'POST', { title: 'Assigned outside project', agent: 'outside-agent' });
const excludedNext = await call(`/agent/next?project=${restrictedProject.created[0].id}`, 'GET', undefined, agent('outside-agent'));
check('next task does not return an assignment the agent cannot claim', excludedNext.body.task === null);
const { body: listedTask } = await call(`/projects/${restrictedProject.created[0].id}/tasks`, 'POST', { title: 'Assigned to listed agent', agent: 'allowed-agent' });
const allowedNext = await call(`/agent/next?project=${restrictedProject.created[0].id}`, 'GET', undefined, agent('allowed-agent'));
check('project-listed agent can receive the assigned task', allowedNext.body.task?.id === listedTask.task.id);

const winner = claims.find((c) => c.status === 200).body.task.agent;
const startedCount = (await call(`/projects/${pid}`)).body.entries.filter((e) => e.title === 'Started: First').length;
await call(`/agent/tasks/${dep.task.id}/claim`, 'POST', undefined, agent(winner));
const startedAgainCount = (await call(`/projects/${pid}`)).body.entries.filter((e) => e.title === 'Started: First').length;
check('same agent claim retry does not duplicate Started log', startedCount === 1 && startedAgainCount === 1);
const otherReport = await call(`/agent/tasks/${dep.task.id}`, 'PATCH', { status: 'done' }, agent(winner === 'a1' ? 'a2' : 'a1'));
check('another agent cannot report a claimed task', otherReport.status === 409);
const done = await call(`/agent/tasks/${dep.task.id}`, 'PATCH', { status: 'done', note: 'smoke' }, agent(winner));
check('winner can finish', done.status === 200);
const next2 = await call(`/agent/next?project=${pid}`, 'GET', undefined, agent('a2'));
check('dependent task becomes ready', next2.body.task?.id === after.task.id);

const burst = await Promise.all(Array.from({ length: 8 }, (_, i) =>
  call(`/projects/${pid}/tasks`, 'POST', { title: `burst ${i}` })));
const detail = (await call(`/projects/${pid}`)).body;
check('8 parallel writes all persist', detail.tasks.filter((t) => t.title.startsWith('burst')).length === 8,
  burst.map((b) => b.status).join(','));
check('progress entries logged', detail.entries.filter((e) => e.kind === 'progress').length >= 2);

await call(`/projects/${pid}`, 'DELETE');
check('project deleted', (await call(`/projects/${pid}`)).status === 404);

// ─── planning fields, inbox, bulk edits, undo, comments, search, history, feeds ───
const { body: planProject } = await call('/projects', 'POST', { name: `Planning ${stamp}`, status: 'active', agents: [], summary: 'before' });
const planPid = planProject.created[0].id;
const badEstimate = await call(`/projects/${planPid}/tasks`, 'POST', { title: 'Bad estimate', estimate: -3 });
const badRecurrence = await call(`/projects/${planPid}/tasks`, 'POST', { title: 'Bad recurrence', recurrence: 'fortnightly' });
const badDate = await call(`/projects/${planPid}/tasks`, 'POST', { title: 'Bad date', planned_for: 'tomorrow' });
check('invalid estimate, recurrence and planned_for are rejected', badEstimate.status === 400 && badRecurrence.status === 400 && badDate.status === 400);
const { body: weekly } = await call(`/projects/${planPid}/tasks`, 'POST', { title: 'Weekly dependency update', recurrence: 'weekly', due_date: dayPlus(1), estimate: 3, labels: ['chore', '#ops', 'chore'] });
check('labels are deduplicated and stripped of #', JSON.stringify(weekly.task.labels) === JSON.stringify(['chore', 'ops']) && weekly.task.estimate === 3);
const finished = await call(`/tasks/${weekly.task.id}`, 'PATCH', { status: 'done' });
check('finishing a recurring task spawns the next occurrence a week later',
  finished.status === 200 && finished.body.task.status === 'done' && finished.body.task.recurrence === null &&
  finished.body.spawned?.status === 'todo' && finished.body.spawned.due_date === dayPlus(8) && finished.body.spawned.recurrence === 'weekly' && finished.body.spawned.estimate === 3);
const reopened = await call(`/tasks/${weekly.task.id}`, 'PATCH', { status: 'todo' });
const refinished = await call(`/tasks/${weekly.task.id}`, 'PATCH', { status: 'done' });
check('a reopened occurrence does not spawn twice', reopened.status === 200 && refinished.body.spawned === null);
const { body: a } = await call(`/projects/${planPid}/tasks`, 'POST', { title: 'Bulk A' });
const { body: bTask } = await call(`/projects/${planPid}/tasks`, 'POST', { title: 'Bulk B' });
const { body: child } = await call(`/projects/${planPid}/tasks`, 'POST', { title: 'Bulk B child', parent_id: bTask.task.id });
const commitsBeforeBulk = (await (await fetch('http://localhost:4010/__stats')).json()).commits;
const bulk = await call('/tasks', 'PATCH', { items: [{ id: a.task.id, priority: 'high', planned_for: '2026-11-01' }, { id: bTask.task.id, agent: 'claude-code', estimate: 5 }] });
const commitsAfterBulk = (await (await fetch('http://localhost:4010/__stats')).json()).commits;
check('bulk patch edits several tasks in one commit', bulk.status === 200 && bulk.body.tasks.length === 2 && bulk.body.tasks[0].priority === 'high' && bulk.body.tasks[1].agent === 'claude-code' && commitsAfterBulk === commitsBeforeBulk + 1);
const bulkInvalid = await call('/tasks', 'PATCH', { items: [{ id: a.task.id, priority: 'low' }, { id: 'missing-task', priority: 'low' }] });
check('bulk patch with one bad id writes nothing', bulkInvalid.status === 404 && (await call(`/projects/${planPid}`)).body.tasks.find((t) => t.id === a.task.id).priority === 'high');
const { body: ownerLate } = await call(`/projects/${planPid}/tasks`, 'POST', { title: 'Owner step, overdue', agent: 'me', due_date: dayPlus(-2) });
const hubAwake = (await call('/projects')).body;
const snoozed = await call(`/tasks/${ownerLate.task.id}`, 'PATCH', { snoozed_until: dayPlus(5) });
const hubSnoozed = (await call('/projects')).body;
const inHub = (hub, id) => ({ today: hub.today.some((t) => t.id === id), mine: hub.mine.some((t) => t.id === id), attention: hub.attention.some((x) => x.task_id === id), overdue: hub.projects.find((p) => p.id === planPid).stats.overdue });
check('an overdue owner step is on today, in my tasks and in attention until it is snoozed',
  JSON.stringify(inHub(hubAwake, ownerLate.task.id)) === JSON.stringify({ today: true, mine: true, attention: true, overdue: 1 }) && snoozed.status === 200 &&
  JSON.stringify(inHub(hubSnoozed, ownerLate.task.id)) === JSON.stringify({ today: false, mine: false, attention: false, overdue: 0 }), JSON.stringify([inHub(hubAwake, ownerLate.task.id), inHub(hubSnoozed, ownerLate.task.id)]));
const comment = await call(`/tasks/${bTask.task.id}/comments`, 'POST', { body: 'Owner note: ship behind a flag' });
check('owner comments attach to the task', comment.status === 200 && comment.body.entry.task_id === bTask.task.id && comment.body.entry.author === 'me');
const agentComment = await call(`/agent/tasks/${bTask.task.id}/comments`, 'POST', { body: 'Which flag name?' }, agent('claude-code'));
const thread = await call(`/agent/tasks/${bTask.task.id}`, 'GET', undefined, agent('claude-code'));
check('agents read the task thread with both sides', agentComment.status === 200 && thread.status === 200 && thread.body.thread.length === 2 && thread.body.thread[1].author === 'claude-code' && thread.body.task.subtasks.length === 1);
const update = await call(`/projects/${planPid}/entries`, 'POST', { kind: 'update', title: 'Week 44', body: 'Flag work on track', health: 'on_track' });
const updateNoHealth = await call(`/projects/${planPid}/entries`, 'POST', { kind: 'update', title: 'Week 45' });
check('status updates carry a health call', update.status === 200 && update.body.created[0].health === 'on_track' && updateNoHealth.status === 400);
const removed = await call(`/tasks/${bTask.task.id}`, 'DELETE');
check('deleting a parent returns the whole subtree for undo', removed.status === 200 && removed.body.removed.length === 2);
const restored = await call('/tasks/restore', 'POST', { tasks: removed.body.removed });
const afterRestore = (await call(`/projects/${planPid}`)).body;
check('undo restores tasks with their original ids and parent links',
  restored.body.restored.length === 2 && afterRestore.tasks.some((t) => t.id === bTask.task.id) && afterRestore.tasks.find((t) => t.id === child.task.id)?.parent_id === bTask.task.id &&
  afterRestore.entries.some((e) => e.task_id === bTask.task.id));
const restoredAgain = await call('/tasks/restore', 'POST', { tasks: removed.body.removed });
check('restoring twice is a no-op', restoredAgain.body.restored.length === 0);
const reorder = await call(`/projects/${planPid}/reorder`, 'POST', { order: [{ id: bTask.task.id }, { id: a.task.id }] });
const ordered = (await call(`/projects/${planPid}`)).body.tasks.filter((t) => [a.task.id, bTask.task.id].includes(t.id)).sort((x, y) => x.sort_order - y.sort_order).map((t) => t.title);
check('reorder writes the new sequence and answers with placements only', reorder.status === 200 && JSON.stringify(ordered) === JSON.stringify(['Bulk B', 'Bulk A']) && reorder.body.tasks.every((t) => typeof t.sort_order === 'number' && !('title' in t)));

const captured = await call('/inbox', 'POST', { title: 'Try the new build pipeline', priority: 'high', labels: ['ops'], due_date: '2026-11-20' });
const proposed = await call('/agent/inbox', 'POST', { title: 'Consider rate limiting', project_id: planPid }, agent('claude-code'));
const inboxList = await call('/inbox');
check('captures and agent proposals land in the inbox', captured.status === 200 && proposed.status === 200 && proposed.body.item.source === 'claude-code' && inboxList.body.items.length >= 2);
const badCapture = await call('/inbox', 'POST', { title: '   ' });
check('blank captures are rejected', badCapture.status === 400);
const commitsBeforeTriage = (await (await fetch('http://localhost:4010/__stats')).json()).commits;
const triaged = await call(`/inbox/${captured.body.item.id}/triage`, 'POST', { project_id: planPid, agent: 'claude-code' });
const commitsAfterTriage = (await (await fetch('http://localhost:4010/__stats')).json()).commits;
const inboxAfter = await call('/inbox');
check('triage turns a capture into a task in one commit and keeps its hints',
  triaged.status === 200 && triaged.body.task.priority === 'high' && triaged.body.task.due_date === '2026-11-20' && triaged.body.task.agent === 'claude-code' && triaged.body.task.labels.includes('ops') &&
  !inboxAfter.body.items.some((i) => i.id === captured.body.item.id) && commitsAfterTriage === commitsBeforeTriage + 1);
const triageMissing = await call(`/inbox/${captured.body.item.id}/triage`, 'POST', { project_id: planPid });
check('triaging twice is refused', triageMissing.status === 404);
await call(`/inbox/${proposed.body.item.id}`, 'DELETE');

const index = await call('/search');
check('search index lists projects, tasks and inbox', index.status === 200 && index.body.projects.some((p) => p.id === planPid) && index.body.tasks.some((t) => t.id === a.task.id && t.project_name === `Planning ${stamp}`));
const hubNow = await call('/projects');
check('hub carries today, done today, inbox and health', Array.isArray(hubNow.body.today) && Array.isArray(hubNow.body.doneToday) && Array.isArray(hubNow.body.inbox) && hubNow.body.projects.find((p) => p.id === planPid)?.health?.level);
const ics = await fetch(`${B}/calendar.ics`);
const icsText = await ics.text();
check('calendar feed lists due dates as all-day events', ics.headers.get('content-type')?.startsWith('text/calendar') && icsText.includes('BEGIN:VEVENT') && icsText.includes('DTSTART;VALUE=DATE:20261120'));
const digest = await fetch(`${B}/digest`);
check('digest renders the brief as Markdown', digest.ok && (await digest.text()).startsWith('# Brief for'));

await call(`/projects/${planPid}`, 'PATCH', { summary: 'after' });
const history = await call(`/history?project=${planPid}`);
check('history lists commits that touched the project, newest first', history.status === 200 && history.body.available === true && history.body.commits.length >= 3 && /after|edit summary/.test(history.body.commits[0].message));
const beforeSha = history.body.commits.find((c) => /summary|Planning/.test(c.message) && c.sha !== history.body.commits[0].sha)?.sha || history.body.commits[1].sha;
const preview = await call(`/projects/${planPid}/history/${beforeSha}`);
check('a past version can be previewed', preview.status === 200 && preview.body.project.id === planPid);
const commitsBeforeRestore = (await (await fetch('http://localhost:4010/__stats')).json()).commits;
const restoredProject = await call(`/projects/${planPid}/history/${beforeSha}`, 'POST');
const commitsAfterRestore = (await (await fetch('http://localhost:4010/__stats')).json()).commits;
check('restoring a version rewrites nothing and adds one commit', restoredProject.status === 200 && restoredProject.body.project.summary === 'before' && commitsAfterRestore === commitsBeforeRestore + 1 && restoredProject.body.entries.some((e) => /Restored the project/.test(e.title)));
const badSha = await call(`/projects/${planPid}/history/not-a-sha`);
check('malformed commit ids are rejected', badSha.status === 400);
await call(`/projects/${planPid}`, 'DELETE');

// ─── fixes from the review: identities, cycles, hints, threads, review passes ───
const { body: fixProject } = await call('/projects', 'POST', { name: `Fixes ${stamp}`, status: 'active', agents: [] });
const fixPid = fixProject.created[0].id;
const imported2 = await call(`/projects/${fixPid}/tasks`, 'POST', { items: [{ source_key: `inventory:${stamp}:recurring`, title: 'Imported weekly chore', recurrence: 'weekly', due_date: dayPlus(1), agent: 'claude-code' }] });
const choreId = imported2.body.created[0].id;
const choreDone = await call(`/tasks/${choreId}`, 'PATCH', { status: 'done' });
const storeStillReads = await call('/projects');
check('finishing an imported recurring task spawns a copy without the import key, and the store still reads',
  choreDone.status === 200 && choreDone.body.spawned && !choreDone.body.spawned.source_key && storeStillReads.status === 200);
check('the next occurrence is deferred until it is due, so an agent cannot pick it up again at once',
  choreDone.body.spawned.snoozed_until === dayPlus(8) && (await call(`/agent/next?project=${fixPid}`, 'GET', undefined, agent('claude-code'))).body.task === null);
const { body: top } = await call(`/projects/${fixPid}/tasks`, 'POST', { title: 'Top' });
const { body: mid } = await call(`/projects/${fixPid}/tasks`, 'POST', { title: 'Mid', parent_id: top.task.id });
await call(`/tasks/${mid.task.id}`, 'PATCH', { status: 'done' });
const cycle = await call(`/tasks/${top.task.id}`, 'PATCH', { parent_id: mid.task.id });
check('a task cannot be moved under its own finished subtask', cycle.status === 400);
const hinted = await call('/inbox', 'POST', { title: 'Water the plants', planned_for: '2026-11-03', recurrence: 'weekly', priority: 'low' });
const hintedTask = await call(`/inbox/${hinted.body.item.id}/triage`, 'POST', { project_id: fixPid });
check('plan-for and repeat hints survive capture and triage', hinted.body.item.planned_for === '2026-11-03' && hintedTask.body.task.planned_for === '2026-11-03' && hintedTask.body.task.recurrence === 'weekly');
const keyed = await call(`/projects/${fixPid}/tasks`, 'POST', { items: [{ source_key: `inventory:${stamp}:keyed`, title: 'Keyed task' }] });
const keyedId = keyed.body.created[0].id;
const keyedRemoved = await call(`/tasks/${keyedId}`, 'DELETE');
const keyedBack = await call('/tasks/restore', 'POST', { tasks: keyedRemoved.body.removed });
check('undoing a delete keeps the task\'s import identity', keyedBack.body.restored[0]?.source_key === `inventory:${stamp}:keyed`);
const reimport = await call(`/projects/${fixPid}/tasks`, 'POST', { items: [{ source_key: `inventory:${stamp}:keyed`, title: 'Keyed task again' }] });
check('so a repeated import does not duplicate it', reimport.body.created.length === 0 && reimport.body.skipped === 1);
const { body: otherProject } = await call('/projects', 'POST', { name: `Other ${stamp}`, status: 'active', agents: [] });
const { body: otherTask } = await call(`/projects/${otherProject.created[0].id}/tasks`, 'POST', { title: 'Lives elsewhere' });
const crafted = await call('/tasks/restore', 'POST', { tasks: [{ ...otherTask.task, project_id: fixPid }] });
check('a restore payload cannot plant an id that already exists in another project', crafted.status === 409);
const before = (await call(`/projects/${fixPid}`)).body.tasks.find((t) => t.id === top.task.id).updated_at;
await new Promise((r) => setTimeout(r, 20));
const { body: child2 } = await call(`/projects/${fixPid}/tasks`, 'POST', { title: 'Child of top', parent_id: top.task.id });
const { body: grandchild } = await call(`/projects/${fixPid}/tasks`, 'POST', { title: 'Grandchild', parent_id: child2.task.id });
const { body: ms } = await call(`/projects/${fixPid}/milestones`, 'POST', { title: 'Later' });
await call(`/projects/${fixPid}/reorder`, 'POST', { order: [{ id: top.task.id, milestone_id: ms.milestone.id }] });
const afterReorder = (await call(`/projects/${fixPid}`)).body.tasks;
check('reordering keeps updated_at and moves grandchildren with their root', afterReorder.find((t) => t.id === top.task.id).updated_at === before && afterReorder.find((t) => t.id === grandchild.task.id).milestone_id === ms.milestone.id);
const { body: blockedTask } = await call(`/projects/${fixPid}/tasks`, 'POST', { title: 'Stuck on a key', status: 'blocked', agent: 'claude-code' });
const commitsBeforeReply = (await (await fetch('http://localhost:4010/__stats')).json()).commits;
const replied = await call(`/tasks/${blockedTask.task.id}/comments`, 'POST', { body: 'Key is in the vault', status: 'todo' });
const commitsAfterReply = (await (await fetch('http://localhost:4010/__stats')).json()).commits;
check('reply and unblock is one commit', replied.status === 200 && replied.body.task.status === 'todo' && replied.body.entry.task_id === blockedTask.task.id && commitsAfterReply === commitsBeforeReply + 1);
const commitsBeforeReview = (await (await fetch('http://localhost:4010/__stats')).json()).commits;
const reviewed = await call(`/projects/${fixPid}/review`, 'POST', { next_action: 'Ship the chore', update: { health: 'at_risk', body: 'Behind on the chore' } });
const commitsAfterReview = (await (await fetch('http://localhost:4010/__stats')).json()).commits;
check('a review pass with an update is one commit', reviewed.status === 200 && reviewed.body.project.last_reviewed_at && reviewed.body.project.next_action === 'Ship the chore' && reviewed.body.entries.some((e) => e.kind === 'update' && e.health === 'at_risk') && commitsAfterReview === commitsBeforeReview + 1);
const badReview = await call(`/projects/${fixPid}/review`, 'POST', { update: { health: 'fine', body: 'x' } });
check('a review update needs a real health call', badReview.status === 400);
const commitsBeforeTemplate = (await (await fetch('http://localhost:4010/__stats')).json()).commits;
const templated = await call('/projects', 'POST', { name: `Templated ${stamp}`, status: 'planned', template: 'research-spike' });
const templatedDetail = await call(`/projects/${templated.body.created[0].id}`);
const commitsAfterTemplate = (await (await fetch('http://localhost:4010/__stats')).json()).commits;
check('a project created from a template is one commit with its plan', templatedDetail.body.milestones.length === 1 && templatedDetail.body.tasks.length === 4 && commitsAfterTemplate === commitsBeforeTemplate + 1);
const badTemplate = await call('/projects', 'POST', { name: `Bad template ${stamp}`, template: 'nope' });
check('an unknown template creates nothing', badTemplate.body.created.length === 0 && badTemplate.body.failed[0].reason === 'no template nope');

// ─── fixes from the second review: late chores, one-commit undo, identities, agent gates, validation ───
const { body: lateChore } = await call(`/projects/${fixPid}/tasks`, 'POST', { title: 'Late weekly chore', recurrence: 'weekly', due_date: dayPlus(-30) });
const lateDone = await call(`/tasks/${lateChore.task.id}`, 'PATCH', { status: 'done' });
check('a recurring task finished a month late spawns its next occurrence in the coming week, never in the past',
  lateDone.status === 200 && !!lateDone.body.spawned && lateDone.body.spawned.due_date > dayPlus(0) && lateDone.body.spawned.due_date <= dayPlus(7) && lateDone.body.spawned.snoozed_until === lateDone.body.spawned.due_date);
const commitsBeforeReopen = await commitCount();
const reopened2 = await call(`/tasks/${lateChore.task.id}/reopen`, 'POST', { status: 'todo', recurrence: 'weekly', spawned_id: lateDone.body.spawned.id });
const commitsAfterReopen = await commitCount();
const afterReopen = (await call(`/projects/${fixPid}`)).body.tasks;
check('undoing a finish reopens the task, gives the rule back and removes the spawned occurrence in one commit',
  reopened2.status === 200 && reopened2.body.task.status === 'todo' && reopened2.body.task.recurrence === 'weekly' && reopened2.body.task.done_at === null && reopened2.body.removed.length === 1 &&
  !afterReopen.some((t) => t.id === lateDone.body.spawned.id) && commitsAfterReopen === commitsBeforeReopen + 1);
check('reopen refuses a closed status', (await call(`/tasks/${lateChore.task.id}/reopen`, 'POST', { status: 'done' })).status === 400);
const plantedProject = await call('/tasks/restore', 'POST', { tasks: [{ ...top.task, id: fixPid }] });
await call('/repos', 'POST', { input: `fixture-owner/fixture-repo-${stamp}` });
const trackedRepo = (await call('/repos')).body.repos.find((r) => r.repo === `fixture-repo-${stamp}`);
const plantedRepo = await call('/tasks/restore', 'POST', { tasks: [{ ...top.task, id: trackedRepo?.id }] });
check('a restore payload cannot reuse a project id or a tracked repository id', plantedProject.status === 409 && !!trackedRepo && plantedRepo.status === 409);
const badStamp = await call('/tasks/restore', 'POST', { tasks: [{ ...otherTask.task, id: `${otherTask.task.id}-x`, project_id: fixPid, done_at: 'yesterday' }] });
check('a restore payload with a malformed timestamp is rejected', badStamp.status === 400);
const { body: gated } = await call('/projects', 'POST', { name: `Gated ${stamp}`, status: 'active', agents: ['other-agent'] });
const gatedPid = gated.created[0].id;
const { body: gatedTask } = await call(`/projects/${gatedPid}/tasks`, 'POST', { title: 'Gated task' });
const gatedComment = await call(`/agent/tasks/${gatedTask.task.id}/comments`, 'POST', { body: 'Can I help?' }, agent('claude-code'));
const allowedComment = await call(`/agent/tasks/${gatedTask.task.id}/comments`, 'POST', { body: 'On it' }, agent('other-agent'));
check('agent comments are checked against the project like every other agent write', gatedComment.status === 409 && allowedComment.status === 200 && allowedComment.body.entry.author === 'other-agent');
await call(`/projects/${gatedPid}`, 'PATCH', { status: 'paused' });
check('agent comments are refused on a paused project', (await call(`/agent/tasks/${gatedTask.task.id}/comments`, 'POST', { body: 'Still here' }, agent('other-agent'))).status === 409);
const agentTask = await call(`/agent/projects/${fixPid}/tasks`, 'POST', { title: 'Agent subtask', estimate: 3, labels: ['ops', '#ops'], due_date: dayPlus(3), assign_self: true }, agent('claude-code'));
check('agents set estimate, labels and due date on the tasks they add',
  agentTask.status === 200 && agentTask.body.task.estimate === 3 && JSON.stringify(agentTask.body.task.labels) === JSON.stringify(['ops']) && agentTask.body.task.due_date === dayPlus(3) && agentTask.body.task.agent === 'claude-code');
check('agent task fields are validated', (await call(`/agent/projects/${fixPid}/tasks`, 'POST', { title: 'Bad', estimate: -1 }, agent('claude-code'))).status === 400);
const { body: msB } = await call(`/projects/${fixPid}/milestones`, 'POST', { title: 'Cascade' });
const { body: parentT } = await call(`/projects/${fixPid}/tasks`, 'POST', { title: 'Parent to move' });
const { body: childT } = await call(`/projects/${fixPid}/tasks`, 'POST', { title: 'Child that follows', parent_id: parentT.task.id });
await call(`/tasks/${parentT.task.id}`, 'PATCH', { milestone_id: msB.milestone.id });
const cascaded = (await call(`/projects/${fixPid}`)).body.tasks.find((t) => t.id === childT.task.id);
check('moving a task to a milestone moves its subtasks with it', cascaded?.milestone_id === msB.milestone.id);
const badKind = await call(`/projects/${fixPid}/entries`, 'POST', { kind: 'rumor', title: 'x' });
const badDecision = await call(`/projects/${fixPid}/entries`, 'POST', { kind: 'decision', title: 'x', decision_status: 'maybe' });
const badEntryDate = await call(`/projects/${fixPid}/entries`, 'POST', { kind: 'note', title: 'x', entry_date: 'yesterday' });
check('entry kind, decision status and date are validated', badKind.status === 400 && badDecision.status === 400 && badEntryDate.status === 400);
const { body: noteEntry } = await call(`/projects/${fixPid}/entries`, 'POST', { kind: 'note', title: 'Plain note', body: 'b' });
const badEdit = await call(`/entries/${noteEntry.created[0].id}`, 'PATCH', { kind: 'update' });
const badEditTitle = await call(`/entries/${noteEntry.created[0].id}`, 'PATCH', { title: '  ' });
check('editing an entry is validated like creating one', badEdit.status === 400 && badEditTitle.status === 400);
const badTarget = await call(`/projects/${fixPid}`, 'PATCH', { target_date: 'next week' });
const badReviewed = await call(`/projects/${fixPid}`, 'PATCH', { last_reviewed_at: 'yesterday' });
const badPriority = await call(`/projects/${fixPid}`, 'PATCH', { priority: 'urgent' });
check('project dates, review stamps and priority are validated', badTarget.status === 400 && badReviewed.status === 400 && badPriority.status === 400);
const ownerTomorrow = await call(`/projects/${fixPid}/tasks`, 'POST', { title: 'Owner step due today, moved on', agent: 'me', due_date: dayPlus(0), planned_for: dayPlus(1) });
check('a task planned for tomorrow is off today even when it is due today', ownerTomorrow.status === 200 && !(await call('/projects')).body.today.some((t) => t.id === ownerTomorrow.body.task.id));
// ─── third round: anchors, reopen identity, real dates, commit messages ───
const { body: monthly } = await call(`/projects/${fixPid}/tasks`, 'POST', { title: 'Monthly chore', recurrence: 'monthly', due_date: dayPlus(-45) });
const monthlyDone = await call(`/tasks/${monthly.task.id}`, 'PATCH', { status: 'done' });
check('a spawned occurrence records what spawned it and the day of the month it aims for',
  monthlyDone.body.spawned?.spawned_from === monthly.task.id && monthlyDone.body.spawned.recurrence_day === Number(dayPlus(-45).slice(8, 10)) && monthlyDone.body.spawned.due_date > dayPlus(0));
const { body: otherChore } = await call(`/projects/${fixPid}/tasks`, 'POST', { title: 'Other daily chore', recurrence: 'daily' });
const wrongReopen = await call(`/tasks/${monthly.task.id}/reopen`, 'POST', { status: 'todo', recurrence: 'monthly', spawned_id: otherChore.task.id });
const otherStill = (await call(`/projects/${fixPid}`)).body.tasks.some((t) => t.id === otherChore.task.id);
check('reopen refuses a spawned_id this task did not spawn, and deletes nothing', wrongReopen.status === 400 && otherStill);
await call(`/tasks/${monthlyDone.body.spawned.id}`, 'DELETE');
const goneReopen = await call(`/tasks/${monthly.task.id}/reopen`, 'POST', { status: 'todo', recurrence: 'monthly', spawned_id: monthlyDone.body.spawned.id });
check('reopen gives the rule back when the spawned occurrence is already gone', goneReopen.status === 200 && goneReopen.body.task.recurrence === 'monthly' && goneReopen.body.removed.length === 0);
const badMonth = await call(`/tasks/${monthly.task.id}`, 'PATCH', { due_date: '2026-13-01' });
const badDay = await call(`/tasks/${monthly.task.id}`, 'PATCH', { planned_for: '2026-02-30' });
const badMsDate = await call(`/projects/${fixPid}/milestones`, 'POST', { title: 'Bad date', target_date: '2026-02-30' });
const badLinks = await call(`/projects/${fixPid}`, 'PATCH', { links: {} });
const badOwner = await call(`/projects/${fixPid}`, 'PATCH', { owner: 42 });
check('impossible dates, malformed links and a numeric owner are refused', badMonth.status === 400 && badDay.status === 400 && badMsDate.status === 400 && badLinks.status === 400 && badOwner.status === 400);
const fakeLog = (await (await fetch('http://localhost:4010/__stats')).json()).log;
check('a reply that changes status says so in the commit message', fakeLog.some((m) => /reply and set todo on Stuck on a key/.test(m)));
await call(`/repos/${trackedRepo?.id}`, 'DELETE');
await call(`/projects/${gatedPid}`, 'DELETE');
await call(`/projects/${templated.body.created[0].id}`, 'DELETE');
await call(`/projects/${otherProject.created[0].id}`, 'DELETE');
await call(`/projects/${fixPid}`, 'DELETE');

await fetch('http://localhost:4010/__test/legacy');
const legacyRead = await call('/projects');
check('validated pre-versioned records remain readable', legacyRead.status === 200 && legacyRead.body.projects?.some((p) => p.id === 'legacy-fixture'));
const legacyWrite = await call('/projects/legacy-fixture', 'PATCH', { summary: 'migrated safely' }, { ...json, 'Idempotency-Key': `legacy-${stamp}` });
const legacyReplay = await call('/projects/legacy-fixture', 'PATCH', { summary: 'migrated safely' }, { ...json, 'Idempotency-Key': `legacy-${stamp}` });
const legacyDetail = await call('/projects/legacy-fixture');
const legacyFiles = await (await fetch('http://localhost:4010/__test/files')).json();
const legacyChecks = { write: legacyWrite.status === 200, replay: legacyReplay.status === 200, topField: legacyDetail.body.preservedTopField === 'keep', projectField: legacyDetail.body.project.preservedProjectField === 'keep', repos: legacyFiles.paths.includes('repos.json'), operations: legacyFiles.paths.includes('operations.json') };
check('legacy mutation writes metadata and preserves unknown fields', Object.values(legacyChecks).every(Boolean), JSON.stringify(legacyChecks));

await fetch('http://localhost:4010/__test/public');
const publicStore = await call('/projects');
check('public data repository fails closed', publicStore.status === 503 && /Refusing to use public/.test(publicStore.body.error));
await fetch('http://localhost:4010/__test/private');
await fetch('http://localhost:4010/__test/drop-main');
const missingBranch = await call('/projects');
check('missing data branch fails closed', missingBranch.status === 500 && /refusing to treat it as empty/.test(missingBranch.body.error));

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
