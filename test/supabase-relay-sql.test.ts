import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const tag = "a".repeat(64);
const commitment = "b".repeat(64);
let db: PGlite;

async function configure() {
  await db.exec(`update prawnsplit.relay_control set writes_enabled=true, imports_enabled=true,
    max_payload_bytes=100000000, max_entries=100000, max_groups=1000,
    max_namespace_bytes=200000000, max_database_bytes=2000000000`);
}
async function append(proof = commitment, blob = "encrypted-blob", nextTag = tag) {
  return (await db.query<{ cursor: string | null }>(
    "select public.prawnsplit_relay_append($1,$2,$3,$4) as cursor", [nextTag, proof, blob, "device-a"])).rows[0]!.cursor;
}
async function ingest(rows: { cursor: string; blob: string; author: string }[], proof: string | null = commitment) {
  return (await db.query<{ count: number }>("select public.prawnsplit_relay_import($1,$2,$3::jsonb) as count",
    [tag, proof, JSON.stringify(rows)])).rows[0]!.count;
}
async function read(cursor: string | null = null, limit = 500, author: string | null = null) {
  return (await db.query<{ cursor: string; blob: string; author: string }>(
    "select * from public.prawnsplit_relay_read($1,$2,$3,$4)", [tag, cursor, limit, author])).rows;
}
async function counts() {
  return (await db.query("select payload_bytes::text,entry_count::text,group_count::text from prawnsplit.relay_control")).rows;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(readFileSync(new URL("../supabase/schemas/relay.sql", import.meta.url), "utf8"));
}, 30_000);
beforeEach(async () => {
  await db.exec("reset role; truncate prawnsplit.relay_entries,prawnsplit.relay_topics,prawnsplit.relay_control; insert into prawnsplit.relay_control(singleton) values(true);");
});
afterAll(async () => { await db?.close(); });

