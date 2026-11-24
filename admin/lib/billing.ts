// Client billing: the projects you bill, an estimate for each merged pull
// request, and the estimates and invoices made from them. Stored in billing.json.

import { gh } from "./github";
import { Conflict, Invalid, NotFound } from "./projects";
import { mutate, newId, readSnapshot, type Snapshot } from "./store";
import {
  countLines,
  docLines,
  docTotal,
  estimateHours,
  nextDocNumber,
  type BillingClient,
  type BillingDoc,
  type BillingFile,
  type DocKind,
  type DocStatus,
  type LineCounts,
  type WorkItem,
} from "./billingTypes";

export type BillingProject = { id: string; name: string; repo: string | null };
export type BillingState = BillingFile & { projects: BillingProject[] };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);
/** New pull requests read per client per sync; the rest come on the next one. */
export const SYNC_BATCH = 25;

const str = (v: unknown, max: number, field: string): string => {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw new Invalid(`${field} must be text`);
  const s = v.trim();
  if (s.length > max) throw new Invalid(`keep ${field} under ${max} characters`);
  return s;
};

const rateOf = (v: unknown, field = "rate"): number => {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > 10000) throw new Invalid(`${field} must be a dollar amount per hour above 0`);
  return Math.round(n * 100) / 100;
};

const hoursOf = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1000) throw new Invalid("hours must be between 0 and 1000");
  return Math.round(n * 100) / 100;
};

