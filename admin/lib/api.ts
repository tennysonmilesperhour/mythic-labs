import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { Conflict, NotFound } from "./projects";

export class Unauthorized extends Error {}
export class BadRequest extends Error {}

/** Wrap a route body: JSON out, typed errors → 4xx, anything else → 500. */
export async function handle(fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    if (out instanceof Response) return out;
    return NextResponse.json(out);
  } catch (err: unknown) {
    const status =
      err instanceof NotFound ? 404 :
      err instanceof Conflict ? 409 :
      err instanceof Unauthorized ? 401 :
      err instanceof BadRequest ? 400 : 500;
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

/**
 * Agent API auth: `Authorization: Bearer $PM_AGENT_TOKEN`. The agent API is
 * off until PM_AGENT_TOKEN is set.
 */
export function requireAgent(req: Request): void {
  const expected = process.env.PM_AGENT_TOKEN;
  if (!expected) throw new Unauthorized("Agent API disabled: set PM_AGENT_TOKEN on the dashboard.");
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Unauthorized("Bad or missing agent token.");
}

/** The calling agent's name, from ?agent= or the X-Agent header. */
export function agentName(req: Request, b?: Record<string, unknown>): string {
  const name =
    (typeof b?.agent === "string" && b.agent) ||
    new URL(req.url).searchParams.get("agent") ||
    req.headers.get("x-agent") ||
    "";
  if (!/^[\w.-]{1,64}$/.test(name)) throw new BadRequest("Name the agent: ?agent=<name> or X-Agent header.");
  return name;
}

export function markdown(text: string) {
  return new Response(text, { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
