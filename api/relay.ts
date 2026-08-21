import { Redis } from "@upstash/redis";

export const config = { runtime: "edge" };

const TAG_RE = /^[0-9a-f]{64}$/;
const MAX_BLOB = Number(process.env.RELAY_MAX_BLOB_BYTES ?? 131_072);
const MAX_LIMIT = Number(process.env.RELAY_MAX_FETCH_LIMIT ?? 500);

const streamKey = (tag: string): string => `ts:${tag}`;

function redis(): Redis {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error("relay storage is not configured");
  }
  return Redis.fromEnv();
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const bad = (message: string, status = 400): Response => json({ error: message }, status);

function parseLimit(value: string | null): number {
  const parsed = Number(value ?? 100);
  if (!Number.isFinite(parsed) || parsed < 1) return 100;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

export default async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);

    if (req.method === "POST") {
      const body = (await req.json()) as { tag?: string; blob?: string; author?: string; writeProof?: string };
      const tag = body.tag ?? "";
      if (!TAG_RE.test(tag)) return bad("invalid tag");
      if (typeof body.blob !== "string" || body.blob.length === 0 || body.blob.length > MAX_BLOB) return bad("invalid blob");
      if (typeof body.author !== "string" || body.author.length === 0 || body.author.length > 128) return bad("invalid author");
      if (typeof body.writeProof !== "string" || body.writeProof.length === 0 || body.writeProof.length > 256) return bad("invalid proof");

      const cursor = await redis().xadd(streamKey(tag), "*", {
        blob: body.blob,
        author: body.author,
        proofPrefix: body.writeProof.slice(0, 16),
      });
      return json({ cursor });
    }

    if (req.method === "GET") {
      const tag = url.searchParams.get("tag") ?? "";
      if (!TAG_RE.test(tag)) return bad("invalid tag");

      const cursor = url.searchParams.get("cursor");
      const author = url.searchParams.get("author");
      const rows = await redis().xrange<{ blob?: string; author?: string }>(
        streamKey(tag),
        cursor ? `(${cursor}` : "-",
        "+",
        parseLimit(url.searchParams.get("limit")),
      );
      let entries = Object.entries(rows).flatMap(([entryCursor, fields]) =>
        typeof fields.blob === "string" && typeof fields.author === "string"
          ? [{ cursor: entryCursor, blob: fields.blob, author: fields.author }]
          : [],
      );
      if (author) entries = entries.filter((entry) => entry.author === author);
      return json({ entries });
    }

    return bad("method not allowed", 405);
  } catch (error) {
    return bad(error instanceof Error ? error.message : String(error), 503);
  }
}
