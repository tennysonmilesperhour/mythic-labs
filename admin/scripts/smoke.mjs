// End-to-end smoke test for the git-backed store and the agent API.
// Start the fake (node scripts/fake-github.mjs), then the app with
//   GITHUB_TOKEN=fake GITHUB_API_URL=http://localhost:4010 PM_AGENT_API_ENABLED=true PM_AGENT_TOKEN=smoke-token npm run build && npm start
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
const { body: weekly } = await call(`/projects/${planPid}/tasks`, 'POST', { title: 'Weekly dependency update', recurrence: 'weekly', due_date: '2026-11-02', estimate: 3, labels: ['chore', '#ops', 'chore'] });
check('labels are deduplicated and stripped of #', JSON.stringify(weekly.task.labels) === JSON.stringify(['chore', 'ops']) && weekly.task.estimate === 3);
const finished = await call(`/tasks/${weekly.task.id}`, 'PATCH', { status: 'done' });
check('finishing a recurring task spawns the next occurrence a week later',
  finished.status === 200 && finished.body.task.status === 'done' && finished.body.task.recurrence === null &&
  finished.body.spawned?.status === 'todo' && finished.body.spawned.due_date === '2026-11-09' && finished.body.spawned.recurrence === 'weekly' && finished.body.spawned.estimate === 3);
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
const snoozed = await call(`/tasks/${a.task.id}`, 'PATCH', { snoozed_until: '2999-01-01' });
check('snoozed tasks leave today and the attention list', snoozed.status === 200 && snoozed.body.task.snoozed_until === '2999-01-01');
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
check('reorder writes the new sequence', reorder.status === 200 && JSON.stringify(ordered) === JSON.stringify(['Bulk B', 'Bulk A']));

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
