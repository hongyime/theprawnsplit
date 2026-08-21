import { eventSortKey, type Event } from "@theprawnsplit/core";

export const CLOCK_SKEW_WARNING_MS = 10 * 60 * 1000;

export function peerClockSkewWarning(input: {
  events: Event[];
  localDeviceId: string;
  now: number;
  thresholdMs?: number;
}): string | undefined {
  const thresholdMs = input.thresholdMs ?? CLOCK_SKEW_WARNING_MS;
  const peerWalls = input.events
    .filter((event) => event.dev !== input.localDeviceId)
    .sort(eventSortKey)
    .slice(-10)
    .map((event) => event.hlc.wall)
    .sort((a, b) => a - b);

  if (peerWalls.length === 0) return undefined;

  const middle = Math.floor(peerWalls.length / 2);
  const median = peerWalls.length % 2 === 1 ? peerWalls[middle]! : (peerWalls[middle - 1]! + peerWalls[middle]!) / 2;
  return Math.abs(input.now - median) > thresholdMs
    ? "Your device clock appears inaccurate; expense ordering may look wrong."
    : undefined;
}
