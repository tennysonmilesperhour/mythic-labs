import { createHash } from "node:crypto";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { Conflict, Invalid, NotFound } from "./projects";
import { StoreNotConfigured, withRequestOperation } from "./store";

export class Unauthorized extends Error {}
export class BadRequest extends Error {}
const payloadHashes = new WeakMap<Request, string>();

/** Wrap a route body: JSON out, typed errors → 4xx, anything else → 500. */
export async function handle(fn: () => Promise<unknown>, req?: Request) {
  try {
    const out = req ? await withRequestWrite(req, fn) : await fn();
    if (out instanceof Response) return out;
    return NextResponse.json(out);
  } catch (err: unknown) {
    const status =
      err instanceof NotFound ? 404 :
      err instanceof Conflict ? 409 :
      err instanceof Unauthorized ? 401 :
      err instanceof BadRequest || err instanceof Invalid ? 400 :
      err instanceof StoreNotConfigured ? 503 :
      (err as { status?: number }).status === 409 ? 409 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  let raw = "";
  try {
    raw = await req.clone().text();
    payloadHashes.set(req, createHash("sha256").update(raw).digest("hex"));
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    payloadHashes.set(req, createHash("sha256").update(raw).digest("hex"));
    return {};
  }
}

/**
 * Agent API auth: `Authorization: Bearer $PM_AGENT_TOKEN`. The agent API is
 * off until PM_AGENT_TOKEN is set.
 */
export function requireAgent(req: Request): void {
  if (process.env.PM_AGENT_API_ENABLED !== "true") {
    throw new Unauthorized("Agent API is disabled; enable only after reviewing shared-token access and agent identity limits.");
  }
  const expected = process.env.PM_AGENT_TOKEN;
  if (!expected) throw new Unauthorized("Agent API disabled: set PM_AGENT_TOKEN on the dashboard.");
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Unauthorized("Bad or missing agent token.");
}

/** Persist an operation receipt atomically with dashboard changes when a key is supplied. */
export function withRequestWrite<T>(req: Request, fn: () => Promise<T> | T): Promise<T> {
  const id = req.headers.get("idempotency-key")?.trim();
  if (!id) return Promise.resolve(fn());
  const bodyHash = payloadHashes.get(req) || (req.bodyUsed ? null : createHash("sha256").update("").digest("hex"));
  if (!bodyHash) throw new BadRequest("Read mutation bodies with body(req) before applying idempotency.");
  const url = new URL(req.url);
  const payloadHash = createHash("sha256").update(`${req.method.toUpperCase()}\n${url.pathname}${url.search}\n${bodyHash}`).digest("hex");
  return withRequestOperation(id, payloadHash, fn);
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
