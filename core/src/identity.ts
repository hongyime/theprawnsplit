import type { Anomaly, Event, VerificationContext } from "./types";
import { eventSortKey } from "./types";

class DSU {
  private parent = new Map<string, string>();

  add(x: string): void {
    if (!this.parent.has(x)) this.parent.set(x, x);
  }

  find(x: string): string {
    this.add(x);
    const parent = this.parent.get(x)!;
    if (parent === x) return x;
    const root = this.find(parent);
    this.parent.set(x, root);
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    const root = ra < rb ? ra : rb;
    const child = root === ra ? rb : ra;
    this.parent.set(child, root);
  }

  roots(): Map<string, string> {
    const out = new Map<string, string>();
    for (const pid of [...this.parent.keys()].sort()) out.set(pid, this.find(pid));
    return out;
  }
}

export function voidedEventIds(events: Event[]): Set<string> {
  const eventTypes = new Map(events.map((event) => [event.id, event.t]));
  const voided = new Set<string>();
  for (const event of events) {
    if (event.t !== "EventVoided") continue;
    if (eventTypes.get(event.targetId) === "EventVoided") continue;
    voided.add(event.targetId);
  }
  return voided;
}

export function buildDSU(events: Event[]): Map<string, string> {
  const dsu = new DSU();
  const voided = voidedEventIds(events);
  for (const event of [...events].sort(eventSortKey)) {
    if ("pid" in event) dsu.add(event.pid);
    if (event.t === "ParticipantMerged" && !voided.has(event.id)) dsu.union(event.from, event.into);
  }
  return dsu.roots();
}

const verifiesWithAny = (
  ctx: VerificationContext,
  payload: string,
  signature: string,
  keys: { publicKey: string; alg: "ed25519" | "ecdsa-p256" }[],
): boolean => keys.some((key) => ctx.verifySignature({ payload, signature, publicKey: key.publicKey, alg: key.alg }));

export function authorisedKeys(events: Event[], pid: string, ctx: VerificationContext): Set<string> {
  const voided = voidedEventIds(events);
  const ordered = [...events].filter((event) => !voided.has(event.id)).sort(eventSortKey);
  const keys = new Map<string, "ed25519" | "ecdsa-p256">();

  const genesis = firstValidClaim(ordered, pid, ctx);
  if (genesis) keys.set(genesis.claimPk, genesis.alg);

  let changed = true;
  while (changed) {
    changed = false;
    const current = [...keys.entries()].map(([publicKey, alg]) => ({ publicKey, alg }));
    for (const event of ordered) {
      if (event.t === "DeviceLinked" && event.pid === pid && !keys.has(event.newClaimPk)) {
        const payload = `${ctx.groupTag}:link:${event.pid}:${event.newDevice}:${event.newClaimPk}:${event.nonce}`;
        if (verifiesWithAny(ctx, payload, event.sig, current)) {
          keys.set(event.newClaimPk, event.alg);
          changed = true;
        }
      }
    }
  }

  const claimedPeers = [...new Set(ordered.flatMap((event) => (event.t === "ParticipantClaimed" ? [event.pid] : [])))]
    .filter((peerPid) => peerPid !== pid && authorisedKeysWithoutReattestation(ordered, peerPid, ctx).size > 0)
    .sort();
  const threshold = Math.max(1, Math.floor((claimedPeers.length - 1) / 2) + 1);
  const reattestedTargets = new Map<string, { key: string; alg: "ed25519" | "ecdsa-p256"; attestors: Set<string> }>();

  for (const event of ordered) {
    if (event.t !== "ClaimReattested" || event.pid !== pid) continue;
    if (!claimedPeers.includes(event.attestor)) continue;
    const attestorKeys = [...authorisedKeysWithoutReattestation(ordered, event.attestor, ctx).entries()].map(
      ([publicKey, alg]) => ({ publicKey, alg }),
    );
    const payload = `${ctx.groupTag}:reattest:${event.pid}:${event.newDevice}:${event.newClaimPk}`;
    if (verifiesWithAny(ctx, payload, event.sig, attestorKeys)) {
      const targetKey = `${event.newDevice}\0${event.newClaimPk}`;
      const target = reattestedTargets.get(targetKey) ?? { key: event.newClaimPk, alg: event.alg, attestors: new Set<string>() };
      target.attestors.add(event.attestor);
      reattestedTargets.set(targetKey, target);
    }
  }

  for (const target of reattestedTargets.values()) {
    if (target.attestors.size >= threshold) keys.set(target.key, target.alg);
  }

  return new Set([...keys.keys()].sort());
}

