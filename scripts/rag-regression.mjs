// RAG regression runner (Run: retrieval debug + eval harness).
//
// Re-runs the 15 questions from docs/eval/20260502_ADA_EVAL_RAGEvalHarness_v0.1.md
// through both arms of the A/B design described there:
//   Arm A = RAG on  (live retrieval + context injection)
//   Arm B = RAG off (no injection — this is today's actual production behavior,
//                     since the chat function's retrieval block is disabled)
//
// This calls Anthropic directly (not the /chat Edge Function) so the 30
// diagnostic exchanges never get persisted as real conversations/messages
// or decrement anyone's credits. The retrieval side (embed + query +
// injection template) mirrors the disabled block in
// supabase/functions/chat/index.ts verbatim — this script does not modify
// or re-enable that code, it just exercises the same logic standalone.
//
// Scoring is intentionally NOT automated here — the harness's rubric
// (grounding/specificity/coaching-value/authenticity, 1-4 each) requires
// human (or a separate LLM-judge pass) judgment. This script's job is to
// produce the paired responses + retrieval metadata table so that scoring
// can happen against real output.
//
// Required env vars (put these in .env.local or export before running):
//   SUPABASE_URL or VITE_SUPABASE_URL   — project URL
//   SUPABASE_SERVICE_ROLE_KEY           — bypasses RLS to read document_chunks
//   OPENAI_API_KEY                      — text-embedding-3-small
//   ANTHROPIC_API_KEY                   — claude-haiku-4-5-20251001
//
// Run: node scripts/rag-regression.mjs

import "dotenv/config";
import { config as loadEnvLocal } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

loadEnvLocal({ path: ".env.local", override: false });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const EVAL_DOC = path.join(
  REPO_ROOT,
  "docs/eval/20260502_ADA_EVAL_RAGEvalHarness_v0.1.md",
);
const RESULTS_DIR = path.join(REPO_ROOT, "docs/eval/results");

const EMBEDDING_MODEL = "text-embedding-3-small";
const CHAT_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 4000;
const MATCH_COUNT = 3;
const CONTEXT_CHAR_CAP = 4000 * 4;

// Threshold is overridable via --threshold=<n> or RAG_THRESHOLD, for running
// a sweep (see docs/rag-architecture.md — 0.60, the production default,
// retrieved chunks for only 1 of 15 questions against this corpus, so most
// pairs weren't a real RAG-on/off comparison). Defaults to the production
// value when not given.
const thresholdArg = process.argv.find((a) => a.startsWith("--threshold="));
const MATCH_THRESHOLD = thresholdArg
  ? parseFloat(thresholdArg.split("=")[1])
  : process.env.RAG_THRESHOLD
    ? parseFloat(process.env.RAG_THRESHOLD)
    : 0.6;

function requireEnv(name, ...fallbacks) {
  for (const key of [name, ...fallbacks]) {
    if (process.env[key]) return process.env[key];
  }
  return null;
}

function parseQuestions(docText) {
  const lines = docText.split("\n");
  let tier = "unknown";
  const questions = [];
  for (const line of lines) {
    const tierMatch = line.match(/^###\s*Tier\s*(\d+):\s*(.+)$/);
    if (tierMatch) {
      tier = `Tier ${tierMatch[1]} (${tierMatch[2].trim()})`;
      continue;
    }
    const qMatch = line.match(/^Q(\d+)\s+(.+)$/);
    if (qMatch) {
      questions.push({ id: `Q${qMatch[1]}`, tier, question: qMatch[2].trim() });
    }
  }
  return questions;
}

async function embed(openai, text) {
  const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: text });
  return res.data[0].embedding;
}

function buildInjectedSystemPrompt(basePrompt, chunks) {
  let contextBody = "";
  for (const chunk of chunks) {
    const sep = contextBody ? "\n\n---\n\n" : "";
    if (contextBody.length + sep.length + chunk.content.length > CONTEXT_CHAR_CAP) break;
    contextBody += sep + chunk.content;
  }
  if (!contextBody) return basePrompt;
  return (
    "Use the following background knowledge to inform your coaching where relevant. " +
    "Do not mention, reference, or reveal that you have a knowledge base, that documents " +
    "were uploaded, or that content was retrieved. Simply coach as an expert who knows " +
    "this material deeply.\n\n" +
    contextBody +
    "\n\n" +
    basePrompt
  );
}

