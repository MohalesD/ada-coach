// Run 5 intel budget tests: the config-driven search cap must provably
// hold across every allocation shape — a single market research call, an
// identification call, and a multi-competitor profiling run.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_INTEL_SEARCH_BUDGET,
  honestConfidence,
  identifySearchBudget,
  parseIntelSearchBudget,
  perCompetitorSearchBudget,
} from "./intel-config.ts";

describe("parseIntelSearchBudget", () => {
  it("parses a valid setting", () => {
    expect(parseIntelSearchBudget("15")).toBe(15);
    expect(parseIntelSearchBudget(" 3 ")).toBe(3);
    expect(parseIntelSearchBudget("1")).toBe(1);
  });

  it("falls back to the default on missing or malformed values", () => {
    expect(parseIntelSearchBudget(null)).toBe(DEFAULT_INTEL_SEARCH_BUDGET);
    expect(parseIntelSearchBudget(undefined)).toBe(DEFAULT_INTEL_SEARCH_BUDGET);
    expect(parseIntelSearchBudget("")).toBe(DEFAULT_INTEL_SEARCH_BUDGET);
    expect(parseIntelSearchBudget("0")).toBe(DEFAULT_INTEL_SEARCH_BUDGET);
    expect(parseIntelSearchBudget("-4")).toBe(DEFAULT_INTEL_SEARCH_BUDGET);
    expect(parseIntelSearchBudget("lots")).toBe(DEFAULT_INTEL_SEARCH_BUDGET);
    expect(parseIntelSearchBudget("1.5")).toBe(DEFAULT_INTEL_SEARCH_BUDGET);
  });
});

describe("identifySearchBudget", () => {
  it("caps identification at 5 searches", () => {
    expect(identifySearchBudget(15)).toBe(5);
    expect(identifySearchBudget(100)).toBe(5);
  });

  it("never exceeds a smaller total budget", () => {
    expect(identifySearchBudget(3)).toBe(3);
    expect(identifySearchBudget(1)).toBe(1);
  });
});

describe("perCompetitorSearchBudget — the cap must hold across the run", () => {
  it("divides the budget across confirmed competitors", () => {
    expect(perCompetitorSearchBudget(15, 3)).toBe(5);
    expect(perCompetitorSearchBudget(15, 4)).toBe(3);
    expect(perCompetitorSearchBudget(15, 15)).toBe(1);
    expect(perCompetitorSearchBudget(2, 2)).toBe(1);
  });

  it("count × per-competitor never exceeds the budget (the invariant)", () => {
    for (const budget of [1, 2, 3, 5, 15, 40]) {
      for (let count = 1; count <= budget; count++) {
        expect(perCompetitorSearchBudget(budget, count) * count)
          .toBeLessThanOrEqual(budget);
        expect(perCompetitorSearchBudget(budget, count))
          .toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("returns 0 when the budget cannot cover the competitors (the gate rejects this case)", () => {
    expect(perCompetitorSearchBudget(2, 3)).toBe(0);
    expect(perCompetitorSearchBudget(15, 16)).toBe(0);
    expect(perCompetitorSearchBudget(15, 0)).toBe(0);
  });
});

describe("honestConfidence — the label never exceeds what citations support", () => {
  it("forces 'none' when nothing grounded survives", () => {
    expect(honestConfidence("strong", 0)).toBe("none");
    expect(honestConfidence("none", 0)).toBe("none");
  });

  it("caps thin evidence at 'thin' and modest evidence at 'moderate'", () => {
    expect(honestConfidence("strong", 1)).toBe("thin");
    expect(honestConfidence("strong", 2)).toBe("thin");
    expect(honestConfidence("strong", 3)).toBe("moderate");
    expect(honestConfidence("strong", 5)).toBe("moderate");
    expect(honestConfidence("strong", 6)).toBe("strong");
  });

  it("never raises the model's own claim", () => {
    expect(honestConfidence("thin", 10)).toBe("thin");
    expect(honestConfidence("moderate", 10)).toBe("moderate");
    expect(honestConfidence("none", 10)).toBe("none");
  });
});
