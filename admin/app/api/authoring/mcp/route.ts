import { NextResponse } from "next/server";
import { readFile, writeFile, BRAIN_OWNER, BRAIN_REPO } from "@/lib/github";

/**
 * Add or update an MCP server entry inside a plugin's .mcp.json.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      plugin_slug: string;
      server_name: string;
      command: string;
      args?: string[];
      env?: Record<string, string>;
    };

    if (!body.plugin_slug || !body.server_name || !body.command) {
      return NextResponse.json(
        { error: "plugin_slug, server_name, and command are required" },
        { status: 400 }
      );
    }

    const path = `${body.plugin_slug}/.mcp.json`;
    const existing = await readFile(BRAIN_OWNER, BRAIN_REPO, path);

    let mcpJson: { mcpServers?: Record<string, unknown> } = { mcpServers: {} };
    if (existing) {
      try {
        mcpJson = JSON.parse(existing.content);
        if (!mcpJson.mcpServers) mcpJson.mcpServers = {};
      } catch {
        return NextResponse.json(
          { error: "existing .mcp.json is invalid JSON" },
          { status: 500 }
        );
      }
    }

    mcpJson.mcpServers![body.server_name] = {
      command: body.command,
      args: body.args || [],
      ...(body.env ? { env: body.env } : {}),
    };

    const result = await writeFile(
      BRAIN_OWNER,
      BRAIN_REPO,
      path,
      JSON.stringify(mcpJson, null, 2) + "\n",
      `chore(${body.plugin_slug}): register MCP server "${body.server_name}"`
    );

    return NextResponse.json({ ok: true, commit_sha: result.commitSha, path });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
