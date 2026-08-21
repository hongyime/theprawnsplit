import type { Event, HLC } from "./types";

export type Admission = { ok: true } | { ok: false; reason: "future"; retryAt: number };

export function receive(local: HLC, remote: HLC, now: number): HLC {
  const wall = Math.max(now, local.wall, remote.wall);
  let ctr = 0;
  if (wall === local.wall && wall === remote.wall) ctr = Math.max(local.ctr, remote.ctr) + 1;
  else if (wall === local.wall) ctr = local.ctr + 1;
  else if (wall === remote.wall) ctr = remote.ctr + 1;
  return { wall, ctr, dev: local.dev };
}

export function admissionGate(e: Event, now: number, maxDriftMs: number): Admission {
  if (e.hlc.wall > now + maxDriftMs) return { ok: false, reason: "future", retryAt: e.hlc.wall - maxDriftMs };
  return { ok: true };
}
