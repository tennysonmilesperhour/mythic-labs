import { mutate, newId, readSnapshot, storeLocation, type TrackedRepo } from "./store";

// The Repos page's tracked exceptions, stored in repos.json alongside the
// project files (see store.ts).

export type Repo = TrackedRepo;

export type RepoPlugin = {
  repo_id: string;
  plugin_slug: string;
  enabled: boolean;
};

/** A presentation-safe description of the configured project repository. */
export function dataSourceLabel(): string {
  return storeLocation().startsWith("disk:") ? "local files" : "GitHub";
}

export async function listRepos(): Promise<Repo[]> {
  const { repos } = await readSnapshot();
  return [...repos.repos].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function addRepo(
  owner: string,
  repo: string,
  meta?: { is_fork?: boolean; default_branch?: string }
): Promise<Repo> {
  const o = owner.trim();
  const r = repo.trim();
  return mutate(`Track repo ${o}/${r}`, (s) => {
    const key = `${o}/${r}`.toLowerCase();
    if (s.repos.repos.some((x) => `${x.owner}/${x.repo}`.toLowerCase() === key)) {
      throw new Error("already tracked");
    }
    const row: Repo = {
      id: newId(),
      owner: o,
      repo: r,
      default_branch: meta?.default_branch || "main",
      is_fork: meta?.is_fork ?? null,
      last_applied_at: null,
      last_applied_sha: null,
      created_at: new Date().toISOString(),
    };
    s.repos.repos.push(row);
    return row;
  });
}

export async function backfillRepoMeta(
  repoId: string,
  meta: { is_fork: boolean; default_branch: string }
): Promise<void> {
  await mutate("Backfill repo metadata", (s) => {
    const row = s.repos.repos.find((x) => x.id === repoId);
    if (row) Object.assign(row, meta);
  });
}

export async function deleteRepo(id: string): Promise<void> {
  await mutate("Untrack repo", (s) => {
    s.repos.repos = s.repos.repos.filter((x) => x.id !== id);
    delete s.repos.plugins[id];
  });
}

export async function listRepoPlugins(repoId: string): Promise<RepoPlugin[]> {
  const { repos } = await readSnapshot();
  return Object.entries(repos.plugins[repoId] || {}).map(([plugin_slug, enabled]) => ({
    repo_id: repoId,
    plugin_slug,
    enabled,
  }));
}

export async function setRepoPlugin(
  repoId: string,
  slug: string,
  enabled: boolean
): Promise<void> {
  await mutate(`${enabled ? "Enable" : "Disable"} ${slug} for a tracked repo`, (s) => {
    if (!s.repos.repos.some((x) => x.id === repoId)) throw new Error("repo not tracked");
    s.repos.plugins[repoId] = { ...(s.repos.plugins[repoId] || {}), [slug]: enabled };
  });
}
