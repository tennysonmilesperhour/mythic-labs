"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BillingState, SyncResult } from "@/lib/billing";
import {
  countsSummary,
  itemAmount,
  hoursLabel,
  money,
  type BillingClient as Client,
  type BillingDoc,
  type DocKind,
  type WorkItem,
} from "@/lib/billingTypes";
import { projectHref } from "@/lib/taskMap";
import { Chip, api, btnGhost, btnPrimary, inputBase } from "@/components/ProjectBits";
import { useToast } from "@/components/Toast";

const day = (iso: string) => iso.slice(0, 10);

export default function BillingClient({ initial }: { initial: BillingState }) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, setState] = useState(initial);
  useEffect(() => setState(initial), [initial]);
  const [syncing, setSyncing] = useState(false);
  const [syncErrors, setSyncErrors] = useState<SyncResult["errors"]>([]);
  const synced = useRef(false);
  const name = (id: string) => state.projects.find((p) => p.id === id)?.name || "Unknown project";

  const sync = async (quiet: boolean) => {
    if (!state.clients.length) return;
    setSyncing(true);
    try {
      const res = await api<SyncResult>("/api/billing/sync", "POST", {});
      setSyncErrors(res.errors);
      if (res.added.length) {
        toast(`${res.added.length} merged pull request${res.added.length === 1 ? "" : "s"} estimated${res.more ? ", more on the next sync" : ""}.`);
        router.refresh();
      } else if (!quiet) toast("No new merged pull requests.");
    } catch (err) {
      toast({ message: (err as Error).message, tone: "error" });
    } finally {
      setSyncing(false);
    }
  };

  // Each visit picks up pull requests merged since the last one.
  useEffect(() => {
    if (synced.current) return;
    synced.current = true;
    void sync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-12">
      <Clients state={state} name={name} onChange={() => router.refresh()} />
      {syncErrors.length ? (
        <div className="border border-accent bg-bg-warm/80 px-4 py-3 text-[0.82rem] leading-relaxed">
          {syncErrors.map((e) => (
            <p key={e.project_id}><strong>{name(e.project_id)}:</strong> {e.error}</p>
          ))}
        </div>
      ) : null}
      {state.clients.map((c) => (
        <ClientWork
          key={c.project_id}
          client={c}
          projectName={name(c.project_id)}
          work={state.work.filter((w) => w.project_id === c.project_id)}
          syncing={syncing}
          onSync={() => sync(false)}
          onChange={() => router.refresh()}
        />
      ))}
      <Documents docs={state.documents} name={name} />
      <Settings state={state} onChange={() => router.refresh()} />
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2 mb-4">
        <h2 className="mono-label">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Clients({ state, name, onChange }: { state: BillingState; name: (id: string) => string; onChange: () => void }) {
  const { toast } = useToast();
  const [projectId, setProjectId] = useState("");
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);
  const available = state.projects.filter((p) => !state.clients.some((c) => c.project_id === p.id));

  const add = async () => {
    if (!projectId) return;
    setBusy(true);
    try {
      await api("/api/billing/clients", "POST", { project_id: projectId, ...(rate ? { rate: Number(rate) } : {}) });
      toast(`${name(projectId)} is now client work.`);
      setProjectId("");
      setRate("");
      onChange();
    } catch (err) {
      toast({ message: (err as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={`Client projects (${state.clients.length})`}>
      {state.clients.length ? (
        <ul className="space-y-2 mb-5">
          {state.clients.map((c) => (
            <ClientRow key={c.project_id} client={c} projectName={name(c.project_id)} onChange={onChange} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-dim mb-5">No client projects yet. Add one below; its merged pull requests from today on are estimated automatically.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputBase} aria-label="Project">
          <option value="">Add a client project…</option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.repo ? "" : " (no repo)"}</option>
          ))}
        </select>
        <input value={rate} onChange={(e) => setRate(e.target.value)} placeholder={`$${state.default_rate}/h`} inputMode="decimal" className={`${inputBase} w-24`} aria-label="Hourly rate" />
        <button onClick={add} disabled={!projectId || busy} className={btnPrimary}>Add</button>
      </div>
    </Section>
  );
}

function ClientRow({ client, projectName, onChange }: { client: Client; projectName: string; onChange: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ client_name: client.client_name, client_email: client.client_email, rate: String(client.rate), since: client.since });
  useEffect(() => setForm({ client_name: client.client_name, client_email: client.client_email, rate: String(client.rate), since: client.since }), [client]);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api("/api/billing/clients", "POST", { project_id: client.project_id, ...form, rate: Number(form.rate) });
      toast("Saved.");
      setOpen(false);
      onChange();
    } catch (err) {
      toast({ message: (err as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirm(`Stop billing ${projectName}? Unbilled work is dropped; invoices are kept.`)) return;
    try {
      await api("/api/billing/clients", "DELETE", { project_id: client.project_id });
      onChange();
    } catch (err) {
      toast({ message: (err as Error).message, tone: "error" });
    }
  };

  return (
    <li className="border border-line bg-bg-warm/40 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href={projectHref(client.project_id)} className="font-medium hover:text-accent">{projectName}</Link>
        <Chip tone="accent">Client work</Chip>
        <span className="font-mono text-xs">{money(client.rate)}/h</span>
        <span className="text-fg-dim text-xs">
          Bill to {client.client_name}{client.client_email ? ` · ${client.client_email}` : " · no email yet"} · PRs merged since {client.since}
        </span>
        <button onClick={() => setOpen((o) => !o)} className={`${btnGhost} ml-auto`}>{open ? "Close" : "Edit"}</button>
      </div>
      {open ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-fg-dim">Client name<input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} className={`${inputBase} w-full mt-1`} /></label>
          <label className="text-xs text-fg-dim">Client email<input value={form.client_email} onChange={(e) => setForm({ ...form, client_email: e.target.value })} type="email" className={`${inputBase} w-full mt-1`} /></label>
          <label className="text-xs text-fg-dim">Rate per hour ($)<input value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} inputMode="decimal" className={`${inputBase} w-full mt-1`} /></label>
          <label className="text-xs text-fg-dim">Bill PRs merged on or after<input value={form.since} onChange={(e) => setForm({ ...form, since: e.target.value })} type="date" className={`${inputBase} w-full mt-1`} /></label>
          <div className="flex gap-2 sm:col-span-2">
            <button onClick={save} disabled={busy} className={btnPrimary}>Save</button>
            <button onClick={remove} className={btnGhost}>Stop billing</button>
          </div>
          <p className="text-xs text-fg-dim sm:col-span-2">A new rate applies to work not yet invoiced. Moving the date earlier picks up older merged pull requests on the next sync.</p>
        </div>
      ) : null}
    </li>
  );
}

function ClientWork({ client, projectName, work, syncing, onSync, onChange }: {
  client: Client; projectName: string; work: WorkItem[]; syncing: boolean; onSync: () => void; onChange: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hours, setHours] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const unbilled = useMemo(() => work.filter((w) => w.status === "unbilled").sort((a, b) => b.merged_at.localeCompare(a.merged_at)), [work]);
  const others = useMemo(() => work.filter((w) => w.status !== "unbilled").sort((a, b) => b.merged_at.localeCompare(a.merged_at)), [work]);
  const rows = showAll ? [...unbilled, ...others] : unbilled;
  const picked = unbilled.filter((w) => selected.has(w.id));
  const pickedTotal = picked.reduce((t, w) => t + itemAmount(w), 0);
  const unbilledHours = unbilled.reduce((t, w) => t + w.hours, 0);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = unbilled.length > 0 && picked.length === unbilled.length;

  const patch = async (items: Array<{ id: string; hours?: number; status?: "unbilled" | "excluded" }>) => {
    try {
      await api("/api/billing/work", "PATCH", { items });
      onChange();
    } catch (err) {
      toast({ message: (err as Error).message, tone: "error" });
    }
  };
  const saveHours = (w: WorkItem) => {
    const raw = hours[w.id];
    if (raw === undefined || Number(raw) === w.hours) return;
    void patch([{ id: w.id, hours: Number(raw) }]);
  };
  const make = async (kind: DocKind) => {
    if (!picked.length) return;
    setBusy(true);
    try {
      const res = await api<{ document: BillingDoc }>("/api/billing/documents", "POST", { kind, work_ids: picked.map((w) => w.id) });
      setSelected(new Set());
      router.push(`/billing/${res.document.id}`);
    } catch (err) {
      toast({ message: (err as Error).message, tone: "error" });
      setBusy(false);
    }
  };

  return (
    <Section
      title={`${projectName} · unbilled ${hoursLabel(unbilledHours)} · ${money(unbilled.reduce((t, w) => t + itemAmount(w), 0))}`}
      aside={<button onClick={onSync} disabled={syncing} className={btnGhost}>{syncing ? "Checking GitHub…" : "Check for merged PRs"}</button>}
    >
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left mono-label text-fg-dim">
                <th className="py-2 pr-2 w-6"><input type="checkbox" checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(unbilled.map((w) => w.id)))} aria-label="Select all unbilled" /></th>
                <th className="py-2 pr-3">Merged</th>
                <th className="py-2 pr-3">Pull request</th>
                <th className="py-2 pr-3 text-right">Estimate</th>
                <th className="py-2 pr-3 text-right">Bill</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id} className={`border-t border-line align-top ${w.status === "unbilled" ? "" : "text-fg-dim"}`}>
                  <td className="py-2 pr-2">
                    {w.status === "unbilled" ? <input type="checkbox" checked={selected.has(w.id)} onChange={() => toggle(w.id)} aria-label={`Select ${w.title}`} /> : null}
                  </td>
                  <td className="py-2 pr-3 text-xs whitespace-nowrap">{day(w.merged_at)}</td>
                  <td className="py-2 pr-3 min-w-[14rem]">
                    {w.pr_url ? <a href={w.pr_url} target="_blank" rel="noreferrer" className="hover:text-accent">#{w.pr_number} {w.title}</a> : <span>{w.title}</span>}
                    <div className="text-[0.7rem] text-fg-dim mt-0.5">{countsSummary(w.counts)}{w.note ? ` · ${w.note}` : ""}</div>
                  </td>
                  <td className="py-2 pr-3 text-right text-xs whitespace-nowrap">{w.kind === "expense" ? "cost" : hoursLabel(w.estimate_hours)}</td>
                  <td className="py-2 pr-3 text-right">
                    {w.kind === "expense" ? (
                      <span className="text-xs text-fg-dim">none</span>
                    ) : w.status === "unbilled" ? (
                      <input
                        value={hours[w.id] ?? String(w.hours)}
                        onChange={(e) => setHours({ ...hours, [w.id]: e.target.value })}
                        onBlur={() => saveHours(w)}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        inputMode="decimal"
                        className={`${inputBase} w-16 text-right`}
                        aria-label={`Hours for ${w.title}`}
                      />
                    ) : (
                      <span className="font-mono text-xs">{hoursLabel(w.hours)}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-xs whitespace-nowrap">{money(itemAmount(w))}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {w.status === "unbilled" ? <button onClick={() => patch([{ id: w.id, status: "excluded" }])} className={btnGhost}>Exclude</button> : null}
                    {w.status === "excluded" ? <button onClick={() => patch([{ id: w.id, status: "unbilled" }])} className={btnGhost}>Include</button> : null}
                    {w.status === "invoiced" && w.invoice_id ? <Link href={`/billing/${w.invoice_id}`} className={btnGhost}>Invoiced</Link> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-fg-dim">
          Nothing unbilled. Pull requests merged on {client.client_name}&apos;s repo since {client.since} show up here with an estimate.
        </p>
      )}
      <AddTime projectId={client.project_id} onAdded={onChange} />
      <div className="flex flex-wrap items-center gap-3 mt-4">
        <button onClick={() => make("estimate")} disabled={!picked.length || busy} className={btnGhost}>Make estimate</button>
        <button onClick={() => make("invoice")} disabled={!picked.length || busy} className={btnPrimary}>Make invoice</button>
        <span className="text-xs text-fg-dim">{picked.length ? `${picked.length} selected · ${money(pickedTotal)}` : "Select work to bill"}</span>
        {others.length ? (
          <button onClick={() => setShowAll((s) => !s)} className="ml-auto text-xs text-fg-dim underline">
            {showAll ? "Hide invoiced and excluded" : `Show invoiced and excluded (${others.length})`}
          </button>
        ) : null}
      </div>
    </Section>
  );
}

function AddTime({ projectId, onAdded }: { projectId: string; onAdded: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [hours, setHours] = useState("");
  const [kind, setKind] = useState<"work" | "expense">("work");
  const [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!title.trim() || !hours) return;
    setBusy(true);
    try {
      await api("/api/billing/work", "POST", kind === "expense"
        ? { project_id: projectId, kind, title, amount: Number(hours), date }
        : { project_id: projectId, title, hours: Number(hours), date });
      setTitle("");
      setHours("");
      toast(kind === "expense" ? "Cost added." : "Time added.");
      onAdded();
    } catch (err) {
      toast({ message: (err as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 mt-4">
      <select value={kind} onChange={(e) => setKind(e.target.value as "work" | "expense")} className={inputBase} aria-label="Kind">
        <option value="work">Time</option>
        <option value="expense">Cost</option>
      </select>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "expense" ? "What the cost is, e.g. November hosting" : "What you did"} className={`${inputBase} flex-1 min-w-[12rem]`} aria-label="Work description" />
      <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder={kind === "expense" ? "$" : "Hours"} inputMode="decimal" className={`${inputBase} w-20`} aria-label={kind === "expense" ? "Amount" : "Hours"} />
      <input value={date} onChange={(e) => setDate(e.target.value)} type="date" className={inputBase} aria-label="Date" />
      <button onClick={add} disabled={busy || !title.trim() || !hours} className={btnGhost}>{kind === "expense" ? "Add cost" : "Add time"}</button>
    </div>
  );
}

const STATUS_TONE: Record<BillingDoc["status"], "dim" | "accent" | "solid"> = { draft: "dim", sent: "accent", paid: "solid", void: "dim" };

function Documents({ docs, name }: { docs: BillingDoc[]; name: (id: string) => string }) {
  const sorted = [...docs].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const outstanding = docs.filter((d) => d.kind === "invoice" && d.status === "sent").reduce((t, d) => t + d.total, 0);
  return (
    <Section title={`Estimates and invoices (${docs.length})`} aside={outstanding ? <span className="text-xs text-fg-dim">Outstanding {money(outstanding)}</span> : undefined}>
      {sorted.length ? (
        <ul className="divide-y divide-line border-y border-line">
          {sorted.map((d) => (
            <li key={d.id}>
              <Link href={`/billing/${d.id}`} className="flex flex-wrap items-center gap-3 py-2.5 text-sm hover:text-accent">
                <span className="font-mono text-xs w-28">{d.number}</span>
                <span>{d.client_name}</span>
                <span className="text-fg-dim text-xs">{name(d.project_id)} · {d.issued_on}</span>
                <span className="ml-auto font-mono text-xs">{money(d.total)}</span>
                <Chip tone={STATUS_TONE[d.status]}>{d.status}</Chip>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-dim">None yet. Select unbilled work above and make an estimate or an invoice.</p>
      )}
    </Section>
  );
}

function Settings({ state, onChange }: { state: BillingState; onChange: () => void }) {
  const { toast } = useToast();
  const initialForm = () => ({ ...state.business, payment_terms_days: String(state.business.payment_terms_days), default_rate: String(state.default_rate) });
  const [form, setForm] = useState(initialForm);
  useEffect(() => setForm(initialForm()), [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api("/api/billing/settings", "PATCH", { ...form, payment_terms_days: Number(form.payment_terms_days), default_rate: Number(form.default_rate) });
      toast("Saved.");
      onChange();
    } catch (err) {
      toast({ message: (err as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Your details on the paperwork">
      <div className="grid gap-2 sm:grid-cols-2 max-w-3xl">
        <label className="text-xs text-fg-dim">Business name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${inputBase} w-full mt-1`} /></label>
        <label className="text-xs text-fg-dim">Business email<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" className={`${inputBase} w-full mt-1`} /></label>
        <label className="text-xs text-fg-dim">Default rate per hour ($)<input value={form.default_rate} onChange={(e) => setForm({ ...form, default_rate: e.target.value })} inputMode="decimal" className={`${inputBase} w-full mt-1`} /></label>
        <label className="text-xs text-fg-dim">Invoices due after (days)<input value={form.payment_terms_days} onChange={(e) => setForm({ ...form, payment_terms_days: e.target.value })} inputMode="numeric" className={`${inputBase} w-full mt-1`} /></label>
        <label className="text-xs text-fg-dim sm:col-span-2">How to pay (printed on invoices)<textarea value={form.payment_note} onChange={(e) => setForm({ ...form, payment_note: e.target.value })} rows={3} placeholder="For example: Pay by Zelle or ACH to …" className={`${inputBase} w-full mt-1`} /></label>
        <div><button onClick={save} disabled={busy} className={btnPrimary}>Save</button></div>
      </div>
    </Section>
  );
}
