"use client";
import Link from "next/link";
import { useState } from "react";
import { WORKABLE, PRIORITY_RANK, isReady, isSnoozed, type ProjectDetail } from "@/lib/projectTypes";
import { isMine } from "@/lib/taskMap";
import { groupThreads, type Message } from "@/lib/messageTypes";
import type { ApprovalItem } from "@/lib/approvals";
import { deliveryLabel } from "@/lib/delivery";
import { useCommands } from "./CommandLayer";

export default function DailyHome({ details, messages, approvals, day }: { details: ProjectDetail[]; messages: Message[]; approvals: ApprovalItem[]; day: string }) {
  const { open } = useCommands();
  const [allActions, setAllActions] = useState(false);
  const tasks = details.filter(d => WORKABLE.includes(d.project.status)).flatMap(d => d.tasks.map(t => ({...t, project: d.project, ready: isReady(t,d.tasks)})));
  const owner = tasks.filter(t => isMine(t) && t.status !== "done" && !isSnoozed(t,day)).sort((a,b)=>PRIORITY_RANK[a.priority]-PRIORITY_RANK[b.priority]);
  const threads = groupThreads(messages);
  const actionable = threads.filter(t => t.kind === "needs_you" && t.unread && !t.awaiting_agent);
  const actions = [
    ...owner.map(t => ({key:`task:${t.id}`, title:t.title, context:t.project.name, href:`/tasks/${t.id}`})),
    ...approvals.map(a => ({key:a.key,title:a.title,context:a.kind === "finished" ? "Review submitted work" : "Your approval needed",href:"/approvals"})),
    ...actionable.map(t=>({key:`message:${t.id}`,title:t.subject,context:"Agent needs your input",href:`/messages?thread=${t.id}`})),
  ];
  const running = tasks.filter(t => t.status === "doing" && !isMine(t));
  const queued = tasks.filter(t => t.ready && !isMine(t));
  const waiting = tasks.filter(t => t.status === "done" && t.delivery?.stage !== "verified");
  const delivered = details.flatMap(d=>d.tasks.filter(t=>t.status==="done" && t.delivery?.stage==="verified").map(t=>({...t,project:d.project}))).sort((a,b)=>(b.delivery?.at??"").localeCompare(a.delivery?.at??""));
  const agents = Array.from(new Set(queued.map(t=>t.agent))).sort((a,b)=>(a??"").localeCompare(b??""));
  return <div className="space-y-7">
    <header className="space-y-3"><p className="text-sm text-fg-dim">{day} · Mountain time</p><h1 className="serif-display text-4xl">Today</h1><p className="text-fg-dim">{actions.length ? `${actions.length} things need your attention.` : "No decisions or owner steps waiting."}</p>
      <button onClick={()=>open("capture")} className="bg-fg text-bg rounded-xl px-5 py-4 text-base w-full sm:w-auto">+ What do you want done?</button>
    </header>
    <section className="border border-line rounded-xl p-5"><h2 className="text-xl mb-3">Needs you</h2>
      {actions.length ? <ul className="divide-y divide-line">{(allActions ? actions : actions.slice(0,3)).map(a=><li key={a.key}><Link href={a.href} className="block py-4"><span className="block text-sm text-fg-dim mb-1">{a.context}</span><span className="text-base">{a.title} →</span></Link></li>)}</ul> : <p className="text-fg-dim">Nothing to act on here.</p>}
      {actions.length>3 && <button onClick={()=>setAllActions(!allActions)} className="underline py-3 text-accent">{allActions ? "Show the first three" : `Show all ${actions.length}`}</button>}
    </section>
    <section className="border border-line rounded-xl p-5 space-y-3"><h2 className="text-xl">Work in motion</h2>
      {running.length ? running.map(t=><Link key={t.id} href={`/tasks/${t.id}`} className="block py-2">{t.title}<span className="block text-sm text-fg-dim">{t.agent} · claimed {t.claimed_at ? new Date(t.claimed_at).toLocaleString("en-US",{timeZone:"America/Denver"}) : "at an unknown time"}. A claim is not proof the runner is still working.</span></Link>) : <p className="text-fg-dim">No tasks currently claimed by an agent.</p>}
      <details><summary className="cursor-pointer py-3">{queued.length} unblocked tasks waiting to start</summary><p className="text-sm text-fg-dim pb-3">Assignments need a connected runner. Recent messages show activity; the schedule and next run are unverified.</p>
        {agents.map(agent=>{const list=queued.filter(t=>t.agent===agent); const last=messages.filter(m=>m.author===agent).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];return <div key={agent??"unassigned"} className="border-t border-line py-3"><h3 className="font-medium">{agent ? `Assigned to ${agent}` : "Choose who will do these"} · {list.length}</h3><p className="text-sm text-fg-dim">{agent ? last ? `Last message: ${new Date(last.created_at).toLocaleString("en-US",{timeZone:"America/Denver"})} Mountain` : "No recorded runner activity" : "Open a task to assign it or approve an agent's offer."}</p><ul>{list.map(t=><li key={t.id}><Link className="block py-3 underline" href={`/tasks/${t.id}`}>{t.title}</Link></li>)}</ul></div>})}
      </details>
      {waiting.length>0 && <details><summary className="cursor-pointer py-3">{waiting.length} submissions awaiting review or delivery</summary>{waiting.map(t=><Link key={t.id} className="block py-3" href={`/tasks/${t.id}`}>{t.title}<span className="block text-sm text-fg-dim">{deliveryLabel(t)}</span></Link>)}</details>}
    </section>
    <section className="border border-line rounded-xl p-5"><h2 className="text-xl mb-3">Verified results</h2>{delivered.length ? delivered.slice(0,5).map(t=><Link key={t.id} href={`/tasks/${t.id}`} className="block py-3">{t.title}<span className="block text-sm text-fg-dim">{t.project.name} · {t.delivery?.note}</span></Link>) : <p className="text-fg-dim">No live results verified yet. Submitted work stays visible until its outcome is checked.</p>}</section>
    <Link href="/messages" className="block border border-line rounded-xl p-5">Activity and messages →<span className="block text-sm text-fg-dim mt-1">Routine reports are grouped here. Decisions stay in Needs you.</span></Link>
  </div>;
}
