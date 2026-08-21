import type { Event, Financials, HLC } from "@theprawnsplit/core";
import { newId, todayLocal } from "./ids";

export interface EventFactory {
  deviceId: string;
  nextCounter: number;
}

export function makeHlc(deviceId: string, counter: number): HLC {
  return { wall: Date.now(), ctr: counter, dev: deviceId };
}

export function makeEvent<T extends Event["t"]>(
  factory: EventFactory,
  t: T,
  payload: Omit<Extract<Event, { t: T }>, "t" | "v" | "id" | "hlc" | "dev">,
): Extract<Event, { t: T }> {
  const counter = factory.nextCounter;
  factory.nextCounter += 1;
  return {
    v: 1,
    id: `${factory.deviceId}:${counter}`,
    hlc: makeHlc(factory.deviceId, counter),
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
