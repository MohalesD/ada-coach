// Pure helpers for dictating into a chat box with the browser's own speech
// recognition (Web Speech API). No DOM and no recognition object here, so
// Vitest can run it; the hook in src/hooks/use-dictation.ts owns the mic.
//
// The one hard part is that Chrome does not report speech the same way
// everywhere. Desktop can re-fire a finished phrase verbatim. Android ignores
// `continuous`, restarts constantly, and each restart re-emits a GROWING
// PREFIX of the same sentence ("just" → "just the" → "just the test"). Typing
// each result straight into the box produces "just just the just the test".
// `mergeTranscript` is the defence, carried over from Builder Journal's
// src/lib/transcription.ts, where it was written after exactly that bug.

/**
 * Join `addition` onto `base`, dropping any leading words of `addition` that
 * already end `base`. Word-level, case-insensitive on the comparison, original
 * casing kept. A plain append when nothing overlaps.
 *
 * Accepted trade-off: a real spoken repeat at the exact seam ("the the") can
 * collapse to one. That is far better than the duplication it prevents.
 */
export function mergeTranscript(base: string, addition: string): string {
  const b = base.trim();
  const a = addition.trim();
  if (!b) return a;
  if (!a) return b;

  const bw = b.split(/\s+/);
  const aw = a.split(/\s+/);
  const maxK = Math.min(bw.length, aw.length);

  let overlap = 0;
  for (let k = maxK; k >= 1; k--) {
    let match = true;
    for (let i = 0; i < k; i++) {
      if (bw[bw.length - k + i].toLowerCase() !== aw[i].toLowerCase()) {
        match = false;
        break;
      }
    }
    if (match) {
      overlap = k;
      break;
    }
  }

  const tail = aw.slice(overlap).join(' ');
  return tail ? `${b} ${tail}` : b;
}

/**
 * Fold one recognition result into what this listening session has heard so
 * far, and return only the words that are new. The caller appends `delta` to
 * the box and keeps `session` for the next result. Working in deltas means the
 * person can keep typing while the mic is on without their edits being
 * overwritten by a rebuilt transcript.
 */
export function takeDictation(session: string, piece: string): { session: string; delta: string } {
  const before = session.trim();
  const next = mergeTranscript(before, piece);
  const delta = next.length > before.length ? next.slice(before.length).trim() : '';
  return { session: next, delta };
}

/** Put dictated words at the end of the box, spaced so they do not run into what is there. */
export function appendDictated(value: string, delta: string): string {
  const d = delta.trim();
  if (!d) return value;
  if (!value) return d;
  return /\s$/.test(value) ? value + d : `${value} ${d}`;
}

/**
 * What to tell the person when recognition stops with an error. Null means
 * say nothing: they stopped it themselves.
 */
export function dictationErrorText(error: string): string | null {
  if (error === 'aborted') return null;
  if (error === 'not-allowed' || error === 'service-not-allowed') {
    return 'Dictation needs the microphone. Allow it for this site in your browser, then try again.';
  }
  if (error === 'no-speech') return "Ada didn't hear anything. Tap the mic and try again.";
  return 'Dictation stopped. Tap the mic to start again.';
}
