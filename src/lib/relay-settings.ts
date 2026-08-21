export interface RelayDefaults {
  operatedEndpoint: string;
  nostrRelays: string[];
}

export interface RelaySettings {
  useOperated: boolean;
  operatedEndpoint: string;
  nostrRelays: string[];
}

export function defaultRelaySettings(defaults: RelayDefaults): RelaySettings {
  return {
    useOperated: true,
    operatedEndpoint: normalizeHttpEndpoint(defaults.operatedEndpoint, "/api/relay"),
    nostrRelays: normalizeNostrRelays(defaults.nostrRelays),
  };
}

export function normalizeRelaySettings(input: Partial<RelaySettings> | undefined, defaults: RelayDefaults): RelaySettings {
  const base = defaultRelaySettings(defaults);
  if (!input) return base;
  return {
    useOperated: input.useOperated ?? base.useOperated,
    operatedEndpoint: normalizeHttpEndpoint(input.operatedEndpoint, base.operatedEndpoint),
    nostrRelays: normalizeNostrRelays(input.nostrRelays ?? base.nostrRelays),
  };
}

export function parseNostrRelayText(text: string): string[] {
  return normalizeNostrRelays(text.split(/\s|,/));
}

export function relaySettingsTargetCount(settings: RelaySettings): number {
  return (settings.useOperated ? 1 : 0) + (settings.nostrRelays.length > 0 ? 1 : 0);
}

function normalizeHttpEndpoint(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith("/")) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function normalizeNostrRelays(values: Iterable<string>): string[] {
  const relays = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "wss:" && url.protocol !== "ws:") continue;
      url.hash = "";
      url.search = "";
      relays.add(url.toString().replace(/\/$/, ""));
    } catch {
      continue;
    }
  }
  return [...relays];
}
