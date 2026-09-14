import type { RelayEntry } from "../src/relay/types";

const CURSOR_RE = /^(0|[1-9][0-9]{0,19})-(0|[1-9][0-9]{0,19})$/;
const UINT64_MAX = 18_446_744_073_709_551_615n;
const RESPONSE_LIMIT = 2_100_000;

export function validRedisCursor(value: string): boolean {
  if (!CURSOR_RE.test(value)) return false;
  const [ms, seq] = value.split("-");
  return BigInt(ms!) <= UINT64_MAX && BigInt(seq!) <= UINT64_MAX;
}

export class SupabaseRelayStore {
  private endpoint: string;
  private headers: Record<string, string>;

  constructor(url: string | undefined, key: string | undefined, private fetcher: typeof fetch = fetch) {
    if (!url || !key) throw new Error("relay storage is not configured");
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co") ||
        parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
      throw new Error("invalid relay storage configuration");
    }
    this.endpoint = `${parsed.origin}/rest/v1/rpc/`;
    this.headers = { "content-type": "application/json", apikey: key };
    // Modern secret keys are not JWTs. Legacy service-role JWTs also need Bearer.
    if (!key.startsWith("sb_secret_")) this.headers.Authorization = `Bearer ${key}`;
  }

  private async rpc(name: string, payload: unknown): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("relay storage unavailable")); }, 8_000);
    });
    const operation = async () => {
      const response = await this.fetcher(this.endpoint + name, {
        method: "POST", headers: this.headers, body: JSON.stringify(payload),
        redirect: "error", signal: controller.signal,
      });
      // Error bodies may contain database details. Never return them to clients.
      if (!response.ok) throw new Error("relay storage unavailable");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("invalid relay storage response");
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          bytes += next.value.byteLength;
          if (bytes > RESPONSE_LIMIT) throw new Error("relay storage response exceeds limit");
          chunks.push(next.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const joined = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
      return JSON.parse(new TextDecoder().decode(joined)) as unknown;
    };
    try {
      return await Promise.race([operation(), deadline]);
    } catch {
      throw new Error("relay storage unavailable");
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  async append(tag: string, commitment: string, blob: string, author: string): Promise<string | null> {
    const cursor = await this.rpc("prawnsplit_relay_append", {
      p_tag: tag, p_commitment: commitment, p_blob: blob, p_author: author,
    });
    if (cursor === null) return null;
    if (typeof cursor !== "string" || !validRedisCursor(cursor)) throw new Error("invalid relay storage response");
    return cursor;
  }

  async read(tag: string, cursor: string | null, limit: number, author: string | null): Promise<RelayEntry[]> {
    if (cursor && !validRedisCursor(cursor)) throw new Error("invalid cursor");
    const rows = await this.rpc("prawnsplit_relay_read", {
      p_tag: tag, p_cursor: cursor || null, p_limit: Math.min(500, Math.max(1, Math.floor(limit))),
      p_author: author || null,
    });
    if (!Array.isArray(rows) || rows.length > 500 || rows.some((row: unknown) => {
      if (!row || typeof row !== "object") return true;
      const entry = row as Partial<RelayEntry>;
      return typeof entry.cursor !== "string" || !validRedisCursor(entry.cursor) ||
        typeof entry.blob !== "string" || typeof entry.author !== "string";
    })) throw new Error("invalid relay storage response");
    return rows as RelayEntry[];
  }
}
