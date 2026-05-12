import { NextResponse } from "next/server";
import { addRepo, listRepos } from "@/lib/db";
import { getRepoMeta } from "@/lib/github";

export async function GET() {
  try {
    const repos = await listRepos();
    return NextResponse.json({ repos });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { input?: string };
    if (!body.input) {
      return NextResponse.json(
        { error: "Provide input: string with one repo per line." },
        { status: 400 }
      );
    }

    const lines = body.input
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const created: string[] = [];
    const failed: Array<{ line: string; reason: string }> = [];

    for (const line of lines) {
      const parsed = parseRepoLine(line);
      if (!parsed) {
        failed.push({ line, reason: "could not parse owner/repo" });
        continue;
      }
      try {
        const meta = await getRepoMeta(parsed.owner, parsed.repo);
        await addRepo(parsed.owner, parsed.repo, meta || undefined);
        created.push(`${parsed.owner}/${parsed.repo}`);
      } catch (err: unknown) {
        failed.push({ line, reason: (err as Error).message });
      }
    }

    return NextResponse.json({ created, failed });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

function parseRepoLine(line: string): { owner: string; repo: string } | null {
  const cleaned = line.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "");
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return { owner: parts[0], repo: parts[1] };
}
