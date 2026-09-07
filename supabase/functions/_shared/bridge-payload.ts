// Bridge request body validation (Spec 4 §7 step 4) and the daily-cap window.
// Pure: no Deno or Supabase imports, so Vitest can run it. Manual validation
// matches every other Edge Function in this repo (no Zod in the Deno side).

export const BRIEF_MAX = 50_000; // Ada's intake limit; Builder Journal cuts at 40k
export const TITLE_MAX = 200;
export const TAG_MAX = 40;
export const TAGS_MAX = 20;
export const DISPLAY_NAME_MAX = 100;
export const DAILY_HANDOFF_CAP = 20;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Deliberately loose: Supabase Auth is the authority on what it accepts.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https:\/\/\S+$/;

export type LinkMode = "permanent" | "session";

export interface HandoffBody {
  action: "handoff";
  bj_user_id: string;
  email: string;
  display_name: string | null;
  link_mode: LinkMode;
  idea: {
    id: string;
    title: string;
    brief: string;
    tags: string[];
    status: string | null;
    captured_at: string | null;
    url: string | null;
  };
}

export interface UnlinkBody {
  action: "unlink";
  bj_user_id: string;
}

export type BridgeBody = HandoffBody | UnlinkBody;

export type ParseResult =
  | { ok: true; body: BridgeBody }
  | { ok: false; errors: string[] };

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseBridgeBody(raw: unknown): ParseResult {
  const errors: string[] = [];
  if (!isRecord(raw)) return { ok: false, errors: ["body must be a JSON object"] };

  const action = str(raw.action);
  const bjUserId = str(raw.bj_user_id);
  if (!bjUserId || !UUID_RE.test(bjUserId)) errors.push("bj_user_id must be a uuid");

  if (action === "unlink") {
    if (errors.length) return { ok: false, errors };
    return { ok: true, body: { action: "unlink", bj_user_id: bjUserId! } };
  }
  if (action !== "handoff") {
    errors.push("action must be 'handoff' or 'unlink'");
    return { ok: false, errors };
  }

  const email = str(raw.email)?.trim().toLowerCase() ?? null;
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    errors.push("email must be a valid address");
  }

  const displayNameRaw = str(raw.display_name)?.trim() ?? "";
  const displayName = displayNameRaw ? displayNameRaw.slice(0, DISPLAY_NAME_MAX) : null;

  const linkMode = str(raw.link_mode);
  if (linkMode !== "permanent" && linkMode !== "session") {
    errors.push("link_mode must be 'permanent' or 'session'");
  }

  const idea = isRecord(raw.idea) ? raw.idea : null;
  if (!idea) {
    errors.push("idea is required");
    return { ok: false, errors };
  }
  const ideaId = str(idea.id);
  if (!ideaId || !UUID_RE.test(ideaId)) errors.push("idea.id must be a uuid");

  const title = str(idea.title)?.trim() ?? "";
  if (!title) errors.push("idea.title is required");
  else if (title.length > TITLE_MAX) errors.push(`idea.title must be at most ${TITLE_MAX} characters`);

  const brief = str(idea.brief)?.trim() ?? "";
  if (!brief) errors.push("idea.brief is required");
  else if (brief.length > BRIEF_MAX) errors.push(`idea.brief must be at most ${BRIEF_MAX} characters`);

  let tags: string[] = [];
  if (idea.tags !== undefined) {
    if (!Array.isArray(idea.tags) || idea.tags.some((t) => typeof t !== "string")) {
      errors.push("idea.tags must be an array of strings");
    } else {
      tags = (idea.tags as string[])
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, TAGS_MAX)
        .map((t) => t.slice(0, TAG_MAX));
    }
  }

  const status = str(idea.status)?.trim().slice(0, 40) || null;
  const capturedAt = str(idea.captured_at)?.trim().slice(0, 40) || null;
  const url = str(idea.url)?.trim() ?? null;
  if (url && (!URL_RE.test(url) || url.length > 500)) errors.push("idea.url must be an https URL");

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    body: {
      action: "handoff",
      bj_user_id: bjUserId!,
      email: email!,
      display_name: displayName,
      link_mode: linkMode as LinkMode,
      idea: {
        id: ideaId!,
        title,
        brief,
        tags,
        status,
        captured_at: capturedAt,
        url: url || null,
      },
    },
  };
}

// Start of the current UTC day, as an ISO string, for the per-user daily cap.
export function utcDayStart(now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}
