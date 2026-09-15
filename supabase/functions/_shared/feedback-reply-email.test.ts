// Tests for the admin reply email builder (Spec 2 / DEU-90).
//
// What matters here: admin-typed text reaches a user's inbox, so escaping is
// a security property, not a formatting nicety; and the paragraph handling
// is the difference between a readable reply and one run-on blob.
//
// Mirrors src/lib/feedback-reply.test.ts on the mailto side, and follows
// _shared/redact.test.ts in unit-testing a Deno-free Edge module under
// Vitest.

import { describe, expect, it } from "vitest";
import {
  REPLY_BODY_MAX,
  REPLY_SUBJECT,
  buildReplyEmail,
  escapeHtml,
  firstName,
  paragraphs,
  validateReplyBody,
} from "./feedback-reply-email.ts";
import { REPLY_SUBJECT as MAILTO_SUBJECT } from "../../../src/lib/feedback-reply.ts";

describe("firstName", () => {
  it("takes the first token of a display name", () => {
    expect(firstName("Mohales Deis")).toBe("Mohales");
  });

  it("falls back to 'there' for empty, blank, or missing names", () => {
    expect(firstName(null)).toBe("there");
    expect(firstName(undefined)).toBe("there");
    expect(firstName("   ")).toBe("there");
  });
});

describe("escapeHtml", () => {
  it("neutralises markup", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("escapes ampersands before anything else, so entities are not doubled", () => {
    expect(escapeHtml("Tom & Jerry <3")).toBe("Tom &amp; Jerry &lt;3");
  });
});

describe("paragraphs", () => {
  it("splits blank-line-separated blocks into separate paragraphs", () => {
    expect(paragraphs("One.\n\nTwo.")).toBe("<p>One.</p>\n<p>Two.</p>");
  });

  it("keeps single newlines as line breaks within a paragraph", () => {
    expect(paragraphs("Line one\nLine two")).toBe("<p>Line one<br>Line two</p>");
  });

  it("escapes the text it wraps", () => {
    expect(paragraphs("<b>hi</b>")).toBe("<p>&lt;b&gt;hi&lt;/b&gt;</p>");
  });

  it("drops empty blocks rather than emitting empty paragraphs", () => {
    expect(paragraphs("A.\n\n\n\n\nB.")).toBe("<p>A.</p>\n<p>B.</p>");
  });
});

describe("buildReplyEmail", () => {
  const base = {
    displayName: "Mohales Deis",
    originalComment: "The sidebar scroll jumps when I pin a chat.",
    replyBody: "Thanks for flagging this. Fixed in today's deploy.",
  };

  it("greets by first name and includes the admin's reply", () => {
    const { html } = buildReplyEmail(base);
    expect(html).toContain("<p>Hi Mohales,</p>");
    expect(html).toContain("<p>Thanks for flagging this. Fixed in today's deploy.</p>");
  });

  it("quotes the original feedback underneath", () => {
    const { html } = buildReplyEmail(base);
    expect(html).toContain("You wrote:");
    expect(html).toContain("The sidebar scroll jumps when I pin a chat.");
  });

  it("omits the quote block entirely when there is no comment", () => {
    const html = buildReplyEmail({ ...base, originalComment: null }).html;
    expect(html).not.toContain("You wrote:");
    expect(html).not.toContain("<blockquote");
  });

  it("treats a whitespace-only comment as no comment", () => {
    const html = buildReplyEmail({ ...base, originalComment: "  \n  " }).html;
    expect(html).not.toContain("You wrote:");
  });

  it("escapes markup in every field it interpolates", () => {
    const { html } = buildReplyEmail({
      displayName: "<img src=x onerror=alert(1)>",
      originalComment: "<script>bad()</script>",
      replyBody: "<b>not bold</b>",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>not bold</b>");
    expect(html).toContain("&lt;b&gt;not bold&lt;/b&gt;");
  });

  it("uses the shared subject", () => {
    expect(buildReplyEmail(base).subject).toBe(REPLY_SUBJECT);
  });

  // The in-app send and the mailto fallback have to land in the same mail
  // thread. They cannot share a module across the Deno/browser boundary, so
  // this test is what keeps the two copies honest.
  it("uses the same subject as the mailto fallback", () => {
    expect(REPLY_SUBJECT).toBe(MAILTO_SUBJECT);
  });
});

describe("validateReplyBody", () => {
  it("rejects a missing, non-string, or blank body", () => {
    expect(validateReplyBody(undefined)).toEqual({
      ok: false,
      error: "reply_body_required",
    });
    expect(validateReplyBody(42)).toEqual({ ok: false, error: "reply_body_required" });
    expect(validateReplyBody("   \n  ")).toEqual({
      ok: false,
      error: "reply_body_required",
    });
  });

  it("rejects a body past the cap the database also enforces", () => {
    expect(validateReplyBody("x".repeat(REPLY_BODY_MAX + 1))).toEqual({
      ok: false,
      error: "reply_body_too_long",
    });
  });

  it("accepts a body exactly at the cap", () => {
    const body = "x".repeat(REPLY_BODY_MAX);
    expect(validateReplyBody(body)).toEqual({ ok: true, body });
  });

  it("returns the trimmed body, so surrounding whitespace never reaches the DB", () => {
    expect(validateReplyBody("  hello  ")).toEqual({ ok: true, body: "hello" });
  });

  it("does not let trailing whitespace push a valid body over the cap", () => {
    const body = "x".repeat(REPLY_BODY_MAX);
    expect(validateReplyBody(`  ${body}  `)).toEqual({ ok: true, body });
  });
});
