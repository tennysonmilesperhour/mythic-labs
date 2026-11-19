import Link from "next/link";
import { listMessages } from "@/lib/projects";
import { groupThreads, type Thread } from "@/lib/messageTypes";
import { fixHref } from "@/lib/taskMap";
import MessagesClient from "./MessagesClient";

export const dynamic = "force-dynamic";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{thread?: string}> }) {
  const { thread } = await searchParams;
  let error: string | null = null;
  let threads: Thread[] = [];
  try {
    threads = groupThreads(await listMessages());
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  // The Claude session that runs the daily checks; set PM_CLAUDE_URL on Vercel to point at it.
  const claudeUrl = process.env.PM_CLAUDE_URL || "https://claude.ai/code";

  return (
    <div>
      <header className="border-b border-line pb-6 mb-8">
        <h1 className="serif-display text-[2.2rem] md:text-[2.6rem] leading-none mb-2">Messages</h1>
        <p className="text-fg-dim text-sm max-w-2xl leading-relaxed">
          Questions and owner actions appear first. Routine run reports are grouped separately. Agents receive your messages when they next connect; the next run time is unverified.
        </p>
      </header>
      {error ? (
        <p className="border border-line bg-bg-warm/80 p-5 text-sm text-fg-dim">
          The project store didn&apos;t load: {error}{" "}
          <Link href={fixHref("source:store")} className="text-accent underline">Fix it step by step →</Link>
        </p>
      ) : (
        <MessagesClient initial={threads} claudeUrl={claudeUrl} initialThread={thread} />
      )}
    </div>
  );
}
