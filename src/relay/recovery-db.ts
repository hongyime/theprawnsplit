import { openDB, type DBSchema } from "idb";

export interface RecoveryPacket { blob: string; author: string; events: { id: string; fingerprint: string }[]; snapshotSeq?: number }
export interface NostrCheckpoint {
  /** Inclusive descending page boundary; never derived from an opaque event id. */
  until?: number;
  since: number;
  ceiling?: number;
  lastSweep?: number;
  saturated?: boolean;
}
export interface RecoveryState {
  scope: string;
  generation: "supabase-v1";
  cursor?: string;
  initialReadDone?: boolean;
  pending?: RecoveryPacket;
  nostr: Record<string, NostrCheckpoint>;
  nextNostr: number;
}
interface RecoveryDB extends DBSchema {
  states: { key: string; value: RecoveryState };
  receipts: { key: [string, string]; value: { scope: string; id: string; fingerprint: string } };
}

// Separate from the v2 ledger. Existing open app versions keep their database,
// keys and history; no blocked schema upgrade or rewriting old metadata fields.
export class RecoveryRepository {
  private database;
  constructor(name = "ThePrawnSplitRelayRecovery") {
    this.database = openDB<RecoveryDB>(name, 1, { upgrade(db) {
      db.createObjectStore("states", { keyPath: "scope" });
      db.createObjectStore("receipts", { keyPath: ["scope", "id"] });
    } });
  }
  async state(scope: string): Promise<RecoveryState | undefined> { return (await this.database).get("states", scope); }
  async initialize(scope: string): Promise<RecoveryState> {
    const tx = (await this.database).transaction("states", "readwrite");
    try {
      const existing = await tx.store.get(scope);
      const state: RecoveryState = existing ?? { scope, generation: "supabase-v1", nostr: {}, nextNostr: 0 };
      if (!existing) await tx.store.put(state);
      await tx.done;
      return state;
    } catch (error) {
      try { tx.abort(); } catch { /* Already aborted. */ }
      await tx.done.catch(() => {});
      throw error;
    }
  }
  async save(state: RecoveryState): Promise<void> { await (await this.database).put("states", state); }
  async covered(scope: string, id: string, fingerprint: string): Promise<boolean> {
    return (await (await this.database).get("receipts", [scope, id]))?.fingerprint === fingerprint;
  }
  /** Receipt + retry-packet removal are one commit. A crash replays the same blob. */
  async acknowledge(state: RecoveryState, events: RecoveryPacket["events"]): Promise<void> {
    const tx = (await this.database).transaction(["states", "receipts"], "readwrite");
    try {
      await tx.objectStore("states").put(state);
      for (const event of events) await tx.objectStore("receipts").put({ scope: state.scope, ...event });
      await tx.done;
    } catch (error) {
      try { tx.abort(); } catch { /* Already aborted. */ }
      await tx.done.catch(() => {});
      throw error;
    }
  }
  async close(): Promise<void> { (await this.database).close(); }
}

let shared: RecoveryRepository | undefined;
export const recoveryRepository = (): RecoveryRepository => shared ??= new RecoveryRepository();
