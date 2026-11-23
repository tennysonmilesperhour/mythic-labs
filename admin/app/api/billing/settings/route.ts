import { body, handle } from "@/lib/api";
import { saveSettings } from "@/lib/billing";

// PATCH { name?, email?, payment_terms_days?, payment_note?, default_rate? } · who the paperwork is from.
export async function PATCH(req: Request) {
  const b = await body(req);
  return handle(async () => ({ settings: await saveSettings(b) }), req);
}
