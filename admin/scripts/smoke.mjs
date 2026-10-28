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
const idem = `smoke-${stamp}`;
const idempotentPayload = { name: `Receipt ${stamp}`, status: 'active' };
const firstReceipt = await call('/projects', 'POST', idempotentPayload, { ...json, 'Idempotency-Key': idem });
const replayReceipt = await call('/projects', 'POST', idempotentPayload, { ...json, 'Idempotency-Key': idem });
check('same idempotency key replays the original result', firstReceipt.body.created?.[0]?.id === replayReceipt.body.created?.[0]?.id);
const reusedKey = await call('/projects', 'POST', { ...idempotentPayload, name: `Different ${stamp}` }, { ...json, 'Idempotency-Key': idem });
check('same key with different payload is rejected', reusedKey.status === 409);
const { body: made } = await call('/projects', 'POST', { name: `Smoke ${stamp}`, status: 'active', agents: [] });
const pid = made.created[0].id;
const { body: paused } = await call('/projects', 'POST', { name: `Paused ${stamp}`, status: 'paused', agents: [] });
const { body: pausedTask } = await call(`/projects/${paused.created[0].id}/tasks`, 'POST', { title: 'Must not be claimed' });
const pausedClaim = await call(`/agent/tasks/${pausedTask.task.id}/claim`, 'POST', undefined, agent('a1'));
check('paused project task cannot be claimed', pausedClaim.status === 409);
const { body: dep } = await call(`/projects/${pid}/tasks`, 'POST', { title: 'First', acceptance: 'exists' });
const { body: after } = await call(`/projects/${pid}/tasks`, 'POST', { title: 'Second', depends_on: [dep.task.id] });

const next1 = await call(`/agent/next?project=${pid}`, 'GET', undefined, agent('a1'));
check('next returns the unblocked task', next1.body.task?.id === dep.task.id, next1.body.task?.title);

const claims = await Promise.all(['a1', 'a2', 'a3', 'a4', 'a5'].map((a) =>
  call(`/agent/tasks/${dep.task.id}/claim`, 'POST', undefined, agent(a))));
const wins = claims.filter((c) => c.status === 200).length;
check('exactly one of five parallel claims wins', wins === 1, `${wins} won`);
check('losers get 409', claims.filter((c) => c.status === 409).length === 4);

const early = await call(`/agent/tasks/${after.task.id}/claim`, 'POST', undefined, agent('a2'));
check('claiming a task with an open dependency is 409', early.status === 409);

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

await fetch('http://localhost:4010/__test/public');
const publicStore = await call('/projects');
check('public data repository fails closed', publicStore.status === 503 && /Refusing to use public/.test(publicStore.body.error));
await fetch('http://localhost:4010/__test/private');
await fetch('http://localhost:4010/__test/drop-main');
const missingBranch = await call('/projects');
check('missing data branch fails closed', missingBranch.status === 500 && /refusing to treat it as empty/.test(missingBranch.body.error));

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
