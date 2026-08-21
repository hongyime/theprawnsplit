export interface JoinTokenSeed {
  secretB64: string;
  tagHex: string;
  name?: string;
  currency?: string;
}

export function encodeJoinSeed(seed: JoinTokenSeed): string {
  return btoa(JSON.stringify(seed)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodeJoinSeed(value: string): JoinTokenSeed {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return JSON.parse(atob(padded)) as JoinTokenSeed;
}

export function buildJoinLink(baseHref: string, seed: JoinTokenSeed): string {
  const url = new URL(baseHref);
  url.hash = `join=${encodeJoinSeed(seed)}`;
  return url.toString();
}
