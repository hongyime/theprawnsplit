import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createJoinSeed, ensureGroup, readGroup, recordAppLaunch, resetRepositoryForTests, updateMeta } from "@/db/repo";
import {
  dismissInstallPrompt,
  emptyDurabilityPromptState,
  exportPromptReason,
  installPromptLevel,
  shouldPromptFirstZeroExport,
  shouldPromptIdentityBackup,
  shouldPromptPinLink,
  shouldPromptSevenDayExport,
  type InstallPromptInput,
} from "@/lib/durability";

const now = Date.UTC(2026, 7, 21);

function installInput(overrides: Partial<InstallPromptInput> = {}): InstallPromptInput {
  return {
    state: emptyDurabilityPromptState(),
    expenseCount: 1,
    isStandalone: false,
    isArchived: false,
    isOnline: true,
    isDesktop: false,
    persisted: false,
    now,
    ...overrides,
  };
}

describe("durability prompt policy", () => {
  it("suppresses install nagging in standalone, archived, offline, and desktop contexts", () => {
    expect(installPromptLevel(installInput({ isStandalone: true }))).toBeNull();
    expect(installPromptLevel(installInput({ isArchived: true }))).toBeNull();
    expect(installPromptLevel(installInput({ isOnline: false }))).toBeNull();
    expect(installPromptLevel(installInput({ isDesktop: true }))).toBeNull();
  });

  it("escalates install prompts and caps dismissals per level", () => {
    const sessionTwo = { ...emptyDurabilityPromptState(), sessionCount: 2 };
    expect(installPromptLevel(installInput({ state: sessionTwo, expenseCount: 1 }))).toBe(2);

    const sessionThree = { ...emptyDurabilityPromptState(), sessionCount: 3 };
    expect(installPromptLevel(installInput({ state: sessionThree, expenseCount: 1, persisted: false }))).toBe(3);
    expect(installPromptLevel(installInput({ state: { ...sessionThree, installModalShownSession: 3 }, expenseCount: 1, persisted: false }))).toBe(2);

    const retired = [1, 2, 3, 4].reduce((state) => dismissInstallPrompt(state, 1), emptyDurabilityPromptState());
    expect(retired.retiredInstallLevels).toContain(1);
    expect(installPromptLevel(installInput({ state: retired, expenseCount: 1 }))).toBeNull();
  });

  it("shows the pin-link prompt only until it is marked handled", () => {
    expect(shouldPromptPinLink(emptyDurabilityPromptState())).toBe(true);
    expect(shouldPromptPinLink({ ...emptyDurabilityPromptState(), pinLinkPromptedAt: now })).toBe(false);
  });

  it("starts created and joined groups with a durable one-time pin-link prompt", async () => {
    await resetRepositoryForTests(`durability-create-${crypto.randomUUID()}`);
    const created = await ensureGroup();
    expect(created.meta.durability).toBeDefined();
    expect(shouldPromptPinLink(created.meta.durability!)).toBe(true);

    await recordAppLaunch(created.groupId, now);
    const launched = await readGroup(created.groupId);
    expect(launched.meta.durability?.sessionCount).toBe(1);
    expect(shouldPromptPinLink(launched.meta.durability!)).toBe(true);

    await updateMeta(created.groupId, (meta) => ({
      ...meta,
      durability: { ...meta.durability!, pinLinkPromptedAt: now },
    }));
    const handled = await readGroup(created.groupId);
    expect(shouldPromptPinLink(handled.meta.durability!)).toBe(false);

    const seed = createJoinSeed(created);
    await resetRepositoryForTests(`durability-join-${crypto.randomUUID()}`);
    const joined = await ensureGroup(seed);
    expect(joined.meta.durability).toBeDefined();
    expect(shouldPromptPinLink(joined.meta.durability!)).toBe(true);
  });

  it("shows the identity-backup prompt only after a local claim until handled", () => {
    expect(shouldPromptIdentityBackup(emptyDurabilityPromptState(), false)).toBe(false);
    expect(shouldPromptIdentityBackup(emptyDurabilityPromptState(), true)).toBe(true);
    expect(shouldPromptIdentityBackup({ ...emptyDurabilityPromptState(), identityBackupPromptedAt: now }, true)).toBe(false);
  });

  it("allows export prompts only for first-zero and seven-day-unprotected returns", () => {
    const withDebtHistory = { ...emptyDurabilityPromptState(), hadNonZeroBalance: true };
    expect(shouldPromptFirstZeroExport(withDebtHistory, true)).toBe(true);
    expect(shouldPromptFirstZeroExport({ ...withDebtHistory, firstZeroExportPromptedAt: now }, true)).toBe(false);
    expect(shouldPromptFirstZeroExport(emptyDurabilityPromptState(), true)).toBe(false);

    const returnedAfterEightDays = { ...emptyDurabilityPromptState(), lastSeenAt: now - 8 * 24 * 60 * 60 * 1000 };
    expect(shouldPromptSevenDayExport(returnedAfterEightDays, false, now)).toBe(true);
    expect(shouldPromptSevenDayExport(returnedAfterEightDays, true, now)).toBe(false);
    expect(shouldPromptSevenDayExport({ ...returnedAfterEightDays, sevenDayExportPromptedAt: now }, false, now)).toBe(false);
  });

  it("selects no export prompt for launch, session, or timer-only state changes", () => {
    expect(exportPromptReason({ ...emptyDurabilityPromptState(), sessionCount: 7 }, true, false, now)).toBeNull();
    expect(exportPromptReason({ ...emptyDurabilityPromptState(), lastSeenAt: now }, true, false, now)).toBeNull();
    expect(exportPromptReason({ ...emptyDurabilityPromptState(), lastSeenAt: now - 7 * 24 * 60 * 60 * 1000 }, true, false, now)).toBeNull();
    expect(exportPromptReason({ ...emptyDurabilityPromptState(), hadNonZeroBalance: true }, true, false, now)).toBe("first-zero");
    expect(exportPromptReason({ ...emptyDurabilityPromptState(), lastSeenAt: now - 8 * 24 * 60 * 60 * 1000 }, false, false, now)).toBe("seven-day");
  });
});