async function main() {
  const missing = [];
  const supabaseUrl = requireEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE");
  const openaiKey = requireEnv("OPENAI_API_KEY");
  const anthropicKey = requireEnv("ANTHROPIC_API_KEY");
  if (!supabaseUrl) missing.push("SUPABASE_URL (or VITE_SUPABASE_URL)");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!openaiKey) missing.push("OPENAI_API_KEY");
  if (!anthropicKey) missing.push("ANTHROPIC_API_KEY");

  if (missing.length > 0) {
    console.error("Cannot run — missing required env vars:\n" + missing.map((m) => `  - ${m}`).join("\n"));
    console.error("\nSet these in .env.local or export them before running.");
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(EVAL_DOC)) {
    console.error(`Eval doc not found: ${EVAL_DOC}`);
    process.exitCode = 1;
    return;
  }

  const questions = parseQuestions(fs.readFileSync(EVAL_DOC, "utf-8"));
  if (questions.length === 0) {
    console.error("No questions parsed from the eval doc — check its format.");
    process.exitCode = 1;
    return;
  }
  console.log(`Parsed ${questions.length} questions from ${path.basename(EVAL_DOC)}`);

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const openai = new OpenAI({ apiKey: openaiKey });
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  const { data: activePrompt, error: promptErr } = await supabase
    .from("coaching_prompts")
    .select("prompt_text")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (promptErr || !activePrompt?.prompt_text) {
    console.error("Could not load the active coaching prompt:", promptErr?.message);
    process.exitCode = 1;
    return;
  }
  const basePrompt = activePrompt.prompt_text;

  const results = [];
  for (const q of questions) {
    process.stdout.write(`${q.id} ... `);

    const queryEmbedding = await embed(openai, q.question);
    const { data: chunks, error: rpcErr } = await supabase.rpc("match_document_chunks", {
      query_embedding: queryEmbedding,
      match_threshold: MATCH_THRESHOLD,
      match_count: MATCH_COUNT,
    });
    if (rpcErr) {
      console.log(`retrieval failed: ${rpcErr.message}`);
      results.push({ ...q, chunks: [], responseA: `[retrieval error: ${rpcErr.message}]`, responseB: null });
      continue;
    }

    const systemA = buildInjectedSystemPrompt(basePrompt, chunks ?? []);
    const systemB = basePrompt;

    const [responseA, responseB] = await Promise.all([
      anthropic.messages.create({
        model: CHAT_MODEL,
        max_tokens: MAX_TOKENS,
        system: systemA,
        messages: [{ role: "user", content: q.question }],
      }),
      anthropic.messages.create({
        model: CHAT_MODEL,
        max_tokens: MAX_TOKENS,
        system: systemB,
        messages: [{ role: "user", content: q.question }],
      }),
    ]);

    const textOf = (r) => r.content.find((b) => b.type === "text")?.text ?? "";

    results.push({
      ...q,
      chunks: chunks ?? [],
      responseA: textOf(responseA),
      responseB: textOf(responseB),
    });
    console.log(`${(chunks ?? []).length} chunks retrieved`);
  }

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(
    RESULTS_DIR,
    `rag-regression-t${MATCH_THRESHOLD}-${stamp}.md`,
  );

  const lines = [];
  lines.push("# RAG Regression Run");
  lines.push("");
  lines.push(`Run at: ${new Date().toISOString()}`);
  lines.push(`Model: ${CHAT_MODEL} · Embedding: ${EMBEDDING_MODEL} · threshold=${MATCH_THRESHOLD} · match_count=${MATCH_COUNT}`);
  lines.push("");
  lines.push("Arm A = RAG on (retrieval + injection). Arm B = RAG off (current production behavior).");
  lines.push("Scoring against the harness rubric (grounding/specificity/coaching-value/authenticity) is manual — this table is the raw material.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| ID | Tier | Chunks retrieved | Top similarity |");
  lines.push("|---|---|---|---|");
  for (const r of results) {
    const top = r.chunks.length > 0 ? r.chunks[0].similarity.toFixed(3) : "—";
    lines.push(`| ${r.id} | ${r.tier} | ${r.chunks.length} | ${top} |`);
  }
  lines.push("");
  lines.push("## Paired responses");
  lines.push("");
  for (const r of results) {
    lines.push(`### ${r.id} — ${r.tier}`);
    lines.push("");
    lines.push(`**Question:** ${r.question}`);
    lines.push("");
    if (r.chunks.length > 0) {
      lines.push("**Retrieved chunks:**");
      lines.push("");
      r.chunks.forEach((c, i) => {
        lines.push(`${i + 1}. (similarity ${c.similarity.toFixed(3)}) ${c.content.slice(0, 200).replace(/\n/g, " ")}...`);
      });
      lines.push("");
    } else {
      lines.push("**Retrieved chunks:** none above threshold");
      lines.push("");
    }
    lines.push("**Arm A (RAG on):**");
    lines.push("");
    lines.push(r.responseA);
    lines.push("");
    lines.push("**Arm B (RAG off):**");
    lines.push("");
    lines.push(r.responseB ?? "[not run]");
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  fs.writeFileSync(outPath, lines.join("\n"), "utf-8");
  console.log(`\nWrote results to ${path.relative(REPO_ROOT, outPath)}`);
}

main().catch((err) => {
  console.error("Regression run failed:", err);
  process.exitCode = 1;
});
