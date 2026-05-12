import { NextResponse } from "next/server";
import { writeFile, BRAIN_OWNER, BRAIN_REPO } from "@/lib/github";

/**
 * Create a new slash command file inside a plugin's commands/ directory.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      plugin_slug: string;
      command_name: string;
      description: string;
      argument_hint?: string;
      body: string;
    };

    if (
      !body.plugin_slug ||
      !body.command_name ||
      !body.description ||
      !body.body
    ) {
      return NextResponse.json(
        {
          error:
            "plugin_slug, command_name, description, and body are required",
        },
        { status: 400 }
      );
    }

    const slug = body.command_name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");

    const path = `${body.plugin_slug}/commands/${slug}.md`;

    const frontmatter = [
      "---",
      `description: ${body.description.replace(/\n/g, " ")}`,
      ...(body.argument_hint ? [`argument-hint: ${body.argument_hint}`] : []),
      "---",
      "",
    ].join("\n");

    const content = frontmatter + body.body.trim() + "\n";

    const result = await writeFile(
      BRAIN_OWNER,
      BRAIN_REPO,
      path,
      content,
      `feat(${body.plugin_slug}): add /${slug} command`
    );

    return NextResponse.json({
      ok: true,
      commit_sha: result.commitSha,
      path,
      invocation: `/${body.plugin_slug}:${slug}`,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
