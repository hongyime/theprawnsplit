import { afterEach, describe, expect, it } from "vitest";
import handler from "../api/relay";

const tag = "a".repeat(64);
const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

afterEach(() => {
  if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
  if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
});

async function body(response: Response): Promise<{ error?: string }> {
  return (await response.json()) as { error?: string };
}

describe("operated relay API", () => {
  it("rejects malformed relay requests before touching storage", async () => {
    const response = await handler(new Request("https://relay.test/api/relay?tag=bad", { method: "GET" }));

    expect(response.status).toBe(400);
    await expect(body(response)).resolves.toEqual({ error: "invalid tag" });
  });

  it("reports missing storage configuration for otherwise valid writes", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const response = await handler(
      new Request("https://relay.test/api/relay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tag, author: "d_test", blob: "ciphertext", writeProof: "proof" }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(body(response)).resolves.toEqual({ error: "relay storage is not configured" });
  });

  it("keeps unsupported methods explicit", async () => {
    const response = await handler(new Request(`https://relay.test/api/relay?tag=${tag}`, { method: "PUT" }));

    expect(response.status).toBe(405);
    await expect(body(response)).resolves.toEqual({ error: "method not allowed" });
  });
});
