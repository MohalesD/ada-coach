// Core chunk/embed pipeline, extracted verbatim from ingest/index.ts so the
// session-scoped ingest path reuses the exact same pipeline as the global
// knowledge base (PRD v2 change #2: extend, don't build a parallel system).
// Pure helpers + one fetch-based embedder; no Deno APIs, so the chunker is
// unit-testable from Vitest.

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIM = 1536;
export const CHUNK_WORDS = 300;
export const CHUNK_OVERLAP_WORDS = 50;
export const EMBED_BATCH_SIZE = 96;

export function guessTypeFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt")) return "text/plain";
  return "";
}

// Split text into sentences using a simple punctuation-based regex.
// Falls back to the whole string if no sentence terminators are found.
export function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const matches = cleaned.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
  if (!matches || matches.length === 0) return [cleaned];
  return matches.map((s) => s.trim()).filter(Boolean);
}

export function wordCount(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

// Sentence-aware sliding window: pack sentences until we hit `targetWords`,
// emit a chunk, then carry forward the trailing `overlapWords` of words
// (re-flowed as plain text) into the next chunk.
export function chunkText(
  text: string,
  targetWords: number = CHUNK_WORDS,
  overlapWords: number = CHUNK_OVERLAP_WORDS,
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

export async function embedBatch(
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

// Embed all chunks in batches of EMBED_BATCH_SIZE.
export async function embedChunks(
  chunks: string[],
  apiKey: string,
): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    embeddings.push(...(await embedBatch(batch, apiKey)));
  }
  if (embeddings.length !== chunks.length) {
    throw new Error(
      `Embedding count mismatch: ${embeddings.length} vs ${chunks.length}`,
    );
  }
  return embeddings;
}
