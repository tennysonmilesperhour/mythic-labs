import { NextResponse } from "next/server";
import { NotFound } from "./projects";

/** Wrap a route body: JSON out, NotFound → 404, anything else → 500. */
export async function handle(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json(await fn());
  } catch (err: unknown) {
    const status = err instanceof NotFound ? 404 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}