describe("Supabase relay SQL behavior", () => {
  it("starts closed for import and writes without claiming a topic", async () => {
    await expect(append()).rejects.toThrow("writes are paused");
    await expect(ingest([])).rejects.toThrow("imports are paused");
    expect(await counts()).toEqual([{ payload_bytes: "0", entry_count: "0", group_count: "0" }]);
  });

  it.each(["anon", "authenticated"])("denies direct table and RPC access to %s", async (role) => {
    await configure();
    await append();
    await db.exec(`set role ${role}`);
    try {
      await expect(read()).rejects.toThrow("permission denied");
      await expect(append()).rejects.toThrow("permission denied");
      await expect(db.query("select * from public.prawnsplit_relay_topic_info($1)", [tag])).rejects.toThrow("permission denied");
      await expect(db.query("select * from prawnsplit.relay_entries")).rejects.toThrow("permission denied");
    } finally { await db.exec("reset role"); }
  });

  it("service-only invoker appends atomically and rejects a different commitment", async () => {
    await configure();
    await db.exec("set role service_role");
    const first = await append();
    expect(first).toMatch(/^\d+-\d+$/);
    const before = await counts();
    expect(await append("c".repeat(64))).toBeNull();
    expect(await counts()).toEqual(before);
    expect(await read()).toEqual([{ cursor: first, blob: "encrypted-blob", author: "device-a" }]);
    expect((await db.query("select commitment from prawnsplit.relay_topics")).rows).toEqual([{ commitment }]);
  });

  it("preserves exact large Redis IDs and continues after the imported high watermark", async () => {
    await configure();
    const rows = ["9007199254740993-2", "9007199254740993-10", "9007199254740994-0"]
      .map((cursor, i) => ({ cursor, blob: `ciphertext-${i}=\r\n`, author: "device-a" }));
    expect(await ingest([rows[2]!, rows[0]!, rows[1]!])).toBe(3);
    expect(await read()).toEqual(rows);
    expect(await read(rows[0]!.cursor)).toEqual(rows.slice(1));
    expect(await append()).toBe("9007199254740994-1");
  });

  it("retries exact imports without duplicates or changed counters", async () => {
    await configure();
    const rows = [{ cursor: "1000-0", blob: "exact+/=", author: "original-author" }];
    expect(await ingest(rows)).toBe(1);
    const before = await counts();
    expect(await ingest(rows)).toBe(0);
    expect(await counts()).toEqual(before);
    expect(await read()).toEqual(rows);
  });

  it("replays a lost append acknowledgement without allocating another row or capacity", async () => {
    await configure();
    const first = await append();
    const before = await counts();
    await db.exec("update prawnsplit.relay_control set max_entries=1,max_payload_bytes=0");
    expect(await append()).toBe(first);
    expect(await counts()).toEqual(before);
    expect(await append("c".repeat(64))).toBeNull();
    await expect(append(commitment, "different-ciphertext")).rejects.toThrow("capacity exceeded");
  });

  it("preserves historical duplicate cursors while reusing the earliest exact matching receipt", async () => {
    await configure();
    await ingest(["10-0", "11-0"].map((cursor) => ({ cursor, blob: "encrypted-blob", author: "device-a" })));
    expect(await append()).toBe("10-0");
    expect(await read()).toHaveLength(2);
  });

  it("returns exact proof-only and populated topic metadata only through the service role", async () => {
    await configure();
    await db.exec("set role service_role");
    await ingest([]);
    expect((await db.query("select * from public.prawnsplit_relay_topic_info($1)", [tag])).rows)
      .toEqual([{ commitment, entry_count: "0", payload_bytes: "0" }]);
    await ingest([{ cursor: "1-0", blob: "ciphertext", author: "device-a" }]);
    expect((await db.query("select * from public.prawnsplit_relay_topic_info($1)", [tag])).rows)
      .toEqual([{ commitment, entry_count: "1", payload_bytes: String(Buffer.byteLength("ciphertextdevice-a")) }]);
  });

  it("rolls back the whole chunk on cursor content or commitment conflict", async () => {
    await configure();
    await ingest([{ cursor: "1000-0", blob: "original", author: "device-a" }]);
    const before = await counts();
    await expect(ingest([{ cursor: "1000-1", blob: "new", author: "device-a" },
      { cursor: "1000-0", blob: "changed", author: "device-a" }])).rejects.toThrow("content conflict");
    await expect(ingest([], "c".repeat(64))).rejects.toThrow("commitment conflict");
    expect(await counts()).toEqual(before);
    expect(await read()).toEqual([{ cursor: "1000-0", blob: "original", author: "device-a" }]);
  });

  it.each(["max_payload_bytes", "max_entries", "max_groups", "max_namespace_bytes", "max_database_bytes"])
  ("enforces %s before claiming or writing and permits retry after capacity is restored", async (column) => {
    await configure();
    await db.exec(`update prawnsplit.relay_control set ${column}=0`);
    await expect(append()).rejects.toThrow("capacity exceeded");
    expect(await counts()).toEqual([{ payload_bytes: "0", entry_count: "0", group_count: "0" }]);
    expect(await read()).toEqual([]);
    await configure();
    expect(await append()).toMatch(/^\d+-\d+$/);
  });

  it("bounds reads by count and serialized bytes without skipping the next page", async () => {
    await configure();
    const rows = Array.from({ length: 25 }, (_, i) => ({ cursor: `1000-${i}`, blob: "z".repeat(131072), author: "device-a" }));
    for (let start = 0; start < rows.length; start += 10) await ingest(rows.slice(start, start + 10));
    expect(await read(null, 2)).toEqual(rows.slice(0, 2));
    const page = await read();
    expect(page.length).toBeGreaterThan(0);
    expect(page.length).toBeLessThan(rows.length);
    expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(2097152);
    expect([...page, ...await read(page.at(-1)!.cursor)]).toEqual(rows);
    expect(await read(null, 2, "another-device")).toEqual([]);
  });

  it("refuses a first topic when remaining physical space cannot cover its initial pages", async () => {
    await configure();
    const measured = (await db.query<{ bytes: string }>(`select
      (pg_total_relation_size('prawnsplit.relay_control') + pg_total_relation_size('prawnsplit.relay_topics') +
       pg_total_relation_size('prawnsplit.relay_entries'))::text as bytes`)).rows[0]!.bytes;
    await db.query("update prawnsplit.relay_control set max_namespace_bytes=$1", [Number(measured) + 8192]);
    await expect(ingest([])).rejects.toThrow("capacity exceeded");
    expect(await counts()).toEqual([{ payload_bytes: "0", entry_count: "0", group_count: "0" }]);
    expect((await db.query("select count(*)::int as topics from prawnsplit.relay_topics")).rows).toEqual([{ topics: 0 }]);
  });

  it("retains an orphan source stream but refuses to claim its missing proof", async () => {
    await configure();
    const row = { cursor: "1000-0", blob: "retained-orphan", author: "device-a" };
    await ingest([row], null);
    expect(await read()).toEqual([row]);
    expect(await append()).toBeNull();
  });

  it("rejects cursor overflow and unsafe import shapes without retaining partial data", async () => {
    await configure();
    await expect(ingest([{ cursor: "18446744073709551616-0", blob: "bad", author: "device-a" }])).rejects.toThrow();
    await expect(db.query("select public.prawnsplit_relay_import($1,$2,$3::jsonb)",
      [tag, commitment, JSON.stringify([{ cursor: "1-0", blob: "bad", extra: "must not be ignored" }])])).rejects.toThrow();
    expect(await counts()).toEqual([{ payload_bytes: "0", entry_count: "0", group_count: "0" }]);
  });
});
