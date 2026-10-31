import { HEALTH_META, type Health } from "@/lib/projectTypes";

/** On track / at risk / off track as a small chip; the reasons sit in the tooltip. */
export function HealthChip({ health, size = "sm" }: { health: Health; size?: "sm" | "md" }) {
  const tone =
    health.level === "off_track"
      ? "border-fg bg-fg text-bg"
      : health.level === "at_risk"
        ? "border-accent text-fg bg-[rgba(139,115,85,0.1)]"
        : health.level === "on_track"
          ? "border-accent-light text-fg-dim"
          : "border-line text-fg-ghost";
  const mark = health.level === "off_track" ? "▲" : health.level === "at_risk" ? "◆" : health.level === "on_track" ? "●" : "○";
  return (
    <span
      title={[HEALTH_META[health.level].hint, ...health.reasons].join("\n")}
      className={`inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.12em] border ${size === "md" ? "text-[0.6rem] px-2 py-1" : "text-[0.52rem] px-1.5 py-0.5"} ${tone}`}
    >
      <span className="text-[0.6em]">{mark}</span>
      {HEALTH_META[health.level].label}
    </span>
  );
}
