"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { STATUS_META, fmtDate, type ProjectStatus } from "@/lib/projectTypes";
import { fuzzyScore, parseQuick, toTaskFields, type Parsed, type ProjectOption } from "@/lib/quick";
import { api } from "@/components/ProjectBits";
import { projectHref, taskHref } from "@/lib/taskMap";
import { useToast } from "./Toast";

type Mode = null | "palette" | "capture" | "help";

type Commands = {
  open: (mode: Exclude<Mode, null>, seed?: string) => void;
  close: () => void;
};

const Ctx = createContext<Commands | null>(null);

export function useCommands(): Commands {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCommands needs <CommandLayer>");
  return c;
}

/** Pages reachable with g then a letter. Shared by the palette, the help sheet and the sidebar. */
export const GO: Array<{ key: string; href: string; label: string }> = [
  { key: "o", href: "/", label: "Overview" },
  { key: "t", href: "/today", label: "Today" },
  { key: "i", href: "/inbox", label: "Inbox" },
  { key: "m", href: "/tasks", label: "My tasks" },
  { key: "q", href: "/queue", label: "All tasks" },
  { key: "p", href: "/projects", label: "Projects" },
  { key: "r", href: "/review", label: "Review" },
  { key: "n", href: "/insights", label: "Insights" },
  { key: "h", href: "/history", label: "History" },
  { key: "b", href: "/brain", label: "Brain" },
  { key: "s", href: "/repos", label: "Repos" },
  { key: "a", href: "/authoring", label: "Authoring" },
];

type Index = {
  projects: Array<{ id: string; name: string; status: ProjectStatus; owner: string | null; repo: string | null; summary: string; tags: string[] }>;
  tasks: Array<{ id: string; project_id: string; project_name: string; title: string; status: string; priority: string; agent: string | null; due_date: string | null; labels: string[]; ready: boolean }>;
  milestones: Array<{ id: string; project_id: string; project_name: string; title: string; target_date: string | null; done: boolean }>;
  entries: Array<{ id: string; project_id: string; project_name: string; kind: string; title: string; entry_date: string; decision_status: string | null }>;
  inbox: Array<{ id: string; title: string }>;
  generated_at: string;
};

let indexCache: { at: number; value: Promise<Index> } | null = null;
const INDEX_TTL = 45_000;

function loadIndex(force = false): Promise<Index> {
  if (!force && indexCache && Date.now() - indexCache.at < INDEX_TTL) return indexCache.value;
  const value = api<Index>("/api/search", "GET");
  indexCache = { at: Date.now(), value };
  value.catch(() => (indexCache = null));
  return value;
}

/** Forget the cached search index (after a write). */
export function invalidateIndex() {
  indexCache = null;
}

const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
};

export default function CommandLayer({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>(null);
  const [seed, setSeed] = useState("");
  const router = useRouter();
  const pending = useRef<{ key: string; at: number } | null>(null);

  const open = useCallback((m: Exclude<Mode, null>, s = "") => {
    setSeed(s);
    setMode(m);
  }, []);
  const close = useCallback(() => setMode(null), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMode((m) => (m === "palette" ? null : "palette"));
        setSeed("");
        return;
      }
      if (e.key === "Escape" && mode) {
        setMode(null);
        return;
      }
      if (mode || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const now = Date.now();
      if (pending.current && now - pending.current.at < 900) {
        const target = GO.find((g) => g.key === e.key.toLowerCase());
        pending.current = null;
        if (target) {
          e.preventDefault();
          router.push(target.href);
        }
        return;
      }
      if (e.key === "g") {
        pending.current = { key: "g", at: now };
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        open("palette");
      } else if (e.key === "c") {
        e.preventDefault();
        open("capture");
      } else if (e.key === "?") {
        e.preventDefault();
        open("help");
      }
    };
    const onHelp = () => open("help");
    const onCapture = (e: Event) => open("capture", (e as CustomEvent<string>).detail ?? "");
    const onPalette = () => open("palette");
    document.addEventListener("keydown", onKey);
    document.addEventListener("mythic:open-help", onHelp);
    document.addEventListener("mythic:open-capture", onCapture);
    document.addEventListener("mythic:open-palette", onPalette);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mythic:open-help", onHelp);
      document.removeEventListener("mythic:open-capture", onCapture);
      document.removeEventListener("mythic:open-palette", onPalette);
    };
  }, [mode, open, router]);

  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {mode ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(0,0,0,0.35)] px-4 pt-[12vh]" onMouseDown={close} role="presentation">
          <div className="w-full max-w-2xl" onMouseDown={(e) => e.stopPropagation()}>
            {mode === "palette" ? <Palette seed={seed} onClose={close} onCapture={(s) => open("capture", s)} /> : null}
            {mode === "capture" ? <Capture seed={seed} onClose={close} /> : null}
            {mode === "help" ? <Help onClose={close} /> : null}
          </div>
        </div>
      ) : null}
    </Ctx.Provider>
  );
}

