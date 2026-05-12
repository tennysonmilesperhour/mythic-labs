import { serviceClient, ADMIN_USER_ID } from "./supabase";

// Tables live in public with a "mythic_" prefix so this app can co-tenant
// inside an existing Supabase project. See supabase/migrations/0001_initial_schema.sql.
const T_REPOS = "mythic_repos";
const T_REPO_PLUGINS = "mythic_repo_plugins";

export type Repo = {
  id: string;
  user_id: string;
  owner: string;
  repo: string;
  default_branch: string;
  is_fork: boolean | null;
  last_applied_at: string | null;
  last_applied_sha: string | null;
  created_at: string;
};

export type RepoPlugin = {
  repo_id: string;
  plugin_slug: string;
  enabled: boolean;
};

export async function listRepos(): Promise<Repo[]> {
  const db = serviceClient();
  const { data, error } = await db
    .from(T_REPOS)
    .select("*")
    .eq("user_id", ADMIN_USER_ID)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as Repo[];
}

export async function addRepo(
  owner: string,
  repo: string,
  meta?: { is_fork?: boolean; default_branch?: string }
): Promise<Repo> {
  const db = serviceClient();
  const row: Record<string, unknown> = {
    user_id: ADMIN_USER_ID,
    owner: owner.trim(),
    repo: repo.trim(),
  };
  if (meta?.is_fork !== undefined) row.is_fork = meta.is_fork;
  if (meta?.default_branch) row.default_branch = meta.default_branch;
  const { data, error } = await db
    .from(T_REPOS)
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data as Repo;
}

export async function backfillRepoMeta(
  repoId: string,
  meta: { is_fork: boolean; default_branch: string }
): Promise<void> {
  const db = serviceClient();
  const { error } = await db
    .from(T_REPOS)
    .update({
      is_fork: meta.is_fork,
      default_branch: meta.default_branch,
    })
    .eq("id", repoId);
  if (error) throw error;
}

export async function deleteRepo(id: string): Promise<void> {
  const db = serviceClient();
  const { error } = await db
    .from(T_REPOS)
    .delete()
    .eq("id", id)
    .eq("user_id", ADMIN_USER_ID);
  if (error) throw error;
}

export async function listRepoPlugins(repoId: string): Promise<RepoPlugin[]> {
  const db = serviceClient();
  const { data, error } = await db
    .from(T_REPO_PLUGINS)
    .select("*")
    .eq("repo_id", repoId);
  if (error) throw error;
  return (data || []) as RepoPlugin[];
}

export async function setRepoPlugin(
  repoId: string,
  slug: string,
  enabled: boolean
): Promise<void> {
  const db = serviceClient();
  const { error } = await db
    .from(T_REPO_PLUGINS)
    .upsert(
      { repo_id: repoId, plugin_slug: slug, enabled },
      { onConflict: "repo_id,plugin_slug" }
    );
  if (error) throw error;
}

export async function markApplied(
  repoId: string,
  sha: string
): Promise<void> {
  const db = serviceClient();
  const { error } = await db
    .from(T_REPOS)
    .update({
      last_applied_at: new Date().toISOString(),
      last_applied_sha: sha,
    })
    .eq("id", repoId);
  if (error) throw error;
}
