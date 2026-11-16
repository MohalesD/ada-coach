// Public landing page at / for signed-out visitors (signed-in visitors get
// the chat, see HomeRoute). Every section is a working miniature of the
// product, driven by sample data; nothing here calls the backend.

import { useRef, type CSSProperties, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown,
  ArrowRight,
  Compass,
  FileText,
  Globe,
  GraduationCap,
  Info,
  MessagesSquare,
  Mic,
  Pointer,
  ShieldCheck,
  StickyNote,
} from 'lucide-react';
import {
  CAPABILITIES,
  CHROME,
  CLOSE,
  DIFFERENCE,
  FAQ,
  HERO,
  NAV_LINKS,
  NEVER,
  RISK,
  ROADMAP_TEASER,
  RULES,
  SPRINT,
  TRACKS,
  VOICES,
} from '@/content/landing';
import { ROADMAP, STATUS_COPY, STATUS_ORDER, countByStatus } from '@/content/roadmap';
import { Heading, SiteFooter, SiteNav, StartLink } from '@/components/landing/SiteChrome';
import HeroDemo from '@/components/landing/HeroDemo';
import Reframer from '@/components/landing/Reframer';
import SprintTour from '@/components/landing/SprintTour';
import RiskPlayground from '@/components/landing/RiskPlayground';
import Tracks from '@/components/landing/Tracks';
import Faq from '@/components/landing/Faq';
import Voices from '@/components/landing/Voices';
import { useReveal, useSpy, useStill } from '@/components/landing/hooks';
import '@/components/landing/landing.css';

const NAV_IDS = NAV_LINKS.map((link) => link.href.slice(1));

const CAPABILITY_ICONS = {
  chat: MessagesSquare,
  sprint: Compass,
  intel: Globe,
  portfolio: GraduationCap,
  notes: StickyNote,
  reports: FileText,
  voice: Mic,
  privacy: ShieldCheck,
};

/** The hero title a word at a time, so each can rise in; the emphasised word gets a hand-drawn underline. */
function HeroTitle() {
  let index = 0;
  return (
    <h1 className="lp-h1">
      {HERO.title.map(([text, strong], run) =>
        text.split(' ').map((word, n) => {
          const i = index++;
          return (
            <span key={`${run}-${n}`} className="lp-w" style={{ '--i': i } as CSSProperties}>
              {strong ? (
                <em className="lp-true">
                  {word}
                  <svg viewBox="0 0 120 14" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M3 9 C 28 2, 52 13, 78 6 S 108 5, 117 8" pathLength="1" />
                  </svg>
                </em>
              ) : (
                word
              )}{' '}
            </span>
          );
        }),
      )}
    </h1>
  );
}

