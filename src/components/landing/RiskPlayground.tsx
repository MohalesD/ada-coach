// A working risk map. The visitor picks a sample assumption and moves its
// confidence and impact; the dot travels and the "test first" ranking
// re-sorts. The score is the product's own formula (src/lib/risk.ts).

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { CATEGORY_LABEL, RISK as t, type SampleAssumption } from '@/content/landing';
import { CATEGORY_COLORS } from '@/components/discovery/RiskMap';
import { rankByRisk, riskScore } from '@/lib/risk';

const SIZE = 400;
const PAD = 34;
const PLOT = SIZE - PAD * 2;
const CELL = PLOT / 5;
// value 1..5 to a cell-centred position
const px = (confidence: number) => PAD + (confidence - 0.5) * CELL;
const py = (impact: number) => PAD + PLOT - (impact - 0.5) * CELL;

/** Dots that share a cell fan out so each stays clickable. */
function offsets(list: SampleAssumption[]): Record<string, [number, number]> {
  const seen = new Map<string, number>();
  const out: Record<string, [number, number]> = {};
  for (const item of list) {
    const cell = `${item.confidence}-${item.impact}`;
    const n = seen.get(cell) ?? 0;
    seen.set(cell, n + 1);
    out[item.id] = n === 0 ? [0, 0] : [n % 2 ? 20 : -20, n > 2 ? 20 : 0];
  }
  return out;
}

export default function RiskPlayground({ still }: { still: boolean }) {
  const [items, setItems] = useState<SampleAssumption[]>(t.assumptions);
  const [picked, setPicked] = useState(t.assumptions[0].id);
  const ranked = useMemo(() => rankByRisk(items), [items]);
  const shift = useMemo(() => offsets(items), [items]);
  const number = (id: string) => t.assumptions.findIndex((item) => item.id === id) + 1;
  const current = items.find((item) => item.id === picked) ?? items[0];
  const changed = items.some((item, n) => {
    const start = t.assumptions[n];
    return item.confidence !== start?.confidence || item.impact !== start?.impact;
  });

  function change(field: 'confidence' | 'impact', value: number) {
    setItems((list) => list.map((item) => (item.id === picked ? { ...item, [field]: value } : item)));
  }

  return (
    <div className="lp-risk">
      <figure className="lp-risk-map" aria-label={t.figure}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label={t.figure}>
          {/* High impact, weak evidence: where discovery goes first. */}
          <rect className="lp-risk-zone" x={PAD} y={PAD} width={CELL * 2} height={CELL * 2} rx="10" />
          <text className="lp-risk-zone-label" x={PAD + 10} y={PAD + 20}>
            {t.zone}
          </text>
          {Array.from({ length: 6 }, (_, n) => (
            <g key={n} className="lp-risk-grid">
              <line x1={PAD + n * CELL} y1={PAD} x2={PAD + n * CELL} y2={PAD + PLOT} />
              <line x1={PAD} y1={PAD + n * CELL} x2={PAD + PLOT} y2={PAD + n * CELL} />
            </g>
          ))}
          <text className="lp-risk-axis" x={PAD} y={SIZE - 10}>
            {t.confidenceEnds[0]}
          </text>
          <text className="lp-risk-axis" x={PAD + PLOT / 2} y={SIZE - 10} textAnchor="middle">
            {t.axisX} →
          </text>
          <text className="lp-risk-axis" x={PAD + PLOT} y={SIZE - 10} textAnchor="end">
            {t.confidenceEnds[1]}
          </text>
          <text
            className="lp-risk-axis"
            transform={`translate(16 ${PAD + PLOT / 2}) rotate(-90)`}
            textAnchor="middle"
          >
            {t.axisY} →
          </text>
          {items.map((item) => {
            const [dx, dy] = shift[item.id] ?? [0, 0];
            const on = item.id === picked;
            return (
              <g
                key={item.id}
                className={`lp-dot${on ? ' lp-on' : ''}`}
                style={{
                  transform: `translate(${px(item.confidence) + dx}px, ${py(item.impact) + dy}px)`,
                }}
                role="button"
                tabIndex={0}
                aria-pressed={on}
                aria-label={`${item.statement}. ${t.score} ${riskScore(item)}`}
                onClick={() => setPicked(item.id)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  setPicked(item.id);
                }}
              >
                <circle className="lp-dot-halo" r="22" />
                <circle r="15" fill={CATEGORY_COLORS[item.category]} />
                <text textAnchor="middle" dy="0.35em">
                  {number(item.id)}
                </text>
              </g>
            );
          })}
        </svg>
      </figure>

      <div className="lp-risk-side">
        <div className="lp-risk-edit">
          <p className="lp-risk-picked">
            <span className="lp-cat" style={{ background: CATEGORY_COLORS[current.category] }}>
              {CATEGORY_LABEL[current.category]}
            </span>
            {current.statement}
          </p>
          <label className="lp-slider">
            <span>{t.confidence}</span>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={current.confidence}
              onChange={(event) => change('confidence', Number(event.target.value))}
            />
            <span className="lp-slider-ends" aria-hidden="true">
              <i>{t.confidenceEnds[0]}</i>
              <i>{t.confidenceEnds[1]}</i>
            </span>
          </label>
          <label className="lp-slider">
            <span>{t.impact}</span>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={current.impact}
              onChange={(event) => change('impact', Number(event.target.value))}
            />
            <span className="lp-slider-ends" aria-hidden="true">
              <i>{t.impactEnds[0]}</i>
              <i>{t.impactEnds[1]}</i>
            </span>
          </label>
          <p className="lp-risk-formula">
            <span>
              {t.score} = {t.formula}
            </span>
            <b key={riskScore(current)}>{riskScore(current)}</b>
          </p>
        </div>

        <div className="lp-risk-rank">
          <p className="lp-label">
            {t.ranking}
            {changed && (
              <button type="button" className="lp-link-btn" onClick={() => setItems(t.assumptions)}>
                <RotateCcw aria-hidden="true" />
                {t.reset}
              </button>
            )}
          </p>
          <ol>
            {ranked.map((item, place) => (
              <motion.li
                key={item.id}
                layout={!still}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className={`${place < 3 ? 'lp-top' : ''}${item.id === picked ? ' lp-on' : ''}`}
              >
                <button type="button" onClick={() => setPicked(item.id)} aria-pressed={item.id === picked}>
                  <span className="lp-rank" style={{ background: CATEGORY_COLORS[item.category] }}>
                    {number(item.id)}
                  </span>
                  <span className="lp-row-text">{item.statement}</span>
                  <span className="lp-score">{riskScore(item)}</span>
                </button>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
