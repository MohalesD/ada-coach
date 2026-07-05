// Product memory formatting tests (Run 2, "session ten builds on session
// one" story): the bundle prepended to the Sonnet coaching calls.

import { describe, expect, it } from "vitest";
import { formatProductMemory } from "./product-memory.ts";

describe("formatProductMemory", () => {
  it("returns empty string when there is no history", () => {
    expect(formatProductMemory([], [])).toBe("");
  });

  it("groups the ledger by status and lists summaries most recent first", () => {
    const out = formatProductMemory(
      ["Second sprint summary", "First sprint summary"],
      [
        { statement: "PMs will pay $20/mo", status: "challenged" },
        { statement: "PMs struggle with discovery", status: "validated" },
        { statement: "Enterprise is the wedge", status: "abandoned" },
      ],
    );
    expect(out).toContain("PRODUCT MEMORY");
    expect(out).toContain("VALIDATED:\n- PMs struggle with discovery");
    expect(out).toContain("CHALLENGED:\n- PMs will pay $20/mo");
    expect(out).toContain("ABANDONED:\n- Enterprise is the wedge");
    expect(out.indexOf("[1] Second sprint summary")).toBeGreaterThan(-1);
    expect(out.indexOf("[1] Second sprint summary")).toBeLessThan(
      out.indexOf("[2] First sprint summary"),
    );
  });

  it("caps summaries at three and truncates very long ones", () => {
    const long = "x".repeat(2000);
    const out = formatProductMemory([long, "b", "c", "d"], []);
    expect(out).not.toContain("[4]");
    expect(out).toContain("…");
    expect(out.length).toBeLessThan(2100 + 200); // clipped + scaffolding
  });

  it("omits empty ledger statuses entirely", () => {
    const out = formatProductMemory(
      [],
      [{ statement: "Only one", status: "validated" }],
    );
    expect(out).toContain("VALIDATED:");
    expect(out).not.toContain("CHALLENGED:");
    expect(out).not.toContain("ABANDONED:");
  });
});
