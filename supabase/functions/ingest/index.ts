// Ada Coach /ingest Edge Function
// Chunks an uploaded document, embeds each chunk with OpenAI, and writes
// the rows into document_chunks. Owner-only. Drives a document from
// status 'uploaded' → 'processing' → 'ready' (or 'error' on failure).
//
// Auth: owner-only. requireAdmin gates admin/owner; we additionally
// require role === 'owner' to match the documents-table RLS posture.

import "@supabase/functions-js/edge-runtime.d.ts";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireAdmin,
} from "../_shared/auth.ts";

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;
const CHUNK_WORDS = 300;
const CHUNK_OVERLAP_WORDS = 50;
const EMBED_BATCH_SIZE = 96;

const SUPPORTED_MIME = new Set(["application/pdf", "text/plain"]);

type IngestRequest = { document_id?: unknown };

type DocumentRow = {
  id: string;
  user_id: string;
  filename: string;
  file_path: string;
  status: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }

  // 1. Auth — owner-only (admin alone is not sufficient for documents)
  const authResult = await requireAdmin(req);
  if (authResult.error) return authResult.error;
  const { user, profile } = authResult;

  if (profile.role !== "owner") {
    return jsonResponse({ error: "Forbidden" }, 403, req);
  }

  // 2. Parse + validate body
  let body: IngestRequest;
  try {
    body = (await req.json()) as IngestRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, req);
  }

  const documentId =
    typeof body.document_id === "string" ? body.document_id.trim() : "";
  if (!documentId) {
    return jsonResponse({ error: "document_id is required" }, 400, req);
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    console.error("Missing OPENAI_API_KEY");
    return jsonResponse(
      { error: "Ingest is not configured correctly." },
      500,
      req,
    );
  }

  const service = getServiceClient();

  // 3. Fetch document row + verify ownership
  const { data: doc, error: docErr } = await service
    .from("documents")
    .select("id, user_id, filename, file_path, status")
    .eq("id", documentId)
    .maybeSingle<DocumentRow>();

  if (docErr) {
    console.error("Failed to load document:", docErr);
    return jsonResponse({ error: "Could not load document." }, 500, req);
  }
  if (!doc) {
    return jsonResponse({ error: "Document not found" }, 404, req);
  }
  if (doc.user_id !== user.id) {
    return jsonResponse({ error: "Forbidden" }, 403, req);
  }

  // 4. Mark processing
  const { error: procErr } = await service
    .from("documents")
    .update({ status: "processing" })
    .eq("id", documentId);
  if (procErr) {
    console.error("Failed to mark processing:", procErr);
    return jsonResponse({ error: "Could not start ingest." }, 500, req);
  }

  // From here on, any failure must mark the document 'error' and clean up
  // any partially-inserted chunks before returning.
  try {
    // 5. Download the file from Storage
    const { data: fileBlob, error: dlErr } = await service.storage
      .from("documents")
      .download(doc.file_path);

    if (dlErr || !fileBlob) {
      throw new Error(
        `Storage download failed: ${dlErr?.message ?? "no body"}`,
      );
    }

    // 5a. Detect content type and extract text accordingly. Storage type
    //     is whatever was set on upload; fall back to filename suffix if
    //     blob.type is empty (some storage clients omit it on download).
    const contentType =
      (fileBlob.type && fileBlob.type.toLowerCase().split(";")[0].trim()) ||
      guessTypeFromFilename(doc.filename);

    if (!SUPPORTED_MIME.has(contentType)) {
      // Reset status so the doc isn't stuck on 'processing' for an
      // unsupported file. A 400 is a client error (wrong file type),
      // not an ingest pipeline failure, so keep status as 'uploaded'.
      await service
        .from("documents")
        .update({ status: "uploaded" })
        .eq("id", documentId);
      return jsonResponse(
        {
          error: `Unsupported content type "${contentType}". Only application/pdf and text/plain are supported.`,
        },
        400,
        req,
      );
    }

    let text: string;
    if (contentType === "application/pdf") {
      const buf = new Uint8Array(await fileBlob.arrayBuffer());
      const pdf = await getDocumentProxy(buf);
      const extracted = await extractText(pdf, { mergePages: true });
      text = Array.isArray(extracted.text)
        ? extracted.text.join("\n\n")
        : extracted.text;
    } else {
      text = await fileBlob.text();
    }

    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error("Document is empty after extraction.");
    }
    const charCount = trimmed.length;

    // 6. Chunk
    const chunks = chunkText(trimmed, CHUNK_WORDS, CHUNK_OVERLAP_WORDS);
    if (chunks.length === 0) {
      throw new Error("Chunker produced no chunks.");
    }

    // 7. Embed (batched)
    const embeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
      const batchEmbeddings = await embedBatch(batch, openaiKey);
      embeddings.push(...batchEmbeddings);
    }

    if (embeddings.length !== chunks.length) {
      throw new Error(
        `Embedding count mismatch: ${embeddings.length} vs ${chunks.length}`,
      );
    }

    // 8. Re-ingest guard: clear any prior chunks for this document so a
    //    second invocation produces the same end state instead of doubling.
    const { error: clearErr } = await service
      .from("document_chunks")
      .delete()
      .eq("document_id", documentId);
    if (clearErr) {
      throw new Error(`Failed to clear prior chunks: ${clearErr.message}`);
    }

    // 9. Insert all chunks in a single batch (atomic per request)
    const rows = chunks.map((content, idx) => ({
      document_id: documentId,
      chunk_index: idx,
      content,
      embedding: embeddings[idx],
    }));

    const { error: insertErr } = await service
      .from("document_chunks")
      .insert(rows);

    if (insertErr) {
      throw new Error(`Chunk insert failed: ${insertErr.message}`);
    }

    // 10. Mark ready
    const { error: readyErr } = await service
      .from("documents")
      .update({ status: "ready", chunk_count: chunks.length })
      .eq("id", documentId);

    if (readyErr) {
      throw new Error(`Failed to mark ready: ${readyErr.message}`);
    }

    return jsonResponse(
      {
        document_id: documentId,
        chunk_count: chunks.length,
        char_count: charCount,
      },
      200,
      req,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("ingest failed:", message);

    // Roll back: delete any chunks we may have inserted, then flag error.
    await service.from("document_chunks").delete().eq("document_id", documentId);
    await service
      .from("documents")
      .update({ status: "error", chunk_count: null })
      .eq("id", documentId);

    return jsonResponse(
      { error: "Ingest failed. Document marked as error." },
      500,
      req,
    );
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function guessTypeFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt")) return "text/plain";
  return "";
}

