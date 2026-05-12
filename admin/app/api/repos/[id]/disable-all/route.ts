import { NextResponse } from "next/server";
import { serviceClient, ADMIN_USER_ID } from "@/lib/supabase";
import { markApplied } from "@/lib/db";
import { writeFile, BRAIN_OWNER, BRAIN_REPO } from "@/lib/github";
import { fetchMarketplace, renderSettingsJson } from "@/lib/brain";

/**
 * Turn off every plugin for this repo in one shot and re-apply.
 * Writes a settings.json where every known plugin slug is set to false.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const db = serviceClient();
    const { data: repo, error } = await db
      .from("mythic_repos")
      .select("*")
      .eq("id", params.id)
      .eq("user_id", ADMIN_USER_ID)
      .single();
    if (error || !repo) {
      return NextResponse.json({ error: "Repo not found" }, { status: 404 });
    }

    const marketplace = await fetchMarketplace();

    const rows = marketplace.plugins.map((p) => ({
      repo_id: params.id,
      plugin_slug: p.name,
      enabled: false,
    }));

    const { error: upsertErr } = await db
      .from("mythic_repo_plugins")
      .upsert(rows, { onConflict: "repo_id,plugin_slug" });
    if (upsertErr) throw upsertErr;

    const enabled: Record<string, boolean> = {};
    for (const p of marketplace.plugins) enabled[p.name] = false;

    const content = renderSettingsJson(
      BRAIN_OWNER,
      BRAIN_REPO,
      marketplace.name,
      enabled
    );

    const result = await writeFile(
      repo.owner,
      repo.repo,
      ".claude/settings.json",
      content,
      "chore(claude): disable all Mythic Labs brain plugins",
      repo.default_branch
    );

    await markApplied(params.id, result.commitSha);

    return NextResponse.json({
      ok: true,
      commit_sha: result.commitSha,
      path: ".claude/settings.json",
      disabled_count: marketplace.plugins.length,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
