// DATA-005: canonical content fingerprint for one Event, shared across every
// ingestion path (upsertRemoteEvents, the legacy sync readback-confirmation
// count, and migrated-sync's own recovery receipts) so "have I already seen
// this exact content" means the same thing everywhere. Previously this lived
// only inside migrated-sync.ts as a private helper; other callers either had
// no fingerprint at all (upsertRemoteEvents skipped by id only) or would
// have reimplemented it slightly differently.
import type { Event } from "@theprawnsplit/core";
import { bytesToHex } from "@/crypto/bytes";
import { bigintReplacer } from "@/lib/money";

export async function eventFingerprint(event: Event): Promise<string> {
  // Preserve the persisted bigint tags while canonicalizing object-key order.
  // Object.fromEntries retains an own "__proto__" field as data; assigning it
  // into a plain accumulator would silently omit it from the fingerprint.
  const ordered = JSON.stringify(JSON.parse(JSON.stringify(event, bigintReplacer)), (_name, value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map((name) => [name, (value as Record<string, unknown>)[name]]))
      : value);
  const bytes = new TextEncoder().encode(ordered);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}
