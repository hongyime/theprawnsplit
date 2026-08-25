import { describe, expect, it } from "vitest";
import { BATCH_SAFETY_MARGIN_BYTES, fitCountWithinLimit, projectBatchSize, resolveMessageLimit } from "@/relay/batch-limits";

// Recorded CR-010 A13 measurements (2026-08-24, .agents/task0-retention.md):
// 50 ledger events encrypted to ONE message of 221,449 bytes; NIP-11
// limitation.max_message_length per default relay:
const MEASURED_LIMITS = {
  "wss://nos.lol": 131072,
  "wss://relay.primal.net": 1000000,
  "wss://nostr.mom": 131072,
  "wss://offchain.pub": 131072,
  "wss://relay.snort.social": 524288,
} as const;
const MEASURED_BATCH_BYTES = 221449;
const MEASURED_BATCH_COUNT = 50;

const sizeForMeasured = (count: number): number =>
  projectBatchSize(MEASURED_BATCH_BYTES, MEASURED_BATCH_COUNT, count);

describe("resolveMessageLimit", () => {
  it("takes the weakest relay's measured limit", () => {
    expect(resolveMessageLimit(Object.values(MEASURED_LIMITS), Number.POSITIVE_INFINITY)).toBe(131072);
  });

  it("ignores unknown limits while any limit is known", () => {
    expect(resolveMessageLimit([null, null, MEASURED_LIMITS["wss://relay.snort.social"]], 999999)).toBe(524288);
  });

  it("falls back when no relay reported a limit", () => {
    expect(resolveMessageLimit([null, null], 262144)).toBe(262144);
  });
});

describe("fitCountWithinLimit against recorded measurements", () => {
  const target = (limit: number) => limit - BATCH_SAFETY_MARGIN_BYTES;

  it("caps a 50-event batch below the 128 KiB relays", () => {
    const fitted = fitCountWithinLimit(MEASURED_BATCH_COUNT, sizeForMeasured, target(MEASURED_LIMITS["wss://nos.lol"]));
    expect(fitted).toBeLessThan(MEASURED_BATCH_COUNT);
    // The fitted batch must actually fit.
    expect(sizeForMeasured(fitted)).toBeLessThanOrEqual(target(MEASURED_LIMITS["wss://nos.lol"]));
    expect(sizeForMeasured(fitted + 1)).toBeGreaterThan(target(MEASURED_LIMITS["wss://nos.lol"]));
  });

  it("keeps all 50 events on the 1 MiB and 512 KiB relays", () => {
    expect(
      fitCountWithinLimit(MEASURED_BATCH_COUNT, sizeForMeasured, target(MEASURED_LIMITS["wss://relay.primal.net"])),
    ).toBe(50);
    expect(
      fitCountWithinLimit(MEASURED_BATCH_COUNT, sizeForMeasured, target(MEASURED_LIMITS["wss://relay.snort.social"])),
    ).toBe(50);
  });

  it("returns 0 when even one event cannot fit", () => {
    expect(fitCountWithinLimit(10, sizeForMeasured, BATCH_SAFETY_MARGIN_BYTES - 1)).toBe(0);
  });

  it("keeps the full batch when the projected size already fits", () => {
    expect(fitCountWithinLimit(MEASURED_BATCH_COUNT, sizeForMeasured, MEASURED_BATCH_BYTES)).toBe(MEASURED_BATCH_COUNT);
  });

  it("handles an empty pending queue", () => {
    expect(fitCountWithinLimit(0, sizeForMeasured, 1_000_000)).toBe(0);
  });
});
