import { Octokit } from "@octokit/rest";

let cached: Octokit | null = null;

export function gh(): Octokit {
  if (cached) return cached;
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN env var missing.");
  }
  cached = new Octokit({ auth: token });
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
