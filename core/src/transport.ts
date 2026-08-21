import { admissionGate } from "./hlc";
import type { Event } from "./types";

export interface TransportAdmissionOptions {
  now: number;
  supportedVersion: number;
  maxFutureDriftMs: number;
  capUnknownAuthor: number;
  capKnownAuthor: number;
  bufferMaxEvents: number;
}

export interface BufferedEvent {
  event: Event;
  retryAt: number;
}

export interface DroppedEvent {
  event: Event;
  reason: "cap" | "buffer-cap";
}

export interface TransportAdmissionResult {
  admitted: Event[];
  buffered: BufferedEvent[];
  dropped: DroppedEvent[];
  discardVector: Record<string, number>;
  transportVector: Record<string, number>;
}

export function eventCounter(event: Event): number {
  const parsed = event.id.startsWith(`${event.dev}:`) ? Number(event.id.split(":")[1]) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : event.hlc.ctr;
}

function knownAuthors(events: Event[]): Set<string> {
  const known = new Set<string>();
  for (const event of events) {
    if (event.t === "ParticipantAdded" || event.t === "ParticipantClaimed") known.add(event.dev);
  }
  return known;
}

function authorCounts(events: Event[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) counts.set(event.dev, (counts.get(event.dev) ?? 0) + 1);
  return counts;
}

function bump(vector: Record<string, number>, event: Event): void {
  vector[event.dev] = Math.max(vector[event.dev] ?? 0, eventCounter(event));
}

export function admitTransportEvents(
  incoming: Event[],
  current: Event[],
  currentDiscardVector: Record<string, number>,
  opts: TransportAdmissionOptions,
): TransportAdmissionResult {
  const known = knownAuthors(current);
  const counts = authorCounts(current);
  const admitted: Event[] = [];
  const buffered: BufferedEvent[] = [];
  const dropped: DroppedEvent[] = [];
  const discardVector = { ...currentDiscardVector };
  const transportVector: Record<string, number> = {};

  for (const event of incoming) {
    bump(transportVector, event);
    const nextCount = (counts.get(event.dev) ?? 0) + 1;
    counts.set(event.dev, nextCount);
    const cap = known.has(event.dev) ? opts.capKnownAuthor : opts.capUnknownAuthor;
    if (nextCount > cap) {
      dropped.push({ event, reason: "cap" });
      bump(discardVector, event);
      continue;
    }

    const gate = admissionGate(event, opts.now, opts.maxFutureDriftMs);
    if (!gate.ok) {
      if (buffered.length >= opts.bufferMaxEvents) {
        dropped.push({ event, reason: "buffer-cap" });
        bump(discardVector, event);
      } else {
        buffered.push({ event, retryAt: gate.retryAt });
      }
      continue;
    }

    admitted.push(event);
  }

  return { admitted, buffered, dropped, discardVector, transportVector };
}
