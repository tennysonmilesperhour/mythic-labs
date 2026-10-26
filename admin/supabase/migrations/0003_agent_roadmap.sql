-- Mythic Labs Brain Admin · agent-ready roadmap
-- Run after 0002_project_manager.sql. Additive only.
--
-- Gives autonomous build agents what they need to work from the plan without
-- asking: per-project build instructions, acceptance criteria and dependencies
-- on tasks, claim timestamps, and attributed progress entries.

alter table public.mythic_projects
  add column if not exists agent_instructions text not null default '';

alter table public.mythic_tasks
  add column if not exists acceptance text not null default '',
  add column if not exists depends_on uuid[] not null default '{}',
  add column if not exists claimed_at timestamptz;

alter table public.mythic_project_entries
  add column if not exists author text;

-- New entry kind: "progress" (an agent's or your running log on the work).
alter table public.mythic_project_entries
  drop constraint if exists mythic_project_entries_kind_check;
alter table public.mythic_project_entries
  add constraint mythic_project_entries_kind_check
  check (kind in ('changelog', 'decision', 'note', 'status', 'progress'));
