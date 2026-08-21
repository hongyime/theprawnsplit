export interface SyncSurfaceLabels {
  topbar: string;
  protection: string;
}

export function syncSurfaceLabels(input: { unconfirmedCount: number; quarantinedCount: number }): SyncSurfaceLabels {
  if (input.quarantinedCount > 0) {
    return {
      topbar: "update required",
      protection: "sync blocked",
    };
  }
  if (input.unconfirmedCount > 0) {
    return {
      topbar: "offline, changes unconfirmed",
      protection: `${input.unconfirmedCount} unsynced`,
    };
  }
  return {
    topbar: "ready offline",
    protection: "sync current",
  };
}
