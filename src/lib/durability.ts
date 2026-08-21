export type InstallPromptLevel = 1 | 2 | 3 | 4;
export type ExportPromptReason = "first-zero" | "seven-day";

export interface DurabilityPromptState {
  sessionCount: number;
  lastSeenAt?: number | undefined;
  firstExpensePersistRequestedAt?: number | undefined;
  installDismissals: Partial<Record<InstallPromptLevel, number>>;
  retiredInstallLevels: InstallPromptLevel[];
  installModalShownSession?: number | undefined;
  pinLinkPromptedAt?: number | undefined;
  identityBackupPromptedAt?: number | undefined;
  hadNonZeroBalance?: boolean | undefined;
  firstZeroExportPromptedAt?: number | undefined;
  sevenDayExportPromptedAt?: number | undefined;
}

export interface InstallPromptInput {
  state: DurabilityPromptState;
  expenseCount: number;
  isStandalone: boolean;
  isArchived: boolean;
  isOnline: boolean;
  isDesktop: boolean;
  persisted: boolean | null;
  now: number;
}

export const emptyDurabilityPromptState = (): DurabilityPromptState => ({
  sessionCount: 0,
  installDismissals: {},
  retiredInstallLevels: [],
});

export function normalizeDurabilityPromptState(state?: Partial<DurabilityPromptState>): DurabilityPromptState {
  return {
    sessionCount: state?.sessionCount ?? 0,
    lastSeenAt: state?.lastSeenAt,
    firstExpensePersistRequestedAt: state?.firstExpensePersistRequestedAt,
    installDismissals: state?.installDismissals ?? {},
    retiredInstallLevels: state?.retiredInstallLevels ?? [],
    installModalShownSession: state?.installModalShownSession,
    pinLinkPromptedAt: state?.pinLinkPromptedAt,
    identityBackupPromptedAt: state?.identityBackupPromptedAt,
    hadNonZeroBalance: state?.hadNonZeroBalance,
    firstZeroExportPromptedAt: state?.firstZeroExportPromptedAt,
    sevenDayExportPromptedAt: state?.sevenDayExportPromptedAt,
  };
}

const dismissalCount = (state: DurabilityPromptState, level: InstallPromptLevel): number => state.installDismissals[level] ?? 0;

export function installPromptLevel(input: InstallPromptInput): InstallPromptLevel | null {
  if (input.isStandalone || input.isArchived || !input.isOnline || input.isDesktop) return null;

  const retired = new Set(input.state.retiredInstallLevels);
  const allowed = (level: InstallPromptLevel): boolean => !retired.has(level) && dismissalCount(input.state, level) < 4;
  const daysSinceLastSeen = input.state.lastSeenAt === undefined ? 0 : input.now - input.state.lastSeenAt;

  if (input.expenseCount > 0 && daysSinceLastSeen >= 7 * 24 * 60 * 60 * 1000 && allowed(4)) return 4;
  if (
    input.state.sessionCount >= 3 &&
    input.persisted === false &&
    input.state.installModalShownSession !== input.state.sessionCount &&
    allowed(3)
  ) {
    return 3;
  }
  if ((input.expenseCount >= 3 || input.state.sessionCount >= 2) && allowed(2)) return 2;
  if (input.expenseCount >= 1 && allowed(1)) return 1;
  return null;
}

export function dismissInstallPrompt(state: DurabilityPromptState, level: InstallPromptLevel): DurabilityPromptState {
  const count = dismissalCount(state, level) + 1;
  return {
    ...state,
    installDismissals: { ...state.installDismissals, [level]: count },
    retiredInstallLevels: count >= 4 ? [...new Set([...state.retiredInstallLevels, level])] : state.retiredInstallLevels,
  };
}

export function shouldPromptPinLink(state: DurabilityPromptState): boolean {
  return state.pinLinkPromptedAt === undefined;
}

export function shouldPromptIdentityBackup(state: DurabilityPromptState, hasLocalClaim: boolean): boolean {
  return hasLocalClaim && state.identityBackupPromptedAt === undefined;
}

export function shouldPromptFirstZeroExport(state: DurabilityPromptState, allBalancesZero: boolean): boolean {
  return Boolean(state.hadNonZeroBalance && allBalancesZero && state.firstZeroExportPromptedAt === undefined);
}

export function shouldPromptSevenDayExport(state: DurabilityPromptState, persisted: boolean | null, now: number): boolean {
  if (persisted !== false || state.lastSeenAt === undefined || state.sevenDayExportPromptedAt !== undefined) return false;
  return now - state.lastSeenAt > 7 * 24 * 60 * 60 * 1000;
}

export function exportPromptReason(
  state: DurabilityPromptState,
  allBalancesZero: boolean,
  persisted: boolean | null,
  now: number,
): ExportPromptReason | null {
  if (shouldPromptFirstZeroExport(state, allBalancesZero)) return "first-zero";
  if (shouldPromptSevenDayExport(state, persisted, now)) return "seven-day";
  return null;
}
