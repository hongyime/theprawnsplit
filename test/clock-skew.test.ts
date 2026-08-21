import { describe, expect, it } from "vitest";
import { peerClockSkewWarning } from "@/lib/clock-skew";
import { defaultParticipant, type EventFactory } from "@/lib/events";

function event(dev: string, counter: number, wall: number) {
  const factory: EventFactory = { deviceId: dev, nextCounter: counter };
  const created = defaultParticipant(factory, `${dev}-${counter}`);
  return { ...created, hlc: { ...created.hlc, wall } };
}

describe("ambient clock skew warning", () => {
  it("does not warn without peer events or when local time is near peer median", () => {
    expect(peerClockSkewWarning({ events: [event("local", 1, 1000)], localDeviceId: "local", now: 1_000_000 })).toBeUndefined();
    expect(
      peerClockSkewWarning({
        events: [event("peer-a", 1, 1_000_000), event("peer-b", 1, 1_000_500), event("local", 1, 5_000_000)],
        localDeviceId: "local",
        now: 1_001_000,
      }),
    ).toBeUndefined();
  });

  it("warns when local time differs from the median of the last 10 peer events by more than 10 minutes", () => {
    const events = Array.from({ length: 12 }, (_, index) => event(index % 2 === 0 ? "peer-a" : "peer-b", index + 1, 1_000_000 + index * 1000));
    const lastTenMedian = 1_006_500;

    expect(
      peerClockSkewWarning({
        events,
        localDeviceId: "local",
        now: lastTenMedian + 10 * 60 * 1000,
      }),
    ).toBeUndefined();
    expect(
      peerClockSkewWarning({
        events,
        localDeviceId: "local",
        now: lastTenMedian + 10 * 60 * 1000 + 1,
      }),
    ).toBe("Your device clock appears inaccurate; expense ordering may look wrong.");
  });

  it("uses only peer events and does not mutate event HLC values", () => {
    const peer = event("peer", 1, 2_000_000);
    const local = event("local", 1, 200_000_000);
    const before = peer.hlc.wall;

    expect(peerClockSkewWarning({ events: [peer, local], localDeviceId: "local", now: 200_000_000 })).toBe(
      "Your device clock appears inaccurate; expense ordering may look wrong.",
    );
    expect(peer.hlc.wall).toBe(before);
  });
});
