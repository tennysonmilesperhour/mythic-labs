// Client-safe helpers for task maps: where every row on the dashboard leads,
// and the links, steps and copy-ready text a person needs to finish a task.

import type { AttentionItem, Project, Task } from "./projectTypes";

/** The person running the dashboard. Tasks assigned here are human-only. */
export const ME = "me";

export const isMine = (t: Pick<Task, "agent">) => t.agent === ME;

/** Kinds of attention flag that point at a single task. */
const TASK_FLAGS = new Set(["blocked", "overdue", "stalled", "critical"]);

/** "proj:blocked:task", "group:next" and "source:store" all carry the kind second. */
export function flagKind(key: string): string {
  return key.split(":")[1] ?? "";
}

export function taskHref(id: string, why?: string): string {
  return `/tasks/${id}${why ? `?why=${why}` : ""}`;
}

export function fixHref(key: string): string {
  return `/fix?key=${encodeURIComponent(key)}`;
}

/** The logical next page for an attention flag. */
export function attentionHref(a: AttentionItem): string {
  if (a.href) return a.href;
  const kind = flagKind(a.key);
  if (a.task_id && TASK_FLAGS.has(kind)) return taskHref(a.task_id, kind);
  return fixHref(a.key);
}

// ─────────── text mining ───────────

const URL_RE = /https?:\/\/[^\s<>()"'`]+[^\s<>()"'`.,;:!?]/g;

export function extractUrls(...texts: string[]): string[] {
  return Array.from(new Set(texts.flatMap((t) => t.match(URL_RE) ?? [])));
}

/** Fenced blocks and inline `code` from notes: the things worth copying. */
export function extractSnippets(...texts: string[]): string[] {
  const out: string[] = [];
  for (const t of texts) {
    for (const m of t.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) out.push(m[1].trim());
    const noFences = t.replace(/```[\s\S]*?```/g, "");
    for (const m of noFences.matchAll(/`([^`\n]{2,})`/g)) out.push(m[1].trim());
  }
  return Array.from(new Set(out.filter(Boolean)));
}

/** Bullet or numbered lines become steps; otherwise each non-empty line is one. */
export function extractSteps(notes: string): string[] {
  const body = notes.replace(/```[\s\S]*?```/g, "");
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const listed = lines.filter((l) => /^([-*•]|\d+[.)]|\[[ x]\])\s+/i.test(l));
  const pick = listed.length ? listed : lines.length > 1 ? lines : [];
  return pick.map((l) => l.replace(/^([-*•]|\d+[.)])\s+/, "").replace(/^\[[ x]\]\s+/i, ""));
}

export function slug(s: string, max = 40): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, max).replace(/-$/, "");
}

// ─────────── links ───────────

/** Where each tool preset is worked on. Unknown tools get a web search. */
const TOOL_URLS: Record<string, string> = {
  GitHub: "https://github.com",
  Vercel: "https://vercel.com/dashboard",
  Supabase: "https://supabase.com/dashboard/projects",
  ClickUp: "https://app.clickup.com",
  Canva: "https://www.canva.com/projects",
  "Claude Docs": "https://claude.ai",
  Gmail: "https://mail.google.com",
  "Google Calendar": "https://calendar.google.com",
  "Google Drive": "https://drive.google.com",
  Wix: "https://manage.wix.com",
  Lucid: "https://lucid.app",
  Base44: "https://app.base44.com",
  Figma: "https://www.figma.com/files",
  Stripe: "https://dashboard.stripe.com",
};

export type MapLink = { label: string; url: string; note?: string };

export function repoLinks(p: Pick<Project, "owner" | "repo">, taskTitle?: string): MapLink[] {
  if (!p.owner || !p.repo) return [];
  const base = `https://github.com/${p.owner}/${p.repo}`;
  const q = taskTitle ? encodeURIComponent(taskTitle) : "";
  return [
    { label: `${p.owner}/${p.repo}`, url: base, note: "repo" },
    { label: "Open pull requests", url: `${base}/pulls` },
    ...(taskTitle
      ? [
          { label: "Issues and PRs matching this task", url: `${base}/issues?q=${q}` },
          { label: "Open a new issue for it", url: `${base}/issues/new?title=${q}` },
        ]
      : []),
    { label: "Actions (CI runs)", url: `${base}/actions` },
  ];
}

export function toolLinks(tools: string[]): MapLink[] {
  return tools.map((t) => ({
    label: t,
    url: TOOL_URLS[t] ?? `https://www.google.com/search?q=${encodeURIComponent(t)}`,
    note: "tool",
  }));
}

export function labelFor(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path.length > 1 ? path : ""}`;
  } catch {
    return url;
  }
}
