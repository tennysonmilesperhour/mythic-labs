import { NextResponse } from "next/server";
import { deleteRepo, listRepoPlugins, setRepoPlugin } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const plugins = await listRepoPlugins(resolvedParams.id);
    return NextResponse.json({ plugins });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const body = (await req.json()) as { slug: string; enabled: boolean };
    if (!body.slug) {
      return NextResponse.json(
        { error: "slug required" },
        { status: 400 }
      );
    }
    await setRepoPlugin(resolvedParams.id, body.slug, body.enabled);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    await deleteRepo(resolvedParams.id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
