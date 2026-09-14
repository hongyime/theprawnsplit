import { describe, expect, it, vi } from "vitest";
import { recoverNostrPage, NOSTR_RECOVERY_LIMIT, type NostrRecoverySource } from "@/relay/nostr-recovery";
import type { NostrCheckpoint } from "@/relay/recovery-db";
import type { RelayEntry } from "@/relay/types";

const url = "wss://fixture.invalid";
function source(rows: RelayEntry[]): NostrRecoverySource {
  return { relayUrls: [url], recoveryPage: vi.fn(async (_url, _tag, filter) => rows
    .filter((row) => Number(row.cursor) >= filter.since && Number(row.cursor) <= filter.until)
    .sort((a, b) => Number(b.cursor) - Number(a.cursor) || a.blob.localeCompare(b.blob))
    .slice(0, filter.limit)) };
}
const row = (n: number, timestamp = n): RelayEntry => ({ blob: `encrypted-${n}`, author: "fixture", cursor: String(timestamp) });

describe("bounded backwards Nostr recovery", () => {
  it("retains every entry beyond two newest-first pages and deduplicates boundary delivery", async () => {
    const rows = Array.from({ length: 121 }, (_, i) => row(i + 1, Math.floor(i / 3) + 1));
    const relay = source(rows), received = new Set<string>();
    let state: NostrCheckpoint | undefined;
    let exhausted = false;
    for (let cycle = 0; cycle < 5 && !exhausted; cycle++) {
      const page = await recoverNostrPage(relay, url, "tag", state, undefined, 200);
      page.entries.forEach((entry) => received.add(entry.blob));
      state = page.next; exhausted = page.exhausted;
    }
    expect(exhausted).toBe(true);
    expect([...received].sort()).toEqual(rows.map((entry) => entry.blob).sort());
    expect(relay.recoveryPage).toHaveBeenCalledTimes(3);
  });

  it("does not skip an overloaded timestamp or falsely declare it complete", async () => {
    const relay = source(Array.from({ length: NOSTR_RECOVERY_LIMIT + 7 }, (_, i) => row(i, 10)));
    const first = await recoverNostrPage(relay, url, "tag", undefined, undefined, 200);
    const blocked = await recoverNostrPage(relay, url, "tag", first.next, undefined, 200);
    expect(blocked).toMatchObject({ saturated: true, exhausted: false, next: { until: 10, since: 0 } });
    const retry = await recoverNostrPage(relay, url, "tag", blocked.next, undefined, 300);
    expect(retry.next.until).toBe(10);
  });

  it("reads late stale-client publications after the initial scan, then periodically rechecks old timestamps", async () => {
    const rows = [row(1, 90)], relay = source(rows);
    const first = await recoverNostrPage(relay, url, "tag", undefined, undefined, 100);
    rows.push(row(2, 150), row(3, 20));
    const tail = await recoverNostrPage(relay, url, "tag", first.next, undefined, 200);
    expect(tail.entries.map((entry) => entry.blob)).toEqual(["encrypted-2"]);
    const rescan = await recoverNostrPage(relay, url, "tag", tail.next, undefined, 86_501);
    expect(rescan.entries.map((entry) => entry.blob)).toContain("encrypted-3");
  });

  it("refuses out-of-range and oversized responses without advancing caller state", async () => {
    const previous = { since: 10, until: 100, ceiling: 100 };
    const relay = source([]);
    vi.mocked(relay.recoveryPage).mockResolvedValue([row(1, 101)]);
    await expect(recoverNostrPage(relay, url, "tag", previous)).rejects.toThrow("Invalid Nostr recovery page");
    vi.mocked(relay.recoveryPage).mockResolvedValue([{ ...row(1, 50), blob: "x".repeat(2_000_001) }]);
    await expect(recoverNostrPage(relay, url, "tag", previous)).rejects.toThrow("transfer limit");
    expect(previous).toEqual({ since: 10, until: 100, ceiling: 100 });
  });
});
