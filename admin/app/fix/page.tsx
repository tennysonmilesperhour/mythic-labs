import Link from "next/link";
import { redirect } from "next/navigation";
import { getHub, getProjectDetail, summarize } from "@/lib/projects";
import { BRAIN_OWNER, BRAIN_REPO } from "@/lib/github";
import { attentionHref, flagKind, taskHref } from "@/lib/taskMap";
import { GlyphArrow } from "@/components/Glyphs";
import FixClient from "./FixClient";
import SourceFix from "./SourceFix";

export const dynamic = "force-dynamic";

/** A task map for anything that isn't a task: an attention flag, a group of them, or a broken data source. */
export default async function FixPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key = "" } = await searchParams;
  const kind = flagKind(key);

  if (key.startsWith("source:")) {
    return (
      <Shell back={{ href: "/", label: "Overview" }}>
        <SourceFix source={kind} brain={`${BRAIN_OWNER}/${BRAIN_REPO}`} />
      </Shell>
    );
  }

  if (key.startsWith("group:")) {
    const hub = await getHub();
    const items = hub.projects.flatMap((p) => p.attention).filter((a) => flagKind(a.key) === kind);
    const head = hub.attention.find((a) => a.key === key);
    return (
      <Shell back={{ href: "/tasks", label: "My tasks" }}>
        <h1 className="serif-display text-[2.2rem] md:text-[2.8rem] leading-[1.05] mb-3">{head?.title ?? `${items.length} projects flagged`}</h1>
        <p className="text-fg-dim text-sm mb-8 max-w-2xl">One fix per project. Each row opens its own map with the fix inline; come back here for the next.</p>
        {items.length ? (
          <ul className="border border-line divide-y divide-line-soft bg-bg/85">
            {items.map((a) => (
              <li key={a.key}>
                <Link href={attentionHref(a)} className="flex items-baseline gap-3 px-4 py-3 hover:bg-[rgba(139,115,85,0.05)]">
                  <span className="flex-1 min-w-0">
                    <span className="text-[0.92rem] text-fg">{a.project_name}</span>
                    <span className="block font-mono text-[0.58rem] text-fg-ghost">{a.title} · {a.detail}</span>
                  </span>
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-accent">Fix →</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-ghost text-sm">All fixed.</p>
        )}
      </Shell>
    );
  }

  const [projectId, , ref] = key.split(":");
  if (!projectId || !kind) redirect("/tasks");
  const detail = await getProjectDetail(projectId);
  if (ref && detail.tasks.some((t) => t.id === ref)) redirect(taskHref(ref, kind));
  const item = summarize(detail).attention.find((a) => a.key === key);

  return (
    <Shell back={{ href: "/tasks", label: "My tasks" }}>
      <FixClient
        initial={detail}
        kind={kind}
        refId={ref ?? null}
        title={item?.title ?? null}
        detail={item?.detail ?? null}
      />
    </Shell>
  );
}

function Shell({ back, children }: { back: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <div>
      <Link href={back.href} className="mono-label-dim hover:text-accent inline-flex items-center gap-2 mb-8">
        <span className="rotate-180 inline-block"><GlyphArrow size={11} /></span>
        {back.label}
      </Link>
      {children}
    </div>
  );
}
