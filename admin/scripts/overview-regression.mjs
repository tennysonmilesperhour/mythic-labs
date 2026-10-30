import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/projectTypes.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { computeAttention, isUpcoming } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const old = new Date(Date.now() - 5 * 86400000).toISOString();
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const activeProject = {
  id: 'test-project', name: 'Test project', status: 'active', priority: 'medium',
  next_action: 'Review the plan', agents: [], agent_instructions: '',
};
const task = {
  id: 'test-task', project_id: activeProject.id, title: 'Stalled overdue task',
  status: 'doing', priority: 'high', due_date: yesterday, updated_at: old,
};
const detail = { project: activeProject, tasks: [task], milestones: [], entries: [] };
const flags = computeAttention(detail, old).map((a) => a.key.split(':')[1]);
assert(flags.includes('overdue'), 'overdue task must keep its overdue attention flag');
assert(flags.includes('stalled'), 'stalled overdue task must also keep its stalled attention flag');

const paused = {
  ...detail,
  project: { ...activeProject, status: 'paused', status_changed_at: new Date().toISOString() },
};
assert.deepEqual(computeAttention(paused, old).filter((a) => a.task_id), [], 'paused tasks must not create task-level attention flags');

const today = new Date().toISOString().slice(0, 10);
const soon = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
assert.equal(isUpcoming(yesterday, 'doing', soon, today), false, 'past-due dates must not crowd upcoming work');
assert.equal(isUpcoming(today, 'todo', soon, today), true, 'work due today remains upcoming');
assert.equal(isUpcoming(soon, 'doing', soon, today), true, 'work due at the end of the window remains upcoming');
assert.equal(isUpcoming(today, 'done', soon, today), false, 'completed work is not upcoming');

const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
assert(!page.includes('from "@/lib/store"'), 'dashboard page must not import the storage implementation');
assert(page.includes('dataSourceLabel'), 'dashboard must use the repository abstraction for its source label');
console.log('overview regressions passed');
