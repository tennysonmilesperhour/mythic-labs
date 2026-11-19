"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { relTime } from "@/lib/projectTypes";
import type { Message, Thread } from "@/lib/messageTypes";
import { ME } from "@/lib/taskMap";
import { Chip, api, btnGhost, btnPrimary, inputCls } from "@/components/ProjectBits";
import Markdown from "@/components/Markdown";
import { useToast } from "@/components/Toast";

const KIND_LABEL: Record<Thread["kind"], string> = { message: "message", report: "run report", needs_you: "needs you" };

export default function MessagesClient({ initial, claudeUrl, initialThread }: { initial: Thread[]; claudeUrl: string; initialThread?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [threads, setThreads] = useState(initial);
  useEffect(() => setThreads(initial), [initial]);
  const [openId, setOpenId] = useState<string | null>(initialThread ?? null);
  const [showReports, setShowReports] = useState(!!initialThread && initial.find(t=>t.id===initialThread)?.kind === "report");
  const reports = threads.filter(t=>t.kind === "report");
  const visibleThreads = threads.filter(t=>showReports ? t.kind === "report" : t.kind !== "report");
  const [composing, setComposing] = useState(initial.length === 0);
  const [subject, setSubject] = useState("");
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const open = useMemo(() => threads.find((t) => t.id === openId) ?? null, [threads, openId]);

  // Opening a thread marks its agent messages read.
  useEffect(() => {
    if (!open || !open.unread) return;
    setThreads((ts) => ts.map((t) => (t.id === open.id ? { ...t, unread: 0, messages: t.messages.map((m) => (m.author !== ME && !m.read_at ? { ...m, read_at: new Date().toISOString() } : m)) } : t)));
    api(`/api/messages/${open.id}/read`, "POST").then(() => router.refresh()).catch(() => undefined);
  }, [open, router]);

  const send = async (payload: { body: string; subject?: string; thread_id?: string }) => {
    setBusy(true);
    try {
      const { message } = await api<{ message: Message }>("/api/messages", "POST", payload);
      setThreads((ts) => {
        if (payload.thread_id) {
          return ts
            .map((t) => (t.id === payload.thread_id ? { ...t, messages: [...t.messages, message], last_at: message.created_at, awaiting_agent: true, unread: 0 } : t))
            .sort((a, b) => b.last_at.localeCompare(a.last_at));
        }
        const thread: Thread = { id: message.thread_id, subject: message.subject || message.body.split("\n")[0].slice(0, 80), kind: "message", messages: [message], last_at: message.created_at, unread: 0, awaiting_agent: true };
        return [thread, ...ts];
      });
      setOpenId(message.thread_id);
      toast({ message: "Sent. The agent replies on its next check.", tone: "success" });
      router.refresh();
      return true;
    } catch (e) {
      toast({ message: (e as Error).message, tone: "error" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid md:grid-cols-[18rem_1fr] gap-6">
      <aside className="min-w-0">
        <div className="flex gap-2 mb-3">
          <button onClick={() => { setComposing(true); setOpenId(null); }} className={btnPrimary}>New message</button>
          <a href={claudeUrl} target="_blank" rel="noreferrer" className={btnGhost} title="Open the Claude session that runs your automations">Open in Claude ↗</a>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          <button className={btnGhost} aria-pressed={!showReports} onClick={()=>setShowReports(false)}>Conversations</button>
          <button className={btnGhost} aria-pressed={showReports} onClick={()=>setShowReports(true)}>Routine reports ({reports.length})</button>
        </div>
        {visibleThreads.length ? (
          <ul className="border border-line bg-bg/85 divide-y divide-line-soft">
            {visibleThreads.map((t) => {
              const last = t.messages[t.messages.length - 1];
              const active = t.id === openId && !composing;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => { setOpenId(t.id); setComposing(false); }}
                    className={`w-full text-left px-3 py-2.5 ${active ? "bg-[rgba(139,115,85,0.08)] border-l-2 border-accent" : "border-l-2 border-transparent hover:bg-bg-warm/60"}`}
                  >
                    <div className="flex items-baseline gap-2">
                      {t.unread ? <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" aria-label="unread" /> : null}
                      <span className={`flex-1 truncate text-[0.88rem] ${t.unread ? "text-fg font-medium" : "text-fg-dim"}`}>{t.subject}</span>
                      <span className="font-mono text-[0.55rem] text-fg-ghost shrink-0">{relTime(t.last_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {t.kind !== "message" ? <span className="font-mono text-[0.55rem] text-accent whitespace-nowrap shrink-0">{KIND_LABEL[t.kind]}</span> : null}
                      <span className="truncate text-[0.75rem] text-fg-ghost">
                        {last.author === ME ? "You: " : `@${last.author}: `}
                        {last.body.replace(/\s+/g, " ").slice(0, 80)}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-fg-dim text-sm border border-dashed border-line px-4 py-6">No messages in this view.</p>
        )}
      </aside>

      <section className="min-w-0">
        {composing || !open ? (
          <div className="border border-line bg-bg/85 p-4">
            <div className="mono-label mb-3">New message to the agents</div>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject (optional)" className={`${inputCls} mb-2`} aria-label="Subject" />
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && draft.trim()) send({ body: draft, subject }).then((ok) => ok && (setDraft(""), setSubject(""), setComposing(false)));
              }}
              rows={8}
              placeholder="Ask a question, give an instruction (focus on kiwipop this week), or flag a problem."
              className={inputCls}
              aria-label="Message"
            />
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={() => send({ body: draft, subject }).then((ok) => ok && (setDraft(""), setSubject(""), setComposing(false)))}
                disabled={busy || !draft.trim()}
                className={btnPrimary}
              >
                {busy ? "Sending…" : "Send"}
              </button>
              <span className="text-[0.75rem] text-fg-ghost">Delivered when an agent next connects. Schedule unverified. ⌘↵ sends.</span>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-baseline gap-2 mb-4">
              <h2 className="serif-display text-[1.6rem] leading-tight text-fg flex-1 min-w-0">{open.subject}</h2>
              {open.kind !== "message" ? <Chip tone="accent">{KIND_LABEL[open.kind]}</Chip> : null}
              {open.awaiting_agent ? <Chip>waiting for the agent</Chip> : null}
            </div>
            <ol className="flex flex-col gap-3 mb-4">
              {open.messages.map((m) => (
                <li key={m.id} className={`border p-4 ${m.author === ME ? "border-line bg-bg-warm/50 md:ml-12" : "border-line bg-bg/85 md:mr-12"}`}>
                  <div className="flex items-baseline gap-2 mb-2 font-mono text-[0.6rem]">
                    <span className={m.author === ME ? "text-fg" : "text-accent"}>{m.author === ME ? "You" : `@${m.author}`}</span>
                    <span className="text-fg-ghost">{relTime(m.created_at)}</span>
                  </div>
                  <Markdown text={m.body} className="text-[0.88rem] leading-relaxed" />
                </li>
              ))}
            </ol>
            <div className="border border-line bg-bg/85 p-3">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && reply.trim()) send({ body: reply, thread_id: open.id }).then((ok) => ok && setReply(""));
                }}
                rows={4}
                placeholder="Reply"
                className={inputCls}
                aria-label="Reply"
              />
              <div className="flex justify-end mt-2">
                <button onClick={() => send({ body: reply, thread_id: open.id }).then((ok) => ok && setReply(""))} disabled={busy || !reply.trim()} className={btnPrimary}>
                  {busy ? "Sending…" : "Reply"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
