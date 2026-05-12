import { NextResponse } from "next/server";
import { backfillRepoMeta, listRepos } from "@/lib/db";
import { getRepoMeta } from "@/lib/github";

/**
 * One-shot: walk every repo that doesn't yet have is_fork set,
 * query GitHub for its metadata, and persist. Idempotent.
 */
export async function POST() {
  try {
    const repos = await listRepos();
    const stale = repos.filter((r) => r.is_fork === null);
    if (stale.length === 0) {
      return NextResponse.json({ updated: 0, skipped: repos.length });
    }

    let updated = 0;
    const failed: Array<{ repo: string; reason: string }> = [];
    for (const r of stale) {
      const meta = await getRepoMeta(r.owner, r.repo);
      if (!meta) {
        failed.push({
          repo: `${r.owner}/${r.repo}`,
          reason: "not accessible to PAT",
        });
        continue;
      }
      try {
        await backfillRepoMeta(r.id, meta);
        updated++;
      } catch (err: unknown) {
        failed.push({
          repo: `${r.owner}/${r.repo}`,
          reason: (err as Error).message,
        });
      }
    }

    return NextResponse.json({ updated, failed, skipped: repos.length - stale.length });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
