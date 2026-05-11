-- Mythic Labs Brain Admin · initial schema
-- Run in Supabase SQL editor, or apply via `supabase db push`.
-- Designed to work today as single-admin and grow into multi-user with minimal change.

-- =============================================================================
-- USERS (placeholder for the eventual auth.users link)
-- =============================================================================
-- For v1 we hardcode one admin UUID. When real auth lands, drop this table and
-- point repos.user_id at auth.users(id) instead. The column type stays the same.

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  github_handle text,
  display_name text,
  created_at timestamptz not null default now()
);

-- Seed the single admin user so v1 has something to FK against.
insert into public.users (id, github_handle, display_name)
values (
  '00000000-0000-0000-0000-000000000001',
  'tennysonmilesperhour',
  'Admin'
)
on conflict (id) do nothing;

-- =============================================================================
-- REPOS
-- =============================================================================
create table if not exists public.repos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  owner text not null,
  repo text not null,
  default_branch text not null default 'main',
  last_applied_at timestamptz,
  last_applied_sha text,
  created_at timestamptz not null default now(),
  unique (user_id, owner, repo)
);

create index if not exists repos_user_id_idx on public.repos(user_id);

-- =============================================================================
-- REPO ↔ PLUGIN ENABLEMENT
-- =============================================================================
create table if not exists public.repo_plugins (
  repo_id uuid not null references public.repos(id) on delete cascade,
  plugin_slug text not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (repo_id, plugin_slug)
);

create index if not exists repo_plugins_repo_id_idx on public.repo_plugins(repo_id);

-- =============================================================================
-- RLS
-- =============================================================================
-- Service role bypasses RLS, which is what the admin app uses. We still enable
-- RLS so that when we add user-facing auth, no rows accidentally leak.

alter table public.users enable row level security;
alter table public.repos enable row level security;
alter table public.repo_plugins enable row level security;

-- Once real auth is on, these policies become "auth.uid() = user_id" etc.
-- For now, no anon/authenticated policies exist — only service_role can read/write.
