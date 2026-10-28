import { createHash, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
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
 * The destination is a separately configured, already-private repository.
 * Every change is one commit; the history is the audit log.
 *
 *   PM_DATA_OWNER   owner             (required)
 *   PM_DATA_REPO    repository        (required)
 *   PM_DATA_BRANCH  existing branch   (required)
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
  schemaVersion: 1;
  repos: TrackedRepo[];
  plugins: Record<string, Record<string, boolean>>;
};

export type OperationReceipt = { payloadHash: string; result: unknown };

export type Snapshot = {
  head: string | null;
  projects: Map<string, ProjectDetail>;
  repos: ReposFile;
  operations: Record<string, OperationReceipt>;
  /** A validated pre-versioned snapshot; metadata is written on its first mutation. */
  legacyMetadataMigration: boolean;
};

type Change = { path: string; content: string | null };

class StaleHead extends Error {}
export class StoreNotConfigured extends Error { readonly status = 503; }
class StoreConflict extends Error { readonly status = 409; }

type RequestOperation = { id: string; payloadHash: string };
const requestOperation = new AsyncLocalStorage<RequestOperation>();

export function withRequestOperation<T>(id: string | undefined, payloadHash: string, fn: () => Promise<T> | T): Promise<T> {
  if (!id) return Promise.resolve(fn());
  if (!/^[\w.:-]{1,160}$/.test(id)) throw new Error("Invalid Idempotency-Key.");
  return Promise.resolve(requestOperation.run({ id, payloadHash }, fn));
}

export const newId = () => randomUUID();

// ─────────── backends ───────────

interface Backend {
  read(): Promise<{ head: string | null; files: Map<string, string> }>;
  /** Commit on top of `head`; throws StaleHead if the branch moved. */
  write(head: string | null, changes: Change[], message: string): Promise<string>;
  describe(): string;
}

const wanted = (p: string) => p === "repos.json" || p === "operations.json" || /^projects\/[\w-]+\.json$/.test(p);

/** Git's blob id for a text, so the cache can match tree entries without refetching. */
const blobSha = (text: string) => {
  const buf = Buffer.from(text, "utf8");
  return createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
};

