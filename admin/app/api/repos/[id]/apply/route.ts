import { NextResponse } from "next/server";
import { serviceClient, ADMIN_USER_ID } from "@/lib/supabase";
import { listRepoPlugins, markApplied } from "@/lib/db";
import { writeFile, BRAIN_OWNER, BRAIN_REPO } from "@/lib/github";
import { fetchMarketplace, renderSettingsJson } from "@/lib/brain";

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

    const [marketplace, repoPlugins] = await Promise.all([
      fetchMarketplace(),
      listRepoPlugins(params.id),
    ]);

    const enabled: Record<string, boolean> = {};
    for (const p of marketplace.plugins) {
      const row = repoPlugins.find((rp) => rp.plugin_slug === p.name);
      enabled[p.name] = row?.enabled ?? false;
    }

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
      "chore(claude): sync .claude/settings.json from Mythic Labs brain admin",
      repo.default_branch
    );

    await markApplied(params.id, result.commitSha);

    return NextResponse.json({
      ok: true,
      commit_sha: result.commitSha,
      path: ".claude/settings.json",
      enabled,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
