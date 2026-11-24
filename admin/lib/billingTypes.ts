// Client-safe types and math for client billing: which projects are client
// work, the billable estimate for each merged pull request, and the estimates
// and invoices made from them. Writes live in billing.ts; the file is billing.json.

export const DEFAULT_RATE = 120;
export const DEFAULT_TERMS_DAYS = 14;

/** A project billed to a client. Being listed here is what puts a project in the client work category. */
export type BillingClient = {
  project_id: string;
  client_name: string;
  client_email: string;
  /** Dollars per hour. */
  rate: number;
  /** Pull requests merged on or after this day (YYYY-MM-DD) are billable. */
  since: string;
  created_at: string;
  updated_at: string;
};

export type FileKind = "code" | "tests" | "docs" | "skipped";

/** How much of a pull request counted toward the estimate, by kind of file. */
export type LineCounts = Record<FileKind, { files: number; additions: number; deletions: number }>;

export type WorkStatus = "unbilled" | "invoiced" | "excluded";

/** One merged pull request on a client project. */
export type WorkItem = {
  id: string;
  project_id: string;
  repo: string;
  pr_number: number;
  pr_url: string;
  title: string;
  author: string;
  merged_at: string;
  counts: LineCounts;
  /** What the size of the change suggests, rounded up to a quarter hour. */
  estimate_hours: number;
  /** What gets billed; starts as the estimate and can be edited. */
  hours: number;
  rate: number;
  status: WorkStatus;
  invoice_id: string | null;
  note: string;
  created_at: string;
  updated_at: string;
};

export type DocKind = "estimate" | "invoice";
export type DocStatus = "draft" | "sent" | "paid" | "void";

export type DocLine = { work_id: string; title: string; pr_url: string; merged_at: string; hours: number; rate: number; amount: number };

/** An estimate or an invoice: a frozen copy of the lines at the time it was made. */
export type BillingDoc = {
  id: string;
  kind: DocKind;
  /** EST-2026-001 or INV-2026-001. */
  number: string;
  project_id: string;
  client_name: string;
  client_email: string;
  issued_on: string;
  /** Invoices only. */
  due_on: string | null;
  lines: DocLine[];
  total: number;
  notes: string;
  status: DocStatus;
  created_at: string;
  sent_at: string | null;
  paid_at: string | null;
};

/** Who the paperwork is from. */
export type Business = { name: string; email: string; payment_terms_days: number; payment_note: string };

export type BillingFile = {
  schemaVersion: 1;
  default_rate: number;
  business: Business;
  clients: BillingClient[];
  work: WorkItem[];
  documents: BillingDoc[];
};

export const EMPTY_BILLING: BillingFile = {
  schemaVersion: 1,
  default_rate: DEFAULT_RATE,
  business: { name: "Mythic Labs", email: "", payment_terms_days: DEFAULT_TERMS_DAYS, payment_note: "" },
  clients: [],
  work: [],
  documents: [],
};

// ─────────── the estimate ───────────

