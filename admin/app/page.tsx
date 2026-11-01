import Link from "next/link";
import { dataSourceLabel, listRepos } from "@/lib/db";
import { getHub } from "@/lib/projects";
import { fetchMarketplace } from "@/lib/brain";
import { AttentionList, TaskRefList } from "@/components/Glance";
import { Freshness } from "@/components/OverviewBits";
import { StatusDot } from "@/components/ProjectBits";
import { ME, facetHref, fixHref, projectHref } from "@/lib/taskMap";
import SubLink from "@/components/SubLink";
import {
  HEALTH_META,
  STALE_DAYS,
  STALLED_CLAIM_DAYS,
  SOON_DAYS,
  STATUSES,
  STATUS_META,
  WORKABLE,
  daysFromNow,
  dueLabel,
  fmtDate,
  relTime,
  today,
  type Hub,
} from "@/lib/projectTypes";

export const dynamic = "force-dynamic";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function settle<T>(p: Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await p };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function Overview() {
  const [hubR, marketR, reposR] = await Promise.all([
    settle(getHub()),
    settle(fetchMarketplace()),
    settle(listRepos()),
  ]);
  const loadedAt = new Date().toISOString();
  const hub: Hub | null = hubR.ok ? hubR.data : null;
  const market = marketR.ok ? marketR.data : null;
  const repos = reposR.ok ? reposR.data : [];
  const agentApiOn = process.env.PM_AGENT_API_ENABLED === "true" && !!process.env.PM_AGENT_TOKEN;
  let storeName = "";
  try {
    storeName = dataSourceLabel();
  } catch {
    storeName = "";
  }

  const projects = hub?.projects ?? [];
  const live = projects.filter((p) => p.status !== "paused");
  const workable = projects.filter((p) => WORKABLE.includes(p.status));
  const sum = (ps: typeof projects, k: "ready" | "blocked" | "overdue") =>
    ps.reduce((n, p) => n + p.stats[k], 0);

  // The home list holds what wants a decision; housekeeping ("tidy") is a count.
  const attention = hub?.attention ?? [];
  const urgent = attention.filter((a) => a.severity !== "low");
  const tidy = attention.filter((a) => a.severity === "low");
  const stalled = attention.filter((a) => a.key.split(":")[1] === "stalled").length;
  const blocked = sum(live, "blocked");
  const ready = sum(workable, "ready");
  const overdue = sum(live, "overdue");
  const soon = daysFromNow(SOON_DAYS);
  const msSoon = (hub?.timeline ?? []).filter(
    (m) => !m.done && m.target_date && m.target_date >= today() && m.target_date <= soon
  );

  const mine = hub?.mine ?? [];
  const calls = attention.filter((a) => !a.task_id).length;
  const reviewDue = attention.filter((a) => a.key.split(":")[1] === "review").reduce((n, a) => n + (a.key.startsWith("group:") ? Number(a.title.split(" ")[0]) || 1 : 1), 0);
  const healthCount = (level: string) => projects.filter((p) => p.health.level === level).length;

  // A broken source leads the page; when all are fine it sits at the bottom.
  const sourcesOk = hubR.ok && marketR.ok && agentApiOn;
  const sources = (
      <Section
        title="Data sources"
        what="Where this page reads from. If one is down, the sections that depend on it say so."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-line border border-line">
          <Source
            name="Project store"
            ok={hubR.ok}
            detail={
              hubR.ok
                ? `${projects.length} projects · ${storeName || "GitHub"}`
                : hubR.error
            }
            fix={hubR.ok ? undefined : "Set PM_DATA_REPO (private owner/repo), PM_DATA_BRANCH and GITHUB_TOKEN."}
            href={fixHref("source:store")}
          />
          <Source
            name="Plugin marketplace"
            ok={marketR.ok}
            detail={
              market
                ? `${market.name}${market.version ? ` v${market.version}` : ""} · ${market.plugins.length} plugins`
                : marketR.ok
                  ? ""
                  : marketR.error
            }
            fix={marketR.ok ? undefined : "Reads .claude-plugin/marketplace.json from BRAIN_OWNER/BRAIN_REPO with GITHUB_TOKEN."}
            href={marketR.ok ? "/brain" : fixHref("source:market")}
          />
          <Source
            name="Agent API"
            ok={agentApiOn}
            okLabel="On"
            offLabel="Off"
            detail={
              agentApiOn
                ? "Agents can read the roadmap and claim tasks at /api/agent."
                : "Agents can't read the roadmap or claim tasks."
            }
            fix={agentApiOn ? undefined : "Set PM_AGENT_API_ENABLED=true and PM_AGENT_TOKEN to turn it on."}
            href={fixHref("source:agent")}
          />
        </div>
      </Section>
  );

  return (
    <div className="flex flex-col gap-14">
      {/* ── Header ── */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <h1 className="serif-display text-[2.2rem] md:text-[2.6rem] leading-none mb-2">Overview</h1>
          <p className="text-fg-dim text-sm max-w-2xl leading-relaxed">
            What needs a decision, what agents are working on, and the state of the plugin brain. Every
            number links to the list it counts. Nothing on this page changes data.
          </p>
        </div>
        <Freshness loadedAt={loadedAt} />
      </header>

      {sourcesOk ? null : sources}

      {/* ── The day ── */}
      {hubR.ok ? (
        <Section
          title="The day"
          what="Where to start: today's plan, captures waiting to be sorted, what already shipped today, and projects due for their weekly pass."
          action={{ href: "/today", label: "Open today" }}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line">
            <Metric label="Planned today" value={hub!.today.length} def="Tasks on today's plan, including carry-overs and your overdue work." href="/today" />
            <Metric label="Inbox" value={hub!.inbox.length} def="Captures and agent proposals waiting to be sorted into a project." href="/inbox" warn />
            <Metric label="Finished today" value={hub!.doneToday.length} def="Tasks closed today by you or an agent." href="/today#finished-today" />
            <Metric label="Due for review" value={reviewDue} def="Live projects that have not had a weekly pass in 7 days." href="/review" warn />
          </div>
        </Section>
      ) : null}

      {/* ── Your work ── */}
      {hubR.ok ? (
        <Section
          title="Only you can do"
          count={mine.length + calls}
          what={`Tasks assigned to @${ME} or noted as an owner step, plus decisions and fixes waiting on you. Each opens a task map with the steps, links and text to paste.`}
          action={{ href: "/tasks", label: "Open my tasks" }}
        >
          {mine.length ? (
            <TaskRefList tasks={mine} show="due" limit={5} empty="" moreHref="/tasks" />
          ) : (
            <EmptyBox>
              Nothing is assigned to @{ME}. Give yourself a task from any plan or task map, or see{" "}
              <Link className="text-accent underline" href="/tasks">My tasks</Link> for decisions waiting on you.
            </EmptyBox>
          )}
          {calls ? (
            <Link href="/tasks" className="block mt-3 font-mono text-[0.6rem] text-fg-dim hover:text-fg">
              + {calls} decision{calls > 1 ? "s" : ""} and fix{calls > 1 ? "es" : ""} on My tasks →
            </Link>
          ) : null}
        </Section>
      ) : null}

      {/* ── Needs you ── */}
      <Section
        title="Needs a decision"
        count={hubR.ok ? urgent.length : undefined}
        what={`Blocked, overdue and critical tasks, late milestones and proposed decisions first, then tasks in progress with no update in ${STALLED_CLAIM_DAYS}d and active projects quiet for ${STALE_DAYS}d+. Click a row to open it.`}
        action={{ href: "/projects?view=list", label: "Open all projects" }}
      >
        {!hubR.ok ? (
          <Unavailable source="Project store" />
        ) : !projects.length ? (
          <EmptyBox>
            No projects yet, so there is nothing to flag. Add or import projects on{" "}
            <Link className="text-accent underline" href="/projects">Projects</Link> or{" "}
            <Link className="text-accent underline" href="/import">Import</Link>.
          </EmptyBox>
        ) : (
          <>
            <AttentionList
              items={urgent}
              limit={10}
              empty={`All clear: nothing is blocked, overdue, stalled or waiting on a decision across ${projects.length} projects.`}
            />
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[0.6rem] text-fg-ghost">
              <span><span className="text-fg">■</span> needs you: blocked, overdue, critical, late, past target</span>
              <span><span className="text-accent">◆</span> watch: stalled, quiet, decision proposed, nothing ready</span>
              {tidy.length ? (
                <Link href="/tasks" className="hover:text-fg">
                  · {tidy.length} housekeeping flag{tidy.length > 1 ? "s" : ""} (missing next action or build
                  instructions, long pauses) on My tasks →
                </Link>
              ) : null}
            </div>
          </>
        )}
      </Section>

      {/* ── Agent work ── */}
      <Section
        title="Task flow"
        what="Tasks across every project that isn't paused. Agents take the highest-ranked ready task from active and building projects."
        action={{ href: "/queue", label: "Open queue" }}
      >
        {!hubR.ok ? (
          <Unavailable source="Project store" />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-line border border-line mb-8">
              <Metric
                label="In progress"
                value={hub!.inProgress.length}
                def="Tasks marked doing."
                href="/queue?status=doing"
              />
              <Metric
                label="Ready"
                value={ready}
                def="Todo with dependencies done, in an active or building project: what an agent can start now."
                href="/queue?ready=1"
              />
              <Metric
                label="Blocked"
                value={blocked}
                def="Tasks marked blocked."
                href="/queue?status=blocked"
                warn
              />
              <Metric
                label="Stalled"
                value={stalled}
                def={`Doing, but no update in ${STALLED_CLAIM_DAYS}+ days.`}
                href="/queue?status=doing"
                warn
              />
              <Metric
                label="Overdue"
                value={overdue}
                def="Open tasks past their due date. Each one is listed under Needs a decision."
                href="#needs-a-decision"
                warn
                className="col-span-2 md:col-span-1"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div>
                <SubHead label="In progress now" note="last update" />
                <TaskRefList
                  tasks={hub!.inProgress}
                  show="since"
                  limit={6}
                  moreHref="/queue?status=doing"
                  empty="No task is marked doing. Ready tasks wait in the queue until a person or agent claims one."
                />
              </div>
              <div>
                <SubHead label={`Due in the next ${SOON_DAYS} days`} note="due" />
                <TaskRefList
                  tasks={hub!.upcoming}
                  show="due"
                  limit={6}
                  empty={`No open task has a due date in the next ${SOON_DAYS} days.`}
                />
                {msSoon.length ? (
                  <ul className="mt-3">
                    {msSoon.slice(0, 4).map((m) => (
                      <li key={m.id}>
                        <Link
                          href={`/projects/${m.project_id}?tab=plan`}
                          className="flex items-baseline gap-3 py-1.5 border-b border-line hover:text-accent"
                        >
                          <span className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-accent shrink-0">
                            Milestone
                          </span>
                          <span className="flex-1 min-w-0 truncate text-[0.85rem]">
                            {m.title}
                            <span className="font-mono text-[0.58rem] text-fg-ghost">
                              {" · "}
                              <SubLink href={projectHref(m.project_id)}>{m.project_name}</SubLink>
                            </span>
                          </span>
                          <span className="font-mono text-[0.58rem] text-fg-ghost tnum shrink-0">
                            {m.tasks_done}/{m.tasks_total} · {dueLabel(m.target_date)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </>
        )}
      </Section>

      {/* ── Projects by status ── */}
      <Section
        title="Projects by status"
        count={hubR.ok ? projects.length : undefined}
        what="How many projects sit in each status. Agents only take work from Active and Building."
        action={{ href: "/projects", label: "Open board" }}
      >
        {!hubR.ok ? (
          <Unavailable source="Project store" />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line mb-px">
              {STATUSES.map((s) => (
                <Metric
                  key={s}
                  label={STATUS_META[s].label}
                  dot={<StatusDot status={s} />}
                  value={projects.filter((p) => p.status === s).length}
                  def={STATUS_META[s].hint}
                  href={`/projects?view=list&status=${s}`}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-px bg-line border border-line">
              {(["on_track", "at_risk", "off_track"] as const).map((h) => (
                <Metric
                  key={h}
                  label={HEALTH_META[h].label}
                  value={healthCount(h)}
                  def={HEALTH_META[h].hint}
                  href={`/projects?view=list&health=${h}`}
                  warn={h !== "on_track"}
                />
              ))}
            </div>
          </>
        )}
      </Section>

      {/* ── Brain + repos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-14">
        <Section
          title="Plugins"
          count={market?.plugins.length}
          what="Plugins in the marketplace that Claude Code and other agents install. Read from marketplace.json on GitHub."
          action={{ href: "/brain", label: "Browse contents" }}
        >
          {!market ? (
            <Unavailable source="Plugin marketplace" />
          ) : !market.plugins.length ? (
            <EmptyBox>
              marketplace.json lists no plugins. Register one with a source entry; see{" "}
              <Link className="text-accent underline" href="/authoring">Authoring</Link>.
            </EmptyBox>
          ) : (
            <ul className="border border-line divide-y divide-line-soft bg-bg/85">
              {market.plugins.map((p) => (
                <li key={p.name}>
                  <Link href={`/brain?plugin=${encodeURIComponent(p.name)}`} className="block px-4 py-2.5 hover:bg-[rgba(139,115,85,0.05)]">
                    <span className="font-mono text-[0.78rem] text-fg">{p.name}</span>
                    {p.description ? (
                      <span className="block text-[0.8rem] text-fg-dim truncate">{p.description}</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Repo exceptions"
          count={reposR.ok ? repos.length : undefined}
          what="Repos that need a different plugin set than your user or org default. Drift is checked per repo on the Repos page (read-only)."
          action={{ href: "/repos", label: "Check drift" }}
        >
          {!reposR.ok ? (
            <Unavailable source="Project store" />
          ) : !repos.length ? (
            <EmptyBox>
              No exceptions tracked, so every repo uses your default plugins. Track a repo on{" "}
              <Link className="text-accent underline" href="/repos">Repos</Link> only when it needs a different set.
            </EmptyBox>
          ) : (
            <ul className="border border-line divide-y divide-line-soft bg-bg/85">
              {repos.slice(0, 8).map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/repos#repo-${r.id}`}
                    className="flex items-baseline gap-3 px-4 py-2.5 hover:bg-[rgba(139,115,85,0.05)]"
                  >
                    <span className="flex-1 min-w-0 truncate font-mono text-[0.78rem] text-fg">
                      {r.owner}/{r.repo}
                    </span>
                    <span className="font-mono text-[0.58rem] text-fg-ghost shrink-0">
                      {r.last_applied_at ? `config copied ${relTime(r.last_applied_at)}` : "config never copied"}
                    </span>
                  </Link>
                </li>
              ))}
              {repos.length > 8 ? (
                <li>
                  <Link href="/repos" className="block px-4 py-2 font-mono text-[0.58rem] text-fg-ghost hover:text-fg">+ {repos.length - 8} more on Repos →</Link>
                </li>
              ) : null}
            </ul>
          )}
        </Section>
      </div>

      {/* ── Recent log ── */}
      <Section
        title="Recent changes and decisions"
        what="The latest changelog and decision entries written by you or agents, newest first."
      >
        {!hubR.ok ? (
          <Unavailable source="Project store" />
        ) : !hub!.recent.length ? (
          <EmptyBox>
            Nothing logged yet. Entries appear here when you or an agent adds a changelog or decision on a project&apos;s Log tab.
          </EmptyBox>
        ) : (
          <ul className="flex flex-col">
            {hub!.recent.map((e) => (
              <li key={e.id}>
                <Link
                  href={
                    e.kind === "decision" && e.decision_status === "proposed"
                      ? fixHref(`${e.project_id}:decision:${e.id}`)
                      : `/projects/${e.project_id}?tab=${e.kind === "decision" ? "decisions" : e.kind === "update" ? "activity" : "changelog"}&entry=${e.id}`
                  }
                  className="flex items-baseline gap-3 py-1.5 border-b border-line hover:text-accent"
                >
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-fg-dim w-20 shrink-0">
                    {e.kind === "decision" ? e.decision_status ?? "decision" : e.kind === "update" ? (e.health ? HEALTH_META[e.health].label : "update") : e.change_type ?? "change"}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-[0.85rem]">
                    {e.title}
                    <span className="font-mono text-[0.58rem] text-fg-ghost">
                      {" "}· <SubLink href={projectHref(e.project_id)}>{e.project_name}</SubLink>
                      {e.version ? ` · v${e.version}` : ""}
                      {e.author ? (
                        <>
                          {" · "}
                          {e.author === ME ? `@${e.author}` : <SubLink href={facetHref("agent", e.author)}>@{e.author}</SubLink>}
                        </>
                      ) : null}
                    </span>
                  </span>
                  <span className="font-mono text-[0.58rem] text-fg-ghost shrink-0 tnum">{fmtDate(e.entry_date)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {sourcesOk ? sources : null}
    </div>
  );
}

// ─────────── pieces ───────────

function Section({
  title,
  what,
  count,
  action,
  children,
}: {
  title: string;
  /** One line on what the section shows, so no number needs guessing. */
  what: string;
  count?: number;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section id={title.toLowerCase().replace(/[^a-z]+/g, "-")} className="scroll-mt-20">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 mb-1">
        <h2 className="text-[1.05rem] font-medium text-fg">
          {title}
          {count === undefined ? null : action ? (
            <Link href={action.href} className="ml-2 font-mono text-[0.75rem] text-fg-ghost tnum hover:text-accent">
              {count}
            </Link>
          ) : (
            <span className="ml-2 font-mono text-[0.75rem] text-fg-ghost tnum">{count}</span>
          )}
        </h2>
        {action ? (
          <Link
            href={action.href}
            className="font-mono text-[0.6rem] tracking-[0.18em] uppercase text-accent hover:text-fg"
          >
            {action.label} →
          </Link>
        ) : null}
      </div>
      <p className="text-fg-ghost text-[0.78rem] leading-relaxed mb-4 max-w-3xl">{what}</p>
      {children}
    </section>
  );
}

function SubHead({ label, note }: { label: string; note: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-line pb-1.5 mb-1">
      <span className="mono-label">{label}</span>
      <span className="font-mono text-[0.55rem] text-fg-ghost uppercase tracking-[0.15em]">{note}</span>
    </div>
  );
}

function Metric({
  label,
  value,
  def,
  href,
  warn,
  dot,
  className = "",
}: {
  label: string;
  value: number;
  /** What the number counts. */
  def: string;
  href: string;
  /** Non-zero is a problem: render it in full ink. */
  warn?: boolean;
  dot?: React.ReactNode;
  className?: string;
}) {
  const strong = warn ? value > 0 : true;
  return (
    <Link href={href} className={`group block bg-bg p-4 hover:bg-bg-warm ${className}`} title={def}>
      <div className="flex items-center gap-2 mono-label-dim mb-2">
        {dot}
        {label}
      </div>
      <div className={`serif-display text-[2rem] leading-none tnum ${strong ? "text-fg" : "text-fg-ghost"}`}>
        {value}
        {warn && value > 0 ? <span className="ml-1.5 align-middle font-mono text-[0.7rem] text-fg">▲</span> : null}
      </div>
      <p className="text-[0.72rem] text-fg-ghost leading-snug mt-2 group-hover:text-fg-dim">{def}</p>
    </Link>
  );
}

function Source({
  name,
  ok,
  detail,
  fix,
  href,
  okLabel = "Connected",
  offLabel = "Unavailable",
}: {
  name: string;
  ok: boolean;
  detail: string;
  fix?: string;
  /** Where to go: the source itself when it works, its step-by-step fix when it doesn't. */
  href: string;
  okLabel?: string;
  offLabel?: string;
}) {
  return (
    <Link href={href} className="block bg-bg p-4 hover:bg-bg-warm">
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="text-[0.85rem] text-fg">{name}</span>
        <span className={`font-mono text-[0.58rem] uppercase tracking-[0.15em] ${ok ? "text-accent" : "text-fg"}`}>
          {ok ? "● " : "✕ "}
          {ok ? okLabel : offLabel}
        </span>
      </div>
      <p className="font-mono text-[0.62rem] text-fg-dim leading-relaxed break-words">{detail}</p>
      {fix ? <p className="font-mono text-[0.6rem] text-fg-ghost leading-relaxed mt-1.5">{fix}</p> : null}
      {ok ? null : <p className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-accent mt-2">Fix it step by step →</p>}
    </Link>
  );
}

function Unavailable({ source }: { source: string }) {
  return (
    <EmptyBox>
      Can&apos;t show this: the {source.toLowerCase()} didn&apos;t load.{" "}
      <Link className="text-accent underline" href={fixHref(source === "Project store" ? "source:store" : "source:market")}>
        Fix it step by step →
      </Link>
    </EmptyBox>
  );
}

function EmptyBox({ children }: { children: React.ReactNode }) {
  return <p className="text-fg-dim text-sm border border-dashed border-line px-4 py-5 leading-relaxed">{children}</p>;
}
