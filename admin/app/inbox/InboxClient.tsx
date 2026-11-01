"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PRIORITIES, relTime, today, type InboxItem, type Priority, type ProjectStatus, type Task } from "@/lib/projectTypes";
import { ME, facetHref, projectHref, taskHref } from "@/lib/taskMap";
import { Chip, InlineText, StatusDot, api, btnGhost, btnPrimary, inputBase } from "@/components/ProjectBits";
import { useToast } from "@/components/Toast";
import { useListKeys } from "@/components/useListKeys";
import { invalidateIndex, useCommands } from "@/components/CommandLayer";

export type InboxProject = { id: string; name: string; status: ProjectStatus; agents: string[]; milestones: Array<{ id: string; title: string }> };

type Choice = { project_id: string; milestone_id: string; agent: string; priority: Priority; due_date: string; planned_for: boolean };

export default function InboxClient({ initial, projects, agents }: { initial: InboxItem[]; projects: InboxProject[]; agents: string[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { open } = useCommands();
  const [items, setItems] = useState(initial);
  useEffect(() => setItems(initial), [initial]);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const choice = (i: InboxItem): Choice =>
    choices[i.id] ?? {
      project_id: i.project_id ?? "",
      milestone_id: "",
      agent: i.agent ?? "",
      priority: i.priority ?? "medium",
      due_date: i.due_date ?? "",
      planned_for: false,
    };
  const setChoice = (id: string, patch: Partial<Choice>) => setChoices((c) => ({ ...c, [id]: { ...choice(items.find((x) => x.id === id)!), ...c[id], ...patch } }));

  const triage = async (i: InboxItem) => {
    const c = choice(i);
    if (!c.project_id) {
      toast({ message: "Pick a project first.", tone: "error" });
      return;
    }
    setBusy(i.id);
    try {
      const res = await api<{ task: Task }>(`/api/inbox/${i.id}/triage`, "POST", {
        project_id: c.project_id,
        milestone_id: c.milestone_id || null,
        agent: c.agent || null,
        priority: c.priority,
        due_date: c.due_date || null,
        planned_for: c.planned_for ? today() : null,
      });
      setItems((xs) => xs.filter((x) => x.id !== i.id));
      const name = projects.find((p) => p.id === c.project_id)?.name ?? "project";
      toast({ message: `Added to ${name}: ${i.title}`, tone: "success", action: { label: "Open task", onClick: () => router.push(taskHref(res.task.id)) } });
      invalidateIndex();
      router.refresh();
    } catch (e) {
      toast({ message: (e as Error).message, tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const drop = async (i: InboxItem) => {
    setItems((xs) => xs.filter((x) => x.id !== i.id));
    try {
      await api(`/api/inbox/${i.id}`, "DELETE");
      toast({
        message: `Dropped: ${i.title}`,
        action: {
          label: "Undo",
          onClick: async () => {
            const { item } = await api<{ item: InboxItem }>("/api/inbox", "POST", {
              title: i.title,
              notes: i.notes,
              project_id: i.project_id,
              agent: i.agent,
              priority: i.priority,
              due_date: i.due_date,
              estimate: i.estimate,
              labels: i.labels,
              source: i.source,
            });
            setItems((xs) => [item, ...xs]);
            router.refresh();
          },
        },
      });
      invalidateIndex();
      router.refresh();
    } catch (e) {
      setItems((xs) => [i, ...xs]);
      toast({ message: (e as Error).message, tone: "error" });
    }
  };

  const edit = async (i: InboxItem, patch: Partial<InboxItem>) => {
    setItems((xs) => xs.map((x) => (x.id === i.id ? { ...x, ...patch } : x)));
    try {
      await api(`/api/inbox/${i.id}`, "PATCH", patch);
    } catch (e) {
      toast({ message: (e as Error).message, tone: "error" });
    }
  };

  const { cursor, setCursor } = useListKeys(items, {
    Enter: (i) => triage(i),
    Backspace: (i) => drop(i),
    Delete: (i) => drop(i),
  });

  if (!items.length) {
    return (
      <div className="border border-dashed border-line bg-bg-warm/40 py-16 px-8 text-center">
        <div className="serif-display text-2xl text-fg mb-3">Inbox zero</div>
        <p className="text-fg-dim text-sm max-w-md mx-auto leading-relaxed mb-5">
          Nothing waiting to be sorted. Capture the next thought with <kbd className="font-mono text-[0.75rem] border border-line px-1">c</kbd>, and agents can propose work here through the API.
        </p>
        <button onClick={() => open("capture")} className={btnPrimary}>Capture something</button>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((i, idx) => {
        const c = choice(i);
        const project = projects.find((p) => p.id === c.project_id);
        const agentOptions = Array.from(new Set([ME, ...(project?.agents ?? []), ...agents]));
        return (
          <li
            key={i.id}
            id={`item-${i.id}`}
            data-cursor={idx}
            onMouseEnter={() => setCursor(idx)}
            className={`border bg-bg/85 p-4 scroll-mt-24 ${idx === cursor ? "border-accent" : "border-line"}`}
          >
            <div className="flex flex-wrap items-baseline gap-3 mb-2">
              <div className="flex-1 min-w-[14rem] text-[1rem] text-fg">
                <InlineText value={i.title} onSave={(title) => title && edit(i, { title })} />
              </div>
              <span className="font-mono text-[0.58rem] text-fg-ghost">
                {i.source && i.source !== ME ? (
                  <>
                    proposed by <Link href={facetHref("agent", i.source)} className="hover:text-accent">@{i.source}</Link> ·{" "}
                  </>
                ) : null}
                {relTime(i.created_at)}
              </span>
            </div>
            {i.notes ? (
              <div className="text-[0.82rem] text-fg-dim leading-relaxed mb-2 whitespace-pre-wrap">
                <InlineText multiline value={i.notes} onSave={(notes) => edit(i, { notes })} />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {i.labels.map((l) => (
                <Chip key={l}>+{l}</Chip>
              ))}
              {i.estimate ? <Chip>{i.estimate} pt</Chip> : null}
              {i.project_id && projects.find((p) => p.id === i.project_id) ? (
                <Chip tone="accent">
                  <Link href={projectHref(i.project_id)}>{projects.find((p) => p.id === i.project_id)!.name}</Link>
                </Chip>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 font-mono text-[0.62rem]">
              <select value={c.project_id} onChange={(e) => setChoice(i.id, { project_id: e.target.value, milestone_id: "" })} className={`${inputBase} max-w-[14rem]`} aria-label="Project">
                <option value="">Project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {project ? <StatusDot status={project.status} /> : null}
              {project?.milestones.length ? (
                <select value={c.milestone_id} onChange={(e) => setChoice(i.id, { milestone_id: e.target.value })} className={`${inputBase} max-w-[12rem]`} aria-label="Milestone">
                  <option value="">Unscheduled</option>
                  {project.milestones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              ) : null}
              <select value={c.agent} onChange={(e) => setChoice(i.id, { agent: e.target.value })} className={`${inputBase} max-w-[10rem]`} aria-label="Assignee">
                <option value="">@ unassigned</option>
                {agentOptions.map((a) => (
                  <option key={a} value={a}>
                    @{a}
                  </option>
                ))}
              </select>
              <select value={c.priority} onChange={(e) => setChoice(i.id, { priority: e.target.value as Priority })} className={`${inputBase}`} aria-label="Priority">
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <input type="date" value={c.due_date} onChange={(e) => setChoice(i.id, { due_date: e.target.value })} className={`${inputBase}`} aria-label="Due date" />
              <label className="flex items-center gap-1.5 text-fg-dim">
                <input type="checkbox" checked={c.planned_for} onChange={(e) => setChoice(i.id, { planned_for: e.target.checked })} />
                today
              </label>
              <span className="ml-auto flex gap-2">
                <button onClick={() => drop(i)} className={btnGhost} title="Drop (backspace)">Drop</button>
                <button onClick={() => triage(i)} disabled={busy === i.id || !c.project_id} className={btnPrimary} title="Add as a task (enter)">
                  {busy === i.id ? "Adding…" : "Add task"}
                </button>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
