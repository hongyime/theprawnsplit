import type { Event, SignatureInput, VerificationContext } from "@theprawnsplit/core";
import * as claimModule from "@/crypto/claim";
import type { GroupRecord } from "@/db/repo";

// PERF-002 (T56): module-level bounded LRU for immutable signature results.
// The key includes groupTag so reuse across different trips is impossible.
// are immutable per event, so cached `true`/`false` never goes stale —
// authority state (voids/revocations) is recomputed by the fold on every
// refresh, not stored here.
const SIGNATURE_CACHE_MAX = 10_000;
const signatureCache = new Map<string, boolean>();

function signatureCacheKey(groupTag: string, input: SignatureInput): string {
  return `${groupTag}\0${input.alg}\0${input.publicKey}\0${input.payload}\0${input.signature}`;
}

function cacheGet(key: string): boolean | undefined {
  if (!signatureCache.has(key)) return undefined;
  const value = signatureCache.get(key)!;
  // Refresh recency: delete + set moves to insertion-order tail.
  signatureCache.delete(key);
  signatureCache.set(key, value);
  return value;
}

function cacheSet(key: string, value: boolean): void {
  if (signatureCache.has(key)) signatureCache.delete(key);
  signatureCache.set(key, value);
  while (signatureCache.size > SIGNATURE_CACHE_MAX) {
    const oldest = signatureCache.keys().next().value;
    if (oldest === undefined) break;
    signatureCache.delete(oldest);
  }
}

// Test seam for deterministic per-test isolation. Not exported to production.
export function resetSignatureCache(): void {
  signatureCache.clear();
}

function publicJwkFromClaimPk(claimPk: string): JsonWebKey | undefined {
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(claimPk), (char) => char.charCodeAt(0)))) as JsonWebKey;
  } catch {
    return undefined;
  }
}

export async function buildVerificationContext(group: Pick<GroupRecord, "events" | "tagHex">): Promise<VerificationContext> {
  const publicKeys = new Map<string, { alg: "ed25519" | "ecdsa-p256"; jwk: JsonWebKey }>();
  const requests: SignatureInput[] = [];

  for (const event of group.events) {
    if (event.t === "ParticipantClaimed") {
      const jwk = publicJwkFromClaimPk(event.claimPk);
      if (jwk) publicKeys.set(event.claimPk, { alg: event.alg, jwk });
    }
    if (event.t === "DeviceLinked") {
      const jwk = publicJwkFromClaimPk(event.newClaimPk);
      if (jwk) publicKeys.set(event.newClaimPk, { alg: event.alg, jwk });
    }
    if (event.t === "ClaimReattested") {
      const jwk = publicJwkFromClaimPk(event.newClaimPk);
      if (jwk) publicKeys.set(event.newClaimPk, { alg: event.alg, jwk });
    }
  }

  for (const event of group.events) {
    addEventSignatureRequests(group.tagHex, event, publicKeys, requests);
  }

  const cache = new Map<string, boolean>();
  for (const request of requests) {
    const cacheKey = signatureCacheKey(group.tagHex, request);
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) {
      cache.set(cacheKey, cached);
      continue;
    }
    const key = publicKeys.get(request.publicKey);
    const result = key ? await claimModule.verifyClaim(key.jwk, request.alg, request.payload, request.signature) : false;
    cache.set(cacheKey, result);
    cacheSet(cacheKey, result);
  }

  return {
    groupTag: group.tagHex,
    verifySignature(input) {
      return cache.get(signatureCacheKey(group.tagHex, input)) ?? false;
    },
  };
}

function addEventSignatureRequests(
  groupTag: string,
  event: Event,
  publicKeys: Map<string, { alg: "ed25519" | "ecdsa-p256"; jwk: JsonWebKey }>,
  requests: SignatureInput[],
): void {
  if (event.t === "ParticipantClaimed") {
    requests.push({
      alg: event.alg,
      publicKey: event.claimPk,
      payload: `${groupTag}:${event.pid}:${event.deviceId}:${event.claimPk}`,
      signature: event.sig,
    });
  }
  if (event.t === "DeviceLinked") {
    for (const [publicKey, key] of publicKeys) {
      requests.push({
        alg: key.alg,
        publicKey,
        payload: `${groupTag}:link:${event.pid}:${event.newDevice}:${event.newClaimPk}:${event.nonce}`,
        signature: event.sig,
      });
    }
  }
  if (event.t === "ClaimReattested") {
    for (const [publicKey, key] of publicKeys) {
      requests.push({
        alg: key.alg,
        publicKey,
        payload: `${groupTag}:reattest:${event.pid}:${event.newDevice}:${event.newClaimPk}`,
        signature: event.sig,
      });
    }
  }
  if (event.t === "SettlementConfirmed") {
    for (const [publicKey, key] of publicKeys) {
      requests.push({
        alg: key.alg,
        publicKey,
        payload: `${groupTag}:confirm:${event.sid}`,
        signature: event.claimSig,
      });
    }
  }
}
