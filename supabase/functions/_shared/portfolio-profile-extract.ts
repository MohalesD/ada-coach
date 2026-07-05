// Haiku resume-field extraction (Run 4, PRD Technical Flow step 2 /
// addendum endpoint 3). Runs on the ALREADY-REDACTED resume text and
// condenses it into a structured digest — role history, skills, years
// of experience, notable projects — that becomes what portfolio_profiles
// stores as `resume_text`. Grounds every later coaching call without
// carrying the full raw resume forward.

import { callClaude, extractFirstJson } from "./anthropic.ts";

const EXTRACT_SYSTEM = `You are Ada, an AI product coach helping an aspiring PM build a portfolio. Extract a clean, structured digest from their resume text below — this digest grounds every later coaching step, so keep it factual and specific. Never invent experience that isn't there.

Respond with ONLY a JSON object, no prose, in exactly this shape:
{"role_history": ["..."], "skills": ["..."], "years_experience": <number or null>, "notable_projects": ["..."], "summary": "<2-3 sentence plain-language summary>"}

If the resume text is too thin to extract real fields, return empty arrays and a summary that says so plainly.`;

export interface ResumeDigest {
  roleHistory: string[];
  skills: string[];
  yearsExperience: number | null;
  notableProjects: string[];
  summary: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export async function extractResumeDigest(opts: {
  apiKey: string;
  model: string;
  redactedResumeText: string;
}): Promise<ResumeDigest> {
  const result = await callClaude({
    apiKey: opts.apiKey,
    model: opts.model,
    system: EXTRACT_SYSTEM,
    messages: [{ role: "user", content: opts.redactedResumeText }],
    maxTokens: 800,
  });

  const parsed = extractFirstJson(result.text) as {
    role_history?: unknown;
    skills?: unknown;
    years_experience?: unknown;
    notable_projects?: unknown;
    summary?: unknown;
  } | null;

  if (
    !parsed ||
    !isStringArray(parsed.role_history) ||
    !isStringArray(parsed.skills) ||
    !isStringArray(parsed.notable_projects) ||
    (parsed.years_experience !== null &&
      typeof parsed.years_experience !== "number") ||
    typeof parsed.summary !== "string" ||
    !parsed.summary.trim()
  ) {
    console.error("resume digest malformed output:", result.text);
    throw new Error("Resume digest extraction returned malformed output");
  }

  return {
    roleHistory: parsed.role_history.slice(0, 20),
    skills: parsed.skills.slice(0, 30),
    yearsExperience: parsed.years_experience,
    notableProjects: parsed.notable_projects.slice(0, 10),
    summary: parsed.summary.trim().slice(0, 1000),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

// One canonical rendering of the digest into the plain text stored as
// portfolio_profiles.resume_text and fed into later Sonnet prompts, so
// storage and prompts never drift apart.
export function formatResumeDigest(d: ResumeDigest): string {
  const parts: string[] = [d.summary];
  if (d.roleHistory.length) {
    parts.push(`Role history: ${d.roleHistory.join("; ")}`);
  }
  if (d.skills.length) {
    parts.push(`Skills: ${d.skills.join(", ")}`);
  }
  if (d.yearsExperience !== null) {
    parts.push(`Years of experience: ${d.yearsExperience}`);
  }
  if (d.notableProjects.length) {
    parts.push(`Notable projects: ${d.notableProjects.join("; ")}`);
  }
  return parts.join("\n");
}