export default function Landing() {
  const rootRef = useRef<HTMLDivElement>(null);
  const still = useStill();
  useReveal(rootRef, still);
  const here = useSpy(NAV_IDS);
  const counts = countByStatus();
  const highlights = ROADMAP.filter((item) => ROADMAP_TEASER.highlights.includes(item.id));

  // A warm light follows a mouse across the hero.
  function onHeroMove(event: PointerEvent<HTMLElement>) {
    if (still || event.pointerType !== 'mouse') return;
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', `${event.clientX - box.left}px`);
    event.currentTarget.style.setProperty('--my', `${event.clientY - box.top}px`);
  }

  return (
    <div className="lp" ref={rootRef}>
      <a href="#main" className="lp-skip">
        {CHROME.skip}
      </a>

      <SiteNav dark>
        <nav className="lp-nav-links" aria-label={CHROME.onThisPage}>
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={here === link.href.slice(1) ? 'lp-here' : undefined}
            >
              {link.text}
            </a>
          ))}
          <Link to="/roadmap">{CHROME.roadmap}</Link>
        </nav>
      </SiteNav>

      <section className="lp-hero" onPointerMove={onHeroMove}>
        <div className="lp-hero-glow" aria-hidden="true" />
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <HeroTitle />
            <p className="lp-hero-lede">{HERO.lede}</p>
            <div className="lp-hero-cta">
              <StartLink className="lp-btn lp-btn-lg">
                {HERO.primary}
                <ArrowRight aria-hidden="true" />
              </StartLink>
              <a href="#difference" className="lp-btn lp-btn-lg lp-btn-quiet">
                {HERO.secondary}
                <ArrowDown aria-hidden="true" />
              </a>
            </div>
            <p className="lp-hero-note">{HERO.note}</p>
          </div>
          <HeroDemo still={still} />
        </div>

        <div className="lp-never" aria-label={NEVER.label} role="group">
          <p className="lp-never-label">{NEVER.label}</p>
          <div className="lp-never-track">
            {/* The list runs twice so the loop has no seam; the copy is hidden from screen readers. */}
            {[0, 1].map((copy) => (
              <ul key={copy} aria-hidden={copy === 1}>
                {NEVER.lines.map((line) => (
                  <li key={line}>
                    <s>{line}</s>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </section>

      <main id="main">
        <section className="lp-sec" id="difference" aria-labelledby="lp-difference-title">
          <div className="lp-wrap lp-split">
            <div data-rv>
              <Heading lines={DIFFERENCE.title} id="lp-difference-title" />
              <p className="lp-lede">{DIFFERENCE.lede}</p>
              <ul className="lp-rules" aria-label={RULES.title}>
                {RULES.items.map((rule) => (
                  <li key={rule.name}>
                    <b>{rule.name}</b> {rule.body}
                  </li>
                ))}
              </ul>
            </div>
            <div data-rv style={{ '--d': '0.12s' } as CSSProperties}>
              <Reframer />
            </div>
          </div>
        </section>

        <section className="lp-sec lp-sec-tint" id="sprint" aria-labelledby="lp-sprint-title">
          <div className="lp-wrap">
            <div className="lp-sec-head" data-rv>
              <Heading lines={SPRINT.title} id="lp-sprint-title" />
              <p className="lp-lede">{SPRINT.lede}</p>
            </div>
            <div data-rv>
              <SprintTour still={still} />
            </div>
          </div>
        </section>

        <section className="lp-sec" id="risk" aria-labelledby="lp-risk-title">
          <div className="lp-wrap">
            <div className="lp-sec-head" data-rv>
              <Heading lines={RISK.title} id="lp-risk-title" />
              <p className="lp-lede">{RISK.lede}</p>
              <p className="lp-try">
                <Pointer aria-hidden="true" />
                {RISK.tryIt}
              </p>
            </div>
            <div data-rv>
              <RiskPlayground still={still} />
            </div>
          </div>
        </section>

        <section className="lp-sec lp-sec-dark" aria-labelledby="lp-tracks-title">
          <div className="lp-wrap">
            <div className="lp-sec-head" data-rv>
              <Heading lines={TRACKS.title} id="lp-tracks-title" />
            </div>
            <div data-rv>
              <Tracks />
            </div>
          </div>
        </section>

        <section className="lp-sec" id="capabilities" aria-labelledby="lp-cap-title">
          <div className="lp-wrap">
            <div className="lp-sec-head" data-rv>
              <Heading lines={CAPABILITIES.title} id="lp-cap-title" />
              <p className="lp-lede">{CAPABILITIES.lede}</p>
            </div>
            <ul className="lp-caps">
              {CAPABILITIES.items.map((item, n) => {
                const Icon = CAPABILITY_ICONS[item.id];
                return (
                  <li key={item.id} data-rv style={{ '--d': `${(n % 4) * 0.07}s` } as CSSProperties}>
                    <span className="lp-cap-icon">
                      <Icon aria-hidden="true" />
                    </span>
                    <h3>{item.name}</h3>
                    <p>{item.body}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="lp-sec lp-sec-tint" id="voices" aria-labelledby="lp-voices-title">
          <div className="lp-wrap lp-split">
            <div data-rv>
              <Heading lines={VOICES.title} id="lp-voices-title" />
              <p className="lp-vo-note">
                <Info aria-hidden="true" />
                <span>{VOICES.note}</span>
              </p>
            </div>
            <div data-rv>
              <Voices still={still} />
            </div>
          </div>
        </section>

        <section className="lp-sec" aria-labelledby="lp-road-title">
          <div className="lp-wrap lp-split">
            <div data-rv>
              <Heading lines={ROADMAP_TEASER.title} id="lp-road-title" />
              <p className="lp-lede">{ROADMAP_TEASER.lede}</p>
              <p className="lp-road-counts">
                {STATUS_ORDER.map((status) => (
                  <span key={status} className="lp-status" data-status={status}>
                    <i aria-hidden="true" />
                    <b>{counts[status]}</b> {STATUS_COPY[status].label.toLowerCase()}
                  </span>
                ))}
              </p>
              <Link to="/roadmap" className="lp-btn">
                {ROADMAP_TEASER.link}
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            <ul className="lp-road-peek">
              {highlights.map((item, n) => (
                <li key={item.id} data-rv style={{ '--d': `${n * 0.1}s` } as CSSProperties}>
                  <span className="lp-status" data-status={item.status}>
                    <i aria-hidden="true" />
                    {STATUS_COPY[item.status].label}
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.summary}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-sec lp-sec-tint" id="faq" aria-labelledby="lp-faq-title">
          <div className="lp-wrap lp-faq-grid">
            <div data-rv>
              <h2 className="lp-h2" id="lp-faq-title">
                {FAQ.title}
              </h2>
            </div>
            <div data-rv>
              <Faq />
            </div>
          </div>
        </section>

        <section className="lp-close" aria-labelledby="lp-close-title">
          <div className="lp-hero-glow" aria-hidden="true" />
          <div className="lp-wrap" data-rv>
            <Heading lines={CLOSE.title} id="lp-close-title" />
            <p className="lp-lede">{CLOSE.lede}</p>
            <div className="lp-hero-cta">
              <StartLink className="lp-btn lp-btn-lg">
                {CLOSE.primary}
                <ArrowRight aria-hidden="true" />
              </StartLink>
              <Link to="/login" className="lp-btn lp-btn-lg lp-btn-quiet">
                {CLOSE.secondary}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
