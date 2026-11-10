// Client-safe logic for the Approvals page and the daily agent run: what is
// waiting on your yes or no, and the checklist an agent works through each day.
// Writes live in projects.ts (applyApprovals, undoApprovals, offerTask).

import {
  WORKABLE,
  daysSince,
  fmtDate,
  isReady,
  isSnoozed,
  rankReady,
  sortProjects,
  taskPath,
  today,
  type DecisionStatus,
  type Entry,
  type InboxItem,
  type ProjectDetail,
  type Task,
  type TaskOffer,
} from "./projectTypes";
import { ME, isMine } from "./taskMap";

/** Finished agent work older than this drops off the Approvals page unreviewed. */
export const REVIEW_WINDOW_DAYS = 14;
/** The agent a hand-off goes to when a project names no agent of its own. */
export const DEFAULT_AGENT = "claude-code";

export const APPROVAL_KINDS = ["proposal", "offer", "decision", "finished"] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

export const APPROVAL_META: Record<ApprovalKind, { label: string; hint: string; approve: string; reject: string }> = {
  proposal: {
    label: "Proposed work",
    hint: "Ideas an agent filed. Approving one adds a task assigned to that agent. It becomes available when its dependencies are complete and an authorized runner connects.",
    approve: "Add task",
    reject: "Drop",
  },
  offer: {
    label: "Agents asking to take a task",
    hint: "Unassigned tasks an agent says it can do. Approving assigns the task to that agent.",
    approve: "Hand off",
    reject: "Keep it",
  },
  decision: {
    label: "Proposed decisions",
    hint: "Choices an agent made and logged for your call.",
    approve: "Accept",
    reject: "Reject",
  },
  finished: {
    label: "Finished by agents",
    hint: `Agent work marked done in the last ${REVIEW_WINDOW_DAYS} days. Approve to sign it off, or send it back to the agent with a note.`,
    approve: "Approve",
    reject: "Send back",
  },
};

export type ApprovalItem = {
  key: string;
  kind: ApprovalKind;
  id: string;
  title: string;
  /** Notes, the offer's reason, the decision text, or the agent's finishing note. */
  body: string;
  project_id: string | null;
  project_name: string | null;
  agent: string | null;
  at: string;
  /** The first link the agent left (usually the pull request). */
  link: string | null;
  /** A proposal with no project yet: pick one before approving. */
  needs_project: boolean;
  /** Task or inbox anchor to open for detail. */
  href: string;
};

const URL_RE = /https?:\/\/[^\s)<>\]"']+/;
const firstLink = (...texts: Array<string | null | undefined>) => {
  for (const t of texts) {
    const m = t ? URL_RE.exec(t) : null;
    if (m) return m[0].replace(/[.,;:]+$/, "");
  }
  return null;
};

/** The agent a project's work goes to by default, or null when only you work on it. */
export function defaultAgentFor(agents: string[]): string | null {
  if (!agents.length) return DEFAULT_AGENT;
  return agents.find((a) => a !== ME) ?? null;
}

/** May this agent take work in this project? Mirrors nextTask and claimTask. */
export function agentAllowed(d: ProjectDetail, agent: string): boolean {
  return !d.project.agents.length || d.project.agents.includes(agent);
}

const isOpenOffer = (t: Task): t is Task & { offer: TaskOffer } =>
  !!t.offer && !t.offer.declined_at && t.status === "todo" && !t.agent;

