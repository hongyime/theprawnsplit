import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const sourceRoot = join(process.cwd(), "src");
const sourceExtensions = new Set([".svelte", ".ts"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return sourceFiles(path);
    return sourceExtensions.has(extname(path)) ? [path] : [];
  });
}

function readSources(): string {
  return sourceFiles(sourceRoot)
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

function sourceEntries(): { path: string; source: string }[] {
  return sourceFiles(sourceRoot).map((path) => ({ path, source: readFileSync(path, "utf8") }));
}

describe("platform boundaries", () => {
  it("keeps ledger storage out of browser key-value stores", () => {
    const source = readSources();

    expect(source).not.toMatch(/\b(?:localStorage|sessionStorage)\b/);
  });

  it("does not add telemetry, analytics, push, or background sync APIs", () => {
    const source = readSources();

    expect(source).not.toMatch(
      /\b(?:navigator\.sendBeacon|gtag|analytics|telemetry|PushManager|pushManager|SyncManager)\b/,
    );
    expect(source).not.toMatch(/\.(?:sync|pushManager)\.(?:register|subscribe)\b/);
  });

  it("keeps settlements as ledger records without payment rails", () => {
    const source = readSources();

    expect(source).not.toMatch(
      /\b(?:Stripe|stripe|PayPal|paypal|Venmo|venmo|Plaid|plaid|CheckoutProvider|PaymentRequest|paymentRequest|PaymentResponse|navigator\.payments)\b/,
    );
    expect(source).not.toMatch(/\b(?:ApplePay|GooglePay|merchantAccount|bankAccount|routingNumber|cardNumber|iban|ach)\b/i);
  });

  it("keeps direct network APIs inside relay adapters", () => {
    const adapterPaths = new Set([join(sourceRoot, "relay", "http.ts"), join(sourceRoot, "relay", "nostr.ts")]);
    const offenders = sourceEntries()
      .filter((entry) => !adapterPaths.has(entry.path))
      .filter((entry) => /\b(?:window|globalThis)\.fetch\s*\(|\bawait\s+fetch\s*\(|\bnew\s+(?:WebSocket|EventSource)\s*\(|\bSimplePool\b|\bpool\.(?:publish|querySync)\b/.test(entry.source))
      .map((entry) => relative(process.cwd(), entry.path));

    expect(offenders).toEqual([]);
  });

  it("keeps relay adapter construction behind the sync relay factory", () => {
    const factoryPath = join(sourceRoot, "relay", "sync.ts");
    const offenders = sourceEntries()
      .filter((entry) => entry.path !== factoryPath)
      .filter((entry) => /\bnew\s+(?:HttpRelay|NostrRelay)\b/.test(entry.source))
      .map((entry) => relative(process.cwd(), entry.path));

    expect(offenders).toEqual([]);
  });

  it("keeps Nostr transport signatures out of ledger authorization", () => {
    const ledgerAuthFiles = [
      join(process.cwd(), "core", "src", "identity.ts"),
      join(sourceRoot, "lib", "verification.ts"),
      join(sourceRoot, "crypto", "claim.ts"),
    ];
    const offenders = ledgerAuthFiles
      .map((path) => ({ path, source: readFileSync(path, "utf8") }))
      .filter((entry) => /\b(?:nostr|Nostr|nostr-tools|SimplePool|finalizeEvent|getPublicKey|pubkey|Schnorr)\b/.test(entry.source))
      .map((entry) => relative(process.cwd(), entry.path));

    expect(offenders).toEqual([]);
  });

  it("keeps operated relay credentials server-only", () => {
    const clientSource = readSources();
    const relaySource = readFileSync(join(process.cwd(), "api", "relay.ts"), "utf8");

    expect(clientSource).not.toMatch(/\bUPSTASH_REDIS_REST_(?:URL|TOKEN)\b/);
    expect(clientSource).not.toMatch(/\bVITE_[A-Z0-9_]*UPSTASH\b/);
    expect(relaySource).toContain("process.env.UPSTASH_REDIS_REST_URL");
    expect(relaySource).toContain("process.env.UPSTASH_REDIS_REST_TOKEN");
    expect(relaySource).not.toContain("import.meta.env");
  });

  it("keeps the operated relay blind to ledger payloads", () => {
    const relaySource = readFileSync(join(process.cwd(), "api", "relay.ts"), "utf8");

    expect(relaySource).not.toMatch(/@theprawnsplit\/core|src\/db|@\/db|src\/crypto\/envelope|@\/crypto\/envelope/);
    expect(relaySource).not.toMatch(/\b(?:decryptEnvelope|encryptEnvelope|decryptEvents|encryptEvents|fold|canonicalState)\b/);
    expect(relaySource).not.toMatch(/\b(?:Event|ParticipantAdded|ExpenseAdded|SettlementRecorded|DeviceIdentityBackup|TripLedgerExport)\b/);
  });
});
