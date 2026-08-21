export type Money = bigint;

export interface HLC {
  wall: number;
  ctr: number;
  dev: string;
}

export interface BaseEvent {
  v: number;
  id: string;
  hlc: HLC;
  dev: string;
  vv?: Record<string, number>;
}

export interface Financials {
  minor: Money;
  payers: { pid: string; minor: Money }[];
  shares: { pid: string; minor: Money }[];
  rate?: { currency: string; toBase: number };
}

export type Event =
  | (BaseEvent & { t: "GroupCreated"; name: string; currency: string })
  | (BaseEvent & { t: "ParticipantAdded"; pid: string; name: string })
  | (BaseEvent & { t: "ParticipantRenamed"; pid: string; name: string })
  | (BaseEvent & {
      t: "ParticipantClaimed";
      pid: string;
      deviceId: string;
      claimPk: string;
      alg: "ed25519" | "ecdsa-p256";
      sig: string;
    })
  | (BaseEvent & {
      t: "DeviceLinked";
      pid: string;
      parentDevice: string;
      newDevice: string;
      newClaimPk: string;
      alg: "ed25519" | "ecdsa-p256";
      nonce: string;
      sig: string;
    })
  | (BaseEvent & {
      t: "ClaimReattested";
      pid: string;
      newDevice: string;
      newClaimPk: string;
      alg: "ed25519" | "ecdsa-p256";
      attestor: string;
      sig: string;
    })
  | (BaseEvent & { t: "ParticipantUnclaimed"; pid: string; deviceId: string })
  | (BaseEvent & { t: "ParticipantMerged"; from: string; into: string })
  | (BaseEvent & { t: "ParticipantsMarkedDistinct"; a: string; b: string })
  | (BaseEvent & { t: "ParticipantDeactivated"; pid: string })
  | (BaseEvent & {
      t: "ExpenseAdded";
      xid: string;
      financials: Financials;
      desc: string;
      at: number;
      date: string;
    })
  | (BaseEvent & {
      t: "ExpenseEdited";
      xid: string;
      financials?: Financials;
      meta?: { desc?: string; date?: string };
    })
  | (BaseEvent & { t: "ExpenseVoided"; xid: string })
  | (BaseEvent & { t: "SettlementRecorded"; sid: string; from: string; to: string; minor: Money })
  | (BaseEvent & { t: "SettlementConfirmed"; sid: string; pid: string; claimSig: string })
  | (BaseEvent & { t: "SettlementDisputed"; sid: string; note?: string })
  | (BaseEvent & { t: "SettlementVoided"; sid: string })
  | (BaseEvent & { t: "GroupArchived"; outstanding: { from: string; to: string; minor: Money }[] })
  | (BaseEvent & { t: "GroupUnarchived" })
  | (BaseEvent & { t: "EventVoided"; targetId: string });

export interface ParticipantState {
  pid: string;
  canonicalPid: string;
  name: string;
  devices: string[];
  deactivated: boolean;
}

export interface ExpenseState {
  xid: string;
  financials: Financials;
  desc: string;
  date: string;
  financialHistory: Financials[];
}

export interface SettlementState {
  sid: string;
  from: string;
  to: string;
  minor: Money;
  confirmed: boolean;
  disputed: boolean;
  pending: boolean;
}

export interface Anomaly {
  code: string;
  pid?: string;
  sid?: string;
  eventId?: string;
  relatedEventId?: string;
  message: string;
}

export interface State {
  participants: Map<string, ParticipantState>;
  expenses: Map<string, ExpenseState>;
  settlements: Map<string, SettlementState>;
  balances: Map<string, Money>;
  anomalies: Anomaly[];
  quarantined: string[];
  frozen: boolean;
}

export interface FoldOptions {
  supportedVersion: number;
}

export interface SignatureInput {
  payload: string;
  signature: string;
  publicKey: string;
  alg: "ed25519" | "ecdsa-p256";
}

export interface VerificationContext {
  groupTag: string;
  verifySignature(input: SignatureInput): boolean;
}

export const compareHlc = (a: HLC, b: HLC): number =>
  a.wall - b.wall || a.ctr - b.ctr || a.dev.localeCompare(b.dev);

export const eventSortKey = (a: Event, b: Event): number =>
  compareHlc(a.hlc, b.hlc) || a.id.localeCompare(b.id);
