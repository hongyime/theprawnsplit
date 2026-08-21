import type { Event, Financials, HLC, VerificationContext } from "../src/types";

let seq = 0;

export function resetIds(): void {
  seq = 0;
}

export function hlc(wall: number, ctr = 0, dev = "dev-a"): HLC {
  return { wall, ctr, dev };
}

export function base(t: Event["t"], partial: Omit<Event, "t" | "v" | "id" | "hlc" | "dev"> & Partial<Pick<Event, "id" | "hlc" | "dev" | "v">>): Event {
  seq += 1;
  return {
    v: partial.v ?? 1,
    id: partial.id ?? `dev-a:${seq}`,
    hlc: partial.hlc ?? hlc(seq),
    dev: partial.dev ?? "dev-a",
    t,
    ...partial,
  } as Event;
}

export function financials(total: bigint, payers: [string, bigint][], shares: [string, bigint][]): Financials {
  return {
    minor: total,
    payers: payers.map(([pid, minor]) => ({ pid, minor })),
    shares: shares.map(([pid, minor]) => ({ pid, minor })),
  };
}

export const groupTag = "a".repeat(64);

export function sig(publicKey: string, payload: string): string {
  return `sig:${publicKey}:${payload}`;
}

export const verifier: VerificationContext = {
  groupTag,
  verifySignature(input) {
    return input.signature === sig(input.publicKey, input.payload);
  },
};

export function claim(pid: string, deviceId: string, publicKey: string, overrides: Partial<Event> = {}): Event {
  const payload = `${groupTag}:${pid}:${deviceId}:${publicKey}`;
  return base("ParticipantClaimed", {
    pid,
    deviceId,
    claimPk: publicKey,
    alg: "ed25519",
    sig: sig(publicKey, payload),
    ...overrides,
  } as never);
}

export function link(pid: string, parentKey: string, newDevice: string, newKey: string, nonce = "nonce"): Event {
  const payload = `${groupTag}:link:${pid}:${newDevice}:${newKey}:${nonce}`;
  return base("DeviceLinked", {
    pid,
    parentDevice: "parent",
    newDevice,
    newClaimPk: newKey,
    alg: "ed25519",
    nonce,
    sig: sig(parentKey, payload),
  } as never);
}

export function confirm(sid: string, key: string): Event {
  return base("SettlementConfirmed", {
    sid,
    pid: "unused",
    claimSig: sig(key, `${groupTag}:confirm:${sid}`),
  } as never);
}
