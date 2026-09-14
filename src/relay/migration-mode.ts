import { config } from "@/config";
import type { HttpRelay } from "./http";
import { recoveryRepository, type RecoveryRepository, type RecoveryState } from "./recovery-db";
import type { RelayRequestOptions } from "./types";

export type MigrationMode = { protocol: 1; mode: "legacy" | "paused" | "supabase-v1"; generation: null | "supabase-v1" };

export function parseMigrationMode(value: unknown): MigrationMode {
  if (!value || typeof value !== "object") throw new Error("Unable to verify relay migration status");
  const item = value as Partial<MigrationMode>;
  if (item.protocol !== 1 || !["legacy", "paused", "supabase-v1"].includes(item.mode ?? "") ||
      item.generation !== (item.mode === "supabase-v1" ? "supabase-v1" : null)) {
    throw new Error("Unable to verify relay migration status");
  }
  return item as MigrationMode;
}

export const recoveryScope = (groupId: string, endpoint: string): string =>
  JSON.stringify([new URL(endpoint, window.location.origin).href, groupId, "supabase-v1"]);

export function isDefaultOperatedRelay(relay: HttpRelay): boolean {
  return new URL(relay.endpoint, window.location.origin).href === new URL(config.relayEndpoint, window.location.origin).href;
}

export async function discoverMigration(groupId: string, relay: HttpRelay, request: RelayRequestOptions,
  repository: RecoveryRepository = recoveryRepository()): Promise<{ mode: MigrationMode; state?: RecoveryState }> {
  const scope = recoveryScope(groupId, relay.endpoint);
  const existing = await repository.state(scope);
  const mode = await relay.migrationMode(request);
  // No silent return to external publishing after a generation has been accepted.
  if (existing && mode.mode === "legacy") throw new Error("Relay migration is paused; local changes are safe and will retry");
  if (mode.mode !== "supabase-v1") return { mode, ...(existing ? { state: existing } : {}) };
  // Discovery can happen before a browser learns it lacks cross-tab locks.
  // First initialization is transactional and never replaces a pending packet.
  const state = await repository.initialize(scope);
  return { mode, state };
}
