// PII redaction for pasted grounding text (Run 1, PRD Backend task).
// Strips email addresses and confidently-identified name patterns before
// text enters the grounding context; ambiguous name-like tokens are flagged
// to the PM, never silently dropped or silently passed through.
//
// Pure TypeScript on purpose: no Deno APIs, no network — the Vitest suite
// imports this file directly to prove no PII survives to the embedding call.

export interface RedactionEvent {
  type: "email" | "name";
  placeholder: string;
}

export interface FlaggedToken {
  token: string;
  context: string;
}

export interface RedactionResult {
  redactedText: string;
  redactions: RedactionEvent[];
  flagged: FlaggedToken[];
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// "Dr. Patel", "Ms Rivera", "Mr. James Lee"
const HONORIFIC_NAME_RE =
  /\b(?:Mr|Mrs|Ms|Mx|Dr|Prof)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g;

// "my name is Sarah Chen" / "my name's Sarah"
const MY_NAME_IS_RE = /\bmy name(?:'s| is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi;

// Interview-transcript speaker labels at line start: "Sarah:", "James Lee:".
const SPEAKER_LABEL_RE = /^[ \t]*([A-Z][a-z]+(?: [A-Z][a-z]+)?):(?=\s)/gm;

// Speaker labels that are roles or prose markers, not personal names.
const SPEAKER_STOPLIST = new Set([
  "Interviewer",
  "Interviewee",
  "Moderator",
  "Facilitator",
  "Participant",
  "Note",
  "Notes",
  "Warning",
  "Question",
  "Answer",
  "Summary",
  "Background",
  "Context",
  "Takeaway",
  "Q",
  "A",
]);

// First words that make a capitalized bigram read as ordinary prose rather
// than a personal name ("The Market", "Our Product", "New York" …).
const BIGRAM_FIRST_WORD_STOPLIST = new Set([
  "The", "This", "That", "These", "Those", "There", "Then", "They",
  "When", "Where", "What", "Why", "How", "Who", "Which",
  "And", "But", "For", "With", "From", "Into", "After", "Before",
  "Our", "Your", "Their", "His", "Her", "Its", "My",
  "If", "In", "On", "At", "By", "As", "An", "A", "Is", "Are", "To", "Of",
  "We", "I", "It", "So", "Not", "New", "Every", "Each", "Most", "Some",
]);

const MAX_FLAGS = 20;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Strip emails and confidently-identified names; flag ambiguous
// capitalized bigrams that survive redaction.
export function redactPII(text: string): RedactionResult {
  const redactions: RedactionEvent[] = [];
  let out = text;

  // 1. Emails — always stripped. Repeats of the same address share one
  //    placeholder so the redacted text stays readable.
  const emailPlaceholders = new Map<string, string>();
  out = out.replace(EMAIL_RE, (match) => {
    const key = match.toLowerCase();
    let placeholder = emailPlaceholders.get(key);
    if (!placeholder) {
      placeholder = `[EMAIL_${emailPlaceholders.size + 1}]`;
      emailPlaceholders.set(key, placeholder);
      redactions.push({ type: "email", placeholder });
    }
    return placeholder;
  });

  // 2. Collect confidently-identified names from high-precision patterns.
  const confirmedNames = new Set<string>();

  for (const m of out.matchAll(HONORIFIC_NAME_RE)) confirmedNames.add(m[1]);
  for (const m of out.matchAll(MY_NAME_IS_RE)) confirmedNames.add(m[1]);
  for (const m of out.matchAll(SPEAKER_LABEL_RE)) {
    if (!SPEAKER_STOPLIST.has(m[1])) confirmedNames.add(m[1]);
  }

  // 3. Strip every capitalized occurrence of each confirmed name — full
  //    form first, then its individual words — so "Sarah Chen", "Sarah:",
  //    and a later bare "Chen" all disappear.
  const nameWords = new Set<string>();
  for (const name of confirmedNames) {
    for (const word of name.split(/\s+/)) {
      if (word.length >= 3) nameWords.add(word);
    }
  }

  const namePlaceholders = new Map<string, string>();
  const placeholderFor = (name: string): string => {
    const key = name.toLowerCase();
    let placeholder = namePlaceholders.get(key);
    if (!placeholder) {
      placeholder = `[NAME_${namePlaceholders.size + 1}]`;
      namePlaceholders.set(key, placeholder);
      redactions.push({ type: "name", placeholder });
    }
    return placeholder;
  };

  const fullNamesLongestFirst = [...confirmedNames].sort(
    (a, b) => b.length - a.length,
  );
  for (const name of fullNamesLongestFirst) {
    out = out.replace(
      new RegExp(`\\b${escapeRegExp(name)}\\b`, "g"),
      placeholderFor(name),
    );
  }
  for (const word of nameWords) {
    out = out.replace(
      new RegExp(`\\b${escapeRegExp(word)}\\b`, "g"),
      placeholderFor(word),
    );
  }

  // 4. Flag ambiguous name-like tokens that remain: capitalized bigrams
  //    that don't read as ordinary prose. Flagged text stays in place —
  //    the caller surfaces the list to the PM for review.
  const flagged: FlaggedToken[] = [];
  const seenFlags = new Set<string>();
  for (const m of out.matchAll(/\b([A-Z][a-z]+) ([A-Z][a-z]+)\b/g)) {
    if (flagged.length >= MAX_FLAGS) break;
    const token = `${m[1]} ${m[2]}`;
    if (BIGRAM_FIRST_WORD_STOPLIST.has(m[1])) continue;
    if (seenFlags.has(token)) continue;
    seenFlags.add(token);
    const start = Math.max(0, (m.index ?? 0) - 30);
    const end = Math.min(out.length, (m.index ?? 0) + token.length + 30);
    flagged.push({ token, context: out.slice(start, end).trim() });
  }

  return { redactedText: out, redactions, flagged };
}
