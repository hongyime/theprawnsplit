import { allocate, type Financials } from "@theprawnsplit/core";

function rescaleRows(
  rows: { pid: string; minor: bigint }[],
  total: bigint,
  eventId: string,
): { pid: string; minor: bigint }[] {
  const pids = rows.map((row) => row.pid);
  const weights = rows.map((row) => row.minor);
  return allocate(total, weights, eventId, pids).map((minor, index) => ({ pid: pids[index]!, minor }));
}

export function editFinancialsForTotal(input: {
  current: Financials;
  nextMinor: bigint;
  eventId: string;
}): Financials {
  return {
    minor: input.nextMinor,
    payers: rescaleRows(input.current.payers, input.nextMinor, `${input.eventId}:payers`),
    shares: rescaleRows(input.current.shares, input.nextMinor, `${input.eventId}:shares`),
    ...(input.current.rate ? { rate: input.current.rate } : {}),
  };
}
