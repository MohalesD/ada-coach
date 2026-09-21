// Parses the "default" key out of a JSON-encoded key-map env var
// (SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS). Pure — takes the raw
// value the caller already read, never touches Deno.env itself, so this is
// testable under Vitest with zero Deno APIs.
export function extractDefaultKey(
  rawValue: string | undefined,
  envVarName: string,
): string {
  if (!rawValue) {
    throw new Error(`Missing env: ${envVarName}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error(`Invalid JSON in env: ${envVarName}`);
  }

  const value =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)["default"]
      : undefined;

  if (typeof value !== "string" || !value) {
    throw new Error(`Missing "default" entry in env: ${envVarName}`);
  }

  return value;
}
