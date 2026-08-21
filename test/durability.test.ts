import { describe, expect, it } from "vitest";
import {
  dismissInstallPrompt,
  emptyDurabilityPromptState,
  installPromptLevel,
  shouldPromptFirstZeroExport,
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
});
