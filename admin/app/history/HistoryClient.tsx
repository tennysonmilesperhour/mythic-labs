"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fmtDate, relTime, type ProjectDetail } from "@/lib/projectTypes";
import { projectHref } from "@/lib/taskMap";
import { Chip, api, btnGhost, btnPrimary, inputBase } from "@/components/ProjectBits";
import { useToast } from "@/components/Toast";

export type Commit = { sha: string; message: string; date: string | null };

type Preview = { sha: string; detail: ProjectDetail };

export default function HistoryClient({ commits, projects, projectId }: { commits: Commit[]; projects: Array<{ id: string; name: string }>; projectId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const project = projects.find((p) => p.id === projectId);

  const open = async (sha: string) => {
    if (!projectId) return;
    setBusy(sha);
    try {
      const detail = await api<ProjectDetail>(`/api/projects/${projectId}/history/${sha}`, "GET");
      setPreview({ sha, detail });
    } catch (e) {
      toast({ message: (e as Error).message, tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const restore = async (sha: string) => {
    if (!project) return;
    if (!confirm(`Restore ${project.name} to its version at ${sha.slice(0, 7)}? The current version stays in history.`)) return;
    setBusy(sha);
    try {
      await api(`/api/projects/${projectId}/history/${sha}`, "POST");
      toast({ message: `${project.name} restored to ${sha.slice(0, 7)}.`, tone: "success", action: { label: "Open project", onClick: () => router.push(projectHref(projectId)) } });
      setPreview(null);
      router.refresh();
    } catch (e) {
      toast({ message: (e as Error).message, tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  // Group by day for scanning.
  const groups = new Map<string, Commit[]>();
  for (const c of commits) {
    const k = c.date ? c.date.slice(0, 10) : "undated";
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }

  return (
    <div className={`grid grid-cols-1 gap-10 ${preview ? "lg:grid-cols-[1fr_24rem]" : ""}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3 mb-6 font-mono text-[0.62rem]">
          <select
            value={projectId}
            onChange={(e) => router.push(e.target.value ? `/history?project=${e.target.value}` : "/history")}
            className={inputBase}
            aria-label="Project"
          >
            <option value="">every project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="text-fg-ghost">{commits.length} commits{projectId ? " touching this project" : ""}</span>
          {!projectId ? <span className="text-fg-ghost">· pick a project to preview and restore versions</span> : null}
        </div>
        {commits.length ? (
          Array.from(groups.entries()).map(([day, list]) => (
            <section key={day} className="mb-8">
              <div className="hairline-accent-sm mb-2">
                <span className="mono-label">{day === "undated" ? "Undated" : fmtDate(day)}</span>
              </div>
              <ol className="border border-line bg-bg/85 divide-y divide-line-soft">
                {list.map((c) => {
                  const [head, ...rest] = c.message.split("\n");
                  return (
                    <li key={c.sha} className={`flex flex-wrap md:flex-nowrap items-baseline gap-3 px-4 py-2.5 ${preview?.sha === c.sha ? "bg-[rgba(139,115,85,0.08)]" : ""}`}>
                      <span className="font-mono text-[0.58rem] text-fg-ghost shrink-0 w-14" title={c.sha}>{c.sha.slice(0, 7)}</span>
                      <span className="flex-1 min-w-[12rem] text-[0.88rem] text-fg">
                        {head}
                        {rest.filter(Boolean).length ? <span className="block font-mono text-[0.58rem] text-fg-ghost truncate">{rest.filter(Boolean).join(" ")}</span> : null}
                      </span>
                      <span className="font-mono text-[0.58rem] text-fg-ghost shrink-0" title={c.date ? new Date(c.date).toLocaleString() : ""}>{relTime(c.date)}</span>
                      {projectId ? (
                        <span className="flex gap-1 shrink-0">
                          <button onClick={() => open(c.sha)} disabled={busy === c.sha} className={btnGhost}>Preview</button>
                          <button onClick={() => restore(c.sha)} disabled={busy === c.sha} className={btnGhost}>Restore</button>
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))
        ) : (
          <p className="text-fg-ghost text-sm">No commits yet.</p>
        )}
      </div>

      {preview ? (
        <aside>
          <div className="sticky top-6 border border-line bg-bg/85 p-4 max-h-[calc(100vh-4rem)] overflow-y-auto">
            <div className="flex items-baseline justify-between mb-3">
              <span className="mono-label">Version {preview.sha.slice(0, 7)}</span>
              <button onClick={() => setPreview(null)} className="font-mono text-[0.6rem] text-fg-ghost hover:text-fg">close</button>
            </div>
            <div className="serif-display text-[1.4rem] leading-tight mb-1">{preview.detail.project.name}</div>
            <div className="font-mono text-[0.6rem] text-fg-dim mb-3">
              {preview.detail.project.status} · {preview.detail.project.priority} · updated {fmtDate(preview.detail.project.updated_at)}
            </div>
            {preview.detail.project.next_action ? <p className="text-[0.85rem] text-fg mb-3">Next: {preview.detail.project.next_action}</p> : null}
            <div className="flex flex-wrap gap-1.5 mb-4">
              <Chip>{preview.detail.milestones.length} milestones</Chip>
              <Chip>{preview.detail.tasks.length} tasks</Chip>
              <Chip>{preview.detail.tasks.filter((t) => t.status === "done").length} done</Chip>
              <Chip>{preview.detail.entries.length} entries</Chip>
            </div>
            <div className="mono-label-dim mb-1">Open tasks then</div>
            <ul className="flex flex-col mb-4 max-h-64 overflow-y-auto">
              {preview.detail.tasks
                .filter((t) => t.status !== "done")
                .slice(0, 30)
                .map((t) => (
                  <li key={t.id} className="flex items-baseline gap-2 py-1 border-b border-line text-[0.82rem]">
                    <span className="flex-1 min-w-0 truncate">{t.title}</span>
                    <span className="font-mono text-[0.55rem] text-fg-ghost">{t.status}{t.agent ? ` · @${t.agent}` : ""}</span>
                  </li>
                ))}
            </ul>
            <div className="flex gap-2">
              <button onClick={() => restore(preview.sha)} disabled={busy === preview.sha} className={btnPrimary}>Restore this version</button>
              <Link href={projectHref(projectId)} className={btnGhost}>Current →</Link>
            </div>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
