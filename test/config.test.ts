import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseClientNumericConfig } from "@/config";

describe("client numeric config parsing", () => {
  it("falls back from malformed, zero, or negative environment values", () => {
    expect(parseClientNumericConfig(undefined, 500)).toBe(500);
    expect(parseClientNumericConfig("not-a-number", 500)).toBe(500);
    expect(parseClientNumericConfig("0", 500)).toBe(500);
    expect(parseClientNumericConfig("-1", 500)).toBe(500);
  });

  it("keeps positive finite values as integer runtime knobs", () => {
    expect(parseClientNumericConfig("42", 500)).toBe(42);
    expect(parseClientNumericConfig("42.9", 500)).toBe(42);
    expect(parseClientNumericConfig(3.8, 500)).toBe(3);
  });

  it("exposes the documented group-total admission cap", async () => {
    const { config } = await import("@/config");

    expect(config.capGroupTotal).toBeGreaterThan(0);
  });

  it("defaults to the v2 schema needed for rate-bearing multi-currency events", async () => {
    const { config } = await import("@/config");

    expect(config.schemaVersion).toBe(2);
  });

  it("documents every runtime client environment key in .env.example", () => {
    const configSource = readFileSync("src/config.ts", "utf8");
    const envExample = readFileSync(".env.example", "utf8");
    const runtimeKeys = [...new Set(configSource.match(/VITE_[A-Z0-9_]+/g) ?? [])].sort();
    const sampleKeys = new Set(envExample.match(/^VITE_[A-Z0-9_]+(?==)/gm) ?? []);

    expect(runtimeKeys.filter((key) => !sampleKeys.has(key))).toEqual([]);
  });

  it("src/config.ts fallback relay list matches VITE_NOSTR_RELAYS in .env.example", () => {
    const configSource = readFileSync("src/config.ts", "utf8");
    const envExample = readFileSync(".env.example", "utf8");

    // Extract fallback relay list from config.ts (the string literal after ??)
    const fallbackMatch = configSource.match(/import\.meta\.env\.VITE_NOSTR_RELAYS\s*\?\?\s*"([^"]+)"/);
    if (!fallbackMatch || !fallbackMatch[1]) throw new Error("Could not find VITE_NOSTR_RELAYS fallback in src/config.ts");
    const fallbackRelays = fallbackMatch[1].split(",").map((r) => r.trim()).filter(Boolean).sort();

    // Extract VITE_NOSTR_RELAYS from .env.example
    const envMatch = envExample.match(/^VITE_NOSTR_RELAYS=(.+)$/m);
    if (!envMatch || !envMatch[1]) throw new Error("Could not find VITE_NOSTR_RELAYS in .env.example");
    const envRelays = envMatch[1].split(",").map((r) => r.trim()).filter(Boolean).sort();

    expect(fallbackRelays).toEqual(envRelays);
  });

  it("every PRD requirement appears in STATUS.md exactly once", () => {
    const prd = readFileSync("PRD.md", "utf8");
    const status = readFileSync("STATUS.md", "utf8");
    const inPrd: Set<string> = new Set(prd.match(/REQ-[A-Z]+-\d+/g) ?? []);
    const inStatus: string[] = status.match(/REQ-[A-Z]+-\d+/g) ?? [];

    const untracked: string[] = [...inPrd].filter((id) => !inStatus.includes(id));
    const orphaned: string[] = [...new Set(inStatus)].filter((id) => !inPrd.has(id));
    const duplicated: string[] = [...new Set(inStatus)].filter(
      (id) => inStatus.filter((x) => x === id).length > 1,
    );

    expect({ untracked, orphaned, duplicated }).toEqual({
      untracked: [],
      orphaned: [],
      duplicated: [],
    });
  });

  it("every assumption ID referenced in PRD prose exists in the §12 register (CR-011)", () => {
    const prd = readFileSync("PRD.md", "utf8");
    const lines = prd.split(/\r?\n/);

    // Collect the register IDs from the §12 assumptions table: | **A13** | ... |
    const sectionBounds = lines.reduce<{ start: number; end: number }>((bounds, line, index) => {
      if (/^## 12\. Assumptions register/.test(line)) bounds.start = index;
      if (bounds.start >= 0 && bounds.end < 0 && /^## 13\./.test(line)) bounds.end = index;
      return bounds;
    }, { start: -1, end: -1 });
    expect(sectionBounds.start).toBeGreaterThanOrEqual(0);

    const registerIds = new Set(
      lines
        .slice(sectionBounds.start, sectionBounds.end)
        .map((line) => line.match(/^\| \*\*(A\d+)\*\*/)?.[1])
        .filter((id): id is string => Boolean(id)),
    );
    expect(registerIds.size).toBeGreaterThan(0);

    // Scan every prose line outside the §12 table for assumption references.
    // A prose note explaining that an ID was DELETED may name it without the ID
    // existing in the register, so those mentions are recognised and allowed.
    const unknown = new Map<string, string[]>();
    const deletedMentions = /\bA\d+\s+deleted\b/i;
    lines.forEach((line, index) => {
      if (index >= sectionBounds.start && index <= sectionBounds.end) return;
      if (deletedMentions.test(line)) return;
      for (const match of line.match(/\bA\d+\b/g) ?? []) {
        if (!registerIds.has(match)) {
          const seen = unknown.get(match) ?? [];
          seen.push(String(index + 1));
          unknown.set(match, seen);
        }
      }
    });

    expect([...unknown.entries()].map(([id, at]) => `${id} first referenced at PRD.md:${at[0]}`)).toEqual([]);
  });

  it("phase-column histogram computed from PRD matches STATUS audit scope (CR-012)", () => {
    const prd = readFileSync("PRD.md", "utf8");
    const status = readFileSync("STATUS.md", "utf8");
    const lines = prd.split(/\r?\n/);

    // Section 7 spans from "## 7. Requirements" to "## 8. Data model".
    const start = lines.findIndex((l) => /^## 7\. Requirements/.test(l));
    const end = lines.findIndex((l) => /^## 8\. Data model/.test(l));
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);

    const histogram = new Map<number, number>();
    const splitPhaseRows: string[] = [];
    for (const line of lines.slice(start, end)) {
      const m = line.match(/^\| (REQ-[A-Z]+-\d+) \| .+ \| (.+) \|$/);
      const id = m?.[1];
      const phaseCell = m?.[2]?.trim();
      if (!m || !id || !phaseCell) continue;
      if (/^\d+$/.test(phaseCell)) {
        const phase = Number(phaseCell);
        histogram.set(phase, (histogram.get(phase) ?? 0) + 1);
      } else {
        splitPhaseRows.push(`${id}: ${phaseCell}`);
      }
    }

    // The phase >= 3 population the audits cover. If PRD phases change, the
    // numbers change HERE first — and the STATUS prose below must follow.
    expect(histogram.get(3)).toBe(12);
    expect(histogram.get(4)).toBe(16);
    expect(histogram.get(5)).toBe(8);

    // Exactly one row carries a split-phase cell.
    expect(splitPhaseRows).toEqual(["REQ-SEC-01: 2 (mint) / 4 (verify)"]);

    // STATUS stated audit scope must quote the computed histogram. Normalize
    // the Unicode multiplication sign used in STATUS prose to ASCII x first.
    const normalizedStatus = status.replace(/\u00d7/g, "x");
    for (const phase of [3, 4, 5]) {
      const stated = new RegExp("(\\d+)x phase " + phase);
      const match = normalizedStatus.match(stated);
      expect(match, `STATUS must state the phase-${phase} count`).not.toBeNull();
      expect(Number(match![1])).toBe(histogram.get(phase));
    }
  });

  it("JOURNAL.md has no duplicate content lines (root cause: edit-with-single-pos replaces one line then survivors duplicate) (CR-013)", () => {
    const journal = readFileSync(".agents/JOURNAL.md", "utf8");
    const contentLines = journal.split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith("- ") && !l.includes("MOLT_AUTO") && !l.includes("[PRAWN-"));
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const line of contentLines) {
      if (seen.has(line)) duplicates.push(line.slice(0, 80));
      seen.add(line);
    }
    expect(duplicates).toEqual([]);
  });

  it("every STATUS.md requirement row has exactly the header cell count (CR-013)", () => {
    const status = readFileSync("STATUS.md", "utf8");
    const lines = status.split(/\r?\n/);
    const headerLine = lines.find((l) => /^\| ID \| Status \|/.test(l));
    expect(headerLine, "STATUS header row not found").toBeTruthy();
    const expectedPipes = (headerLine!.match(/\|/g) ?? []).length;
    const badRows: string[] = [];
    for (const line of lines) {
      if (!/^\| REQ-/.test(line)) continue;
      const pipes = (line.match(/\|/g) ?? []).length;
      if (pipes !== expectedPipes)
        badRows.push(`${line.slice(0, 30).trim()} (${pipes} pipes, expected ${expectedPipes})`);
    }
    expect(badRows).toEqual([]);
  });

  it("every STATUS.md requirement row Evidence cell is 'rendered' or 'source-shape' (CR-013)", () => {
    const status = readFileSync("STATUS.md", "utf8");
    const badRows: string[] = [];
    for (const line of status.split(/\r?\n/)) {
      if (!/^\| REQ-/.test(line)) continue;
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      const evidence = cells[cells.length - 1];
      if (evidence !== "rendered" && evidence !== "source-shape")
        badRows.push(`${cells[0]}: "${evidence}"`);
    }
    expect(badRows).toEqual([]);
  });

  it("most recent CR commit has a .agents/cr-NNN-report.md file (CR-013)", () => {
    let commitMsg: string;
    try {
      commitMsg = readFileSync(".git/COMMIT_EDITMSG", "utf8").trim();
    } catch {
      return; // not running inside a git repo (e.g. fresh CI checkout without history)
    }
    const match = commitMsg.match(/\bcr-(\d{3})\b/i);
    if (!match) return; // most recent commit is not a CR commit
    const crNum = match[1];
    const reportPath = `.agents/cr-${crNum}-report.md`;
    try {
      readFileSync(reportPath);
    } catch {
      throw new Error(`${reportPath} must exist — add it before pushing the CR commit`);
    }
  });
});
