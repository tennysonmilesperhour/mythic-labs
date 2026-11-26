import { agentName, body, handle, requireAgent } from "@/lib/api";
import { getBilling, syncBilling } from "@/lib/billing";
import { itemAmount } from "@/lib/billingTypes";

// GET · unbilled hours and amount per client project, for the daily report. ?items=1 lists each item.
export async function GET(req: Request) {
  return handle(async () => {
    requireAgent(req);
    agentName(req);
    const items = new URL(req.url).searchParams.get("items") === "1";
    const b = await getBilling();
    const clients = b.clients.map((c) => {
      const unbilled = b.work.filter((w) => w.project_id === c.project_id && w.status === "unbilled");
      return {
        project_id: c.project_id,
        project: b.projects.find((p) => p.id === c.project_id)?.name || c.project_id,
        client_name: c.client_name,
        rate: c.rate,
        unbilled_items: unbilled.length,
        unbilled_hours: unbilled.reduce((t, w) => t + w.hours, 0),
        unbilled_amount: Math.round(unbilled.reduce((t, w) => t + itemAmount(w), 0) * 100) / 100,
        ...(items
          ? { items: unbilled.map((w) => ({ id: w.id, title: w.title, date: w.merged_at.slice(0, 10), kind: w.kind || "work", hours: w.hours, amount: itemAmount(w) })) }
          : {}),
      };
    });
    return { clients };
  });
}

// POST · estimate newly merged pull requests on client projects (the daily run calls this).
export async function POST(req: Request) {
  await body(req);
  return handle(async () => {
    requireAgent(req);
    agentName(req);
    return syncBilling();
  }, req);
}
