// Redaction pass acceptance tests (PRD Run 1, Backend):
// "a test pasting a sample transcript with names and emails confirms no
//  PII reaches the embedding call; ambiguous tokens are flagged to the PM,
//  not silently dropped."
//
// The ingest function embeds exactly chunkText(redactPII(pasted).redactedText),
// so the pipeline test below exercises the same text path the embedding
// call receives.

import { describe, expect, it } from "vitest";
import { redactPII } from "./redact.ts";
import { chunkText } from "./ingest-core.ts";

const SAMPLE_TRANSCRIPT = `Interview notes — checkout research, June 2026.

Interviewer: Thanks for making time. Can you introduce yourself?
Sarah: Sure — my name is Sarah Chen, I run ops at a mid-size retailer.
Interviewer: Walk me through the last time you abandoned a cart.
Sarah: Last Tuesday. The shipping calculator failed twice, so I emailed
support at sarah.chen@example.com and also cc'd help@retailco.example.org.
Note: she followed up twice before anyone replied.
Dr. Patel joined late and mostly observed. Sarah said Acme Corp has the
same problem with their vendor portal.`;

describe("redactPII — emails", () => {
  it("strips every email address", () => {
    const { redactedText } = redactPII(SAMPLE_TRANSCRIPT);
    expect(redactedText).not.toMatch(/@/);
    expect(redactedText).not.toContain("sarah.chen@example.com");
    expect(redactedText).not.toContain("help@retailco.example.org");
    expect(redactedText).toContain("[EMAIL_1]");
    expect(redactedText).toContain("[EMAIL_2]");
  });

  it("reuses one placeholder for a repeated address", () => {
    const { redactedText, redactions } = redactPII(
      "Mail a@b.co today. Then mail a@b.co again.",
    );
    expect(redactedText).toBe("Mail [EMAIL_1] today. Then mail [EMAIL_1] again.");
    expect(redactions.filter((r) => r.type === "email")).toHaveLength(1);
  });
});

describe("redactPII — name patterns", () => {
  it("strips honorific names", () => {
    const { redactedText } = redactPII(SAMPLE_TRANSCRIPT);
    expect(redactedText).not.toContain("Patel");
  });

  it("strips self-introductions", () => {
    const { redactedText } = redactPII("Hello, my name is Jordan Rivera.");
    expect(redactedText).not.toContain("Jordan");
    expect(redactedText).not.toContain("Rivera");
  });

  it("strips speaker labels AND later bare mentions of the same name", () => {
    const { redactedText } = redactPII(SAMPLE_TRANSCRIPT);
    expect(redactedText).not.toMatch(/\bSarah\b/);
    expect(redactedText).not.toMatch(/\bChen\b/);
  });

  it("leaves role-based speaker labels alone", () => {
    const { redactedText } = redactPII(SAMPLE_TRANSCRIPT);
    expect(redactedText).toContain("Interviewer:");
    expect(redactedText).toContain("Note:");
  });
});

describe("redactPII — ambiguous tokens are flagged, not dropped", () => {
  it("flags a capitalized bigram it cannot confidently classify", () => {
    const { redactedText, flagged } = redactPII(SAMPLE_TRANSCRIPT);
    const tokens = flagged.map((f) => f.token);
    expect(tokens).toContain("Acme Corp");
    // Flagged means surfaced to the PM — the text itself is untouched.
    expect(redactedText).toContain("Acme Corp");
  });

  it("provides surrounding context for each flag", () => {
    const { flagged } = redactPII(SAMPLE_TRANSCRIPT);
    const acme = flagged.find((f) => f.token === "Acme Corp");
    expect(acme).toBeDefined();
    expect(acme!.context.length).toBeGreaterThan("Acme Corp".length);
  });

  it("does not flag ordinary prose bigrams", () => {
    const { flagged } = redactPII(
      "The Market is big. Our Product helps. This Approach works.",
    );
    expect(flagged).toHaveLength(0);
  });
});

describe("pipeline — no PII reaches the embedding input", () => {
  it("chunks of the redacted transcript contain no known PII", () => {
    const { redactedText } = redactPII(SAMPLE_TRANSCRIPT);
    // Same call chain ingest uses before the embedding request.
    const chunks = chunkText(redactedText);
    expect(chunks.length).toBeGreaterThan(0);

    const pii = [
      "sarah.chen@example.com",
      "help@retailco.example.org",
      "Sarah",
      "Chen",
      "Patel",
    ];
    for (const chunk of chunks) {
      for (const secret of pii) {
        expect(chunk).not.toContain(secret);
      }
    }
  });
});
