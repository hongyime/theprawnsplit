import { eventSortKey, type Event, type Money } from "@theprawnsplit/core";

export interface OutstandingTransfer {
  from: string;
  to: string;
  minor: Money;
}

export type ArchiveEvent = Extract<Event, { t: "GroupArchived" }>;

export interface ArchiveTransitionPlan {
  actions: readonly ["download-export", "append-archive-event"];
  outstanding: OutstandingTransfer[];
}

export interface PollingDecisionInput {
  hasGroup: boolean;
  documentHidden: boolean;
  archived: boolean;
  now: number;
  lastActivityAt: number;
  lastSyncAt?: number | undefined;
  idleAfterMs: number;
  pollActiveMs: number;
  pollBackoffMs: number;
  pollIdleMs: number;
}

export function isSettledViewPredicate(balances: Map<string, Money>, archived: boolean): boolean {
  return !archived && [...balances.values()].every((minor) => minor === 0n);
}

export function canEditGroupProfile(archived: boolean): boolean {
  return !archived;
}

export function shouldPollGroup(input: PollingDecisionInput): boolean {
  if (!input.hasGroup || input.documentHidden || input.archived) return false;
  const inactiveFor = Math.max(0, input.now - input.lastActivityAt);
  let cadence = input.pollIdleMs;
  if (inactiveFor <= input.pollActiveMs) cadence = input.pollActiveMs;
  else if (inactiveFor <= input.idleAfterMs) cadence = input.pollBackoffMs;
  return input.now - (input.lastSyncAt ?? 0) >= cadence;
}

export function latestArchiveEvent(events: Event[]): ArchiveEvent | undefined {
  let latest: ArchiveEvent | undefined;
  for (const event of [...events].sort(eventSortKey)) {
    if (event.t === "GroupArchived") latest = event;
    if (event.t === "GroupUnarchived") latest = undefined;
  }
  return latest;
}

export function createArchiveTransitionPlan(outstanding: OutstandingTransfer[]): ArchiveTransitionPlan {
  return {
    actions: ["download-export", "append-archive-event"],
    outstanding: outstanding.map((transfer) => ({ ...transfer })),
  };
}

export function groupWithPendingArchiveEvent<T extends { events: Event[]; nextCounter: number }>(
  group: T,
  archiveEvent: ArchiveEvent,
  nextCounter: number,
): T {
  return {
    ...group,
    events: [...group.events, archiveEvent],
    nextCounter,
  };
}

export function archiveConfirmationText(outstanding: string[]): string {
  const label = outstanding.length ? outstanding.join("\n") : "All balances are zero.";
  return `Archive this trip?\n\nOutstanding balances:\n${label}\n\nA ledger export containing the archive event will download before the archive event is saved. Relay retention is outside this app's control; archiving does not delete relay data.`;
}

export function unarchiveConfirmationText(): string {
  return "Unarchive this trip?\n\nThe ledger will become editable again and sync polling can resume. The archive event remains in history.";
}
