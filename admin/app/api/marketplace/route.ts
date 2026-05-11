import { NextResponse } from "next/server";
import { fetchMarketplace } from "@/lib/brain";

export async function GET() {
  try {
    const m = await fetchMarketplace();
    return NextResponse.json(m);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
