import { handle } from "@/lib/api";
import { loadAll } from "@/lib/projects";
import { calendarEvents, renderIcs } from "@/lib/ical";

// GET /api/calendar.ics[?mine=1][&project=<id>] · due dates and milestones as an
// iCalendar feed. Subscribe to it from Google Calendar or Apple Calendar. Behind
// Vercel Deployment Protection, append ?x-vercel-protection-bypass=<secret>.
export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    const mine = url.searchParams.get("mine") === "1";
    const projectId = url.searchParams.get("project") || undefined;
    const all = await loadAll();
    const events = calendarEvents(all, url.origin, { mine, projectId });
    const name = mine ? "Mythic Labs · my due dates" : projectId ? `Mythic Labs · ${all.find((d) => d.project.id === projectId)?.project.name ?? "project"}` : "Mythic Labs · roadmap";
    return new Response(renderIcs(events, name), {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": 'inline; filename="mythic-labs.ics"',
        "cache-control": "private, max-age=300",
      },
    });
  });
}
