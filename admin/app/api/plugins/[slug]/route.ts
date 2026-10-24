import { NextResponse } from "next/server";
import { fetchPluginDetail } from "@/lib/brain";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const resolvedParams = await params;
    const detail = await fetchPluginDetail(resolvedParams.slug);
    return NextResponse.json(detail);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
