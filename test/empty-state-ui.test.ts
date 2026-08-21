import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("empty state UI", () => {
  it("presents add-people and share-trip as primary actions", () => {
    const source = readFileSync(join(process.cwd(), "src", "App.svelte"), "utf8");

    expect(source).toContain("{#if participants.length === 0}");
    expect(source).toContain("Add people to start a trip ledger.");
    expect(source).toContain("<Users size={17} /> Add people");
    expect(source).toContain("participantNameInput?.focus()");
    expect(source).toContain("<Download size={17} /> Share trip file");
    expect(source).toContain("downloadExport()");
    expect(source).toContain("bind:this={participantNameInput}");
  });
});