/** owner/repo from "owner/repo" or a GitHub URL. */
export function parseRepo(repo: string | null): { owner: string; repo: string } | null {
  if (!repo) return null;
  const m = repo.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, "").match(/^([\w.-]+)\/([\w.-]+)/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

function projectsOf(s: Snapshot): BillingProject[] {
  return Array.from(s.projects.values())
    .map((d) => ({ id: d.project.id, name: d.project.name, repo: d.project.repo }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getBilling(): Promise<BillingState> {
  const s = await readSnapshot();
  return { ...s.billing, projects: projectsOf(s) };
}

/** The client record for a project, or null when it is not client work. */
export async function clientFor(projectId: string): Promise<BillingClient | null> {
  return (await readSnapshot()).billing.clients.find((c) => c.project_id === projectId) || null;
}

// ─────────── clients ───────────

/** Put a project in the client work category, or change its rate and contact. */
export async function saveClient(input: Record<string, unknown>): Promise<BillingClient> {
  const projectId = str(input.project_id, 64, "project_id");
  if (!projectId) throw new Invalid("pick a project");
  const name = "client_name" in input ? str(input.client_name, 120, "client name") : undefined;
  const email = "client_email" in input ? str(input.client_email, 200, "client email") : undefined;
  if (email && !EMAIL_RE.test(email)) throw new Invalid("client email does not look like an email address");
  const since = "since" in input ? str(input.since, 10, "since") : undefined;
  if (since && !DATE_RE.test(since)) throw new Invalid("since must be a date (YYYY-MM-DD)");
  const rate = "rate" in input && input.rate !== "" && input.rate !== null ? rateOf(input.rate) : undefined;
  return mutate(
    (c) => `Billing: ${c.client_name || "client"} at $${c.rate}/h`,
    (s) => {
      const d = s.projects.get(projectId);
      if (!d) throw new NotFound(`no project ${projectId}`);
      let c = s.billing.clients.find((x) => x.project_id === projectId);
      const stamp = now();
      if (!c) {
        c = {
          project_id: projectId,
          client_name: name || d.project.name,
          client_email: email || "",
          rate: rate ?? s.billing.default_rate,
          since: since || today(),
          created_at: stamp,
          updated_at: stamp,
        };
        s.billing.clients.push(c);
      } else {
        if (name !== undefined) c.client_name = name || d.project.name;
        if (email !== undefined) c.client_email = email;
        if (since) c.since = since;
        if (rate !== undefined && rate !== c.rate) {
          c.rate = rate;
          // Work not yet invoiced follows the new rate; invoices keep the rate they were made with.
          for (const w of s.billing.work) if (w.project_id === projectId && w.status !== "invoiced") { w.rate = rate; w.updated_at = stamp; }
        }
        c.updated_at = stamp;
      }
      return c;
    }
  );
}

/** Take a project out of client work. Invoiced work and paperwork stay as records. */
export async function removeClient(projectId: string): Promise<{ removed: number }> {
  return mutate(
    (r) => `Billing: stop billing a project (${r.removed} unbilled items dropped)`,
    (s) => {
      const before = s.billing.clients.length;
      s.billing.clients = s.billing.clients.filter((c) => c.project_id !== projectId);
      if (s.billing.clients.length === before) throw new NotFound("that project is not client work");
      const keep = s.billing.work.filter((w) => w.project_id !== projectId || w.status === "invoiced");
      const removed = s.billing.work.length - keep.length;
      s.billing.work = keep;
      return { removed };
    }
  );
}

export async function saveSettings(input: Record<string, unknown>): Promise<BillingFile["business"] & { default_rate: number }> {
  const patch: Partial<BillingFile["business"]> = {};
  if ("name" in input) patch.name = str(input.name, 120, "business name");
  if ("email" in input) {
    patch.email = str(input.email, 200, "business email");
    if (patch.email && !EMAIL_RE.test(patch.email)) throw new Invalid("business email does not look like an email address");
  }
  if ("payment_note" in input) patch.payment_note = str(input.payment_note, 1000, "payment instructions");
  if ("payment_terms_days" in input) {
    const n = Number(input.payment_terms_days);
    if (!Number.isInteger(n) || n < 0 || n > 365) throw new Invalid("payment terms must be 0 to 365 days");
    patch.payment_terms_days = n;
  }
  const defaultRate = "default_rate" in input ? rateOf(input.default_rate, "default rate") : undefined;
  return mutate("Billing: settings", (s) => {
    Object.assign(s.billing.business, patch);
    if (defaultRate !== undefined) s.billing.default_rate = defaultRate;
    return { ...s.billing.business, default_rate: s.billing.default_rate };
  });
}

// ─────────── work ───────────

/** Edit billed hours or notes, or exclude and include items. Invoiced items are frozen. */
export async function updateWork(ops: unknown): Promise<WorkItem[]> {
  if (!Array.isArray(ops) || !ops.length || ops.length > 200) throw new Invalid("send 1 to 200 items");
  const clean = ops.map((o) => {
    const op = o as Record<string, unknown>;
    const id = str(op.id, 64, "id");
    if (!id) throw new Invalid("each item needs an id");
    const status = op.status;
    if (status !== undefined && status !== "unbilled" && status !== "excluded") throw new Invalid("status must be unbilled or excluded");
    return {
      id,
      status: status as "unbilled" | "excluded" | undefined,
      hours: op.hours === undefined ? undefined : hoursOf(op.hours),
      note: op.note === undefined ? undefined : str(op.note, 500, "note"),
    };
  });
  return mutate(
    (r) => `Billing: edit ${r.length} work item${r.length === 1 ? "" : "s"}`,
    (s) =>
      clean.map((op) => {
        const w = s.billing.work.find((x) => x.id === op.id);
        if (!w) throw new NotFound(`no work item ${op.id}`);
        if (w.status === "invoiced") throw new Conflict(`"${w.title}" is on an invoice; void the invoice to change it`);
        if (op.status) w.status = op.status;
        if (op.hours !== undefined) w.hours = op.hours;
        if (op.note !== undefined) w.note = op.note;
        w.updated_at = now();
        return w;
      })
  );
}

type FetchedPull = {
  repo: string;
  number: number;
  url: string;
  title: string;
  author: string;
  bot: boolean;
  merged_at: string;
  counts: LineCounts;
};

/** Merged pull requests on the client's repo since its start date that are not recorded yet. */
async function fetchNewPulls(client: BillingClient, repoName: string, known: Set<string>): Promise<{ pulls: FetchedPull[]; more: boolean }> {
  const r = parseRepo(repoName);
  if (!r) throw new Error(`the project's repo "${repoName}" is not owner/name`);
  const found: Array<{ number: number; url: string; title: string; author: string; bot: boolean; merged_at: string }> = [];
  for (let page = 1; page <= 5; page++) {
    const res = await gh().pulls.list({ owner: r.owner, repo: r.repo, state: "closed", sort: "updated", direction: "desc", per_page: 100, page });
    for (const p of res.data) {
      if (!p.merged_at || p.merged_at.slice(0, 10) < client.since) continue;
      if (known.has(`${r.owner}/${r.repo}#${p.number}`.toLowerCase())) continue;
      found.push({ number: p.number, url: p.html_url, title: p.title, author: p.user?.login || "unknown", bot: p.user?.type === "Bot", merged_at: p.merged_at });
    }
    const last = res.data[res.data.length - 1];
    // Sorted by last update: once a page reaches back past the start date, older pages cannot hold newer merges.
    if (res.data.length < 100 || !last || last.updated_at.slice(0, 10) < client.since) break;
  }
  found.sort((a, b) => a.merged_at.localeCompare(b.merged_at));
  const batch = found.slice(0, SYNC_BATCH);
  const pulls: FetchedPull[] = [];
  for (const p of batch) {
    const files = await gh().paginate(gh().pulls.listFiles, { owner: r.owner, repo: r.repo, pull_number: p.number, per_page: 100 });
    pulls.push({ ...p, repo: `${r.owner}/${r.repo}`, counts: countLines(files.map((f) => ({ filename: f.filename, additions: f.additions, deletions: f.deletions }))) });
  }
  return { pulls, more: found.length > batch.length };
}

export type SyncResult = {
  added: Array<{ project_id: string; title: string; pr_url: string; hours: number }>;
  errors: Array<{ project_id: string; error: string }>;
  more: boolean;
};

/** Record every newly merged pull request on a client project, with its estimate. */
export async function syncBilling(): Promise<SyncResult> {
  const s = await readSnapshot();
  const known = new Set(s.billing.work.map((w) => `${w.repo}#${w.pr_number}`.toLowerCase()));
  const fetched: Array<{ client: BillingClient; pulls: FetchedPull[] }> = [];
  const errors: SyncResult["errors"] = [];
  let more = false;
  for (const client of s.billing.clients) {
    const repo = s.projects.get(client.project_id)?.project.repo;
    if (!repo) {
      errors.push({ project_id: client.project_id, error: "the project has no repo, so there are no pull requests to read" });
      continue;
    }
    try {
      const res = await fetchNewPulls(client, repo, known);
      if (res.pulls.length) fetched.push({ client, pulls: res.pulls });
      more ||= res.more;
    } catch (err) {
      const status = (err as { status?: number }).status;
      errors.push({
        project_id: client.project_id,
        error: status === 404 || status === 403 ? `GitHub refused ${repo} (${status}); the dashboard's GitHub token needs read access to it` : (err as Error).message,
      });
    }
  }
  if (!fetched.length) return { added: [], errors, more };
  const added = await mutate<SyncResult["added"]>(
    (r) => `Billing: ${r.length} merged pull request${r.length === 1 ? "" : "s"} estimated`,
    (draft) => {
      const have = new Set(draft.billing.work.map((w) => `${w.repo}#${w.pr_number}`.toLowerCase()));
      const out: SyncResult["added"] = [];
      for (const { client, pulls } of fetched) {
        const current = draft.billing.clients.find((c) => c.project_id === client.project_id);
        if (!current) continue;
        for (const p of pulls) {
          if (have.has(`${p.repo}#${p.number}`.toLowerCase())) continue;
          const hours = estimateHours(p.counts);
          const stamp = now();
          draft.billing.work.push({
            id: newId(),
            project_id: client.project_id,
            repo: p.repo,
            pr_number: p.number,
            pr_url: p.url,
            title: p.title,
            author: p.author,
            merged_at: p.merged_at,
            counts: p.counts,
            estimate_hours: hours,
            hours,
            rate: current.rate,
            // Dependency bots are not your hours; they stay listed so you can include one.
            status: p.bot ? "excluded" : "unbilled",
            invoice_id: null,
            note: p.bot ? "Opened by a bot" : "",
            created_at: stamp,
            updated_at: stamp,
          });
          out.push({ project_id: client.project_id, title: p.title, pr_url: p.url, hours });
        }
      }
      return out;
    }
  );
  return { added, errors, more };
}

// ─────────── estimates and invoices ───────────

/** Make an estimate or an invoice from unbilled work on one client project. An invoice marks its work invoiced. */
export async function createDocument(input: Record<string, unknown>): Promise<BillingDoc> {
  const kind = input.kind as DocKind;
  if (kind !== "estimate" && kind !== "invoice") throw new Invalid("kind must be estimate or invoice");
  const ids = Array.isArray(input.work_ids) ? input.work_ids.filter((x): x is string => typeof x === "string") : [];
  if (!ids.length) throw new Invalid("select the work to include");
  const notes = str(input.notes, 2000, "notes");
  return mutate(
    (d) => `Billing: ${d.kind} ${d.number} for ${d.client_name}, $${d.total}`,
    (s) => {
      const items = ids.map((id) => {
        const w = s.billing.work.find((x) => x.id === id);
        if (!w) throw new NotFound(`no work item ${id}`);
        if (w.status !== "unbilled") throw new Conflict(`"${w.title}" is ${w.status}, not unbilled`);
        return w;
      });
      const projectId = items[0].project_id;
      if (items.some((w) => w.project_id !== projectId)) throw new Invalid("one client per document; select work from a single project");
      const client = s.billing.clients.find((c) => c.project_id === projectId);
      if (!client) throw new Conflict("that project is not client work any more");
      const lines = docLines(items);
      const stamp = now();
      const issued = stamp.slice(0, 10);
      const due = new Date(`${issued}T12:00:00Z`);
      due.setUTCDate(due.getUTCDate() + s.billing.business.payment_terms_days);
      const doc: BillingDoc = {
        id: newId(),
        kind,
        number: nextDocNumber(s.billing.documents, kind, Number(issued.slice(0, 4))),
        project_id: projectId,
        client_name: client.client_name,
        client_email: client.client_email,
        issued_on: issued,
        due_on: kind === "invoice" ? due.toISOString().slice(0, 10) : null,
        lines,
        total: docTotal(lines),
        notes,
        status: "draft",
        created_at: stamp,
        sent_at: null,
        paid_at: null,
      };
      s.billing.documents.push(doc);
      if (kind === "invoice") for (const w of items) { w.status = "invoiced"; w.invoice_id = doc.id; w.updated_at = stamp; }
      return doc;
    }
  );
}

const NEXT: Record<DocKind, DocStatus[]> = { estimate: ["draft", "sent", "void"], invoice: ["draft", "sent", "paid", "void"] };

/** Mark sent, paid or void, or edit notes. Voiding an invoice returns its work to unbilled. */
export async function updateDocument(id: string, input: Record<string, unknown>): Promise<BillingDoc> {
  const status = input.status as DocStatus | undefined;
  const notes = "notes" in input ? str(input.notes, 2000, "notes") : undefined;
  return mutate(
    (d) => `Billing: ${d.number} ${status ? `marked ${d.status}` : "edited"}`,
    (s) => {
      const doc = s.billing.documents.find((d) => d.id === id);
      if (!doc) throw new NotFound(`no estimate or invoice ${id}`);
      if (notes !== undefined) doc.notes = notes;
      if (status && status !== doc.status) {
        if (!NEXT[doc.kind].includes(status)) throw new Invalid(`an ${doc.kind} can be ${NEXT[doc.kind].join(", ")}`);
        if (doc.status === "void") throw new Conflict(`${doc.number} is void; make a new one instead`);
        const stamp = now();
        if (status === "sent" && !doc.sent_at) doc.sent_at = stamp;
        if (status === "paid") { doc.paid_at = stamp; doc.sent_at ||= stamp; }
        if (status !== "paid") doc.paid_at = null;
        if (status === "void" && doc.kind === "invoice") {
          for (const w of s.billing.work) if (w.invoice_id === doc.id) { w.status = "unbilled"; w.invoice_id = null; w.updated_at = stamp; }
        }
        doc.status = status;
      }
      return doc;
    }
  );
}
