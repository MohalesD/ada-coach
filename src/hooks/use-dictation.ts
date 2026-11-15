// Owns one browser speech-recognition session for a chat box.
// One job: turn "the mic is on" into a stream of new words for the caller.
//
// Uses the browser's own recognition (Web Speech API). Where the browser has
// none (Firefox, some embedded views) `supported` is false and the caller
// renders no button at all, so nobody is offered a control that cannot work.
// Nothing is recorded or stored by Ada: the audio goes to the browser's speech
// service and only the resulting text reaches the box, exactly as if typed.

import { useCallback, useEffect, useRef, useState } from 'react';
import { dictationErrorText, takeDictation } from '@/lib/dictation';

interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionClass = new () => Recognition;

/** Read when needed, not at module load: support can appear after load. */
function recognitionClass(): RecognitionClass | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionClass;
    webkitSpeechRecognition?: RecognitionClass;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// One box listens at a time across the app; starting another releases this
// one. `owner` is a per-hook token, so a hook only ever clears its own claim.
let active: { owner: object; release: () => void } | null = null;

export function useDictation(opts: {
  /** Called with each run of newly heard words. */
  onText: (delta: string) => void;
  /** Called with a sentence to show when recognition stops on an error. */
  onError?: (message: string) => void;
}) {
  const rec = useRef<Recognition | null>(null);
  const session = useRef('');
  const owner = useRef<object>({});
  const onText = useRef(opts.onText);
  const onError = useRef(opts.onError);
  // The newest callbacks, without restarting the mic when the parent re-renders.
  useEffect(() => {
    onText.current = opts.onText;
    onError.current = opts.onError;
  });
  const [listening, setListening] = useState(false);
  const supported = recognitionClass() !== null;

  const stop = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    r.abort();
    setListening(false);
    if (active?.owner === owner.current) active = null;
  }, []);

  // Leaving the page ends the session; a mic must never outlive its box.
  useEffect(() => stop, [stop]);

  const start = useCallback(() => {
    const Ctor = recognitionClass();
    if (!Ctor || rec.current) return;
    active?.release();
    const r = new Ctor();
    r.continuous = true;
    // Finished phrases only. Interim guesses rewrite themselves, and words
    // that change after they appear are worse in a chat box than a short wait.
    r.interimResults = false;
    r.lang = navigator.language || 'en-US';
    session.current = '';
    r.onresult = (e) => {
      let piece = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        piece += e.results[i]?.[0]?.transcript ?? '';
      }
      const next = takeDictation(session.current, piece);
      session.current = next.session;
      if (next.delta) onText.current(next.delta);
    };
    r.onerror = (e) => {
      const message = dictationErrorText(e.error);
      if (message) onError.current?.(message);
    };
    r.onend = () => {
      if (rec.current !== r) return; // a late end from a session already released
      rec.current = null;
      setListening(false);
      if (active?.owner === owner.current) active = null;
    };
    rec.current = r;
    try {
      r.start();
    } catch {
      rec.current = null;
      onError.current?.('Dictation could not start. Try again.');
      return;
    }
    active = { owner: owner.current, release: stop };
    setListening(true);
  }, [stop]);

  const toggle = useCallback(() => {
    if (rec.current) stop();
    else start();
  }, [start, stop]);

  return { supported, listening, toggle, stop };
}