// Split text into sentences using a simple punctuation-based regex.
// Falls back to the whole string if no sentence terminators are found.
function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const matches = cleaned.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
  if (!matches || matches.length === 0) return [cleaned];
  return matches.map((s) => s.trim()).filter(Boolean);
}

function wordCount(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

// Sentence-aware sliding window: pack sentences until we hit `targetWords`,
// emit a chunk, then carry forward the trailing `overlapWords` of words
// (re-flowed as plain text) into the next chunk.
function chunkText(
  text: string,
  targetWords: number,
  overlapWords: number,
): string[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];

  const chunks: string[] = [];
  let buffer: string[] = []; // current chunk as a list of sentences
  let bufferWordCount = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    const chunkText = buffer.join(" ").trim();
    if (chunkText) chunks.push(chunkText);
  };

  for (const sentence of sentences) {
    const sw = wordCount(sentence);

    // Sentence alone exceeds target — emit any current buffer, then split
    // the long sentence by words into ~targetWords pieces.
    if (sw > targetWords) {
      flush();
      buffer = [];
      bufferWordCount = 0;

      const words = sentence.split(/\s+/).filter(Boolean);
      for (let i = 0; i < words.length; i += targetWords - overlapWords) {
        const slice = words.slice(i, i + targetWords).join(" ");
        if (slice) chunks.push(slice);
        if (i + targetWords >= words.length) break;
      }
      continue;
    }

    if (bufferWordCount + sw <= targetWords) {
      buffer.push(sentence);
      bufferWordCount += sw;
      continue;
    }

    // Buffer is full — flush, then seed next buffer with overlap from tail.
    flush();
    const tailWords = buffer
      .join(" ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(-overlapWords);
    const overlapText = tailWords.join(" ");
    buffer = overlapText ? [overlapText, sentence] : [sentence];
    bufferWordCount = tailWords.length + sw;
  }

  flush();
  return chunks;
}

async function embedBatch(
  inputs: string[],
  apiKey: string,
): Promise<number[][]> {
  const res = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: inputs,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenAI embeddings ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  const items = Array.isArray(data?.data) ? data.data : [];
  if (items.length !== inputs.length) {
    throw new Error(
      `OpenAI returned ${items.length} embeddings for ${inputs.length} inputs`,
    );
  }

  return items.map((item: { embedding: number[] }, i: number) => {
    const emb = item?.embedding;
    if (!Array.isArray(emb) || emb.length !== EMBEDDING_DIM) {
      throw new Error(
        `Embedding ${i} has wrong shape (expected ${EMBEDDING_DIM} dims)`,
      );
    }
    return emb;
  });
}
