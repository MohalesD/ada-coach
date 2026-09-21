// Tests for extractDefaultKey — parses a JSON-encoded env var (e.g.
// SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS) and pulls out the
// "default" entry, with error messages that name the offending env var.
//
// Follows _shared/redact.test.ts and _shared/feedback-reply-email.test.ts in
// unit-testing a Deno-free Edge module directly under Vitest.

import { describe, expect, it } from "vitest";
import { extractDefaultKey } from "./keys.ts";

describe("extractDefaultKey — happy path", () => {
  it("returns the string at the 'default' key", () => {
    const raw = JSON.stringify({ default: "sb_secret_abc123" });
    expect(extractDefaultKey(raw, "SUPABASE_SECRET_KEYS")).toBe("sb_secret_abc123");
  });
});

describe("extractDefaultKey — missing env var", () => {
  it("throws 'Missing env: <name>' when rawValue is undefined", () => {
    expect(() => extractDefaultKey(undefined, "SUPABASE_SECRET_KEYS")).toThrow(
      "Missing env: SUPABASE_SECRET_KEYS",
    );
  });

  it("throws 'Missing env: <name>' when rawValue is an empty string", () => {
    expect(() => extractDefaultKey("", "SUPABASE_SECRET_KEYS")).toThrow(
      "Missing env: SUPABASE_SECRET_KEYS",
    );
  });
});

describe("extractDefaultKey — invalid JSON", () => {
  it("throws 'Invalid JSON in env: <name>' for malformed JSON", () => {
    expect(() => extractDefaultKey("{not valid json", "SUPABASE_SECRET_KEYS")).toThrow(
      "Invalid JSON in env: SUPABASE_SECRET_KEYS",
    );
  });
});

describe("extractDefaultKey — missing or invalid 'default' entry", () => {
  it("throws when valid JSON has no 'default' key at all", () => {
    expect(() => extractDefaultKey('{"other":"x"}', "SUPABASE_SECRET_KEYS")).toThrow(
      'Missing "default" entry in env: SUPABASE_SECRET_KEYS',
    );
  });

  it("throws when 'default' is present but a number, not a string", () => {
    expect(() => extractDefaultKey('{"default":123}', "SUPABASE_SECRET_KEYS")).toThrow(
      'Missing "default" entry in env: SUPABASE_SECRET_KEYS',
    );
  });

  it("throws when 'default' is present but null", () => {
    expect(() => extractDefaultKey('{"default":null}', "SUPABASE_SECRET_KEYS")).toThrow(
      'Missing "default" entry in env: SUPABASE_SECRET_KEYS',
    );
  });

  it("throws when 'default' is an empty string", () => {
    expect(() => extractDefaultKey('{"default":""}', "SUPABASE_SECRET_KEYS")).toThrow(
      'Missing "default" entry in env: SUPABASE_SECRET_KEYS',
    );
  });

  it("throws (not crashes) when the parsed JSON is an array, not an object", () => {
    expect(() => extractDefaultKey("[1,2,3]", "SUPABASE_SECRET_KEYS")).toThrow(
      'Missing "default" entry in env: SUPABASE_SECRET_KEYS',
    );
  });

  it("throws (not crashes) when the parsed JSON is a bare string, not an object", () => {
    expect(() => extractDefaultKey('"just a string"', "SUPABASE_SECRET_KEYS")).toThrow(
      'Missing "default" entry in env: SUPABASE_SECRET_KEYS',
    );
  });
});

describe("extractDefaultKey — envVarName is parameterized, not hardcoded", () => {
  it("uses each call's own envVarName in the thrown message", () => {
    expect(() => extractDefaultKey(undefined, "SUPABASE_SECRET_KEYS")).toThrow(
      "Missing env: SUPABASE_SECRET_KEYS",
    );
    expect(() => extractDefaultKey(undefined, "SUPABASE_PUBLISHABLE_KEYS")).toThrow(
      "Missing env: SUPABASE_PUBLISHABLE_KEYS",
    );
  });

  it("carries a different envVarName through the 'Missing default entry' message too", () => {
    expect(() => extractDefaultKey('{"other":"x"}', "SUPABASE_SECRET_KEYS")).toThrow(
      'Missing "default" entry in env: SUPABASE_SECRET_KEYS',
    );
    expect(() => extractDefaultKey('{"other":"x"}', "SUPABASE_PUBLISHABLE_KEYS")).toThrow(
      'Missing "default" entry in env: SUPABASE_PUBLISHABLE_KEYS',
    );
  });
});
