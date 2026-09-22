// REL-008/T26: proves the generated baseline migration file
// (supabase/migrations/20260922130000_baseline_relay_schema.sql) is a safe,
// functionally-equivalent, idempotent stand-in for supabase/schemas/relay.sql
// — applicable to an empty database AND safely re-applicable against a
// database that already has this exact schema (the live hosted case), per
// REL-008's acceptance criteria: "Isolated baseline upgrade preserves
// records/proofs/cursors/ACLs/disabled controls; forward compensation is
// non-destructive." Runs entirely against a local PGlite instance — no live
// SQL is executed against any hosted project.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const migrationSql = readFileSync(
  new URL("../supabase/migrations/20260922130000_baseline_relay_schema.sql", import.meta.url),
  "utf8",
);
const desiredSchemaSql = readFileSync(new URL("../supabase/schemas/relay.sql", import.meta.url), "utf8");

const tag = "a".repeat(64);
const commitment = "b".repeat(64);

let db: PGlite | undefined;

afterEach(async () => {
  await db?.close();
  db = undefined;
});

async function freshDb(): Promise<PGlite> {
  const instance = new PGlite();
  await instance.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  return instance;
}

async function configure(instance: PGlite): Promise<void> {
  await instance.exec(`update prawnsplit.relay_control set writes_enabled=true, imports_enabled=true,
    max_payload_bytes=100000000, max_entries=100000, max_groups=1000,
    max_namespace_bytes=200000000, max_database_bytes=2000000000`);
}

async function append(instance: PGlite, proof = commitment, blob = "encrypted-blob"): Promise<string | null> {
  return (
    await instance.query<{ cursor: string | null }>(
      "select public.prawnsplit_relay_append($1,$2,$3,$4) as cursor",
      [tag, proof, blob, "device-a"],
    )
  ).rows[0]!.cursor;
}

async function countsOf(instance: PGlite) {
  return (
    await instance.query("select payload_bytes::text,entry_count::text,group_count::text from prawnsplit.relay_control")
  ).rows;
}

describe("REL-008/T26 baseline migration file", { timeout: 30_000 }, () => {
  it("applies cleanly to a fresh, empty database with no error", async () => {
    db = await freshDb();
    await expect(db.exec(migrationSql)).resolves.not.toThrow();
  });

  it("produces a schema that behaves identically to applying relay.sql directly (append + read round trip)", async () => {
    db = await freshDb();
    await db.exec(migrationSql);
    await configure(db);
    await db.exec("set role service_role");
    const cursor = await append(db);
    expect(cursor).toMatch(/^\d+-\d+$/);
    const rows = (
      await db.query<{ cursor: string; blob: string; author: string }>(
        "select * from public.prawnsplit_relay_read($1,$2,$3,$4)",
        [tag, null, 500, null],
      )
    ).rows;
    expect(rows).toEqual([{ cursor, blob: "encrypted-blob", author: "device-a" }]);
  });

  it("still enforces RLS/ACL denial to anon and authenticated roles", async () => {
    db = await freshDb();
    await db.exec(migrationSql);
    await configure(db);
    await db.exec("set role service_role");
    await append(db);
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from prawnsplit.relay_entries")).rejects.toThrow("permission denied");
      await expect(
        db.query("select public.prawnsplit_relay_append($1,$2,$3,$4)", [tag, commitment, "x", "device-a"]),
      ).rejects.toThrow("permission denied");
    } finally {
      await db.exec("reset role");
    }
  });

  it("is idempotent: re-applying the migration to a database that already has the schema and live data is a clean no-op", async () => {
    db = await freshDb();
    await db.exec(migrationSql);
    await configure(db);
    await db.exec("set role service_role");
    const cursor = await append(db);
    const before = await countsOf(db);
    const beforeRows = (await db.query("select * from prawnsplit.relay_entries")).rows;
    const beforeTopics = (await db.query("select * from prawnsplit.relay_topics")).rows;

    await db.exec("reset role");
    // Simulate applying this same baseline migration a second time against
    // the already-live database (e.g. an operator mistakenly re-running it,
    // or a fresh clone applying every migration file including this one
    // against a project that already matches it).
    await expect(db.exec(migrationSql)).resolves.not.toThrow();

    await db.exec("set role service_role");
    expect(await countsOf(db)).toEqual(before);
    expect((await db.query("select * from prawnsplit.relay_entries")).rows).toEqual(beforeRows);
    expect((await db.query("select * from prawnsplit.relay_topics")).rows).toEqual(beforeTopics);
    // The one seed row (relay_control.singleton) must not have been
    // duplicated or reset by the second application either.
    expect((await db.query("select count(*)::int as n from prawnsplit.relay_control")).rows).toEqual([{ n: 1 }]);
    // And the RLS/ACL/writes-enabled configuration survives the re-apply too.
    const readAfter = (
      await db.query<{ cursor: string; blob: string; author: string }>(
        "select * from public.prawnsplit_relay_read($1,$2,$3,$4)",
        [tag, null, 500, null],
      )
    ).rows;
    expect(readAfter).toEqual([{ cursor, blob: "encrypted-blob", author: "device-a" }]);
  });

  it("is a semantically complete copy of the desired schema: same table/function/index names, no dropped statements", async () => {
    const desiredObjects = {
      tables: [...desiredSchemaSql.matchAll(/create table (\S+) \(/g)].map((m) => m[1]),
      functions: [...desiredSchemaSql.matchAll(/create function (\S+)\(/g)].map((m) => m[1]),
      indexes: [...desiredSchemaSql.matchAll(/create index (\S+) on/g)].map((m) => m[1]),
    };
    const migrationObjects = {
      tables: [...migrationSql.matchAll(/create table if not exists (\S+) \(/g)].map((m) => m[1]),
      functions: [...migrationSql.matchAll(/create (?:or replace )?function (\S+)\(/g)].map((m) => m[1]),
      indexes: [...migrationSql.matchAll(/create index if not exists (\S+) on/g)].map((m) => m[1]),
    };
    expect(migrationObjects.tables.sort()).toEqual(desiredObjects.tables.sort());
    expect(migrationObjects.functions.sort()).toEqual(desiredObjects.functions.sort());
    expect(migrationObjects.indexes.sort()).toEqual(desiredObjects.indexes.sort());
  });
});
