import Link from "next/link";
import { notFound } from "next/navigation";
import { getBilling } from "@/lib/billing";
import { hoursLabel, money } from "@/lib/billingTypes";
import DocActions from "./DocActions";

export const dynamic = "force-dynamic";

export default async function BillingDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await getBilling();
  const doc = state.documents.find((d) => d.id === id);
  if (!doc) notFound();
  const b = state.business;
  const project = state.projects.find((p) => p.id === doc.project_id)?.name || "";
  const hours = doc.lines.reduce((t, l) => t + l.hours, 0);
  const isInvoice = doc.kind === "invoice";

  return (
    <div>
      <div className="print:hidden mb-6 flex flex-wrap items-center gap-3">
        <Link href="/billing" className="text-xs text-fg-dim underline">← Billing</Link>
        <DocActions doc={doc} business={b} />
      </div>
      <article className="invoice-sheet border border-line bg-bg p-8 md:p-12 max-w-3xl print:border-0 print:p-0 print:max-w-none">
        <header className="flex flex-wrap justify-between gap-6 mb-10">
          <div>
            <p className="serif-display text-[2rem] leading-none mb-2">{b.name || "Mythic Labs"}</p>
            {b.email ? <p className="text-sm text-fg-dim">{b.email}</p> : null}
          </div>
          <div className="text-right">
            <p className="mono-label mb-1">{isInvoice ? "Invoice" : "Estimate"}{doc.status === "void" ? " (void)" : ""}</p>
            <p className="font-mono text-sm">{doc.number}</p>
            <p className="text-sm text-fg-dim mt-2">Issued {doc.issued_on}</p>
            {doc.due_on ? <p className="text-sm text-fg-dim">Due {doc.due_on}</p> : null}
            {doc.status === "paid" && doc.paid_at ? <p className="text-sm mt-1">Paid {doc.paid_at.slice(0, 10)}</p> : null}
          </div>
        </header>
        <section className="mb-8">
          <p className="mono-label mb-1">{isInvoice ? "Bill to" : "Prepared for"}</p>
          <p className="text-sm">{doc.client_name}</p>
          {doc.client_email ? <p className="text-sm text-fg-dim">{doc.client_email}</p> : null}
          {project ? <p className="text-sm text-fg-dim">Project: {project}</p> : null}
        </section>
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="text-left mono-label text-fg-dim border-b border-line">
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Work</th>
              <th className="py-2 pr-3 text-right">Hours</th>
              <th className="py-2 pr-3 text-right">Rate</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l) => (
              <tr key={l.work_id} className="border-b border-line align-top">
                <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">{l.merged_at.slice(0, 10)}</td>
                <td className="py-2 pr-3">
                  {l.title}
                  {l.pr_url ? <div className="text-[0.7rem] text-fg-dim break-all">{l.pr_url}</div> : null}
                </td>
                <td className="py-2 pr-3 text-right font-mono text-xs whitespace-nowrap">{hoursLabel(l.hours)}</td>
                <td className="py-2 pr-3 text-right font-mono text-xs whitespace-nowrap">{money(l.rate)}</td>
                <td className="py-2 text-right font-mono text-xs whitespace-nowrap">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="pt-4 text-right mono-label">Total</td>
              <td className="pt-4 pr-3 text-right font-mono text-xs">{hoursLabel(hours)}</td>
              <td />
              <td className="pt-4 text-right font-mono text-base">{money(doc.total)}</td>
            </tr>
          </tfoot>
        </table>
        {doc.notes ? <p className="text-sm whitespace-pre-wrap mb-4">{doc.notes}</p> : null}
        {isInvoice && b.payment_note ? (
          <section className="mt-8">
            <p className="mono-label mb-1">How to pay</p>
            <p className="text-sm whitespace-pre-wrap">{b.payment_note}</p>
          </section>
        ) : null}
        {!isInvoice ? <p className="text-xs text-fg-dim mt-8">Hours are estimated from the size of each change and may be adjusted on the invoice.</p> : null}
      </article>
    </div>
  );
}
