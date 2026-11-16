// Public roadmap at /roadmap. A route of four stations (live, up next,
// planned, exploring); picking a station or a theme filters the list in
// place. Data lives in src/content/roadmap.ts.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, X } from 'lucide-react';
import {
  ROADMAP,
  ROADMAP_COPY as COPY,
  STATUS_COPY,
  STATUS_ORDER,
  THEME_COPY,
  countByStatus,
  type RoadmapStatus,
  type RoadmapTheme,
} from '@/content/roadmap';
import { CHROME } from '@/content/landing';
import { SiteFooter, SiteNav, StartLink } from '@/components/landing/SiteChrome';
import { useStill } from '@/components/landing/hooks';
import '@/components/landing/landing.css';


const THEMES = Object.keys(THEME_COPY) as RoadmapTheme[];
const COUNT_MS = 900;

/** Counts up from zero once, on load. Shows the final number at once under reduced motion. */
function CountUp({ to, still }: { to: number; still: boolean }) {
  const [counted, setShown] = useState(0);
  const shown = still ? to : counted;
  const frame = useRef(0);
  useEffect(() => {
    if (still) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      setShown(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [to, still]);
  return <b>{shown}</b>;
}

export default function Roadmap() {
  const still = useStill();
  const [status, setStatus] = useState<RoadmapStatus | null>(null);
  const [theme, setTheme] = useState<RoadmapTheme | null>(null);
  const counts = useMemo(() => countByStatus(), []);

  useEffect(() => {
    const before = document.title;
    document.title = 'Roadmap · Ada Coach';
    return () => {
      document.title = before;
    };
  }, []);

  const visible = ROADMAP.filter(
    (item) => (!status || item.status === status) && (!theme || item.theme === theme),
  );
  const groups = STATUS_ORDER.map((key) => ({
    key,
    items: visible.filter((item) => item.status === key),
  })).filter((group) => group.items.length > 0);
  const filtered = status !== null || theme !== null;

  return (
    <div className="lp rm">
      <a href="#main" className="lp-skip">
        {CHROME.skip}
      </a>
      <SiteNav dark>
        <nav className="lp-nav-links" aria-label="Site">
          <Link to="/">{COPY.back}</Link>
          <Link to="/roadmap" className="lp-here" aria-current="page">
            {CHROME.roadmap}
          </Link>
        </nav>
      </SiteNav>

      <section className="lp-hero rm-hero">
        <div className="lp-hero-glow" aria-hidden="true" />
        <div className="lp-wrap">
          <h1 className="lp-h1 rm-h1">
            <span className="lp-w" style={{ '--i': 0 } as CSSProperties}>
              {COPY.title}
            </span>{' '}
            <span className="lp-w" style={{ '--i': 2 } as CSSProperties}>
              <em>{COPY.titleEm}</em>
            </span>
          </h1>
          <p className="lp-hero-lede">{COPY.lede}</p>

          <div className="rm-route" role="group" aria-label={COPY.route}>
            <span className="rm-route-line" aria-hidden="true">
              <i />
            </span>
            {STATUS_ORDER.map((key, n) => (
              <button
                key={key}
                type="button"
                className="rm-station"
                data-status={key}
                aria-pressed={status === key}
                style={{ '--n': n } as CSSProperties}
                onClick={() => setStatus(status === key ? null : key)}
              >
                <span className="rm-station-dot" aria-hidden="true">
                  {key === 'live' && <Check />}
                </span>
                <span className="rm-station-count">
                  <CountUp to={counts[key]} still={still} />
                </span>
                <span className="rm-station-label">{STATUS_COPY[key].label}</span>
                <span className="rm-station-blurb">{STATUS_COPY[key].blurb}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <main id="main" className="lp-sec rm-main">
        <div className="lp-wrap">
          <div className="rm-filters">
            <div className="lp-chips" role="group" aria-label={COPY.themes}>
              <button
                type="button"
                className="lp-chip"
                aria-pressed={theme === null}
                onClick={() => setTheme(null)}
              >
                {COPY.all}
              </button>
              {THEMES.map((key) => (
                <button
                  key={key}
                  type="button"
                  className="lp-chip"
                  aria-pressed={theme === key}
                  onClick={() => setTheme(theme === key ? null : key)}
                >
                  {THEME_COPY[key]}
                </button>
              ))}
            </div>
            <p className="rm-showing" role="status">
              {COPY.showing(visible.length, ROADMAP.length)}
              {filtered && (
                <button
                  type="button"
                  className="lp-link-btn"
                  onClick={() => {
                    setStatus(null);
                    setTheme(null);
                  }}
                >
                  <X aria-hidden="true" />
                  {COPY.clear}
                </button>
              )}
            </p>
          </div>

          {groups.length === 0 && <p className="rm-empty">{COPY.empty}</p>}

          {groups.map((group) => (
            <section key={group.key} className="rm-group" aria-labelledby={`rm-${group.key}`}>
              <header className="rm-group-head">
                <h2 id={`rm-${group.key}`} className="lp-status rm-group-title" data-status={group.key}>
                  <i aria-hidden="true" />
                  {STATUS_COPY[group.key].label}
                  <span>{group.items.length}</span>
                </h2>
                <p>{STATUS_COPY[group.key].blurb}</p>
              </header>
              <ul className="rm-cards">
                <AnimatePresence initial={false} mode="popLayout">
                  {group.items.map((item) => (
                    <motion.li
                      key={item.id}
                      layout={!still}
                      initial={still ? false : { opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={still ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      className="rm-card"
                      data-status={item.status}
                    >
                      <p className="rm-card-meta">
                        <span>{THEME_COPY[item.theme]}</span>
                        {item.shipped && <time>{item.shipped}</time>}
                      </p>
                      <h3>{item.title}</h3>
                      <p>{item.summary}</p>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          ))}

          <p className="rm-reconciled">{COPY.reconciled}</p>
        </div>
      </main>

      <section className="lp-close" aria-labelledby="rm-close-title">
        <div className="lp-hero-glow" aria-hidden="true" />
        <div className="lp-wrap">
          <h2 className="lp-h2" id="rm-close-title">
            {COPY.closeTitle}
          </h2>
          <p className="lp-lede">{COPY.closeBody}</p>
          <div className="lp-hero-cta">
            <StartLink className="lp-btn lp-btn-lg">
              {CHROME.start}
              <ArrowRight aria-hidden="true" />
            </StartLink>
            <Link to="/" className="lp-btn lp-btn-lg lp-btn-quiet">
              {COPY.back}
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
