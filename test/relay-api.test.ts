import { afterEach, describe, expect, it } from "vitest";
import handler, { checkAdmission, isValidWriteProof, parseRelayNumericLimit, verifyRelayWriteProof, writeProofCommitment } from "../api/relay";

const tag = "a".repeat(64);
const proof = "b".repeat(64);
const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

class MemoryProofStore {
  values = new Map<string, string>();

  async get<TData>(key: string): Promise<TData | null> {
    return (this.values.get(key) as TData | undefined) ?? null;
  }

  async setnx<TData>(key: string, value: TData): Promise<number> {
    if (this.values.has(key)) return 0;
    this.values.set(key, String(value));
    return 1;
  }
}

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
  it("falls back from malformed relay runtime limits", () => {
    expect(parseRelayNumericLimit(undefined, 500)).toBe(500);
    expect(parseRelayNumericLimit("not-a-number", 500)).toBe(500);
    expect(parseRelayNumericLimit("0", 500)).toBe(500);
    expect(parseRelayNumericLimit("-1", 500)).toBe(500);
    expect(parseRelayNumericLimit("42.9", 500)).toBe(42);
  });

  it("rejects malformed relay requests before touching storage", async () => {
    const response = await handler(new Request("https://relay.test/api/relay?tag=bad", { method: "GET" }));

    expect(response.status).toBe(400);
    await expect(body(response)).resolves.toEqual({ error: "invalid tag" });
  });

  it.each(["{secret-source-payload", "null", "[]", '"string-body"'])("rejects non-object or malformed JSON with a safe 400: %s", async (payload) => {
    const response = await handler(new Request("https://relay.test/api/relay", { method: "POST", body: payload }));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: "invalid request body" });
  });

  it("enforces the blob limit in UTF-8 bytes before touching storage", async () => {
    const response = await handler(new Request("https://relay.test/api/relay", { method: "POST",
      body: JSON.stringify({ tag, author: "device-a", blob: "\u00e9".repeat(65537), writeProof: proof }) }));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: "invalid blob" });
  });

  it("redacts invalid provider endpoint details from storage failures", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "invalid-provider-endpoint-sensitive";
    process.env.UPSTASH_REDIS_REST_TOKEN = "fixture-sensitive-token";
    const response = await handler(new Request(`https://relay.test/api/relay?tag=${tag}`));
    expect(response.status).toBe(503);
    expect(await body(response)).toEqual({ error: "relay storage unavailable" });
  });

  it("reports missing storage configuration for otherwise valid writes", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const response = await handler(
      new Request("https://relay.test/api/relay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tag, author: "d_test", blob: "ciphertext", writeProof: proof }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(body(response)).resolves.toEqual({ error: "relay storage is not configured" });
  });

  it("rejects malformed write proofs before touching storage", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const response = await handler(
      new Request("https://relay.test/api/relay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tag, author: "d_test", blob: "ciphertext", writeProof: "proof" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(body(response)).resolves.toEqual({ error: "invalid proof" });
  });

  it("stores only a proof commitment and rejects mismatched later proofs", async () => {
    const store = new MemoryProofStore();
    const otherProof = "c".repeat(64);

    expect(isValidWriteProof(proof)).toBe(true);
    expect(isValidWriteProof("proof")).toBe(false);
    await expect(writeProofCommitment(proof)).resolves.not.toBe(proof);
    await expect(verifyRelayWriteProof(store, tag, proof)).resolves.toBe(true);
    await expect(verifyRelayWriteProof(store, tag, proof)).resolves.toBe(true);
    await expect(verifyRelayWriteProof(store, tag, otherProof)).resolves.toBe(false);
  });

  it("keeps unsupported methods explicit", async () => {
    const response = await handler(new Request(`https://relay.test/api/relay?tag=${tag}`, { method: "PUT" }));

    expect(response.status).toBe(405);
    await expect(body(response)).resolves.toEqual({ error: "method not allowed" });
  });

  it("checkAdmission returns null (admit) when the budget allows the write", async () => {
    const store: import("../server/relay-admission").AdmissionStore = {
      async reserveSetSlot() { return "added"; },
      async releaseSetSlot() {},
      async incrby() { return 1; },
      async decrby() {},
    };
    await expect(checkAdmission(store, tag, "device-a", 100)).resolves.toBeNull();
  });

  it("checkAdmission returns a 429 with a Retry-After header when the budget is exceeded, and does not throw", async () => {
    const store: import("../server/relay-admission").AdmissionStore = {
      async reserveSetSlot() { return "rejected"; },
      async releaseSetSlot() {},
      async incrby() { return 1; },
      async decrby() {},
    };
    const response = await checkAdmission(store, tag, "device-a", 100);
    expect(response).not.toBeNull();
    expect(response!.status).toBe(429);
    expect(response!.headers.get("retry-after")).toBe("60");
    await expect(body(response!)).resolves.toEqual({ error: "relay resource budget exceeded" });
  });
});
