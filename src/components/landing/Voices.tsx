// Sample voices: a deck of quotes that turns by itself and by its two
// buttons. These are not customer quotes. Each card says so, and so does
// the note beside the deck: they are the reactions Ada is built to earn.

import { useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { VOICES as t } from '@/content/landing';
import { useAutoStep } from './hooks';

const TURN_MS = 6000;
const TINTS = ['#e3b366', '#c9d8e6', '#e9c1b0', '#cfe0c2', '#e6d7a8'];

export default function Voices({ still }: { still: boolean }) {
  const total = t.items.length;
  const [held, setHeld] = useState(false);
  const [at, setAt] = useAutoStep(total, TURN_MS, still || held);
  const turn = (by: number) => setAt((at + by + total) % total);

  return (
    <div
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className="lp-vo-stage" role="group" aria-roledescription="carousel" aria-label={t.group}>
        {t.items.map((item, i) => {
          const offset = (i - at + total) % total;
          return (
            <figure
              key={item.who}
              className={`lp-vo${offset === total - 1 ? ' lp-gone' : ''}`}
              style={{ '--o': Math.min(offset, 3) } as CSSProperties}
              aria-hidden={offset !== 0}
            >
              <blockquote>
                {item.quote.map(([text, strong], n) =>
                  strong ? <em key={n}>{text}</em> : <span key={n}>{text}</span>,
                )}
              </blockquote>
              <figcaption className="lp-vo-by">
                <span className="lp-vo-av" style={{ background: TINTS[i % TINTS.length] }} aria-hidden="true">
                  {item.initials}
                </span>
                <span>
                  <b>{item.who}</b>
                  {item.where}
                </span>
                <span className="lp-vo-chip">{t.chip}</span>
              </figcaption>
            </figure>
          );
        })}
      </div>
      <div className="lp-vo-ui">
        <p className="lp-vo-count" role="status">
          {at + 1} <span>{t.of(total)}</span>
        </p>
        <button type="button" className="lp-round" aria-label={t.prev} onClick={() => turn(-1)}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <button type="button" className="lp-round" aria-label={t.next} onClick={() => turn(1)}>
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
