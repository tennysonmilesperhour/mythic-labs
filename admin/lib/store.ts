import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { gh } from "./github";
import { renderProjectMarkdown, type ProjectDetail } from "./projectTypes";

/**
 * The dashboard's data lives as files in git, not a database.
 *
 *   projects/<id>.json   one project: its plan, log and settings
 *   projects/<id>.md     the same project rendered for humans and agents
 *   repos.json           the Repos page's tracked exceptions
 *
 * They live on a branch of a PRIVATE repo, created on first write. Every
 * change is one commit; the history is the audit log. Writes to a public repo
 * are refused: the data includes private repo names and descriptions.
 *
 *   PM_DATA_REPO    owner/repo        (required; must be private)
 *   PM_DATA_BRANCH  branch            (default: roadmap-data)
 *   PM_DATA_DIR     local directory   (dev only: use files on disk, no GitHub)
 */

export type TrackedRepo = {
  id: string;
  owner: string;
  repo: string;
  default_branch: string;
  is_fork: boolean | null;
  last_applied_at: string | null;
  last_applied_sha: string | null;
  created_at: string;
};

export type ReposFile = {
  repos: TrackedRepo[];
  plugins: Record<string, Record<string, boolean>>;
};

export type Snapshot = {
  head: string | null;
  projects: Map<string, ProjectDetail>;
  repos: ReposFile;
};

type Change = { path: string; content: string | null };

class StaleHead extends Error {}

export const newId = () => randomUUID();

// ─────────── backends ───────────

interface Backend {
  read(): Promise<{ head: string | null; files: Map<string, string> }>;
  /** Commit on top of `head`; throws StaleHead if the branch moved. */
  write(head: string | null, changes: Change[], message: string): Promise<string>;
  describe(): string;
}

const wanted = (p: string) => p === "repos.json" || /^projects\/[\w-]+\.json$/.test(p);

/** Git's blob id for a text, so the cache can match tree entries without refetching. */
const blobSha = (text: string) => {
  const buf = Buffer.from(text, "utf8");
  return createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
};

export class StoreNotConfigured extends Error {}

function githubBackend(): Backend {
  const target = process.env.PM_DATA_REPO || "";
  const [owner, repo] = target.split("/");
  const branch = process.env.PM_DATA_BRANCH || "roadmap-data";
  const configured = () => {
    if (!owner || !repo) {
      throw new StoreNotConfigured("Set PM_DATA_REPO to a private repo (owner/repo) for dashboard data.");
    }
  };
  // Checked once per warm function, before the first write.
  let verifiedPrivate = false;
  const assertPrivate = async () => {
    if (verifiedPrivate) return;
    const meta = await gh().repos.get({ owner, repo });
    if (!meta.data.private) {
      throw new StoreNotConfigured(
        `Refusing to write dashboard data to ${owner}/${repo}: it is public, and the data includes private repo names and descriptions. Point PM_DATA_REPO at a private repo.`
      );
    }
    verifiedPrivate = true;
  };
  // Blob cache survives across requests in a warm function: only changed files are refetched.
  const blobs = new Map<string, string>();
  const treeOf = new Map<string, string>(); // commit sha → tree sha
  let last: { head: string; files: Map<string, string> } | null = null;

  return {
    describe: () => `github:${owner}/${repo}@${branch}`,

    async read() {
      configured();
      let head: string;
      try {
        const ref = await gh().git.getRef({ owner, repo, ref: `heads/${branch}` });
        head = ref.data.object.sha;
      } catch (err: unknown) {
        if ((err as { status?: number }).status === 404) return { head: null, files: new Map() };
        throw err;
      }
      if (last?.head === head) return last;

      const commit = await gh().git.getCommit({ owner, repo, commit_sha: head });
      treeOf.set(head, commit.data.tree.sha);
      const tree = await gh().git.getTree({ owner, repo, tree_sha: commit.data.tree.sha, recursive: "true" });
      if (tree.data.truncated) throw new Error("roadmap data tree too large for one read");
      const entries = tree.data.tree.filter((e) => e.type === "blob" && e.path && e.sha && wanted(e.path));
      const files = new Map<string, string>();
      await Promise.all(
        entries.map(async (e) => {
          let text = blobs.get(e.sha!);
          if (text === undefined) {
            const b = await gh().git.getBlob({ owner, repo, file_sha: e.sha! });
            text = Buffer.from(b.data.content, "base64").toString("utf8");
            blobs.set(e.sha!, text);
          }
          files.set(e.path!, text);
        })
      );
      last = { head, files };
      return last;
    },

    async write(head, changes, message) {
      configured();
      await assertPrivate();
      const tree = await gh().git.createTree({
        owner,
        repo,
        ...(head
          ? { base_tree: treeOf.get(head) ?? (await gh().git.getCommit({ owner, repo, commit_sha: head })).data.tree.sha }
          : {}),
        tree: changes.map((c) =>
          c.content === null
            ? { path: c.path, mode: "100644" as const, type: "blob" as const, sha: null }
            : { path: c.path, mode: "100644" as const, type: "blob" as const, content: c.content }
        ),
      });
      const commit = await gh().git.createCommit({
        owner,
        repo,
        message,
        tree: tree.data.sha,
        parents: head ? [head] : [],
      });
      try {
        if (head) {
          await gh().git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: commit.data.sha, force: false });
        } else {
          await gh().git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: commit.data.sha });
        }
      } catch (err: unknown) {
        // 422: not a fast-forward (someone else committed) or the branch now exists.
        if ((err as { status?: number }).status === 422) throw new StaleHead();
        throw err;
      }
      treeOf.set(commit.data.sha, tree.data.sha);
      // Seed the blob cache so the next read only fetches ref, commit and tree.
      for (const c of changes) if (c.content !== null && wanted(c.path)) blobs.set(blobSha(c.content), c.content);
      last = null;
      return commit.data.sha;
    },
  };
}

