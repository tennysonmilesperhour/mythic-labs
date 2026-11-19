import type { Task } from "./projectTypes";

export const DELIVERY_STAGES = ["merged", "deployed", "verified"] as const;
export type DeliveryStage = typeof DELIVERY_STAGES[number];
export function deliveryLabel(task: Task): string {
  if (task.status !== "done") return task.status === "doing" ? "In progress" : task.status === "blocked" ? "Blocked" : "Waiting to start";
  if (task.delivery) return { merged: "Merged", deployed: "Deployed, needs a live check", verified: "Verified live" }[task.delivery.stage];
  return task.approved_at ? "Reviewed, needs delivery" : "Submitted, needs review";
}
export function nextDeliveryStage(task: Task): DeliveryStage | null {
  if (task.status !== "done" || !task.approved_at) return null;
  if (!task.delivery) return "merged";
  return task.delivery.stage === "merged" ? "deployed" : task.delivery.stage === "deployed" ? "verified" : null;
}
export function safeEvidenceUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; }
}