function githubBackend(): Backend {
  const owner = process.env.PM_DATA_OWNER?.trim();
  const repo = process.env.PM_DATA_REPO?.trim();
  const branch = process.env.PM_DATA_BRANCH?.trim();
  if (!owner || !repo || !branch || owner.includes("/") || repo.includes("/")) {
    throw new StoreNotConfigured("Project storage requires independent PM_DATA_OWNER, PM_DATA_REPO, and PM_DATA_BRANCH values.");
  }
  if (process.env.VERCEL_ENV === "preview" && !branch.startsWith("preview/")) {
    throw new StoreNotConfigured("Preview deployments may use only a PM_DATA_BRANCH beginning with preview/.");
  }
  if (process.env.VERCEL_ENV === "production" && branch.startsWith("preview/")) {
    throw new StoreNotConfigured("Production deployments may not use a preview PM_DATA_BRANCH.");
  }
  // Blob cache survives across requests in a warm function: only changed files are refetched.
  const blobs = new Map<string, string>();
  const treeOf = new Map<string, string>(); // commit sha → tree sha
  let last: { head: string; files: Map<string, string> } | null = null;

  const verifyPrivateRepository = async () => {
    try {
      const result = await gh().repos.get({ owner, repo });
      if (!result.data.private) throw new StoreNotConfigured(`Refusing to use public project data repository ${owner}/${repo}.`);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) {
        throw new StoreNotConfigured(`GitHub authentication is not authorized to access private project data repository ${owner}/${repo}; no empty store was assumed.`);
      }
      if (status === 404) {
        throw new StoreNotConfigured(`Configured project data repository ${owner}/${repo} was not found or is not visible to the GitHub token; no empty store was assumed.`);
      }
      throw err;
    }
  };

  return {
    describe: () => `github:${owner}/${repo}@${branch}`,

    async read() {
      await verifyPrivateRepository();
      let head: string;
      try {
        const ref = await gh().git.getRef({ owner, repo, ref: `heads/${branch}` });
        head = ref.data.object.sha;
      } catch (err: unknown) {
        if ((err as { status?: number }).status === 404) {
          throw new Error(`Configured project data branch ${owner}/${repo}@${branch} is missing; refusing to treat it as empty.`);
        }
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
      await verifyPrivateRepository();
      if (!head) throw new Error("Refusing to initialize an empty project data branch; provision a reviewed snapshot first.");
      const tree = await gh().git.createTree({
        owner,
        repo,
        base_tree: treeOf.get(head) ?? (await gh().git.getCommit({ owner, repo, commit_sha: head })).data.tree.sha,
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
        parents: [head],
      });
      try {
        await gh().git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: commit.data.sha, force: false });
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
  if (!backend) {
    if (process.env.PM_DATA_DIR && process.env.VERCEL_ENV) {
      throw new Error("PM_DATA_DIR is supported only for local development; Vercel deployments require the private GitHub store.");
    }
    backend = process.env.PM_DATA_DIR ? diskBackend(process.env.PM_DATA_DIR) : githubBackend();
  }
  return backend;
}

export function storeLocation(): string {
  return store().describe();
}

// ─────────── snapshot ───────────

function parse(head: string | null, files: Map<string, string>): Snapshot {
  const projects = new Map<string, ProjectDetail>();
  const seenIds = new Set<string>();
  const seenTaskSourceKeys = new Set<string>();
  let hasLegacyProject = false;
  let hasVersionedProject = false;
  files.forEach((text, p) => {
    if (!p.startsWith("projects/")) return;
    const d = JSON.parse(text) as ProjectDetail;
    const expectedId = path.basename(p, ".json");
    const schemaVersion = (d as ProjectDetail & { schemaVersion?: number })?.schemaVersion;
    if (schemaVersion === undefined) hasLegacyProject = true;
    else if (schemaVersion === 1) hasVersionedProject = true;
    if ((schemaVersion !== undefined && schemaVersion !== 1) || !d.project || typeof d.project.id !== "string" ||
        typeof d.project.name !== "string" || !Array.isArray(d.project.agents) ||
        d.project.id !== expectedId || !Array.isArray(d.milestones) || !Array.isArray(d.tasks) || !Array.isArray(d.entries)) {
      throw new Error(`Project data file ${p} has an incompatible project record.`);
    }
    if (seenIds.has(d.project.id)) throw new Error(`Duplicate project id ${d.project.id} in project data snapshot.`);
    seenIds.add(d.project.id);
    for (const [kind, rows] of [["milestone", d.milestones], ["task", d.tasks], ["entry", d.entries]] as const) {
      for (const row of rows) {
        if (!row || typeof row.id !== "string" || row.project_id !== d.project.id) {
          throw new Error(`Project data file ${p} contains an invalid ${kind} record.`);
        }
        if (seenIds.has(row.id)) throw new Error(`Duplicate record id ${row.id} in project data snapshot.`);
        seenIds.add(row.id);
        if (kind === "task" && "source_key" in row && row.source_key !== null && row.source_key !== undefined) {
          if (typeof row.source_key !== "string" || !row.source_key.trim() || row.source_key !== row.source_key.trim()) {
            throw new Error(`Project data file ${p} contains an invalid task source_key.`);
          }
          if (seenTaskSourceKeys.has(row.source_key)) throw new Error(`Duplicate task source_key ${row.source_key} in project data snapshot.`);
          seenTaskSourceKeys.add(row.source_key);
        }
      }
    }
    projects.set(d.project.id, d);
  });
  const hasRepos = files.has("repos.json");
  const hasOperations = files.has("operations.json");
  const legacyMetadataMigration = !hasRepos && !hasOperations && projects.size > 0 && hasLegacyProject && !hasVersionedProject;
  if ((!hasRepos || !hasOperations) && !legacyMetadataMigration) {
    throw new Error("Project metadata is missing or incomplete; refusing to treat the store as empty.");
  }
  const parsedRepos = hasRepos ? JSON.parse(files.get("repos.json")!) as Partial<ReposFile> : { schemaVersion: 1, repos: [], plugins: {} };
  if (!parsedRepos || parsedRepos.schemaVersion !== 1 || !Array.isArray(parsedRepos.repos) || !parsedRepos.plugins || typeof parsedRepos.plugins !== "object" || Array.isArray(parsedRepos.plugins)) {
    throw new Error("Project data file repos.json has an incompatible repository collection.");
  }
  const repos = parsedRepos as ReposFile;
  for (const row of repos.repos) {
    if (!row || typeof row.id !== "string" || typeof row.owner !== "string" || typeof row.repo !== "string") {
      throw new Error("Project data file repos.json contains an invalid tracked repository record.");
    }
    if (seenIds.has(row.id)) throw new Error(`Duplicate record id ${row.id} in project data snapshot.`);
    seenIds.add(row.id);
  }
  const parsedOperations = hasOperations ? JSON.parse(files.get("operations.json")!) as { schemaVersion?: number; items?: unknown } : { schemaVersion: 1, items: {} };
  if (!parsedOperations || parsedOperations.schemaVersion !== 1 || !parsedOperations.items || typeof parsedOperations.items !== "object" || Array.isArray(parsedOperations.items)) {
    throw new Error("Project data file operations.json has an incompatible operation receipt collection.");
  }
  for (const receipt of Object.values(parsedOperations.items as Record<string, unknown>)) {
    if (!receipt || typeof receipt !== "object" || Array.isArray(receipt) || typeof (receipt as OperationReceipt).payloadHash !== "string" || !("result" in receipt)) {
      throw new Error("Project data file operations.json contains an invalid operation receipt.");
    }
  }
  return { head, projects, repos, operations: parsedOperations.items as Record<string, OperationReceipt>, legacyMetadataMigration };
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
      { ...d, schemaVersion: 1, project: d.project, milestones: byCreated(d.milestones), tasks: byCreated(d.tasks), entries: byCreated(d.entries) },
      null,
      2
    ) + "\n"
  );
}

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
    const operation = requestOperation.getStore();
    const prior = operation && base.operations[operation.id];
    if (prior) {
      if (prior.payloadHash !== operation!.payloadHash) {
        throw new StoreConflict(`Idempotency-Key ${operation!.id} was already used with a different request payload.`);
      }
      return structuredClone(prior.result) as T;
    }
    const draft: Snapshot = structuredClone(base);
    const result = fn(draft);
    if (operation) {
      draft.operations[operation.id] = {
        payloadHash: operation.payloadHash,
        result: result === undefined ? null : structuredClone(result),
      };
    }

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
    if (base.legacyMetadataMigration && !changes.some((change) => change.path === "repos.json")) {
      changes.push({ path: "repos.json", content: JSON.stringify(draft.repos, null, 2) + "\n" });
    }
    if (JSON.stringify(draft.operations) !== JSON.stringify(base.operations)) {
      changes.push({ path: "operations.json", content: JSON.stringify({ schemaVersion: 1, items: draft.operations }, null, 2) + "\n" });
    }
    if (base.legacyMetadataMigration && !changes.some((change) => change.path === "operations.json")) {
      changes.push({ path: "operations.json", content: JSON.stringify({ schemaVersion: 1, items: draft.operations }, null, 2) + "\n" });
    }
    if (!changes.length) return result;
    if (!base.head) {
      throw new Error("Project data branch is missing; provision a reviewed snapshot before writing.");
    }

    try {
      await store().write(base.head, changes, typeof message === "string" ? message : message(result, draft));
      return result;
    } catch (err: unknown) {
      if (!(err instanceof StaleHead) || attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 150 + Math.random() * 350 * (attempt + 1)));
    }
  }
}
