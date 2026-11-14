"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { relTime } from "@/lib/projectTypes";
import {
  APPROVAL_KINDS,
  APPROVAL_META,
  type ApprovalAction,
  type ApprovalItem,
  type ApprovalKind,
  type ApprovalOp,
  type ApprovalResult,
  type ApprovalUndo,
} from "@/lib/approvals";
import { facetHref, projectHref } from "@/lib/taskMap";
import { Chip, api, btnGhost, btnPrimary, inputBase } from "@/components/ProjectBits";
import { useToast } from "@/components/Toast";
import { useListKeys } from "@/components/useListKeys";
import { invalidateIndex } from "@/components/CommandLayer";

export type ApprovalProject = { id: string; name: string };

type Applied = { results: ApprovalResult[]; undo: ApprovalUndo[] };

export default function ApprovalsClient({ initial, projects }: { initial: ApprovalItem[]; projects: ApprovalProject[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState(initial);
  useEffect(() => setItems(initial), [initial]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [projectFor, setProjectFor] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [sendingBack, setSendingBack] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<ApprovalKind | "">("");
  const [project, setProject] = useState("");
  const [agent, setAgent] = useState("");

  const agents = useMemo(() => Array.from(new Set(items.map((i) => i.agent).filter((a): a is string => !!a))).sort(), [items]);
  const shown = useMemo(
    () => items.filter((i) => (!kind || i.kind === kind) && (!project || i.project_id === project) && (!agent || i.agent === agent)),
    [items, kind, project, agent]
  );
  const groups = APPROVAL_KINDS.map((k) => ({ kind: k, items: shown.filter((i) => i.kind === k) })).filter((g) => g.items.length);
  const flat = groups.flatMap((g) => g.items);
  const indexOf = new Map(flat.map((i, n) => [i.key, n]));

  const toggle = (key: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const opFor = (i: ApprovalItem, action: ApprovalAction): ApprovalOp => ({
    kind: i.kind,
    id: i.id,
    action,
    ...(i.kind === "proposal" && projectFor[i.key] ? { project_id: projectFor[i.key] } : {}),
    ...(i.kind === "finished" && action === "reject" && notes[i.key]?.trim() ? { note: notes[i.key].trim() } : {}),
  });

  const run = async (targets: ApprovalItem[], action: ApprovalAction) => {
    // A proposal without a project cannot become a task; leave it in place and say so.
    const blocked = action === "approve" ? targets.filter((i) => i.needs_project && !projectFor[i.key]) : [];
    const go = targets.filter((i) => !blocked.includes(i));
    if (!go.length) {
      if (blocked.length) toast({ message: `Pick a project for ${blocked.length === 1 ? `"${blocked[0].title}"` : `${blocked.length} proposals`} first.`, tone: "error" });
      return;
    }
    setBusy(true);
    const before = items;
    const keys = new Set(go.map((i) => i.key));
    setItems((xs) => xs.filter((x) => !keys.has(x.key)));
    try {
      const res = await api<Applied>("/api/approvals", "POST", { items: go.map((i) => opFor(i, action)) });
      const failed = res.results.filter((r) => !r.ok);
      if (failed.length) {
        const failedKeys = new Set(failed.map((f) => f.key));
        // Items that failed because they were already handled elsewhere disappear on refresh; the rest come back.
        setItems((xs) => [...xs, ...before.filter((x) => failedKeys.has(x.key))]);
      }
      setSelected((s) => new Set(Array.from(s).filter((k) => !keys.has(k))));
      setSendingBack(null);
      const ok = res.results.length - failed.length;
      const verb = action === "approve" ? "Approved" : "Declined";
      const tail = [blocked.length && `${blocked.length} need a project`, failed.length && `${failed.length} skipped: ${failed[0].error}`].filter(Boolean).join("; ");
      toast({
        message: `${verb} ${ok} item${ok === 1 ? "" : "s"}${tail ? ` (${tail})` : ""}`,
        tone: failed.length ? "error" : "success",
        action: res.undo.length
          ? {
              label: "Undo",
              onClick: async () => {
                try {
                  const u = await api<{ restored: number; skipped: string[] }>("/api/approvals/undo", "POST", { undo: res.undo });
                  toast({ message: `Restored ${u.restored}${u.skipped.length ? `; ${u.skipped.length} had moved on: ${u.skipped[0]}` : ""}`, tone: u.skipped.length ? "error" : "info" });
                } catch (e) {
                  toast({ message: (e as Error).message, tone: "error" });
                }
                router.refresh();
              },
            }
          : undefined,
      });
      invalidateIndex();
      router.refresh();
    } catch (e) {
      setItems(before);
      toast({ message: (e as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const reject = (i: ApprovalItem) => {
    // Sending finished work back asks for a note first; everything else declines at once.
    if (i.kind === "finished" && sendingBack !== i.key) {
      setSendingBack(i.key);
      return;
    }
    run([i], "reject");
  };

  const { cursor, setCursor } = useListKeys(flat, {
    x: (i) => toggle(i.key),
    a: (i) => run([i], "approve"),
    r: (i) => reject(i),
    Enter: (i) => setExpanded((s) => new Set(s).add(i.key)),
  });

  const selectedItems = flat.filter((i) => selected.has(i.key));

  if (!items.length) {
    return (
      <div className="border border-dashed border-line bg-bg-warm/40 py-16 px-8 text-center">
        <div className="serif-display text-2xl text-fg mb-3">Nothing to approve</div>
        <p className="text-fg-dim text-sm max-w-md mx-auto leading-relaxed">
          Agent proposals, offers to take a task, proposed decisions and finished agent work appear here when an authorized agent submits them.
        </p>
      </div>
    );
  }

  return (
    <div className={selected.size ? "pb-24" : ""}>
      <div className="flex flex-wrap items-center gap-2 mb-6 font-mono text-[0.62rem]">
        <select value={kind} onChange={(e) => setKind(e.target.value as ApprovalKind | "")} className={inputBase} aria-label="Kind">
          <option value="">every kind</option>
          {APPROVAL_KINDS.map((k) => (
            <option key={k} value={k}>
              {APPROVAL_META[k].label.toLowerCase()}
            </option>
          ))}
        </select>
        <select value={project} onChange={(e) => setProject(e.target.value)} className={`${inputBase} max-w-[14rem]`} aria-label="Project">
          <option value="">every project</option>
          {projects.filter((p) => items.some((i) => i.project_id === p.id)).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={agent} onChange={(e) => setAgent(e.target.value)} className={inputBase} aria-label="Agent">
          <option value="">every agent</option>
          {agents.map((a) => (
            <option key={a} value={a}>
              @{a}
            </option>
          ))}
        </select>
        <span className="ml-auto flex gap-2">
          <button onClick={() => setSelected(new Set(flat.map((i) => i.key)))} className={btnGhost} disabled={!flat.length}>
            Select all {flat.length}
          </button>
          <button onClick={() => run(flat, "approve")} className={btnPrimary} disabled={busy || !flat.length} title="Approve everything shown">
            Approve all shown
          </button>
        </span>
      </div>

      {!flat.length ? <p className="text-fg-dim text-sm border border-dashed border-line px-4 py-6">Nothing matches these filters.</p> : null}

      {groups.map((g) => (
        <section key={g.kind} className="mb-10">
          <div className="flex flex-wrap items-baseline gap-3 mb-1">
            <h2 className="mono-label">{APPROVAL_META[g.kind].label}</h2>
            <span className="font-mono text-[0.6rem] text-fg-ghost tnum">{g.items.length}</span>
            <button onClick={() => setSelected((s) => new Set([...Array.from(s), ...g.items.map((i) => i.key)]))} className="ml-auto font-mono text-[0.55rem] text-fg-ghost hover:text-fg">
              select all
            </button>
            <button onClick={() => run(g.items, "approve")} disabled={busy} className="font-mono text-[0.55rem] text-accent hover:text-fg disabled:opacity-40">
              {APPROVAL_META[g.kind].approve.toLowerCase()} all {g.items.length}
            </button>
          </div>
          <p className="text-fg-dim text-[0.8rem] mb-3 max-w-2xl">{APPROVAL_META[g.kind].hint}</p>
          <ul className="border border-line bg-bg/85 divide-y divide-line-soft">
            {g.items.map((i) => {
              const n = indexOf.get(i.key)!;
              const sel = selected.has(i.key);
              const open = expanded.has(i.key);
              const meta = APPROVAL_META[i.kind];
              return (
                <li
                  key={i.key}
                  data-cursor={n}
                  onMouseEnter={() => setCursor(n)}
                  className={`px-3 py-3 ${n === cursor ? "bg-[rgba(139,115,85,0.08)]" : ""} ${sel ? "border-l-2 border-accent" : "border-l-2 border-transparent"}`}
                >
                  <div className="flex flex-wrap md:flex-nowrap items-start gap-x-3 gap-y-2">
                    <input type="checkbox" checked={sel} onChange={() => toggle(i.key)} className="mt-1 shrink-0" aria-label={`Select ${i.title}`} />
                    <div className="flex-1 min-w-[12rem]">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <Link href={i.href} className="text-[0.92rem] text-fg hover:text-accent">
                          {i.title}
                        </Link>
                        {i.link ? (
                          <a href={i.link} target="_blank" rel="noreferrer" className="font-mono text-[0.58rem] text-accent hover:text-fg">
                            {/\/pull\/\d+/.test(i.link) ? "pull request ↗" : "link ↗"}
                          </a>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {i.project_id && i.project_name ? (
                          <Chip tone="accent">
                            <Link href={projectHref(i.project_id)}>{i.project_name}</Link>
                          </Chip>
                        ) : null}
                        {i.agent ? (
                          <Chip>
                            <Link href={facetHref("agent", i.agent)}>@{i.agent}</Link>
                          </Chip>
                        ) : null}
                        <span className="font-mono text-[0.58rem] text-fg-ghost">{relTime(i.at)}</span>
                      </div>
                      {i.body ? (
                        <button
                          onClick={() => setExpanded((s) => { const x = new Set(s); if (x.has(i.key)) x.delete(i.key); else x.add(i.key); return x; })}
                          className={`block text-left mt-2 text-[0.82rem] text-fg-dim leading-relaxed whitespace-pre-wrap ${open ? "" : "line-clamp-2"}`}
                          title={open ? "Show less" : "Show all"}
                        >
                          {i.body}
                        </button>
                      ) : null}
                      {sendingBack === i.key ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <input
                            autoFocus
                            value={notes[i.key] ?? ""}
                            onChange={(e) => setNotes((x) => ({ ...x, [i.key]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") run([i], "reject");
                              if (e.key === "Escape") setSendingBack(null);
                            }}
                            placeholder="What should the agent fix? (optional)"
                            className={`${inputBase} flex-1 min-w-[14rem]`}
                            aria-label="Note for the agent"
                          />
                          <button onClick={() => run([i], "reject")} className={btnPrimary} disabled={busy}>
                            Send back
                          </button>
                          <button onClick={() => setSendingBack(null)} className={btnGhost}>
                            Cancel
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[0.62rem] shrink-0">
                      {i.kind === "proposal" ? (
                        <select
                          value={projectFor[i.key] ?? i.project_id ?? ""}
                          onChange={(e) => setProjectFor((x) => ({ ...x, [i.key]: e.target.value }))}
                          className={`${inputBase} max-w-[12rem] ${i.needs_project && !projectFor[i.key] ? "border-accent" : ""}`}
                          aria-label="Project"
                        >
                          <option value="">Project…</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <button onClick={() => reject(i)} className={btnGhost} disabled={busy} title={`${meta.reject} (r)`}>
                        {meta.reject}
                      </button>
                      <button onClick={() => run([i], "approve")} className={btnPrimary} disabled={busy || (i.needs_project && !projectFor[i.key])} title={`${meta.approve} (a)`}>
                        {meta.approve}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {selected.size ? (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 glass border border-line shadow-[var(--shadow-lifted)] px-4 py-3 flex flex-wrap items-center gap-2 font-mono text-[0.62rem] max-w-[calc(100vw-2rem)]">
          <span className="text-fg mr-2 tnum">{selected.size} selected</span>
          <button onClick={() => run(selectedItems, "approve")} className={btnPrimary} disabled={busy}>
            Approve {selectedItems.length}
          </button>
          <button onClick={() => run(selectedItems, "reject")} className={btnGhost} disabled={busy} title="Drop proposals, decline offers, reject decisions, send finished work back">
            Decline {selectedItems.length}
          </button>
          <button onClick={() => setSelected(new Set())} className="text-fg-ghost hover:text-fg px-2">
            clear
          </button>
        </div>
      ) : null}
    </div>
  );
}
