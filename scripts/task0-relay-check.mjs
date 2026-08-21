const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://nostr.mom",
  "wss://offchain.pub",
];

const kind = Number(process.env.VITE_NOSTR_KIND ?? 1512);

function relayInfoUrl(relay) {
  return relay.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function checkKindRegistry() {
  const url = "https://raw.githubusercontent.com/nostr-protocol/registry-of-kinds/master/schema.yaml";
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const registry = await response.text();
    const kindLine = new RegExp(`(^|\\n)\\s*${kind}\\s*:`);
    return {
      source: url,
      regularRange: kind >= 1000 && kind < 10000,
      registered: kindLine.test(registry),
      entry: null,
    };
  } catch (error) {
    return { source: url, regularRange: kind >= 1000 && kind < 10000, error: error.message };
  }
}

async function checkRelay(relay) {
  const url = relayInfoUrl(relay);
  try {
    const info = await fetchJson(url, { headers: { accept: "application/nostr+json" } });
    return {
      relay,
      ok: true,
      name: info.name ?? null,
      software: info.software ?? null,
      supported_nips: info.supported_nips ?? [],
      limitation: {
        max_message_length: info.limitation?.max_message_length ?? null,
        max_limit: info.limitation?.max_limit ?? null,
        max_subscriptions: info.limitation?.max_subscriptions ?? null,
        auth_required: info.limitation?.auth_required ?? null,
        payment_required: info.limitation?.payment_required ?? null,
      },
    };
  } catch (error) {
    return { relay, ok: false, error: error.message };
  }
}

const result = {
  checkedAt: new Date().toISOString(),
  kind,
  registry: await checkKindRegistry(),
  relays: await Promise.all(DEFAULT_RELAYS.map(checkRelay)),
  notes: [
    "NIP-11 does not prove 30-day retention; it only exposes relay-declared capabilities and limits.",
    "Publish/read-back retention probes require live WebSocket writes and should be repeated at 1h/24h/7d/30d with a throwaway key.",
  ],
};

console.log(JSON.stringify(result, null, 2));
