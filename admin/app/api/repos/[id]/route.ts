import { NextResponse } from "next/server";
import { deleteRepo, listRepoPlugins, setRepoPlugin } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const plugins = await listRepoPlugins(params.id);
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
  { params }: { params: { id: string } }
) {
  try {
    const body = (await req.json()) as { slug: string; enabled: boolean };
    if (!body.slug) {
      return NextResponse.json(
        { error: "slug required" },
        { status: 400 }
      );
    }
    await setRepoPlugin(params.id, body.slug, body.enabled);
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
  { params }: { params: { id: string } }
) {
  try {
    await deleteRepo(params.id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
