import type { SyncResult } from "./types";

export const SYNC_NETWORK_BUDGET_MS = 60_000;
export const SYNC_FALLBACK_LIMIT = 10;
const inFlight = new Map<string, Promise<SyncResult>>();

export function emptySyncResult(): SyncResult {
  return { published: 0, confirmed: 0, received: 0, buffered: 0, dropped: 0,
    snapshotsPublished: 0, snapshotsSeen: 0, errors: [], diagnostics: [] };
}

/** Share one cycle in this context; skip a cycle already owned by another tab.
 * A rejected cycle must release both locks so a later retry can make progress. */
export function coordinatedSync(groupId: string, run: () => Promise<SyncResult>): Promise<SyncResult> {
  const existing = inFlight.get(groupId);
  if (existing) return existing;
  const pending = Promise.resolve().then(async () => {
    if (typeof navigator !== "undefined" && navigator.locks) {
      return await navigator.locks.request(`prawn-sync:${groupId}`, { ifAvailable: true },
        async (lock): Promise<SyncResult> => lock ? run() : { ...emptySyncResult(), inProgress: true });
    }
    return run();
  }).finally(() => { inFlight.delete(groupId); });
  inFlight.set(groupId, pending);
  return pending;
}

/** Bound network work without abandoning an in-flight local database commit. */
export function syncNetworkBudget(requestedMs = SYNC_NETWORK_BUDGET_MS) {
  const duration = Number.isFinite(requestedMs) && requestedMs > 0
    ? Math.min(requestedMs, SYNC_NETWORK_BUDGET_MS) : SYNC_NETWORK_BUDGET_MS;
  const controller = new AbortController();
  const reason = new Error("Sync network time limit reached; pending changes will retry");
  const timer = setTimeout(() => controller.abort(reason), duration);
  return {
    signal: controller.signal,
    async run<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
      const signal = controller.signal;
      if (signal.aborted) throw signal.reason;
      let abort!: () => void;
      const stopped = new Promise<never>((_, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
      });
      try { return await Promise.race([operation(signal), stopped]); }
      finally { signal.removeEventListener("abort", abort); }
    },
    close() { clearTimeout(timer); controller.abort(reason); },
  };
}
