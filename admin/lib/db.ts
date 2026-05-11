import { serviceClient, ADMIN_USER_ID } from "./supabase";

export type Repo = {
  id: string;
  user_id: string;
  owner: string;
  repo: string;
  default_branch: string;
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
    .from("repos")
    .select("*")
    .eq("user_id", ADMIN_USER_ID)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as Repo[];
}

export async function addRepo(owner: string, repo: string): Promise<Repo> {
  const db = serviceClient();
  const { data, error } = await db
    .from("repos")
    .insert({
      user_id: ADMIN_USER_ID,
      owner: owner.trim(),
      repo: repo.trim(),
    })
    .select()
    .single();
  if (error) throw error;
  return data as Repo;
}

export async function deleteRepo(id: string): Promise<void> {
  const db = serviceClient();
  const { error } = await db
    .from("repos")
    .delete()
    .eq("id", id)
    .eq("user_id", ADMIN_USER_ID);
  if (error) throw error;
}

export async function listRepoPlugins(repoId: string): Promise<RepoPlugin[]> {
  const db = serviceClient();
  const { data, error } = await db
    .from("repo_plugins")
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
    .from("repo_plugins")
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
    .from("repos")
    .update({
      last_applied_at: new Date().toISOString(),
      last_applied_sha: sha,
    })
    .eq("id", repoId);
  if (error) throw error;
}