function diskBackend(dir: string): Backend {
  const walk = async (rel: string): Promise<string[]> => {
    const abs = path.join(dir, rel);
    const ents = await fs.readdir(abs, { withFileTypes: true }).catch(() => []);
    const out: string[] = [];
    for (const e of ents) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) out.push(...(await walk(p)));
      else out.push(p);
    }
    return out;
  };
  return {
    describe: () => `disk:${dir}`,
    async read() {
      const files = new Map<string, string>();
      for (const p of (await walk("")).filter(wanted)) files.set(p, await fs.readFile(path.join(dir, p), "utf8"));
      return { head: "disk", files };
    },
    async write(_head, changes) {
      for (const c of changes) {
        const abs = path.join(dir, c.path);
        if (c.content === null) await fs.rm(abs, { force: true });
        else {
          await fs.mkdir(path.dirname(abs), { recursive: true });
          await fs.writeFile(abs, c.content);
        }
      }
      return "disk";
    },
  };
}

let backend: Backend | null = null;
function store(): Backend {
  if (!backend) backend = process.env.PM_DATA_DIR ? diskBackend(process.env.PM_DATA_DIR) : githubBackend();
  return backend;
}

export function storeLocation(): string {
  return store().describe();
}

// ─────────── snapshot ───────────

const EMPTY_REPOS: ReposFile = { repos: [], plugins: {} };

function parse(head: string | null, files: Map<string, string>): Snapshot {
  const projects = new Map<string, ProjectDetail>();
  files.forEach((text, p) => {
    if (!p.startsWith("projects/")) return;
    const d = JSON.parse(text) as ProjectDetail;
    projects.set(d.project.id, d);
  });
  const repos = files.has("repos.json") ? (JSON.parse(files.get("repos.json")!) as ReposFile) : EMPTY_REPOS;
  return { head, projects, repos };
}

export async function readSnapshot(): Promise<Snapshot> {
  const { head, files } = await store().read();
  return parse(head, files);
}

/** Stable, diff-friendly JSON: children in creation order, two-space indent. */
function serialize(d: ProjectDetail): string {
  const byCreated = <T extends { created_at: string }>(xs: T[]) =>
    [...xs].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return (
    JSON.stringify(
      { project: d.project, milestones: byCreated(d.milestones), tasks: byCreated(d.tasks), entries: byCreated(d.entries) },
      null,
      2
    ) + "\n"
  );
}

const BRANCH_README = `# Roadmap data

Written by the Mythic Labs dashboard (admin/ in the brain repo). Every change
is a commit, so \`git log\` is the audit trail.

- \`projects/<id>.json\`: one project's plan, log and settings (source of truth)
- \`projects/<id>.md\`: the same project as Markdown, for people and agents
- \`repos.json\`: the Repos page's tracked exceptions

Edit through the dashboard or its agent API, not by hand: the dashboard
rejects stale writes, but a hand edit can still race it.
`;

/**
 * Apply `fn` to a fresh draft and commit what changed, retrying on top of the
 * new head if someone else committed first. `fn` must be safe to run twice:
 * do validation inside it and throw to abort.
 */
export async function mutate<T>(
  message: string | ((result: T, draft: Snapshot) => string),
  fn: (draft: Snapshot) => T
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const base = await readSnapshot();
    const draft: Snapshot = structuredClone(base);
    const result = fn(draft);

    const changes: Change[] = [];
    draft.projects.forEach((d, id) => {
      const before = base.projects.get(id);
      const text = serialize(d);
      if (before && serialize(before) === text) return;
      changes.push({ path: `projects/${id}.json`, content: text });
      changes.push({ path: `projects/${id}.md`, content: renderProjectMarkdown(d, { ids: true }) });
    });
    base.projects.forEach((_d, id) => {
      if (draft.projects.has(id)) return;
      changes.push({ path: `projects/${id}.json`, content: null }, { path: `projects/${id}.md`, content: null });
    });
    if (JSON.stringify(draft.repos) !== JSON.stringify(base.repos)) {
      changes.push({ path: "repos.json", content: JSON.stringify(draft.repos, null, 2) + "\n" });
    }
    if (!changes.length) return result;
    if (!base.head) changes.push({ path: "README.md", content: BRANCH_README });

    try {
      await store().write(base.head, changes, typeof message === "string" ? message : message(result, draft));
      return result;
    } catch (err: unknown) {
      if (!(err instanceof StaleHead) || attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 150 + Math.random() * 350 * (attempt + 1)));
    }
  }
}
