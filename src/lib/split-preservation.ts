import { formatMinorInput, formatPercentageInput, type SplitMode } from "./money";

export interface SplitPreview {
  shares: { pid: string; minor: bigint }[];
}

export interface PreservedSplitInputs {
  exactShares: Record<string, string>;
  shareWeights: Record<string, string>;
  percentages: Record<string, string>;
}

export function preserveSplitInputs(input: {
  fromMode: SplitMode;
  toMode: SplitMode;
  preview: SplitPreview;
  selectedPids: string[];
  total: bigint;
}): PreservedSplitInputs {
  const previewByPid = new Map(input.preview.shares.map((share) => [share.pid, share.minor]));
  const shareFor = (pid: string): bigint => previewByPid.get(pid) ?? 0n;

  return {
    exactShares: Object.fromEntries(input.selectedPids.map((pid) => [pid, formatMinorInput(shareFor(pid))])),
    shareWeights: Object.fromEntries(
      input.selectedPids.map((pid) => [pid, input.fromMode === "equal" && input.toMode === "shares" ? "1" : shareFor(pid) > 0n ? shareFor(pid).toString() : "0"]),
    ),
    percentages: Object.fromEntries(input.selectedPids.map((pid) => [pid, formatPercentageInput(shareFor(pid), input.total)])),
  };
}
