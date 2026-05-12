import { NextResponse } from "next/server";
import { readFile } from "@/lib/github";
import { fetchMarketplace } from "@/lib/brain";

/**
 * Verify that a repo's .claude/settings.json correctly references
 * the brain marketplace and lists known plugins.
 */
export async function GET(
  _req: Request,
  { params }: { params: { owner: string; repo: string } }
) {
  try {
    const [file, marketplace] = await Promise.all([
      readFile(params.owner, params.repo, ".claude/settings.json"),
      fetchMarketplace(),
    ]);

    if (!file) {
      return NextResponse.json({
        ok: false,
        reason: "missing",
        message: `.claude/settings.json not found in ${params.owner}/${params.repo}`,
      });
    }

    let parsed: {
      extraKnownMarketplaces?: Record<string, unknown>;
      enabledPlugins?: Record<string, boolean>;
    };
    try {
      parsed = JSON.parse(file.content);
    } catch {
      return NextResponse.json({
        ok: false,
        reason: "invalid_json",
        message: "settings.json could not be parsed",
      });
    }

    const marketRef = parsed.extraKnownMarketplaces?.[marketplace.name];
    const knownPluginSlugs = marketplace.plugins.map((p) => p.name);
    const declaredPlugins = Object.keys(parsed.enabledPlugins || {}).map((k) =>
      k.split("@")[0]
    );

    const unknownPlugins = declaredPlugins.filter(
      (p) => !knownPluginSlugs.includes(p)
    );
    const missingPlugins = knownPluginSlugs.filter(
      (p) => !declaredPlugins.includes(p)
    );

    const enabledList = Object.entries(parsed.enabledPlugins || {})
      .filter(([, v]) => v === true)
      .map(([k]) => k.split("@")[0]);

    return NextResponse.json({
      ok: !!marketRef,
      marketplace_declared: !!marketRef,
      enabled: enabledList,
      unknown_plugins: unknownPlugins,
      missing_plugins: missingPlugins,
      sha: file.sha,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
