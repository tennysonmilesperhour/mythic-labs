"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Task } from "@/lib/projectTypes";
import { deliveryLabel, nextDeliveryStage } from "@/lib/delivery";
import { api, btnPrimary, inputCls } from "./ProjectBits";
import { invalidateIndex } from "./CommandLayer";

export default function DeliveryPanel({ task, onChange }: { task: Task; onChange: (task: Task) => void }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stage = nextDeliveryStage(task);
  if (task.status !== "done") return null;
  const save = async () => {
    setBusy(true); setError("");
    try {
      const result = await api<{task: Task}>(`/api/tasks/${task.id}/delivery`, "POST", { stage, url, note, expected_updated_at: task.updated_at });
      onChange(result.task); setUrl(""); setNote(""); invalidateIndex(); router.refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <section className="border border-line rounded-xl p-5 mb-6 space-y-3">
    <h2 className="text-lg font-medium">{deliveryLabel(task)}</h2>
    <p className="text-sm text-fg-dim">Submitted → Reviewed → Merged → Deployed → Verified live</p>
    {!task.approved_at && <a className="underline text-accent" href="/approvals">Review this submission</a>}
    {task.delivery && <p className="text-sm">{task.delivery.note} <a href={task.delivery.url} target="_blank" rel="noreferrer" className="underline text-accent">View evidence ↗</a></p>}
    {stage && <details><summary className="cursor-pointer py-3">Record {stage === "verified" ? "a successful live check" : stage === "merged" ? "the merge" : "the production deployment"}</summary>
      <p className="text-sm text-fg-dim mb-3">Record evidence after you or your assistant checks it. This records the result; it does not perform the merge or deployment.</p>
      <label className="block text-sm">Evidence URL<input className={`${inputCls} my-2`} type="url" placeholder={stage === "merged" ? "https://github.com/owner/repo/pull/123" : "https://your-live-app.example"} value={url} onChange={e=>setUrl(e.target.value)} /></label>
      <label className="block text-sm">What was checked?<textarea className={`${inputCls} my-2`} value={note} onChange={e=>setNote(e.target.value)} placeholder={stage === "verified" ? "I tested the requested behavior on the production site. Describe the result." : "Include the commit or deployment and the result you confirmed."} /></label>
      <button className={btnPrimary} onClick={save} disabled={busy || !url.trim() || !note.trim()}>{busy ? "Saving…" : `Record ${stage}`}</button>
    </details>}
    {error && <p role="alert" className="text-sm">{error}</p>}
  </section>;
}
