import type { StoredIdentity } from "@/db/repo";

export interface DeviceLinkRequest {
  type: "DeviceLinkRequest";
  version: 1;
  tagHex: string;
  pid: string;
  newDevice: string;
  newClaimPk: string;
  alg: "ed25519" | "ecdsa-p256";
  nonce: string;
  createdAt: number;
}

export function createDeviceLinkRequest(input: {
  tagHex: string;
  pid: string;
  deviceId: string;
  identity: Pick<StoredIdentity, "claimPk" | "alg">;
  nonce?: string;
  createdAt?: number;
}): DeviceLinkRequest {
  return {
    type: "DeviceLinkRequest",
    version: 1,
    tagHex: input.tagHex,
    pid: input.pid,
    newDevice: input.deviceId,
    newClaimPk: input.identity.claimPk,
    alg: input.identity.alg,
    nonce: input.nonce ?? crypto.randomUUID().replaceAll("-", ""),
    createdAt: input.createdAt ?? Date.now(),
  };
}

export function linkPayload(request: Pick<DeviceLinkRequest, "tagHex" | "pid" | "newDevice" | "newClaimPk" | "nonce">): string {
  return `${request.tagHex}:link:${request.pid}:${request.newDevice}:${request.newClaimPk}:${request.nonce}`;
}

export function parseDeviceLinkRequest(text: string): DeviceLinkRequest {
  const parsed = JSON.parse(text) as Partial<DeviceLinkRequest>;
  if (
    parsed.type !== "DeviceLinkRequest" ||
    parsed.version !== 1 ||
    !parsed.tagHex ||
    !parsed.pid ||
    !parsed.newDevice ||
    !parsed.newClaimPk ||
    !parsed.alg ||
    !parsed.nonce
  ) {
    throw new Error("Unsupported device link request");
  }
  if (parsed.alg !== "ed25519" && parsed.alg !== "ecdsa-p256") throw new Error("Unsupported device link algorithm");
  return {
    type: "DeviceLinkRequest",
    version: 1,
    tagHex: parsed.tagHex,
    pid: parsed.pid,
    newDevice: parsed.newDevice,
    newClaimPk: parsed.newClaimPk,
    alg: parsed.alg,
    nonce: parsed.nonce,
    createdAt: parsed.createdAt ?? Date.now(),
  };
}