export function authorisedDevices(events: Event[], pid: string, ctx: VerificationContext): Set<string> {
  const voided = voidedEventIds(events);
  const ordered = [...events].filter((event) => !voided.has(event.id)).sort(eventSortKey);
  const keys = authorisedKeys(ordered, pid, ctx);
  const devices = new Set<string>();

  for (const event of ordered) {
    if (event.t === "ParticipantClaimed" && event.pid === pid && keys.has(event.claimPk)) devices.add(event.deviceId);
    if (event.t === "DeviceLinked" && event.pid === pid && keys.has(event.newClaimPk)) devices.add(event.newDevice);
    if (event.t === "ClaimReattested" && event.pid === pid && keys.has(event.newClaimPk)) devices.add(event.newDevice);
  }

  return new Set([...devices].sort());
}

function authorisedKeysWithoutReattestation(
  events: Event[],
  pid: string,
  ctx: VerificationContext,
): Map<string, "ed25519" | "ecdsa-p256"> {
  const keys = new Map<string, "ed25519" | "ecdsa-p256">();
  const genesis = firstValidClaim(events, pid, ctx);
  if (genesis) keys.set(genesis.claimPk, genesis.alg);
  let changed = true;
  while (changed) {
    changed = false;
    const current = [...keys.entries()].map(([publicKey, alg]) => ({ publicKey, alg }));
    for (const event of events) {
      if (event.t !== "DeviceLinked" || event.pid !== pid || keys.has(event.newClaimPk)) continue;
      const payload = `${ctx.groupTag}:link:${event.pid}:${event.newDevice}:${event.newClaimPk}:${event.nonce}`;
      if (verifiesWithAny(ctx, payload, event.sig, current)) {
        keys.set(event.newClaimPk, event.alg);
        changed = true;
      }
    }
  }
  return keys;
}

export function verifyConfirmation(events: Event[], sid: string, claimSig: string, ctx: VerificationContext, claimedPid?: string): boolean {
  const settlement = events.find((event) => event.t === "SettlementRecorded" && event.sid === sid);
  if (!settlement || settlement.t !== "SettlementRecorded") return false;
  if (claimedPid !== undefined && claimedPid !== settlement.to) return false;
  if (contestedClaimPids(events, ctx).has(settlement.to)) return false;
  const keySet = authorisedKeys(events, settlement.to, ctx);
  const keyAlgs = keyAlgsFor(events, keySet);
  return verifiesWithAny(ctx, `${ctx.groupTag}:confirm:${sid}`, claimSig, keyAlgs);
}

export function matchesPayeeClaimSignature(events: Event[], sid: string, claimSig: string, ctx: VerificationContext, claimedPid?: string): boolean {
  const settlement = events.find((event) => event.t === "SettlementRecorded" && event.sid === sid);
  if (!settlement || settlement.t !== "SettlementRecorded") return false;
  if (claimedPid !== undefined && claimedPid !== settlement.to) return false;
  const voided = voidedEventIds(events);
  const keys = new Map<string, "ed25519" | "ecdsa-p256">();

  for (const event of events) {
    if (!voided.has(event.id) && event.t === "ParticipantClaimed" && event.pid === settlement.to && validSelfClaim(event, ctx)) {
      keys.set(event.claimPk, event.alg);
    }
  }
  for (const publicKey of authorisedKeys(events, settlement.to, ctx)) {
    const alg = findAlg(events, publicKey);
    if (alg) keys.set(publicKey, alg);
  }

  return verifiesWithAny(
    ctx,
    `${ctx.groupTag}:confirm:${sid}`,
    claimSig,
    [...keys.entries()].map(([publicKey, alg]) => ({ publicKey, alg })),
  );
}

