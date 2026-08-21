import type { StoredIdentity } from "@/db/repo";

const GROUP_TAG_RE = /^[0-9a-f]{64}$/;
const NONCE_RE = /^[0-9a-f]{32}$/;

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
  const nonce = input.nonce ?? crypto.randomUUID().replaceAll("-", "");
  assertDeviceLinkFields(input.tagHex, nonce);
  return {
    type: "DeviceLinkRequest",
    version: 1,
    tagHex: input.tagHex,
    pid: input.pid,
    newDevice: input.deviceId,
    newClaimPk: input.identity.claimPk,
    alg: input.identity.alg,
    nonce,
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
  assertDeviceLinkFields(parsed.tagHex, parsed.nonce);
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

function assertDeviceLinkFields(tagHex: string, nonce: string): void {
  if (!GROUP_TAG_RE.test(tagHex)) throw new Error("Device link tag must be lowercase 64-hex");
  if (!NONCE_RE.test(nonce)) throw new Error("Device link nonce must be lowercase 128-bit hex");
}
