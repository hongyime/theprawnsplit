import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function appSource(): string {
  return readFileSync(join(process.cwd(), "src", "App.svelte"), "utf8");
}

describe("settlement UI boundary", () => {
  it("keeps settlement records as visible ledger claims with gated append-only actions", () => {
    const source = appSource();
    const panel = source.match(/<article class="panel settlements">([\s\S]*?)<\/article>/)?.[1] ?? "";

    expect(source).toContain("$: suggestedSettlements = state ? greedySettlement(state.balances) : [];");
    expect(panel).toContain("recordSettlement(transfer.from, transfer.to, formatMinorInput(transfer.minor))");
    expect(panel).toContain("canRecordManualSettlement");
    expect(panel).toContain("settlementClaimView(group.events, settlement.sid)");
    expect(panel).toContain("{participantLabel(settlement.from)} paid {participantLabel(settlement.to)} {formatMinor(settlement.minor, group.currency)}");
    expect(panel).toContain('Dispute: {claims.dispute.note || "Payment disputed"}');
    expect(panel).toContain('settlement.disputed ? "disputed" : settlement.contestedConfirmation ? "contested" : settlement.confirmed ? "confirmed" : settlement.cashUnconfirmable ? "cash" : "pending"');
    expect(panel).toContain("canConfirmSettlement({");
    expect(panel).toContain("pending: settlement.pending");
    expect(panel).toContain("hasLocalPayeeIdentity: Boolean(localIdentityForPid(settlement.to))");
    expect(panel).toContain("payeeHasActiveClaimAnomaly: hasActiveClaimAnomaly(anomalies, settlement.to)");
    expect(panel).toContain('on:click={() => confirmSettlement(settlement.sid)}>Confirm');
    expect(panel).toContain("!settlement.disputed");
    expect(panel).toContain('on:click={() => disputeSettlement(settlement.sid)}>Dispute');
    expect(panel).toContain("canVoidRecordedSettlement(group.events, settlement.sid, group.deviceId)");
    expect(panel).toContain('on:click={() => voidSettlement(settlement.sid)}>Void');
    expect(panel).not.toMatch(/\b(?:Stripe|PayPal|Venmo|PaymentRequest|navigator\.payments|bankAccount|cardNumber)\b/i);
  });
});
