// End-to-end smoke test for the git-backed store and the agent API.
// Start the fake (node scripts/fake-github.mjs), then the app with
//   GITHUB_TOKEN=fake GITHUB_API_URL=http://localhost:4010 PM_AGENT_TOKEN=smoke-token npm run build && npm start
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
const { body: made } = await call('/projects', 'POST', { name: `Smoke ${stamp}`, status: 'active', agents: [] });
const pid = made.created[0].id;
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

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
