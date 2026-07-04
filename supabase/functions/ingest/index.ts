// Ada Coach /ingest Edge Function
// Turns a grounding source into embedded chunks in document_chunks, driving
// the document 'uploaded' -> 'processing' -> 'ready' (or 'error').
//
// Two modes, one pipeline (chunker/embedder shared via _shared/ingest-core):
//   POST { document_id }                      — ingest an uploaded file.
//     Global-corpus documents (session_id null) stay owner-only, exactly as
//     before. Session-scoped documents (session_id set) only require that
//     the caller owns the document.
//   POST { session_id, pasted_text, title? }  — session-scoped pasted text.
//     The redaction pass (_shared/redact.ts) strips emails and identified
//     names BEFORE the text is stored or chunked, so no PII ever reaches
//     the embedding call. Ambiguous name-like tokens are returned in
//     `flagged` for the PM to review — kept, never silently dropped.
//
// Auth: valid Supabase Auth JWT; role requirements are per-mode as above.

import "@supabase/functions-js/edge-runtime.d.ts";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireUser,
} from "../_shared/auth.ts";
import {
  chunkText,
  embedChunks,
  guessTypeFromFilename,
} from "../_shared/ingest-core.ts";
import { redactPII } from "../_shared/redact.ts";

const SUPPORTED_MIME = new Set(["application/pdf", "text/plain"]);
const PASTED_TEXT_MAX = 50_000; // PRD: pasted text fields cap at 50k chars
const PASTED_PATH_PREFIX = "pasted/";

type IngestRequest = {
  document_id?: unknown;
  session_id?: unknown;
  pasted_text?: unknown;
  title?: unknown;
};

type DocumentRow = {
  id: string;
  user_id: string;
  filename: string;
  file_path: string;
  status: string;
  session_id: string | null;
  content_text: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }

  const authResult = await requireUser(req);
  if (authResult.error) return authResult.error;
  const { user, userClient } = authResult;

  let body: IngestRequest;
  try {
    body = (await req.json()) as IngestRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, req);
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

  // ── Mode 1: session-scoped pasted text ────────────────────────────────
  if (typeof body.pasted_text === "string") {
    const sessionId =
      typeof body.session_id === "string" ? body.session_id : "";
    if (!sessionId) {
      return jsonResponse(
        { error: "session_id is required for pasted text" },
        400,
        req,
      );
    }

    const pasted = body.pasted_text.trim();
    if (!pasted) {
      return jsonResponse({ error: "pasted_text is empty" }, 400, req);
    }
    if (pasted.length > PASTED_TEXT_MAX) {
      return jsonResponse(
        { error: `pasted_text must be at most ${PASTED_TEXT_MAX} characters` },
        400,
        req,
      );
    }

    // RLS: the session is visible only to its owner.
    const { data: session, error: sessErr } = await userClient
      .from("sessions")
      .select("id")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessErr) {
      console.error("session lookup failed:", sessErr);
      return jsonResponse({ error: "Could not load session." }, 500, req);
    }
    if (!session) {
      return jsonResponse({ error: "Session not found" }, 404, req);
    }

    // Redact BEFORE anything is stored or embedded. Only the redacted text
    // persists; raw PII never lands in the database or the vector store.
    const { redactedText, redactions, flagged } = redactPII(pasted);

    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim().slice(0, 200)
        : "Pasted notes";

    const { data: doc, error: docErr } = await service
      .from("documents")
      .insert({
        user_id: user.id,
        session_id: sessionId,
        filename: title,
        file_path: `${PASTED_PATH_PREFIX}${crypto.randomUUID()}`,
        content_text: redactedText,
        status: "processing",
      })
      .select("id")
      .single();
    if (docErr || !doc) {
      console.error("pasted document insert failed:", docErr);
      return jsonResponse({ error: "Could not save pasted text." }, 500, req);
    }

    try {
      const chunkCount = await runPipeline(service, doc.id, redactedText, openaiKey);
      return jsonResponse(
        {
          document_id: doc.id,
          chunk_count: chunkCount,
          char_count: redactedText.length,
          redaction: {
            redacted_count: redactions.length,
            flagged, // ambiguous tokens left in place for the PM to review
          },
        },
        200,
        req,
      );
    } catch (err) {
      return await failDocument(service, doc.id, err, req);
    }
  }

  // ── Mode 2: previously-uploaded document by id ────────────────────────
  const documentId =
    typeof body.document_id === "string" ? body.document_id.trim() : "";
  if (!documentId) {
    return jsonResponse(
      { error: "document_id or pasted_text is required" },
      400,
      req,
    );
  }

  const { data: doc, error: docErr } = await service
    .from("documents")
    .select("id, user_id, filename, file_path, status, session_id, content_text")
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

  // Global-corpus documents keep the original owner-only requirement;
  // session-scoped documents only need ownership (checked above).
  if (!doc.session_id) {
    const { data: profile, error: profileErr } = await service
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr) {
      console.error("profile lookup failed:", profileErr);
      return jsonResponse({ error: "Server error" }, 500, req);
    }
    if (profile?.role !== "owner") {
      return jsonResponse({ error: "Forbidden" }, 403, req);
    }
  }

  // Mark processing
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
    let text: string;

    if (doc.file_path.startsWith(PASTED_PATH_PREFIX)) {
      // Re-ingest of a pasted document: content_text is already redacted.
      text = doc.content_text ?? "";
    } else {
      // Download the file from Storage
      const { data: fileBlob, error: dlErr } = await service.storage
        .from("documents")
        .download(doc.file_path);

      if (dlErr || !fileBlob) {
        throw new Error(
          `Storage download failed: ${dlErr?.message ?? "no body"}`,
        );
      }

      // Detect content type and extract text accordingly. Storage type
      // is whatever was set on upload; fall back to filename suffix if
      // blob.type is empty (some storage clients omit it on download).
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
    }

    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error("Document is empty after extraction.");
    }

    const chunkCount = await runPipeline(service, documentId, trimmed, openaiKey);

    return jsonResponse(
      {
        document_id: documentId,
        chunk_count: chunkCount,
        char_count: trimmed.length,
      },
      200,
      req,
    );
  } catch (err) {
    return await failDocument(service, documentId, err, req);
  }
});

// ── Shared pipeline steps ────────────────────────────────────────────────

// Chunk -> embed -> replace chunks -> mark ready. Returns the chunk count.
// Throwing here is handled by failDocument (rollback + status 'error').
async function runPipeline(
  service: ReturnType<typeof getServiceClient>,
  documentId: string,
  text: string,
  openaiKey: string,
): Promise<number> {
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    throw new Error("Chunker produced no chunks.");
  }

  const embeddings = await embedChunks(chunks, openaiKey);

  // Re-ingest guard: clear any prior chunks for this document so a second
  // invocation produces the same end state instead of doubling.
  const { error: clearErr } = await service
    .from("document_chunks")
    .delete()
    .eq("document_id", documentId);
  if (clearErr) {
    throw new Error(`Failed to clear prior chunks: ${clearErr.message}`);
  }

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

  const { error: readyErr } = await service
    .from("documents")
    .update({ status: "ready", chunk_count: chunks.length })
    .eq("id", documentId);
  if (readyErr) {
    throw new Error(`Failed to mark ready: ${readyErr.message}`);
  }

  return chunks.length;
}

// Roll back: delete any chunks we may have inserted, then flag error.
async function failDocument(
  service: ReturnType<typeof getServiceClient>,
  documentId: string,
  err: unknown,
  req: Request,
): Promise<Response> {
  const message = err instanceof Error ? err.message : String(err);
  console.error("ingest failed:", message);

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
