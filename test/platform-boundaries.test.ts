import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

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
});
