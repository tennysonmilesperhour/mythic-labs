"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { mailtoHref, type BillingDoc, type Business, type DocStatus } from "@/lib/billingTypes";
import { Chip, api, btnGhost, btnPrimary } from "@/components/ProjectBits";
import { useToast } from "@/components/Toast";

export default function DocActions({ doc, business }: { doc: BillingDoc; business: Business }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const set = async (status: DocStatus, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    try {
      await api(`/api/billing/documents/${doc.id}`, "PATCH", { status });
      router.refresh();
    } catch (err) {
      toast({ message: (err as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const email = () => {
    if (!doc.client_email) {
      toast({ message: "Add the client's email on the Billing page first.", tone: "error" });
      return;
    }
    window.location.href = mailtoHref(doc, business);
  };
  const isInvoice = doc.kind === "invoice";
  if (doc.status === "void") return <Chip>void</Chip>;
  return (
    <>
      <Chip tone={doc.status === "paid" ? "solid" : doc.status === "sent" ? "accent" : "dim"}>{doc.status}</Chip>
      <button onClick={() => window.print()} className={btnGhost}>Print or save PDF</button>
      <button onClick={email} className={btnGhost}>Email client</button>
      {doc.status === "draft" ? <button onClick={() => set("sent")} disabled={busy} className={btnPrimary}>Mark sent</button> : null}
      {isInvoice && doc.status === "sent" ? <button onClick={() => set("paid")} disabled={busy} className={btnPrimary}>Mark paid</button> : null}
      {doc.status !== "paid" ? (
        <button
          onClick={() => set("void", isInvoice ? `Void ${doc.number}? Its work goes back to unbilled.` : `Void ${doc.number}?`)}
          disabled={busy}
          className={`${btnGhost} ml-auto`}
        >
          Void
        </button>
      ) : null}
    </>
  );
}
