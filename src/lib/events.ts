import type { Event, Financials, HLC } from "@theprawnsplit/core";
import { newId, todayLocal } from "./ids";

export interface EventFactory {
  deviceId: string;
  nextCounter: number;
  // LOGIC-002: the persisted observed HLC (supplied by reserveEventIds),
  // read within the SAME atomic reservation that advances nextCounter.
  // New events built from this factory must never use a wall clock
  // earlier than this floor -- protects against this device's own clock
  // rolling backward, and ensures a causally-later local edit never sorts
  // before an already-observed remote root just because this device's
  // wall clock hasn't caught up to a faster peer's. Absent (undefined)
  // only for callers that never went through reserveEventIds.
  hlcFloor?: HLC;
}

export function makeHlc(deviceId: string, counter: number, floor?: HLC): HLC {
  const now = Date.now();
  if (!floor) return { wall: now, ctr: counter, dev: deviceId };
  const wall = Math.max(now, floor.wall);
  // A floor tie means real wall-clock time has not caught up to the last
  // observed HLC yet -- bump its OWN counter monotonically rather than
  // reusing the plain sequential id-counter, which could collide with an
  // already-observed ctr at the same wall value.
  const ctr = wall === floor.wall ? floor.ctr + 1 : counter;
  return { wall, ctr, dev: deviceId };
}

export function makeEvent<T extends Event["t"]>(
  factory: EventFactory,
  t: T,
  payload: Omit<Extract<Event, { t: T }>, "t" | "v" | "id" | "hlc" | "dev">,
  version = 1,
): Extract<Event, { t: T }> {
  const counter = factory.nextCounter;
  factory.nextCounter += 1;
  return {
    v: version,
    id: `${factory.deviceId}:${counter}`,
    hlc: makeHlc(factory.deviceId, counter, factory.hlcFloor),
    dev: factory.deviceId,
    t,
    ...payload,
  } as Extract<Event, { t: T }>;
}

export function makeExpenseFinancials(
  total: bigint,
  payers: string | { pid: string; minor: bigint }[],
  shares: { pid: string; minor: bigint }[],
): Financials {
  return {
    minor: total,
    payers: typeof payers === "string" ? [{ pid: payers, minor: total }] : payers,
    shares,
  };
}

export function defaultGroupCreated(factory: EventFactory, name: string, currency: string): Event {
  return makeEvent(factory, "GroupCreated", { name, currency });
}

export function defaultParticipant(factory: EventFactory, name: string): Event {
  return makeEvent(factory, "ParticipantAdded", { pid: newId("p"), name });
}

export function defaultExpenseDate(): { at: number; date: string } {
  return { at: Date.now(), date: todayLocal() };
}
