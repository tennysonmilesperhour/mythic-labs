import { body, handle } from "@/lib/api";
import { syncBilling } from "@/lib/billing";

// POST · read newly merged pull requests on client projects and estimate each one.
export async function POST(req: Request) {
  await body(req);
  return handle(() => syncBilling(), req);
}
