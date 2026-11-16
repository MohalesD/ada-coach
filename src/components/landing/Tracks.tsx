// The two ways into Ada, as tabs: the Discovery Sprint and the Portfolio track.

import { useRef, useState, type KeyboardEvent } from 'react';
import { Check, Compass, GraduationCap } from 'lucide-react';
import { TRACKS as t } from '@/content/landing';

const ICONS = { sprint: Compass, portfolio: GraduationCap };

export default function Tracks() {
  const [index, setIndex] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = t.tabs[index] ?? t.tabs[0];

  function onKey(event: KeyboardEvent) {
    const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!move) return;
    event.preventDefault();
    const next = (index + move + t.tabs.length) % t.tabs.length;
    setIndex(next);
    tabs.current[next]?.focus();
  }

  return (
    <div className="lp-tracks">
      <div className="lp-tabs" role="tablist" aria-label={t.tablist} onKeyDown={onKey}>
        {t.tabs.map((tab, n) => {
          const Icon = ICONS[tab.id];
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabs.current[n] = el;
              }}
              type="button"
              role="tab"
              id={`lp-tab-${tab.id}`}
              aria-selected={n === index}
              aria-controls={`lp-panel-${tab.id}`}
              tabIndex={n === index ? 0 : -1}
              className="lp-tab"
              onClick={() => setIndex(n)}
            >
              <Icon aria-hidden="true" />
              <span>
                {tab.tab}
                <small>{tab.sub}</small>
              </span>
            </button>
          );
        })}
      </div>
      <div
        className="lp-track-panel"
        role="tabpanel"
        id={`lp-panel-${current.id}`}
        aria-labelledby={`lp-tab-${current.id}`}
        key={current.id}
      >
        <div>
          <h3 className="lp-h3">{current.heading}</h3>
          <p>{current.body}</p>
        </div>
        <ul>
          {current.points.map((point, n) => (
            <li key={point} style={{ ['--n' as string]: n }}>
              <Check aria-hidden="true" />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
