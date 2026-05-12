import { NextResponse } from "next/server";
import { fetchPluginDetail } from "@/lib/brain";

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const detail = await fetchPluginDetail(params.slug);
    return NextResponse.json(detail);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
