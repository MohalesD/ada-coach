// The hero stage: a scripted coaching exchange. The visitor picks something
// a PM might say; Ada's reply types out and the coaching move is named.
// Nothing here calls a model. It plays by itself until the visitor picks.

import { useEffect, useState } from 'react';
import { DEMO } from '@/content/landing';
import { AdaMark } from './SiteChrome';

const THINK_MS = 900;
const TYPE_MS = 16;
const REST_MS = 5200;

type Phase = 'thinking' | 'typing' | 'done';

export default function HeroDemo({ still }: { still: boolean }) {
  const [index, setIndex] = useState(0);
  const [played, setPhase] = useState<Phase>('thinking');
  // Under reduced motion the whole reply is simply there.
  const phase: Phase = still ? 'done' : played;
  const [typed, setTyped] = useState(0);
  // Autoplay ends for good the moment the visitor chooses for themselves.
  const [auto, setAuto] = useState(true);
  const [held, setHeld] = useState(false);
  const exchange = DEMO.exchanges[index] ?? DEMO.exchanges[0];

  function show(next: number) {
    setIndex(next);
    setTyped(0);
    setPhase('thinking');
  }

  // One timer at a time drives the exchange: think, type, rest, next.
  const length = exchange.reply.length;
  useEffect(() => {
    if (still) return;
    let timer = 0;
    if (phase === 'thinking') {
      timer = window.setTimeout(() => setPhase('typing'), THINK_MS);
    } else if (phase === 'typing') {
      timer = window.setTimeout(() => {
        if (typed >= length) setPhase('done');
        else setTyped((n) => n + 2);
      }, TYPE_MS);
    } else if (auto && !held) {
      timer = window.setTimeout(() => {
        setIndex((n) => (n + 1) % DEMO.exchanges.length);
        setTyped(0);
        setPhase('thinking');
      }, REST_MS);
    }
    return () => window.clearTimeout(timer);
  }, [phase, typed, still, auto, held, length]);

  function pick(next: number) {
    setAuto(false);
    show(next);
  }

  const shown = phase === 'done' ? exchange.reply : exchange.reply.slice(0, typed);

  return (
    <figure
      className="lp-demo"
      aria-label={DEMO.figure}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className="lp-demo-bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <span>ada-coach.vercel.app</span>
      </div>

      <div className="lp-demo-body">
        <div className="lp-msg lp-msg-you" key={`you-${exchange.id}`}>
          <span className="lp-msg-who">{DEMO.you}</span>
          <p>{exchange.said}</p>
        </div>

        <div className="lp-msg lp-msg-ada" key={`ada-${exchange.id}`}>
          <span className="lp-msg-who">
            <AdaMark className="lp-msg-mark" />
            {DEMO.ada}
          </span>
          {phase === 'thinking' ? (
            <p className="lp-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </p>
          ) : (
            <p aria-hidden="true">
              {shown}
              {phase === 'typing' && <span className="lp-caret" />}
            </p>
          )}
          {/* Screen readers get the whole reply once, not a letter at a time. */}
          <p className="sr-only">
            {exchange.reply}
          </p>
          <p className={`lp-move${phase === 'done' ? ' lp-on' : ''}`}>
            <span>{DEMO.moveLabel}</span>
            {exchange.move}
          </p>
        </div>
      </div>

      <figcaption className="lp-demo-foot">
        <p className="lp-demo-invite">{DEMO.invite}</p>
        <div className="lp-chips" role="group" aria-label={DEMO.invite}>
          {DEMO.exchanges.map((item, n) => (
            <button
              key={item.id}
              type="button"
              className="lp-chip"
              aria-pressed={n === index}
              onClick={() => pick(n)}
            >
              {item.chip}
            </button>
          ))}
        </div>
        <p className="lp-demo-note">{DEMO.disclaimer}</p>
      </figcaption>
    </figure>
  );
}
