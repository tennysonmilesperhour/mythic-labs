-- Mythic Labs Brain Admin · project manager
-- Run after 0001_initial_schema.sql (SQL editor, or Supabase MCP `apply_migration`).
--
-- One row per thing you're building (usually a repo). Each project carries a
-- plan (milestones → tasks → subtasks), a changelog, a decision log and notes.
-- Same conventions as 0001: public schema, "mythic_" prefix, service-role only.

-- =============================================================================
-- PROJECTS
-- =============================================================================
create table if not exists public.mythic_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.mythic_users(id) on delete cascade,
  name text not null,
  owner text,
  repo text,
  status text not null default 'planned'
    check (status in ('active', 'building', 'paused', 'planned')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),
  summary text not null default '',
  description text not null default '',
  next_action text not null default '',
  tags text[] not null default '{}',
  agents text[] not null default '{}',
  tools text[] not null default '{}',
  links jsonb not null default '[]'::jsonb,   -- [{ "label": "Prod", "url": "https://…" }]
  start_date date,
  target_date date,
  status_changed_at timestamptz not null default now(),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mythic_projects_user_id_idx on public.mythic_projects(user_id);
create unique index if not exists mythic_projects_user_repo_uq
  on public.mythic_projects(user_id, lower(owner), lower(repo))
  where owner is not null and repo is not null;

-- =============================================================================
-- MILESTONES (the timeline)
-- =============================================================================
create table if not exists public.mythic_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.mythic_projects(id) on delete cascade,
  title text not null,
  description text not null default '',
  start_date date,
  target_date date,
  done boolean not null default false,
  done_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists mythic_milestones_project_id_idx on public.mythic_milestones(project_id);

-- =============================================================================
-- TASKS (nested via parent_id for subtasks)
-- =============================================================================
create table if not exists public.mythic_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.mythic_projects(id) on delete cascade,
  milestone_id uuid references public.mythic_milestones(id) on delete set null,
  parent_id uuid references public.mythic_tasks(id) on delete cascade,
  title text not null,
  notes text not null default '',
  status text not null default 'todo'
    check (status in ('todo', 'doing', 'blocked', 'done')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),
  agent text,
  due_date date,
  done_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mythic_tasks_project_id_idx on public.mythic_tasks(project_id);
create index if not exists mythic_tasks_parent_id_idx on public.mythic_tasks(parent_id);
create index if not exists mythic_tasks_milestone_id_idx on public.mythic_tasks(milestone_id);

-- =============================================================================
-- ENTRIES (changelog, decisions, notes, status changes)
-- =============================================================================
create table if not exists public.mythic_project_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.mythic_projects(id) on delete cascade,
  kind text not null check (kind in ('changelog', 'decision', 'note', 'status')),
  title text not null,
  body text not null default '',
  entry_date date not null default current_date,
  -- changelog
  version text,
  change_type text check (change_type in ('added', 'changed', 'fixed', 'removed', 'security')),
  source_url text,
  -- decision (lightweight ADR)
  decision_status text check (decision_status in ('proposed', 'accepted', 'superseded', 'rejected')),
  context text not null default '',
  alternatives text not null default '',
  consequences text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists mythic_project_entries_project_id_idx
  on public.mythic_project_entries(project_id, kind);
create unique index if not exists mythic_project_entries_source_uq
  on public.mythic_project_entries(project_id, source_url)
  where source_url is not null;

-- =============================================================================
-- RLS (service role bypasses; matches 0001)
-- =============================================================================
alter table public.mythic_projects enable row level security;
alter table public.mythic_milestones enable row level security;
alter table public.mythic_tasks enable row level security;
alter table public.mythic_project_entries enable row level security;