const SKIPPED = [
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|Pipfile\.lock|composer\.lock|Gemfile\.lock|go\.sum|Podfile\.lock)$/,
  /(^|\/)(dist|build|out|coverage|vendor|node_modules|\.next)\//,
  /\.min\.(js|css)$/,
  /\.map$/,
  /(^|\/)__snapshots__\//,
  /\.snap$/,
  /(^|\/)(database|supabase)\.types\.ts$/,
  /\.generated\.\w+$/,
  /\.(png|jpe?g|gif|webp|avif|ico|svg|pdf|zip|woff2?|ttf|otf|mp4|mov|mp3|wav)$/i,
];
const DOCS = [/\.(md|mdx|txt|rst)$/i, /(^|\/)docs\//, /(^|\/)(LICENSE|CHANGELOG|AUTHORS)(\.\w+)?$/i];
const TESTS = [/(^|\/)(tests?|__tests__|e2e|spec)\//, /\.(test|spec)\.\w+$/, /(^|\/)test_[^/]+\.py$/, /_test\.(go|py)$/];

/** Lock files, build output, snapshots, generated types and binaries are not counted; docs count for less. */
export function classifyFile(filename: string): FileKind {
  if (SKIPPED.some((r) => r.test(filename))) return "skipped";
  if (TESTS.some((r) => r.test(filename))) return "tests";
  if (DOCS.some((r) => r.test(filename))) return "docs";
  return "code";
}

export function countLines(files: Array<{ filename: string; additions: number; deletions: number }>): LineCounts {
  const counts: LineCounts = {
    code: { files: 0, additions: 0, deletions: 0 },
    tests: { files: 0, additions: 0, deletions: 0 },
    docs: { files: 0, additions: 0, deletions: 0 },
    skipped: { files: 0, additions: 0, deletions: 0 },
  };
  for (const f of files) {
    const c = counts[classifyFile(f.filename)];
    c.files++;
    c.additions += Math.max(0, f.additions || 0);
    c.deletions += Math.max(0, f.deletions || 0);
  }
  return counts;
}

/** New lines count fully, removed lines a quarter. Docs count 30%. */
export function weightedLines(c: LineCounts): number {
  const lines = (k: FileKind) => c[k].additions + c[k].deletions * 0.25;
  return lines("code") + lines("tests") + lines("docs") * 0.3;
}

/**
 * Hours a pull request should bill, from the size of the change.
 *
 * Half an hour covers review, the pull request and the merge. Then, by weighted line:
 * the first 300 lines at 75 an hour, the next 1,200 at 150 an hour, the rest at 300 an hour
 * (large changes repeat patterns). Each counted file adds 3 minutes, up to 40 files.
 * Rounded up to the next quarter hour; a change with nothing counted bills a quarter hour.
 */
export function estimateHours(c: LineCounts): number {
  const lines = weightedLines(c);
  const counted = c.code.files + c.tests.files + c.docs.files;
  if (!counted || lines <= 0) return 0.25;
  const tier1 = Math.min(lines, 300) / 75;
  const tier2 = Math.min(Math.max(lines - 300, 0), 1200) / 150;
  const tier3 = Math.max(lines - 1500, 0) / 300;
  const raw = 0.5 + tier1 + tier2 + tier3 + Math.min(counted, 40) * 0.05;
  return roundQuarter(raw);
}

export const roundQuarter = (h: number) => Math.ceil(h * 4 - 1e-9) / 4;

/** Cents-safe dollar amount. */
export const amount = (hours: number, rate: number) => Math.round(hours * rate * 100) / 100;

export const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const hoursLabel = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(2).replace(/0$/, "")} h`;

/** One line describing what counted, for the work table and the estimate. */
export function countsSummary(c: LineCounts): string {
  if (!c.code.files && !c.tests.files && !c.docs.files && !c.skipped.files) return "time entered by hand";
  const parts: string[] = [];
  for (const k of ["code", "tests", "docs"] as const) {
    if (c[k].files) parts.push(`${k} +${c[k].additions} −${c[k].deletions} in ${c[k].files} file${c[k].files === 1 ? "" : "s"}`);
  }
  if (c.skipped.files) parts.push(`${c.skipped.files} generated or lock file${c.skipped.files === 1 ? "" : "s"} not counted`);
  return parts.join("; ") || "no counted files";
}

export function docLines(items: WorkItem[]): DocLine[] {
  return [...items]
    .sort((a, b) => a.merged_at.localeCompare(b.merged_at))
    .map((w) => ({ work_id: w.id, title: w.title, pr_url: w.pr_url, merged_at: w.merged_at, hours: w.hours, rate: w.rate, amount: amount(w.hours, w.rate) }));
}

export const docTotal = (lines: DocLine[]) => Math.round(lines.reduce((t, l) => t + l.amount, 0) * 100) / 100;

/** The next number for a kind in a year: EST-2026-003 after EST-2026-002. */
export function nextDocNumber(docs: BillingDoc[], kind: DocKind, year: number): string {
  const prefix = `${kind === "invoice" ? "INV" : "EST"}-${year}-`;
  const used = docs.filter((d) => d.number.startsWith(prefix)).map((d) => Number(d.number.slice(prefix.length)) || 0);
  return `${prefix}${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0")}`;
}

/** A mail draft to the client with the totals and lines; the PDF is attached by hand. */
export function mailtoHref(doc: BillingDoc, business: Business): string {
  const label = doc.kind === "invoice" ? "Invoice" : "Estimate";
  const from = business.name || "Mythic Labs";
  const lines = doc.lines.map((l) => `- ${l.title}: ${hoursLabel(l.hours)} at ${money(l.rate)}/h = ${money(l.amount)}`);
  const body = [
    `Hi ${doc.client_name || "there"},`,
    "",
    doc.kind === "invoice"
      ? `Attached is invoice ${doc.number} for ${money(doc.total)}${doc.due_on ? `, due ${doc.due_on}` : ""}.`
      : `Attached is estimate ${doc.number} for ${money(doc.total)}.`,
    "",
    ...lines,
    "",
    `Total: ${money(doc.total)}`,
    ...(doc.kind === "invoice" && business.payment_note ? ["", business.payment_note] : []),
    "",
    "Thank you,",
    from,
  ].join("\n");
  const subject = `${label} ${doc.number} from ${from}`;
  return `mailto:${encodeURIComponent(doc.client_email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** The well-formedness check store.ts runs on read; a present file must pass it. */
export function validBillingFile(x: unknown): x is BillingFile {
  const f = x as Partial<BillingFile> | null;
  return !!f && f.schemaVersion === 1 && typeof f.default_rate === "number" && !!f.business && typeof f.business === "object" &&
    Array.isArray(f.clients) && Array.isArray(f.work) && Array.isArray(f.documents) &&
    f.clients.every((c) => !!c && typeof c.project_id === "string" && typeof c.rate === "number") &&
    f.work.every((w) => !!w && typeof w.id === "string" && typeof w.project_id === "string" && typeof w.pr_number === "number") &&
    f.documents.every((d) => !!d && typeof d.id === "string" && typeof d.number === "string" && Array.isArray(d.lines));
}
