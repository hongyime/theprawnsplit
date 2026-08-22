import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createGroup, listGroups, resetRepositoryForTests } from "@/db/repo";

describe("landing and root routing UI", () => {
  it("includes landing screen markup and copy in App.svelte", () => {
    const source = readFileSync(join(process.cwd(), "src", "App.svelte"), "utf8");

    expect(source).toContain('{:else if !group && storedGroups.length === 0}');
    expect(source).toContain('<img src="/favicon.svg" alt="The Prawn Split" class="landing-logo" width="64" height="64" />');
    expect(source).toContain("<h1>The Prawn Split</h1>");
    expect(source).toContain("Split trip costs with friends.");
    expect(source).toContain("No accounts. No ads. Works offline.");
    expect(source).toContain("Start a new trip");
    expect(source).toContain("Got a link from a friend? Just open it.");
  });

  it("includes group list screen markup and copy in App.svelte", () => {
    const source = readFileSync(join(process.cwd(), "src", "App.svelte"), "utf8");

    expect(source).toContain('{:else if !group && storedGroups.length > 0}');
    expect(source).toContain("Your Trips");
    expect(source).toContain("selectTrip(g.groupId)");
    expect(source).toContain("Start a new trip");
  });

  it("lists stored groups sorted by newest first", async () => {
    await resetRepositoryForTests(`landing-ui-${crypto.randomUUID()}`);

    const group1 = await createGroup("First Trip", "USD");
    const group2 = await createGroup("Second Trip", "EUR");

    const stored = await listGroups();
    expect(stored.length).toBe(2);
    expect(stored[0]?.groupId).toBe(group2.groupId);
    expect(stored[1]?.groupId).toBe(group1.groupId);
  });
});
