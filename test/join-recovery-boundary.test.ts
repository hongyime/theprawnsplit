import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function appSource(): string {
  return readFileSync(join(process.cwd(), "src", "App.svelte"), "utf8");
}

describe("join recovery boundary", () => {
  it("blocks participant creation until a linked join has recovered group data", () => {
    const source = appSource();
    const addParticipant = source.match(/async function addParticipant\(\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    const emptyRoster = source.match(/\{#if participants\.length === 0\}([\s\S]*?)\{:else\}/)?.[1] ?? "";

    expect(source).toContain('$: joinBlocked = Boolean(group && !group.events.some((event) => event.t === "GroupCreated"));');
    expect(source).toContain("$: recoveryActive = Boolean(joiningFromLink && joinBlocked);");
    expect(source).toContain("if (joinBlocked) await runSync();");
    expect(addParticipant).toContain("if (!name || !group || joinBlocked || archived) return;");
    expect(source).toContain('<button type="submit" disabled={joinBlocked || archived}><Plus size={17} /> Add</button>');
    expect(emptyRoster).toContain("{#if recoveryActive}");
    expect(emptyRoster).toContain("Waiting for recovered trip data.");
    expect(emptyRoster).toContain("on:click={runSync}");
  });
});
