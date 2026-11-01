import { Octokit } from "@octokit/rest";

let cached: Octokit | null = null;

export function gh(): Octokit {
  if (cached) return cached;
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN env var missing.");
  }
  // PM_GITHUB_API_URL points at the fake GitHub in the smoke test; it wins over
  // GITHUB_API_URL (GitHub Enterprise), which GitHub Actions sets to api.github.com
  // on every job and does not let a workflow override.
  cached = new Octokit({ auth: token, baseUrl: process.env.PM_GITHUB_API_URL || process.env.GITHUB_API_URL || undefined });
  return cached;
}

export const BRAIN_OWNER = process.env.BRAIN_OWNER || "tennysonmilesperhour";
export const BRAIN_REPO = process.env.BRAIN_REPO || "mythic-labs";

/**
 * Read a file from any repo via the GitHub API. Returns null if not found.
 */
export async function readFile(
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<{ content: string; sha: string } | null> {
  try {
    const res = await gh().repos.getContent({ owner, repo, path, ref });
    const data = res.data as { type?: string; content?: string; sha?: string };
    if (data.type !== "file" || !data.content || !data.sha) return null;
    return {
      content: Buffer.from(data.content, "base64").toString("utf8"),
      sha: data.sha,
    };
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 404) return null;
    throw err;
  }
}

/**
 * Write (create or update) a file in any repo. Auto-detects existing sha.
 */
export async function writeFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch?: string
): Promise<{ commitSha: string; blobSha: string }> {
  const existing = await readFile(owner, repo, path, branch);
  const res = await gh().repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    sha: existing?.sha,
    branch,
  });
  return {
    commitSha: res.data.commit.sha || "",
    blobSha: res.data.content?.sha || "",
  };
}

/**
 * Fetch basic metadata for a repo: fork status + default branch.
 * Returns null if the repo is inaccessible (private + token doesn't have access, or doesn't exist).
 */
export async function getRepoMeta(
  owner: string,
  repo: string
): Promise<{ is_fork: boolean; default_branch: string } | null> {
  try {
    const res = await gh().repos.get({ owner, repo });
    return {
      is_fork: !!res.data.fork,
      default_branch: res.data.default_branch || "main",
    };
  } catch {
    return null;
  }
}

/**
 * Read a directory listing from a repo.
 */
export async function readDir(
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<Array<{ name: string; type: string; path: string }>> {
  try {
    const res = await gh().repos.getContent({ owner, repo, path, ref });
    if (!Array.isArray(res.data)) return [];
    return res.data.map((d) => ({ name: d.name, type: d.type, path: d.path }));
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 404) return [];
    throw err;
  }
}

/**
 * Every repo the token can see (owned, collaborator, org member). Used to
 * import repos into the project manager.
 */
export async function listMyRepos(): Promise<
  Array<{
    owner: string;
    repo: string;
    description: string;
    pushed_at: string | null;
    fork: boolean;
    archived: boolean;
    private: boolean;
  }>
> {
  const repos = await gh().paginate(gh().repos.listForAuthenticatedUser, {
    per_page: 100,
    sort: "pushed",
    affiliation: "owner,collaborator,organization_member",
  });
  return repos.map((r) => ({
    owner: r.owner.login,
    repo: r.name,
    description: r.description || "",
    pushed_at: r.pushed_at || null,
    fork: !!r.fork,
    archived: !!r.archived,
    private: !!r.private,
  }));
}

/**
 * Recent activity for a project's repo: merged PRs, commits, latest release.
 * Read-only; feeds the changelog importer.
 */
export async function repoActivity(owner: string, repo: string) {
  const [meta, pulls, commits, release] = await Promise.all([
    gh().repos.get({ owner, repo }),
    gh().pulls.list({ owner, repo, state: "closed", sort: "updated", direction: "desc", per_page: 30 }),
    gh().repos.listCommits({ owner, repo, per_page: 20 }),
    gh().repos.getLatestRelease({ owner, repo }).catch(() => null),
  ]);
  return {
    html_url: meta.data.html_url,
    homepage: meta.data.homepage || null,
    default_branch: meta.data.default_branch,
    open_issues: meta.data.open_issues_count,
    pushed_at: meta.data.pushed_at,
    latest_release: release
      ? { tag: release.data.tag_name, url: release.data.html_url, published_at: release.data.published_at }
      : null,
    merged_pulls: pulls.data
      .filter((p) => p.merged_at)
      .map((p) => ({
        number: p.number,
        title: p.title,
        url: p.html_url,
        merged_at: p.merged_at as string,
        body: (p.body || "").slice(0, 500),
      })),
    commits: commits.data.map((c) => ({
      sha: c.sha.slice(0, 7),
      title: c.commit.message.split("\n")[0],
      url: c.html_url,
      date: c.commit.author?.date || null,
    })),
  };
}
