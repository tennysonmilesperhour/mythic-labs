// An iCalendar feed of due dates, so the plan shows up in Google Calendar or
// Apple Calendar next to meetings. Pure: no store access, client-safe.

import type { ProjectDetail } from "./projectTypes";
import { isMine } from "./taskMap";

type Event = { uid: string; date: string; summary: string; description?: string; url?: string };

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);

/**
 * RFC 5545 folds content lines at 75 octets, continuing with a single space.
 * Count UTF-8 bytes per code point, so a multi-byte character or an emoji is
 * never split in the middle.
 */
const encoder = new TextEncoder();
export function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    if (bytes + n > 75) {
      out.push(cur);
      cur = " ";
      bytes = 1;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n");
}

const dateOnly = (d: string) => d.replace(/-/g, "");
const nextDay = (d: string) => new Date(new Date(`${d}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);

/** All-day events for open task due dates, milestone targets and project targets. */
export function calendarEvents(details: ProjectDetail[], origin: string, opts: { mine?: boolean; projectId?: string } = {}): Event[] {
  const events: Event[] = [];
  for (const d of details) {
    const p = d.project;
    if (opts.projectId && p.id !== opts.projectId) continue;
    if (p.status === "paused") continue;
    for (const t of d.tasks) {
      if (t.status === "done" || !t.due_date) continue;
      // "Mine" means the same thing here as on Today and My tasks: assigned to me, or an owner step.
      if (opts.mine && !isMine(t)) continue;
      events.push({
        uid: `task-${t.id}`,
        date: t.due_date,
        summary: `${t.title} (${p.name})`,
        description: [t.agent ? `@${t.agent}` : "unassigned", t.priority, t.acceptance ? `Done when: ${t.acceptance}` : ""].filter(Boolean).join(" · "),
        url: `${origin}/tasks/${t.id}`,
      });
    }
    if (!opts.mine) {
      for (const m of d.milestones) {
        if (m.done || !m.target_date) continue;
        events.push({ uid: `milestone-${m.id}`, date: m.target_date, summary: `Milestone: ${m.title} (${p.name})`, description: m.description, url: `${origin}/projects/${p.id}?tab=plan` });
      }
      if (p.target_date) {
        events.push({ uid: `project-${p.id}`, date: p.target_date, summary: `Target: ${p.name}`, description: p.summary, url: `${origin}/projects/${p.id}` });
      }
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export function renderIcs(events: Event[], name: string, stamp = new Date()): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mythic Labs//Brain Admin//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`,
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@mythic-labs`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${dateOnly(e.date)}`,
      `DTEND;VALUE=DATE:${dateOnly(nextDay(e.date))}`,
      `SUMMARY:${esc(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
      ...(e.url ? [`URL:${esc(e.url)}`] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
