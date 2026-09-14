import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey } from "nostr-tools";
import { decryptEnvelope, decryptEvents } from "@/crypto/envelope";
import { prepareSourcePackets, readSourceFragment, restoreNostrSource } from "@/relay/source-archive";

const tag = "a".repeat(64), url = "wss://archive.fixture.invalid";
async function fixture() {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const event = finalizeEvent({ kind: 1512, created_at: 1, tags: [["t", tag]], content: "opaque ciphertext" }, generateSecretKey());
  const raw = JSON.stringify(event).slice(0, -1) + ', "unknown":9007199254740993,"escaped":"\\u867e","unicode":' + JSON.stringify("🦐".repeat(20_000)) + '}';
  const entry = { blob: event.content, author: event.pubkey, cursor: "1", sourceEventJson: raw };
  return { key, entry, raw };
}
async function archive() {
  const data = await fixture();
  const packets = await prepareSourcePackets(data.key, url, [data.entry], tag, 1512, async () => false);
  const fragments = await Promise.all(packets.map(async (packet) => {
    const envelope = await decryptEnvelope(data.key, packet.blob);
    if (envelope.type !== "events" || !envelope.sourceArchive) throw new Error("Missing retained fragment");
    return envelope.sourceArchive;
  }));
  return { ...data, packets, fragments };
}

describe("encrypted original Nostr bytes", () => {
  it("restores exact UTF-8 from reordered bounded fragments while legacy decoders see no ledger events", async () => {
    const { raw, key, packets, fragments } = await archive();
    expect(packets.length).toBeGreaterThan(1);
    expect(packets.every((packet) => Buffer.byteLength(packet.blob) <= 131_072)).toBe(true);
    expect(await Promise.all(packets.map((packet) => decryptEvents(key, packet.blob)))).toEqual(packets.map(() => []));
    expect(await restoreNostrSource([...fragments].reverse(), tag, 1512)).toBe(raw);
    const reconstructed = Buffer.concat(fragments.map((fragment) => Buffer.from(fragment.data, "base64")));
    expect(reconstructed.equals(Buffer.from(raw, "utf8"))).toBe(true);
  });

  it("rejects partial, duplicated and mixed originals, altered bytes, invalid signatures and wrong groups", async () => {
    const { fragments } = await archive();
    await expect(restoreNostrSource(fragments.slice(1), tag, 1512)).rejects.toThrow();
    await expect(restoreNostrSource([...fragments.slice(1), fragments[1]], tag, 1512)).rejects.toThrow();
    await expect(restoreNostrSource(fragments.map((item, index) => index ? item : { ...item, sha256: "0".repeat(64) }), tag, 1512)).rejects.toThrow();
    await expect(readSourceFragment({ ...fragments[0], data: "AAAA" + fragments[0]!.data.slice(4) })).rejects.toThrow();
    await expect(readSourceFragment({ ...fragments[0], chunkSha256: "0".repeat(64) })).rejects.toThrow();
    await expect(readSourceFragment({ ...fragments[0], count: 0 })).rejects.toThrow();
    await expect(restoreNostrSource(fragments, "b".repeat(64), 1512)).rejects.toThrow();
    await expect(restoreNostrSource(fragments, tag, 1513)).rejects.toThrow();
  });

  it("deduplicates identical receipts but retains different source locations and unknown fields", async () => {
    const { entry, key, packets } = await archive();
    const receipts = new Set(packets.map((packet) => packet.receipt));
    const covered = async (receipt: string) => receipts.has(receipt);
    expect(await prepareSourcePackets(key, url, [entry, entry], tag, 1512, covered)).toEqual([]);
    expect(await prepareSourcePackets(key, url, [entry, entry], tag, 1512, async () => false)).toHaveLength(packets.length);
    expect((await prepareSourcePackets(key, url + "/second", [entry], tag, 1512, covered)).length).toBeGreaterThan(0);
    const altered = { ...entry, sourceEventJson: entry.sourceEventJson.replace("9007199254740993", "9007199254740995") };
    expect((await prepareSourcePackets(key, url, [altered], tag, 1512, covered)).length).toBeGreaterThan(0);
  });

  it("refuses missing or mismatched provenance and noncanonical source metadata", async () => {
    const { entry, key } = await fixture();
    for (const changed of [{ blob: entry.blob, author: entry.author, cursor: entry.cursor }, { ...entry, author: "wrong" },
      { ...entry, blob: "wrong" }, { ...entry, cursor: "2" },
      { ...entry, sourceEventJson: entry.sourceEventJson.replace("opaque ciphertext", "altered ciphertext") }]) {
      await expect(prepareSourcePackets(key, url, [changed], tag, 1512, async () => false)).rejects.toThrow();
    }
    await expect(prepareSourcePackets(key, "https://fixture.invalid", [entry], tag, 1512, async () => false)).rejects.toThrow();
    await expect(prepareSourcePackets(key, "wss://user:secret@fixture.invalid", [entry], tag, 1512, async () => false)).rejects.toThrow();
    await expect(prepareSourcePackets(key, url, [entry], "b".repeat(64), 1512, async () => false)).rejects.toThrow();
  });

  it("rejects excessive page count and total raw bytes before returning any packets", async () => {
    const { entry, key } = await fixture();
    await expect(prepareSourcePackets(key, url, Array.from({ length: 51 }, () => entry), tag, 1512, async () => false)).rejects.toThrow();
    const oversized = { ...entry, sourceEventJson: entry.sourceEventJson.slice(0, -1) + ',"large":' + JSON.stringify("x".repeat(2_100_000)) + '}' };
    await expect(prepareSourcePackets(key, url, [oversized], tag, 1512, async () => false)).rejects.toThrow();
  });
});
