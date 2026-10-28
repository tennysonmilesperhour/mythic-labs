// End-to-end smoke test for the git-backed store and the agent API.
// Start the fake (node scripts/fake-github.mjs), then the app with
//   GITHUB_TOKEN=fake GITHUB_API_URL=http://localhost:4010 PM_AGENT_API_ENABLED=true PM_AGENT_TOKEN=smoke-token npm run build && npm start
// and run: node scripts/smoke.mjs [http://localhost:3000]
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
