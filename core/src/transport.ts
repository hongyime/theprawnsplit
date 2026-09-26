import { admissionGate } from "./hlc";
import type { Event } from "./types";

export interface TransportAdmissionOptions {
  now: number;
  supportedVersion: number;
  maxFutureDriftMs: number;
  capUnknownAuthor: number;
  capKnownAuthor: number;
  capGroupTotal: number;
  bufferMaxEvents: number;
}

export interface BufferedEvent {
  event: Event;
  retryAt: number;
}

export interface DroppedEvent {
  event: Event;
  reason: "cap" | "buffer-cap" | "malformed";
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

// DATA-007: sorted, non-overlapping, inclusive [start, end] counter
// ranges -- the "bounded" exact-coverage representation. A gap-free run
// compresses to one interval; a hole (a skipped counter while later ones
// were genuinely admitted) shows up as a separate interval rather than
// being silently absorbed into a single running maximum. Lives in core
// (not the app-only db/repo.ts) because it is now part of the Event wire
// format (BaseEvent.coverage in ./types) -- both producer (app stamping)
// and consumer (app sync-coverage.ts) need the identical shape/merge
// semantics, and core is the single source of truth for wire types.
export type CoverageIntervals = [number, number][];

// Inserts a single counter into a sorted, non-overlapping interval list,
// merging with an adjacent/overlapping interval where possible. Pure and
// side-effect-free; returns a NEW array (never mutates the input).
export function mergeCoverageCounter(existing: CoverageIntervals, counter: number): CoverageIntervals {
  const next: CoverageIntervals = [];
  let inserted = false;
  for (const [start, end] of existing) {
    if (inserted || counter < start - 1) {
      next.push([start, end]);
      continue;
    }
    if (counter > end + 1) {
      next.push([start, end]);
      continue;
    }
    // counter is adjacent to or inside [start, end] -- merge, possibly
    // extending into a NEXT interval too if this counter bridges them.
    const mergedStart = Math.min(start, counter);
    const mergedEnd = Math.max(end, counter);
    next.push([mergedStart, mergedEnd]);
    inserted = true;
  }
  if (!inserted) next.push([counter, counter]);
  // A single bridging insertion can make two previously-separate
  // intervals adjacent/overlapping (e.g. [1,2] and [4,5], insert 3) --
  // coalesce the whole list once more to restore the non-overlapping
  // invariant.
  next.sort((a, b) => a[0] - b[0]);
  const coalesced: CoverageIntervals = [];
  for (const [start, end] of next) {
    const last = coalesced[coalesced.length - 1];
    if (last && start <= last[1] + 1) {
      last[1] = Math.max(last[1], end);
    } else {
      coalesced.push([start, end]);
    }
  }
  return coalesced;
}

function knownAuthors(events: Event[]): Set<string> {
  const known = new Set<string>();
  for (const event of events) {
    if (event.t === "ParticipantAdded" || event.t === "ParticipantClaimed") known.add(event.dev);
  }
  return known;
}
function hasFiniteHlc(event: Event): boolean {
  // CR-011 convergence decision: events whose HLC numbers are not finite are
  // rejected at admission. A non-finite wall makes `a.wall - b.wall` NaN, which
  // is falsy, so the comparator would silently fall through to ctr/dev and the
  // resulting order is intransitive between malformed and well-formed events —
  // sort() output would then depend on input permutation (divergence).
  return Number.isFinite(event.hlc.wall) && Number.isFinite(event.hlc.ctr);
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
  // DATA-004: a brand-new author's first-ever sync batch contains their own
  // ParticipantAdded/ParticipantClaimed marker PLUS many other events; if
  // "known" only ever looked at the pre-batch ledger (`current`), every one
  // of their events in THIS batch — including ones before their marker in
  // array order — would be judged under the low capUnknownAuthor instead of
  // capKnownAuthor, even though the batch itself proves who they are.
  // Scanning `incoming` too (order-independent: known is a set, not applied
  // positionally) fixes that. Malformed-HLC events are excluded from this
  // scan (hasFiniteHlc filter) so a marker that will itself be dropped can
  // never be trusted to elevate its author's cap.
  const known = new Set([...knownAuthors(current), ...knownAuthors(incoming.filter(hasFiniteHlc))]);
  const counts = authorCounts(current);
  const admitted: Event[] = [];
  const buffered: BufferedEvent[] = [];
  const dropped: DroppedEvent[] = [];
  const discardVector = { ...currentDiscardVector };
  const transportVector: Record<string, number> = {};
  let groupCount = current.length;

  for (const event of incoming) {
    if (!hasFiniteHlc(event)) {
      dropped.push({ event, reason: "malformed" });
      bump(discardVector, event);
      continue;
    }
    bump(transportVector, event);
    const nextCount = (counts.get(event.dev) ?? 0) + 1;
    counts.set(event.dev, nextCount);
    const cap = known.has(event.dev) ? opts.capKnownAuthor : opts.capUnknownAuthor;
    if (nextCount > cap) {
      dropped.push({ event, reason: "cap" });
      bump(discardVector, event);
      continue;
    }
    if (groupCount >= opts.capGroupTotal) {
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
    groupCount += 1;
  }

  return { admitted, buffered, dropped, discardVector, transportVector };
}
