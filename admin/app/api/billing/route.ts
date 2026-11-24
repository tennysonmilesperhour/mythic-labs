import { handle } from "@/lib/api";
import { getBilling } from "@/lib/billing";

// GET · client projects, billable work, estimates and invoices.
export async function GET() {
  return handle(() => getBilling());
}
