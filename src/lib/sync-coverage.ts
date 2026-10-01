import { eventCounter, eventSortKey, type CoverageIntervals, type Event } from "@theprawnsplit/core";

export function latestVersionVectorsByDevice(events: Event[]): Map<string, Record<string, number>> {
  const latest = new Map<string, Record<string, number>>();
  for (const event of [...events].sort(eventSortKey)) {
    latest.set(event.dev, event.vv ?? { [event.dev]: eventCounter(event) });
  }
  return latest;
}

// DATA-007: each device's LATEST-by-HLC event's own .coverage snapshot --
// its exact durable retention at the moment it last spoke -- distinct
// from the legacy .vv-based latestVersionVectorsByDevice above, which
// only proves transport OBSERVATION and can include counters that were
// later buffered/dropped/conflicted and never actually durably retained.
// A device whose latest event has no .coverage field at all (an old-
// format event, or an already-open old client bundle that never learned
// to stamp it) maps to undefined here -- never coerced into a false
// negative OR a false positive.
export function latestCoverageByDevice(events: Event[]): Map<string, Record<string, CoverageIntervals> | undefined> {
  const latest = new Map<string, Record<string, CoverageIntervals> | undefined>();
  for (const event of [...events].sort(eventSortKey)) {
    latest.set(event.dev, event.coverage);
  }
  return latest;
}

function isCounterWithinIntervals(intervals: CoverageIntervals | undefined, counter: number): boolean {
  if (!intervals) return false;
  return intervals.some(([start, end]) => counter >= start && counter <= end);
}

export type CoverageStatus = "covered" | "not-covered" | "unknown";

// DATA-007 T43: replaces the old boolean vv-only check with a tri-state
// result driven by each known device's own durable-coverage evidence.
// "not-covered" (a confirmed gap) always outranks "unknown" (no coverage
// evidence from that device at all, e.g. an old-format-only peer) --a
// definite negative is stronger signal than an absence of evidence.
// "covered" only when EVERY known device has confirmed, positive coverage
// evidence for the target -- exactly matching this finding's requirement
// to never claim "everyone has this" from vector-only legacy evidence.
export function isEventCoveredByEveryKnownDevice(events: Event[], target: Event): CoverageStatus {
  const targetCounter = eventCounter(target);
  const latestCoverage = latestCoverageByDevice(events);
  if (latestCoverage.size === 0) return "unknown";
  let anyUnknown = false;
  for (const coverage of latestCoverage.values()) {
    if (coverage === undefined) {
      anyUnknown = true;
      continue;
    }
    if (!isCounterWithinIntervals(coverage[target.dev], targetCounter)) return "not-covered";
  }
  return anyUnknown ? "unknown" : "covered";
}
