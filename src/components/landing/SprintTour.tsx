// The Discovery Sprint in seven scenes, one per real step of the product.
// It plays by itself, waits under the pointer or focus, and every step is
// a button. With reduced motion it never advances on its own.

import { useState, type CSSProperties } from 'react';
import { Check, FileDown, Link2, Minus, Search } from 'lucide-react';
import { CATEGORY_LABEL, RISK, SPRINT as t, type SprintStepKey } from '@/content/landing';
import { CATEGORY_COLORS } from '@/components/discovery/RiskMap';
import { pickRiskiest, riskScore } from '@/lib/risk';
import { useAutoStep } from './hooks';

// Matches the fill animation on the active step (landing.css, .lp-step-bar).
export const SCENE_MS = 5600;

const a = t.art;
const TOP = pickRiskiest(RISK.assumptions, 3);

function Scene({ step }: { step: SprintStepKey }) {
  switch (step) {
    case 'grounding':
      return (
        <div className="lp-scene-stack">
          <p className="lp-paper">{a.intake}</p>
          <p className="lp-pill-row">
            <span className="lp-label">{a.stageLabel}</span>
            <span className="lp-pill">{a.stage}</span>
          </p>
          <p className="lp-ask">{a.asks}</p>
        </div>
      );
    case 'mapping':
      return (
        <ul className="lp-rows">
          {RISK.assumptions.slice(0, 4).map((item, n) => (
            <li key={item.id} style={{ '--n': n } as CSSProperties}>
              <span className="lp-cat" style={{ background: CATEGORY_COLORS[item.category] }}>
                {CATEGORY_LABEL[item.category]}
              </span>
              <span className="lp-row-text">{item.statement}</span>
              <span className="lp-score" title={RISK.score}>
                {riskScore(item)}
              </span>
            </li>
          ))}
        </ul>
      );
    case 'evidence':
      return (
        <div className="lp-scene-stack">
          <p className="lp-search">
            <Search aria-hidden="true" />
            {a.evidenceFor}
          </p>
          <ul className="lp-rows">
            {a.sources.map((source, n) => (
              <li key={source.text} style={{ '--n': n + 1 } as CSSProperties}>
                <span className={`lp-verdict lp-${source.kind}`}>
                  {source.kind === 'supports' ? <Check aria-hidden="true" /> : <Minus aria-hidden="true" />}
                  {source.kind === 'supports' ? a.supports : a.contradicts}
                </span>
                <span className="lp-row-text">
                  {source.text}
                  <small>{source.from}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'blind_spots':
      return (
        <ul className="lp-rows lp-blind">
          {a.blind.map((line, n) => (
            <li key={line} style={{ '--n': n } as CSSProperties}>
              <span className="lp-q" aria-hidden="true">
                ?
              </span>
              <span className="lp-row-text">{line}</span>
            </li>
          ))}
        </ul>
      );
    case 'prioritize':
      return (
        <div className="lp-scene-stack">
          <p className="lp-label">{a.top}</p>
          <ol className="lp-rows lp-ranked">
            {TOP.map((item, n) => (
              <li key={item.id} style={{ '--n': n } as CSSProperties}>
                <span className="lp-rank">{n + 1}</span>
                <span className="lp-row-text">{item.statement}</span>
                <span className="lp-meter" aria-hidden="true">
                  <i style={{ width: `${(riskScore(item) / 25) * 100}%` }} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      );
    case 'guide':
      return (
        <div className="lp-scene-stack">
          <p className="lp-label">{a.guideFor}</p>
          <ol className="lp-rows lp-guide">
            {a.guide.map((line, n) => (
              <li key={line} style={{ '--n': n } as CSSProperties}>
                <span className="lp-rank">{n + 1}</span>
                <span className="lp-row-text">{line}</span>
              </li>
            ))}
          </ol>
        </div>
      );
    case 'report':
      return (
        <div className="lp-report">
          <div className="lp-report-page">
            <p className="lp-report-title">{a.reportTitle}</p>
            <p className="lp-report-meta">{a.reportMeta}</p>
            <i />
            <i />
            <i />
          </div>
          <p className="lp-pill-row">
            <span className="lp-pill">
              <FileDown aria-hidden="true" />
              {a.pdf}
            </span>
            <span className="lp-pill">
              <Link2 aria-hidden="true" />
              {a.share}
            </span>
          </p>
        </div>
      );
  }
}

export default function SprintTour({ still }: { still: boolean }) {
  const [held, setHeld] = useState(false);
  const [step, setStep] = useAutoStep(t.steps.length, SCENE_MS, still || held);
  const current = t.steps[step] ?? t.steps[0];

  return (
    <figure
      className="lp-tour"
      aria-label={t.figure}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className="lp-steps" role="group" aria-label={t.stepsLabel}>
        {t.steps.map((item, n) => (
          <button
            key={item.key}
            type="button"
            className={`lp-step${n === step ? ' lp-on' : ''}${n < step ? ' lp-past' : ''}`}
            aria-current={n === step ? 'step' : undefined}
            onClick={() => setStep(n)}
          >
            <span className="lp-step-n">{n + 1}</span>
            <span className="lp-step-label">{item.label}</span>
            <span className="lp-step-bar" aria-hidden="true">
              {/* Remounts on every step and on release, so the fill restarts with the timer. */}
              {n === step && !still && <i key={`${step}-${held}`} data-held={held} />}
            </span>
          </button>
        ))}
      </div>

      <div className="lp-tour-stage">
        <div className="lp-tour-copy" key={`copy-${current.key}`}>
          <p className="lp-tour-count">
            {String(step + 1).padStart(2, '0')}
            <span> / {String(t.steps.length).padStart(2, '0')}</span>
          </p>
          <h3 className="lp-h3">{current.title}</h3>
          <p>{current.body}</p>
        </div>
        <div className="lp-tour-art">
          <p className="lp-tour-sample">{t.sample}</p>
          <div className="lp-scene" key={current.key}>
            <Scene step={current.key} />
          </div>
        </div>
      </div>
    </figure>
  );
}
