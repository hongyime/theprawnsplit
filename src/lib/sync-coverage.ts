import { eventSortKey, type Event } from "@theprawnsplit/core";

function eventCounter(event: Event): number {
  const idCounter = event.id.startsWith(`${event.dev}:`) ? Number(event.id.split(":")[1]) : Number.NaN;
  return Number.isFinite(idCounter) ? idCounter : event.hlc.ctr;
}

export function latestVersionVectorsByDevice(events: Event[]): Map<string, Record<string, number>> {
  const latest = new Map<string, Record<string, number>>();
  for (const event of [...events].sort(eventSortKey)) {
    latest.set(event.dev, event.vv ?? { [event.dev]: eventCounter(event) });
  }
  return latest;
}

export function isEventCoveredByEveryKnownDevice(events: Event[], target: Event): boolean {
  const targetCounter = eventCounter(target);
  const latestVectors = latestVersionVectorsByDevice(events);
  if (latestVectors.size === 0) return false;
  for (const vector of latestVectors.values()) {
    if ((vector[target.dev] ?? 0) < targetCounter) return false;
  }
  return true;
}
