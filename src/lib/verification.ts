import type { Event, SignatureInput, VerificationContext } from "@theprawnsplit/core";
import { verifyClaim } from "@/crypto/claim";
import type { GroupRecord } from "@/db/repo";

function signatureCacheKey(input: SignatureInput): string {
  return `${input.alg}\0${input.publicKey}\0${input.payload}\0${input.signature}`;
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
    const key = publicKeys.get(request.publicKey);
    cache.set(signatureCacheKey(request), key ? await verifyClaim(key.jwk, request.alg, request.payload, request.signature) : false);
  }

  return {
    groupTag: group.tagHex,
    verifySignature(input) {
      return cache.get(signatureCacheKey(input)) ?? false;
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
