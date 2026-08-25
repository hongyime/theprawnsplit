// CR-011 Task 6 — NIP-11 relay information document access.
//
// Reads `limitation.max_message_length` per relay so batch sizing can respect
// the weakest default relay (measured 2026-08-24: nos.lol, nostr.mom and
// offchain.pub report 131072; primal 1000000; snort 524288). Values are cached
// for the process lifetime: limits change on relay-operator timescales, not
// per-sync timescales.

const limitCache = new Map<string, number | null>();

export function clearNip11CacheForTests(): void {
  limitCache.clear();
}

export async function fetchMaxMessageLength(
  relayUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  const cached = limitCache.get(relayUrl);
  if (cached !== undefined) return cached;
  const value = await requestMaxMessageLength(relayUrl, fetchImpl);
  limitCache.set(relayUrl, value);
  return value;
}

async function requestMaxMessageLength(relayUrl: string, fetchImpl: typeof fetch): Promise<number | null> {
  try {
    const httpUrl = relayUrl.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
    const response = await fetchImpl(httpUrl, { headers: { Accept: "application/nostr+json" } });
    if (!response.ok) return null;
    const document = (await response.json()) as { limitation?: { max_message_length?: unknown } };
    const raw = document.limitation?.max_message_length;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
    return raw;
  } catch {
    return null;
  }
}
