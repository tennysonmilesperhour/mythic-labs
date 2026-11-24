import { agentName, body, handle, requireAgent } from "@/lib/api";
import { getBilling, syncBilling } from "@/lib/billing";
import { amount } from "@/lib/billingTypes";

// GET · unbilled hours and amount per client project, for the daily report.
export async function GET(req: Request) {
  return handle(async () => {
    requireAgent(req);
    agentName(req);
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
        unbilled_amount: Math.round(unbilled.reduce((t, w) => t + amount(w.hours, w.rate), 0) * 100) / 100,
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