/** Everything waiting on the Approvals page, grouped by kind, newest first inside each kind. */
export function collectApprovals(details: ProjectDetail[], inbox: InboxItem[], now = Date.now()): ApprovalItem[] {
  const byId = new Map(details.map((d) => [d.project.id, d]));
  const out: ApprovalItem[] = [];
  for (const i of inbox) {
    if (!i.source || i.source === ME) continue;
    const d = i.project_id ? byId.get(i.project_id) : undefined;
    out.push({
      key: `proposal:${i.id}`,
      kind: "proposal",
      id: i.id,
      title: i.title,
      body: i.notes,
      project_id: d ? d.project.id : null,
      project_name: d ? d.project.name : null,
      agent: i.source,
      at: i.created_at,
      link: firstLink(i.notes),
      needs_project: !d,
      href: `/inbox#item-${i.id}`,
    });
  }
  const cutoff = now - REVIEW_WINDOW_DAYS * 86_400_000;
  for (const d of details) {
    const p = d.project;
    for (const t of d.tasks) {
      if (p.status !== "paused" && isOpenOffer(t)) {
        out.push({
          key: `offer:${t.id}`, kind: "offer", id: t.id, title: taskPath(t, d.tasks), body: t.offer.note,
          project_id: p.id, project_name: p.name, agent: t.offer.agent, at: t.offer.at,
          link: firstLink(t.offer.note), needs_project: false, href: `/tasks/${t.id}`,
        });
      }
      if (t.status === "done" && t.agent && t.agent !== ME && !t.approved_at && t.done_at && Date.parse(t.done_at) >= cutoff) {
        const report = finishingNote(d.entries, t);
        out.push({
          key: `finished:${t.id}`, kind: "finished", id: t.id, title: taskPath(t, d.tasks), body: report?.body || report?.title || "",
          project_id: p.id, project_name: p.name, agent: t.agent, at: t.done_at,
          link: firstLink(report?.body, ...threadOf(d.entries, t.id).map((e) => e.body)), needs_project: false, href: `/tasks/${t.id}`,
        });
      }
    }
    for (const e of d.entries) {
      if (e.kind !== "decision" || e.decision_status !== "proposed") continue;
      out.push({
        key: `decision:${e.id}`, kind: "decision", id: e.id, title: e.title,
        body: [e.context && `Context: ${e.context}`, e.body && `Decision: ${e.body}`, e.alternatives && `Alternatives: ${e.alternatives}`].filter(Boolean).join("\n"),
        project_id: p.id, project_name: p.name, agent: e.author, at: e.created_at,
        link: e.evidence_url || e.source_url || null, needs_project: false, href: `/projects/${p.id}?tab=decisions&entry=${e.id}`,
      });
    }
  }
  const rank = (k: ApprovalKind) => APPROVAL_KINDS.indexOf(k);
  return out.sort((a, b) => rank(a.kind) - rank(b.kind) || b.at.localeCompare(a.at));
}

const threadOf = (entries: Entry[], taskId: string) =>
  entries.filter((e) => e.kind === "progress" && e.task_id === taskId).sort((a, b) => b.created_at.localeCompare(a.created_at));

/** The agent's latest "Finished" report on a task. */
function finishingNote(entries: Entry[], t: Task): Entry | undefined {
  return threadOf(entries, t.id).find((e) => e.author === t.agent && e.title.startsWith("Finished"));
}

// ─────────── bulk actions ───────────

export type ApprovalAction = "approve" | "reject";
export type ApprovalOp = {
  kind: ApprovalKind;
  id: string;
  action: ApprovalAction;
  /** Proposals only: the project to add the task to, when the agent named none. */
  project_id?: string | null;
  /** Finished work sent back: what to fix. */
  note?: string;
};
export type ApprovalResult = { key: string; ok: boolean; error?: string; task_id?: string };

/** What it takes to put things back the way they were. Returned by applyApprovals, sent back to undo. */
export type ApprovalUndo = { expected?: string } & (
  | { kind: "proposal"; item: InboxItem; task_id: string | null }
  | { kind: "offer"; task_id: string; offer: TaskOffer; assigned: boolean }
  | { kind: "decision"; entry_id: string; set: DecisionStatus }
  | { kind: "finished"; task_id: string; approved: boolean; done_at: string | null; entry_id: string | null });

// ─────────── the daily run ───────────

/**
 * The checklist a scheduled agent works through each morning, as Markdown.
 * It builds only what is assigned to it; for anything else it offers or proposes,
 * and you approve in bulk.
 */
