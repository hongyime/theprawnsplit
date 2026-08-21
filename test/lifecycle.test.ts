import { describe, expect, it } from "vitest";
import { archiveConfirmationText, unarchiveConfirmationText } from "@/lib/lifecycle";

describe("lifecycle copy", () => {
  it("names outstanding balances and states relay data is not deleted on archive", () => {
    const text = archiveConfirmationText(["Bob pays Alice USD 12.00"]);

    expect(text).toContain("Bob pays Alice USD 12.00");
    expect(text).toContain("ledger export will download");
    expect(text).toContain("does not delete relay data");
  });

  it("requires explicit unarchive confirmation copy", () => {
    expect(unarchiveConfirmationText()).toContain("Unarchive this trip?");
    expect(unarchiveConfirmationText()).toContain("editable again");
  });
});
