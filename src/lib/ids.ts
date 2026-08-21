export function newId(prefix: string): string {
  const webCrypto: Crypto = globalThis.crypto;
  if (typeof webCrypto.randomUUID === "function") {
    return `${prefix}_${webCrypto.randomUUID()}`;
  }
  const bytes = new Uint8Array(16);
  webCrypto.getRandomValues(bytes);
  return `${prefix}_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function todayLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function inferCurrency(): string {
  const locale = navigator.language || "en-US";
  const region = locale.split("-")[1]?.toUpperCase();
  if (region === "SG") return "SGD";
  if (region === "GB") return "GBP";
  if (region === "AU") return "AUD";
  if (region === "CA") return "CAD";
  if (region === "JP") return "JPY";
  if (region === "EU") return "EUR";
  return "USD";
}
