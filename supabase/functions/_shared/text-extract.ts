// Plain-text extraction, factored out of ingest/index.ts (Run 4) so the
// portfolio track can pull text out of an uploaded resume (PDF or plain
// text) without going through the chunk/embed RAG pipeline — a resume
// needs Haiku field extraction, not vector search. `ingest`'s own
// extraction logic is unchanged; this is the same code, reusable.

import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";
import { guessTypeFromFilename } from "./ingest-core.ts";

export const SUPPORTED_RESUME_MIME = new Set([
  "application/pdf",
  "text/plain",
]);

export class UnsupportedFileTypeError extends Error {
  contentType: string;
  constructor(contentType: string) {
    super(`Unsupported content type "${contentType}".`);
    this.name = "UnsupportedFileTypeError";
    this.contentType = contentType;
  }
}

// Extracts plain text from a downloaded file blob. Throws
// UnsupportedFileTypeError for anything outside SUPPORTED_RESUME_MIME —
// callers turn that into a 400, not a 500.
export async function extractPlainText(
  fileBlob: Blob,
  filename: string,
): Promise<string> {
  const contentType =
    (fileBlob.type && fileBlob.type.toLowerCase().split(";")[0].trim()) ||
    guessTypeFromFilename(filename);

  if (!SUPPORTED_RESUME_MIME.has(contentType)) {
    throw new UnsupportedFileTypeError(contentType);
  }

  if (contentType === "application/pdf") {
    const buf = new Uint8Array(await fileBlob.arrayBuffer());
    const pdf = await getDocumentProxy(buf);
    const extracted = await extractText(pdf, { mergePages: true });
    return Array.isArray(extracted.text)
      ? extracted.text.join("\n\n")
      : extracted.text;
  }

  return fileBlob.text();
}
