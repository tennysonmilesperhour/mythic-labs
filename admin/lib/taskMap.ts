// Client-safe helpers for task maps: where every row on the dashboard leads,
// and the links, steps and copy-ready text a person needs to finish a task.

import type { AttentionItem, Project, Task } from "./projectTypes";

/** The person running the dashboard. Tasks assigned here are human-only. */
export const ME = "me";

/** Unassigned tasks whose notes call them an owner step are yours too. */
const OWNER_STEP = /\bowner(?:'s)? (?:step|action|task)\b/i;

export const isMine = (t: Pick<Task, "agent" | "notes">) =>
  t.agent === ME || (!t.agent && OWNER_STEP.test(t.notes ?? ""));

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

/** Where each tool is worked on. Matched by prefix; unknown tools get a web search. */
const TOOL_URLS: Record<string, string> = {
  "GitHub Actions": "https://github.com/features/actions",
  RevenueCat: "https://app.revenuecat.com",
  PostHog: "https://us.posthog.com",
  Resend: "https://resend.com/overview",
  "Anthropic API": "https://console.anthropic.com",
  Capacitor: "https://capacitorjs.com/docs",
  "App Store Connect": "https://appstoreconnect.apple.com/apps",
  TestFlight: "https://appstoreconnect.apple.com/apps",
  "Apple Developer": "https://developer.apple.com/account",
  "Google Play": "https://play.google.com/console",
  Cloudflare: "https://dash.cloudflare.com",
  Sentry: "https://sentry.io",
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

export function toolLinks(tools: string[], p?: Pick<Project, "owner" | "repo">): MapLink[] {
  const keys = Object.keys(TOOL_URLS).sort((a, b) => b.length - a.length);
  return tools.map((t) => {
    if (/^github actions/i.test(t) && p?.owner && p.repo) {
      return { label: t, url: `https://github.com/${p.owner}/${p.repo}/actions`, note: "tool" };
    }
    const key = keys.find((k) => t.toLowerCase().startsWith(k.toLowerCase()));
    return {
      label: t,
      url: key ? TOOL_URLS[key] : `https://www.google.com/search?q=${encodeURIComponent(t)}`,
      note: "tool",
    };
  });
}

// File paths a note points at: docs/NOW.md, db-backup.yml, supabase/migrations/x.sql.
const PATH_RE =
  /(?:^|[\s(`"'])((?:\.?[\w-]+\/)*[\w.-]+\.(?:md|mdx|ya?ml|json|tsx?|jsx?|mjs|cjs|sql|sh|py|toml))\b/g;

/** Repo files mentioned in the task, linked to the default branch; workflows also link to their runs. */
export function repoFileLinks(p: Pick<Project, "owner" | "repo">, ...texts: string[]): MapLink[] {
  if (!p.owner || !p.repo) return [];
  const base = `https://github.com/${p.owner}/${p.repo}`;
  const paths = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(PATH_RE)) paths.add(m[1]);
  return Array.from(paths).flatMap((path): MapLink[] => {
    const workflow = /\.ya?ml$/.test(path) && !path.includes("/");
    if (workflow) {
      return [
        { label: `Run ${path} (Actions → Run workflow)`, url: `${base}/actions/workflows/${path}` },
        { label: `.github/workflows/${path}`, url: `${base}/blob/HEAD/.github/workflows/${path}` },
      ];
    }
    return [{ label: path, url: `${base}/blob/HEAD/${path}` }];
  });
}

/** SCREAMING_CASE names next to the word "secret" or "env": things to paste into a settings page. */
export function secretNames(...texts: string[]): string[] {
  const text = texts.join("\n");
  if (!/secret|env(ironment)? var|\.env/i.test(text)) return [];
  return Array.from(new Set(text.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g) ?? []));
}

export function secretLinks(p: Pick<Project, "owner" | "repo">, ...texts: string[]): MapLink[] {
  const text = texts.join("\n");
  const out: MapLink[] = [];
  if (p.owner && p.repo && /github|actions|workflow/i.test(text) && secretNames(text).length) {
    out.push({ label: "Add a GitHub Actions secret", url: `https://github.com/${p.owner}/${p.repo}/settings/secrets/actions/new` });
  }
  return out;
}

/** Services a task names, linked to the page where that work happens. */
const SERVICE_LINKS: Array<[RegExp, string, string]> = [
  [/app store|testflight|build \d+|resubmi/i, "App Store Connect", "https://appstoreconnect.apple.com/apps"],
  [/testflight/i, "TestFlight builds", "https://appstoreconnect.apple.com/apps"],
  [/provisioning|profiles?\b|signing|certificate/i, "Apple certificates and profiles", "https://developer.apple.com/account/resources/profiles/list"],
  [/family controls/i, "Request Family Controls distribution", "https://developer.apple.com/contact/request/family-controls-distribution"],
  [/sign in with apple|capabilit/i, "Apple identifiers (capabilities)", "https://developer.apple.com/account/resources/identifiers/list"],
  [/stripe.*webhook|webhook.*stripe|charge\.refunded|dispute/i, "Stripe webhooks", "https://dashboard.stripe.com/webhooks"],
  [/stripe/i, "Stripe dashboard", "https://dashboard.stripe.com"],
  [/supabase.*key|key.*supabase|revoked/i, "Supabase API keys (pick the project)", "https://supabase.com/dashboard/project/_/settings/api-keys"],
  [/supabase_db_url|connection string|database url/i, "Supabase connection string (pick the project)", "https://supabase.com/dashboard/project/_?showConnect=true"],
  [/vercel/i, "Vercel dashboard (project → Settings → Environment Variables)", "https://vercel.com/dashboard"],
  [/google play|android/i, "Google Play Console", "https://play.google.com/console"],
  [/posthog/i, "PostHog", "https://us.posthog.com"],
  [/revenuecat/i, "RevenueCat", "https://app.revenuecat.com"],
  [/resend|email domain/i, "Resend", "https://resend.com/overview"],
  [/cloudflare|dns|registrar/i, "Cloudflare DNS", "https://dash.cloudflare.com"],
  [/two-factor|2fa|authenticator/i, "Authenticator setup help", "https://support.google.com/accounts/answer/1066447"],
];

export function serviceLinks(...texts: string[]): MapLink[] {
  const text = texts.join("\n");
  const seen = new Set<string>();
  return SERVICE_LINKS.filter(([re, label]) => re.test(text) && !seen.has(label) && seen.add(label)).map(
    ([, label, url]) => ({ label, url })
  );
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
