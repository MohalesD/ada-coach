// The leading-question reframer: a question with its leading phrases
// flagged, and the question Ada would hand back instead.

import { useState } from 'react';
import { ArrowRight, RotateCcw, Sparkles } from 'lucide-react';
import { DIFFERENCE as t } from '@/content/landing';

export default function Reframer() {
  const [index, setIndex] = useState(0);
  const [reframed, setReframed] = useState(false);
  const item = t.reframes[index] ?? t.reframes[0];
  const total = t.reframes.length;

  function next() {
    setIndex((n) => (n + 1) % total);
    setReframed(false);
  }

  return (
    <div className={`lp-rf${reframed ? ' lp-rf-done' : ''}`}>
      <div className="lp-rf-card lp-rf-asked">
        <p className="lp-label">{t.askedLabel}</p>
        <p className="lp-rf-q" key={index}>
          {item.asked.map(([text, flag], n) =>
            flag ? (
              <mark key={n} style={{ ['--n' as string]: n }}>
                {text}
                <small>{flag}</small>
              </mark>
            ) : (
              <span key={n}>{text}</span>
            ),
          )}
        </p>
      </div>

      <div className="lp-rf-card lp-rf-better" aria-live="polite">
        <p className="lp-label">
          <Sparkles aria-hidden="true" />
          {t.betterLabel}
        </p>
        {reframed ? (
          <div key={index} className="lp-rf-answer">
            <p className="lp-rf-q">{item.better}</p>
            <p className="lp-rf-why">{item.why}</p>
          </div>
        ) : (
          <div className="lp-rf-wait" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        )}
      </div>

      <div className="lp-rf-actions">
        {reframed ? (
          <button type="button" className="lp-btn lp-btn-ghost" onClick={() => setReframed(false)}>
            <RotateCcw aria-hidden="true" />
            {t.again}
          </button>
        ) : (
          <button type="button" className="lp-btn" onClick={() => setReframed(true)}>
            <Sparkles aria-hidden="true" />
            {t.action}
          </button>
        )}
        <button type="button" className="lp-btn lp-btn-ghost" onClick={next}>
          {t.next}
          <ArrowRight aria-hidden="true" />
        </button>
        <span className="lp-rf-count">{t.count(index + 1, total)}</span>
      </div>
    </div>
  );
}