export function claimAnomalies(events: Event[], ctx: VerificationContext): Anomaly[] {
  const voided = voidedEventIds(events);
  const ordered = [...events].filter((event) => !voided.has(event.id)).sort(eventSortKey);
  const validClaims = ordered.filter((event) => event.t === "ParticipantClaimed" && validSelfClaim(event, ctx));
  const anomalies: Anomaly[] = [];

  const claimsByPid = new Map<string, typeof validClaims>();
  const pidsByDevice = new Map<string, Set<string>>();
  for (const claim of validClaims) {
    claimsByPid.set(claim.pid, [...(claimsByPid.get(claim.pid) ?? []), claim]);
    if (!pidsByDevice.has(claim.deviceId)) pidsByDevice.set(claim.deviceId, new Set());
    pidsByDevice.get(claim.deviceId)!.add(claim.pid);
  }

  for (const [pid, claims] of claimsByPid) {
    const genesis = claims[0];
    if (!genesis) continue;
    const delegated = authorisedKeysWithoutReattestation(ordered, pid, ctx);
    const authorised = authorisedKeys(ordered, pid, ctx);
    for (const claim of claims.slice(1)) {
      if (!delegated.has(claim.claimPk) && !authorised.has(claim.claimPk)) {
        anomalies.push({
          code: "unverified-reclaim",
          pid,
          eventId: claim.id,
          relatedEventId: genesis.id,
          message: "Participant has an additional claim without DeviceLinked or peer re-attestation authority",
        });
      }
    }
  }

  for (const [deviceId, pids] of pidsByDevice) {
    if (pids.size <= 1) continue;
    for (const pid of [...pids].sort()) {
      const claim = validClaims.find((event) => event.pid === pid && event.deviceId === deviceId);
      if (!claim) continue;
      anomalies.push({
        code: "device-claims-multiple-participants",
        pid,
        eventId: claim.id,
        message: `Device ${deviceId} claims multiple participants`,
      });
    }
  }

  return anomalies.sort((a, b) =>
    a.code.localeCompare(b.code) ||
    (a.pid ?? "").localeCompare(b.pid ?? "") ||
    (a.eventId ?? "").localeCompare(b.eventId ?? "") ||
    (a.relatedEventId ?? "").localeCompare(b.relatedEventId ?? ""),
  );
}

export function contestedClaimPids(events: Event[], ctx: VerificationContext): Set<string> {
  return new Set(claimAnomalies(events, ctx).flatMap((anomaly) => (anomaly.pid ? [anomaly.pid] : [])));
}

function validSelfClaim(
  event: Event,
  ctx: VerificationContext,
): event is Extract<Event, { t: "ParticipantClaimed" }> {
  if (event.t !== "ParticipantClaimed") return false;
  const payload = `${ctx.groupTag}:${event.pid}:${event.deviceId}:${event.claimPk}`;
  return ctx.verifySignature({ payload, signature: event.sig, publicKey: event.claimPk, alg: event.alg });
}

function firstValidClaim(
  events: Event[],
  pid: string,
  ctx: VerificationContext,
): Extract<Event, { t: "ParticipantClaimed" }> | undefined {
  return [...events].sort(eventSortKey).find((event) => event.t === "ParticipantClaimed" && event.pid === pid && validSelfClaim(event, ctx)) as
    | Extract<Event, { t: "ParticipantClaimed" }>
    | undefined;
}

function findAlg(events: Event[], publicKey: string): "ed25519" | "ecdsa-p256" | undefined {
  for (const event of events) {
    if (event.t === "ParticipantClaimed" && event.claimPk === publicKey) return event.alg;
    if (event.t === "DeviceLinked" && event.newClaimPk === publicKey) return event.alg;
    if (event.t === "ClaimReattested" && event.newClaimPk === publicKey) return event.alg;
  }
  return undefined;
}

function keyAlgsFor(events: Event[], publicKeys: Set<string>): { publicKey: string; alg: "ed25519" | "ecdsa-p256" }[] {
  return [...publicKeys].flatMap((publicKey) => {
    const alg = findAlg(events, publicKey);
    return alg ? [{ publicKey, alg }] : [];
  });
}
