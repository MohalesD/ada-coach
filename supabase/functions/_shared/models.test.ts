// Model routing guard tests (PRD Run 1, DevOps task):
// routing is config-driven and no route may point at Fable 5 or any
// Mythos-tier model.

import { describe, expect, it } from "vitest";
import {
  assertAllowedModel,
  DEFAULT_MODEL_ROUTES,
  resolveModelRoutes,
} from "./models.ts";
import { computeCostUsd } from "./usage.ts";

describe("resolveModelRoutes", () => {
  it("returns the Haiku/Sonnet defaults when no setting exists", () => {
    expect(resolveModelRoutes(null)).toEqual(DEFAULT_MODEL_ROUTES);
    expect(resolveModelRoutes(undefined)).toEqual(DEFAULT_MODEL_ROUTES);
  });

  it("merges a partial config over the defaults", () => {
    const routes = resolveModelRoutes(
      '{"assumption_mapping":"claude-sonnet-5"}',
    );
    expect(routes.assumption_mapping).toBe("claude-sonnet-5");
    expect(routes.stage_classification).toBe("claude-haiku-4-5");
    expect(routes.session_summary).toBe("claude-haiku-4-5");
  });

  it("falls back to defaults on malformed JSON", () => {
    expect(resolveModelRoutes("{not json")).toEqual(DEFAULT_MODEL_ROUTES);
  });

  it("refuses a config that routes to a Mythos-tier model", () => {
    expect(() =>
      resolveModelRoutes('{"session_summary":"claude-fable-5"}'),
    ).toThrow(/build-time only/);
    expect(() =>
      resolveModelRoutes('{"assumption_mapping":"claude-mythos-5"}'),
    ).toThrow(/build-time only/);
  });
});

describe("assertAllowedModel", () => {
  it("allows the production tiers", () => {
    expect(assertAllowedModel("claude-haiku-4-5")).toBe("claude-haiku-4-5");
    expect(assertAllowedModel("claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
  });

  it("blocks Fable/Mythos in any casing or variant", () => {
    for (const model of [
      "claude-fable-5",
      "claude-mythos-5",
      "claude-mythos-preview",
      "CLAUDE-FABLE-5",
      "anthropic.claude-fable-5",
    ]) {
      expect(() => assertAllowedModel(model)).toThrow();
    }
  });
});

describe("computeCostUsd", () => {
  it("prices Haiku at $1/$5 per MTok", () => {
    // 1M input + 1M output = $6
    expect(computeCostUsd("claude-haiku-4-5", 1_000_000, 1_000_000)).toBe(6);
    expect(computeCostUsd("claude-haiku-4-5", 500, 200)).toBeCloseTo(0.0015, 6);
  });

  it("prices Sonnet 4.6 at $3/$15 per MTok", () => {
    expect(computeCostUsd("claude-sonnet-4-6", 1_000_000, 1_000_000)).toBe(18);
  });

  it("returns null for unknown models or missing usage", () => {
    expect(computeCostUsd("some-other-model", 100, 100)).toBeNull();
    expect(computeCostUsd("claude-haiku-4-5", null, null)).toBeNull();
  });

  it("adds web search cost at $10 per 1,000 searches", () => {
    // 3 searches = $0.03 on top of token cost
    expect(
      computeCostUsd("claude-sonnet-4-6", 1_000_000, 1_000_000, 3),
    ).toBeCloseTo(18.03, 6);
    // Search-only cost still records even when the model is unknown
    expect(computeCostUsd("some-other-model", null, null, 2)).toBeCloseTo(
      0.02,
      6,
    );
    // Zero searches changes nothing
    expect(computeCostUsd("claude-haiku-4-5", null, null, 0)).toBeNull();
  });
});

describe("Run 2 routing defaults", () => {
  it("routes all three new call types to Sonnet 4.6 by default", () => {
    const routes = resolveModelRoutes(null);
    expect(routes.market_grounding).toBe("claude-sonnet-4-6");
    expect(routes.blind_spot_analysis).toBe("claude-sonnet-4-6");
    expect(routes.interview_guide).toBe("claude-sonnet-4-6");
  });

  it("refuses a Mythos-tier route on the new call types too", () => {
    expect(() =>
      resolveModelRoutes('{"market_grounding":"claude-fable-5"}'),
    ).toThrow(/build-time only/);
    expect(() =>
      resolveModelRoutes('{"interview_guide":"claude-mythos-5"}'),
    ).toThrow(/build-time only/);
  });
});
