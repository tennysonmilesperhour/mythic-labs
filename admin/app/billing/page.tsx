import Link from "next/link";
import { getBilling, type BillingState } from "@/lib/billing";
import { fixHref } from "@/lib/taskMap";
import BillingClient from "./BillingClient";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  let error: string | null = null;
  let state: BillingState | null = null;
  try {
    state = await getBilling();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div>
      <header className="border-b border-line pb-6 mb-8 print:hidden">
        <h1 className="serif-display text-[2.2rem] md:text-[2.6rem] leading-none mb-2">Billing</h1>
        <p className="text-fg-dim text-sm max-w-2xl leading-relaxed">
          Client work. Every merged pull request on a client project gets an hours estimate from the size of the change. Adjust the hours, then turn selected work into an estimate or an invoice you can print, save as PDF and email.
        </p>
      </header>
      {error || !state ? (
        <p className="border border-line bg-bg-warm/80 p-5 text-sm text-fg-dim">
          The project store didn&apos;t load: {error}{" "}
          <Link href={fixHref("source:store")} className="text-accent underline">Fix it step by step →</Link>
        </p>
      ) : (
        <BillingClient initial={state} />
      )}
    </div>
  );
}