export function renderSweepMarkdown(details: ProjectDetail[], inbox: InboxItem[], agent: string, day = today()): string {
  const sorted = sortProjects(details.map((d) => ({ ...d.project, d }))).map((x) => x.d);
  const open = sorted.filter((d) => WORKABLE.includes(d.project.status) && agentAllowed(d, agent));
  const line = (d: ProjectDetail, t: Task, extra = "") =>
    `- ${taskPath(t, d.tasks)} · ${d.project.name} · ${t.priority}${t.due_date ? ` · due ${t.due_date}` : ""}${extra} \`${t.id}\``;
  const out: string[] = [`# Daily run for @${agent}, ${fmtDate(day)}`, ""];
  out.push(
    "Work top to bottom. Build only tasks assigned to you. For other work you could do, offer to take it or propose it; the owner approves in bulk on the Approvals page.",
    ""
  );

  const doing = open.flatMap((d) => d.tasks.filter((t) => t.status === "doing" && t.agent === agent).map((t) => line(d, t, ` · last update ${daysSince(t.updated_at)}d ago`)));
  section(out, "1. Resume what you already claimed", doing, "Nothing in progress.");

  const sentBack = new Set<string>();
  for (const d of open) for (const t of d.tasks) {
    const last = threadOf(d.entries, t.id)[0];
    if (t.status === "todo" && t.agent === agent && last?.author === ME && last.title.startsWith("Sent back")) sentBack.add(t.id);
  }
  const ready = open.flatMap((d) =>
    rankReady(d.tasks, d.milestones).filter((t) => t.agent === agent).map((t) => line(d, t, sentBack.has(t.id) ? " · sent back, read the thread first" : ""))
  );
  section(out, "2. Build what is assigned to you", ready, "Nothing assigned to you is ready.");

  const offerable = open.flatMap((d) =>
    rankReady(d.tasks, d.milestones)
      .filter((t) => !t.agent && !isMine(t) && !t.offer)
      .map((t) => line(d, t, t.acceptance ? "" : " · no acceptance criteria"))
  );
  section(
    out,
    "3. Offer to take unassigned work",
    offerable.slice(0, 40),
    "No unassigned ready work.",
    "For each task you can finish without the owner's credentials, accounts or judgment calls, `POST /api/agent/tasks/<id>/offer` with a one-line plan. Skip the rest."
  );

  const blocked = open.flatMap((d) => d.tasks.filter((t) => t.status === "blocked" && t.agent === agent && !isSnoozed(t, day)).map((t) => line(d, t)));
  section(out, "4. Still blocked on the owner", blocked, "Nothing of yours is blocked.", "Do not work these. List them in your report.");

  const quiet = open
    .filter((d) => !d.tasks.some((t) => isReady(t, d.tasks) || t.status === "doing"))
    .map((d) => `- ${d.project.name}${d.project.next_action ? `: next action "${d.project.next_action}"` : ": no next action set"} \`${d.project.id}\``);
  section(
    out,
    "5. Projects with nothing ready",
    quiet,
    "Every open project has ready work.",
    "Look at the repo and the next action. If there is clear work, propose it with `POST /api/agent/inbox` (with `project_id`). One proposal per distinct idea."
  );

  const mineWaiting = inbox.filter((i) => i.source === agent).map((i) => `- ${i.title}`);
  section(out, "Your proposals still waiting", mineWaiting, "None.", "Do not propose these again.");

  const waiting = collectApprovals(details, inbox);
  out.push("## 6. Report", "", `${waiting.length} items already wait on the owner's approval. End with a short report: what you finished (with PR links), what you offered or proposed, and what is blocked.`, "");
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function section(out: string[], title: string, lines: string[], empty: string, hint?: string) {
  out.push(`## ${title} (${lines.length})`, "");
  if (hint && lines.length) out.push(hint, "");
  out.push(...(lines.length ? lines : [`- ${empty}`]), "");
}
