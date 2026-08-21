export const MANUAL_FALLBACK_AFTER_MS = 10 * 60 * 1000;

export function isManualFallbackDue(unsyncedSince: number | undefined, now: number): boolean {
  return unsyncedSince !== undefined && now - unsyncedSince > MANUAL_FALLBACK_AFTER_MS;
}