// ─────────── palette ───────────

type Row = {
  key: string;
  kind: string;
  title: string;
  meta?: string;
  href?: string;
  run?: () => void;
  score: number;
};

function Palette({ seed, onClose, onCapture }: { seed: string; onClose: () => void; onCapture: (s: string) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(seed);
  const [index, setIndex] = useState<Index | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    loadIndex().then(setIndex, (e: Error) => setErr(e.message));
  }, []);

  const rows = useMemo<Row[]>(() => {
    const query = q.trim();
    const onlyCommands = query.startsWith(">");
    const onlyProjects = query.startsWith("#");
    const text = query.replace(/^[>#]\s*/, "");
    const out: Row[] = [];
    const push = (r: Omit<Row, "score"> & { score?: number }, hay: string) => {
      const score = r.score ?? fuzzyScore(text, hay);
      if (score > 0) out.push({ ...r, score });
    };
    if (!onlyProjects) {
      for (const g of GO) {
        if (g.href === pathname) continue;
        push({ key: `go:${g.href}`, kind: "go to", title: g.label, meta: `g ${g.key}`, href: g.href }, `go ${g.label}`);
      }
      push({ key: "cmd:new-project", kind: "action", title: "New project", meta: "Projects page", href: "/projects?new=1" }, "new project add project create project");
      push({ key: "cmd:reload", kind: "action", title: "Reload data", meta: "re-read the store", run: () => router.refresh() }, "reload refresh data");
      push({ key: "cmd:theme", kind: "action", title: "Toggle dark mode", meta: "light / dark", run: () => document.dispatchEvent(new CustomEvent("mythic:toggle-theme")) }, "toggle theme dark mode light");
      push({ key: "cmd:help", kind: "action", title: "Keyboard shortcuts", meta: "?", run: () => document.dispatchEvent(new CustomEvent("mythic:open-help")) }, "keyboard shortcuts help");
      push({ key: "cmd:brief", kind: "action", title: "Copy today's brief as Markdown", meta: "/api/digest", run: () => fetch("/api/digest").then((r) => r.text()).then((t) => navigator.clipboard.writeText(t)) }, "copy brief digest markdown");
    }
    if (!onlyCommands && index) {
      const lim = text ? 8 : 5;
      index.projects
        .map((p) => ({ p, s: fuzzyScore(text, `${p.name} ${p.owner ?? ""}/${p.repo ?? ""} ${p.tags.join(" ")}`) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, text ? 12 : 6)
        .forEach(({ p, s }) => push({ key: `p:${p.id}`, kind: "project", title: p.name, meta: STATUS_META[p.status].label, href: projectHref(p.id), score: s + 2 }, p.name));
      if (!onlyProjects) {
        index.tasks
          .filter((t) => text ? true : t.status === "doing")
          .map((t) => ({ t, s: fuzzyScore(text, `${t.title} ${t.project_name} ${t.labels.map((l) => `+${l}`).join(" ")} ${t.agent ?? ""}`) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s || Number(b.t.status === "doing") - Number(a.t.status === "doing"))
          .slice(0, text ? 14 : lim)
          .forEach(({ t, s }) =>
            push(
              { key: `t:${t.id}`, kind: t.status === "done" ? "done task" : "task", title: t.title, meta: [t.project_name, t.agent ? `@${t.agent}` : null, t.due_date ? `due ${fmtDate(t.due_date)}` : null].filter(Boolean).join(" · "), href: taskHref(t.id), score: s + (t.status === "done" ? -10 : 0) },
              t.title
            )
          );
        if (text) {
          index.milestones
            .map((m) => ({ m, s: fuzzyScore(text, `${m.title} ${m.project_name}`) }))
            .filter((x) => x.s > 0)
            .sort((a, b) => b.s - a.s)
            .slice(0, 5)
            .forEach(({ m, s }) => push({ key: `m:${m.id}`, kind: "milestone", title: m.title, meta: `${m.project_name}${m.target_date ? ` · ${fmtDate(m.target_date)}` : ""}`, href: projectHref(m.project_id, "plan"), score: s }, m.title));
          index.entries
            .map((e) => ({ e, s: fuzzyScore(text, `${e.title} ${e.project_name} ${e.kind}`) }))
            .filter((x) => x.s > 0)
            .sort((a, b) => b.s - a.s)
            .slice(0, 8)
            .forEach(({ e, s }) => {
              const tab = e.kind === "decision" ? "decisions" : e.kind === "changelog" ? "changelog" : e.kind === "update" ? "activity" : "notes";
              push({ key: `e:${e.id}`, kind: e.kind, title: e.title, meta: `${e.project_name} · ${fmtDate(e.entry_date)}`, href: projectHref(e.project_id, tab, e.id), score: s - 5 }, e.title);
            });
          index.inbox
            .map((i) => ({ i, s: fuzzyScore(text, i.title) }))
            .filter((x) => x.s > 0)
            .slice(0, 5)
            .forEach(({ i, s }) => push({ key: `i:${i.id}`, kind: "inbox", title: i.title, meta: "waiting to be sorted", href: `/inbox#item-${i.id}`, score: s }, i.title));
        }
      }
    }
    out.sort((a, b) => b.score - a.score);
    if (text && !onlyCommands && !onlyProjects) {
      out.push({ key: "capture", kind: "capture", title: `Capture "${text}"`, meta: "c · opens quick capture with this text", run: () => onCapture(text), score: -1 });
    }
    return out.slice(0, 40);
  }, [q, index, pathname, router, onCapture]);

  useEffect(() => setCursor(0), [q]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const run = (r: Row) => {
    onClose();
    if (r.run) r.run();
    else if (r.href) router.push(r.href);
  };

  return (
    <div className="glass border border-line shadow-[var(--shadow-lifted)]" role="dialog" aria-label="Command palette">
      <div className="flex items-center gap-3 border-b border-line px-4">
        <span className="font-mono text-[0.7rem] text-accent">⌕</span>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(rows.length - 1, c + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === "Enter" && rows[cursor]) {
              e.preventDefault();
              run(rows[cursor]);
            }
          }}
          placeholder="Search projects, tasks, decisions… or type > for actions, # for projects"
          className="flex-1 bg-transparent py-3.5 text-[0.95rem] text-fg placeholder:text-fg-ghost outline-none"
          aria-label="Search"
        />
        <kbd className="font-mono text-[0.55rem] text-fg-ghost border border-line px-1.5 py-0.5">esc</kbd>
      </div>
      <div ref={listRef} className="max-h-[55vh] overflow-y-auto">
        {err ? <p className="px-4 py-3 text-sm text-fg-dim">Search index unavailable: {err}</p> : null}
        {!index && !err ? <p className="px-4 py-3 font-mono text-[0.6rem] text-fg-ghost">Loading index…</p> : null}
        {rows.length === 0 && index ? <p className="px-4 py-4 text-sm text-fg-ghost">Nothing matches.</p> : null}
        <ul>
          {rows.map((r, i) => (
            <li key={r.key} data-row={i}>
              <button
                onMouseEnter={() => setCursor(i)}
                onClick={() => run(r)}
                className={`w-full text-left flex items-baseline gap-3 px-4 py-2 ${i === cursor ? "bg-[rgba(139,115,85,0.1)]" : "hover:bg-[rgba(139,115,85,0.05)]"}`}
              >
                <span className={`font-mono text-[0.52rem] uppercase tracking-[0.15em] w-16 shrink-0 ${r.kind === "capture" ? "text-fg" : "text-accent"}`}>{r.kind}</span>
                <span className="flex-1 min-w-0 truncate text-[0.9rem] text-fg">{r.title}</span>
                {r.meta ? <span className="font-mono text-[0.58rem] text-fg-ghost shrink-0 truncate max-w-[40%]">{r.meta}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2 font-mono text-[0.55rem] text-fg-ghost">
        <span>↑↓ move</span>
        <span>↵ open</span>
        <span>g then a letter: go to a page</span>
        <span>c: capture</span>
        <span>?: all shortcuts</span>
      </div>
    </div>
  );
}

// ─────────── quick capture ───────────

function Capture({ seed, onClose }: { seed: string; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [text, setText] = useState(seed);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [override, setOverride] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.setSelectionRange(text.length, text.length);
    loadIndex().then((i) => setProjects(i.projects.map((p) => ({ id: p.id, name: p.name }))), () => setProjects([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parsed: Parsed = useMemo(() => parseQuick(text, projects), [text, projects]);
  const target = override ? projects.find((p) => p.id === override) ?? null : parsed.project;

  const submit = async () => {
    if (!parsed.title.trim()) return;
    setBusy(true);
    setErr(null);
    const fields = toTaskFields(parsed);
    try {
      if (target) {
        const res = await api<{ task: { id: string } }>(`/api/projects/${target.id}/tasks`, "POST", fields);
        toast({ message: `Added to ${target.name}: ${parsed.title}`, tone: "success", action: { label: "Open", onClick: () => router.push(taskHref(res.task.id)) } });
      } else {
        await api("/api/inbox", "POST", { ...fields, priority: parsed.priority });
        toast({ message: `Captured to Inbox: ${parsed.title}`, tone: "success", action: { label: "Open inbox", onClick: () => router.push("/inbox") } });
      }
      invalidateIndex();
      router.refresh();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass border border-line shadow-[var(--shadow-lifted)]" role="dialog" aria-label="Quick capture">
      <div className="flex items-baseline justify-between px-4 pt-3">
        <span className="mono-label">Quick capture</span>
        <span className="font-mono text-[0.55rem] text-fg-ghost">⌘↵ save · esc close</span>
      </div>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        rows={3}
        placeholder={'What needs doing? e.g. "Fix login redirect #mythic-labs @claude-code !high due:fri ~3 +bug"\nMore lines become notes.'}
        className="w-full bg-transparent px-4 py-3 text-[1rem] text-fg placeholder:text-fg-ghost outline-none resize-none leading-relaxed"
      />
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 min-h-[1.5rem]">
        {parsed.tokens.map((t, i) => (
          <span key={i} className={`font-mono text-[0.58rem] px-1.5 py-0.5 border ${t.kind.endsWith("?") ? "border-fg text-fg" : "border-accent text-fg"}`}>
            <span className="text-fg-ghost">{t.kind.replace("?", "")} </span>
            {t.text}
          </span>
        ))}
        {!parsed.tokens.length && text.trim() ? <span className="font-mono text-[0.58rem] text-fg-ghost">No tokens yet. Add #project to file it, or leave it for the Inbox.</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
        <label className="flex items-center gap-2 font-mono text-[0.6rem] text-fg-dim">
          To
          <select value={override || parsed.project?.id || ""} onChange={(e) => setOverride(e.target.value)} className="bg-bg border border-line px-2 py-1 text-fg outline-none max-w-[14rem]">
            <option value="">Inbox (sort later)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <span className="font-mono text-[0.55rem] text-fg-ghost hidden md:inline">
          #project @agent !high due:fri plan:tomorrow ~3 +label every week
        </span>
        <div className="ml-auto flex items-center gap-3">
          {err ? <span className="font-mono text-xs text-fg">{err}</span> : null}
          <button onClick={submit} disabled={busy || !parsed.title.trim()} className="lift-on-hover font-mono text-[0.62rem] tracking-[0.22em] uppercase px-4 py-2 bg-fg text-bg disabled:opacity-40">
            {busy ? "Saving…" : target ? `Add to ${target.name}` : "Capture"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────── help ───────────

function Help({ onClose }: { onClose: () => void }) {
  const groups: Array<[string, Array<[string, string]>]> = [
    [
      "Anywhere",
      [
        ["⌘ K  or  /", "Search and commands"],
        ["c", "Quick capture"],
        ["?", "This sheet"],
        ["esc", "Close"],
      ],
    ],
    ["Go to", GO.map((g) => [`g ${g.key}`, g.label] as [string, string])],
    [
      "In task lists",
      [
        ["j / k", "Next / previous task"],
        ["x", "Select"],
        ["↵", "Open"],
        ["d", "Mark done"],
        ["s", "Start"],
        ["b", "Mark blocked"],
        ["t", "Plan for today"],
        ["e", "Edit in place"],
      ],
    ],
  ];
  return (
    <div className="glass border border-line shadow-[var(--shadow-lifted)] p-6" role="dialog" aria-label="Keyboard shortcuts">
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="serif-display text-[1.6rem]">Keyboard</h2>
        <button onClick={onClose} className="font-mono text-[0.6rem] text-fg-ghost hover:text-fg">esc</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {groups.map(([title, rows]) => (
          <div key={title}>
            <div className="mono-label-dim mb-2">{title}</div>
            <dl className="flex flex-col gap-1.5">
              {rows.map(([k, v]) => (
                <div key={k} className="flex items-baseline gap-3">
                  <dt className="font-mono text-[0.62rem] text-fg w-20 shrink-0">{k}</dt>
                  <dd className="text-[0.82rem] text-fg-dim">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <p className="mt-5 text-[0.78rem] text-fg-ghost">
        Shortcuts stay quiet while you type in a field. Due dates in capture accept words like tomorrow, fri, next week, in 3d, nov 5 or 2026-11-05.{" "}
        <Link href="/today" onClick={onClose} className="text-accent hover:text-fg">Start with Today →</Link>
      </p>
    </div>
  );
}
