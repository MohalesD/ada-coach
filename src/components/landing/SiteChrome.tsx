// The frame both public pages share: Ada's mark, the sticky bar, the footer.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { CHROME, FOOTER } from '@/content/landing';
import { useStuck } from './hooks';

/** The "A" monogram from the favicon, drawn inline so it can sit on any background. */
export function AdaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="ada-mark-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8B6324" />
          <stop offset="100%" stopColor="#D9A555" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="24" fill="url(#ada-mark-grad)" />
      <path
        d="M48,14 L52,14 L88,88 L12,88 Z M48,44 L52,44 L63,88 L37,88 Z"
        fill="#FAF7F0"
        fillRule="evenodd"
      />
      <rect x="40" y="57" width="20" height="13" fill="#FAF7F0" />
    </svg>
  );
}

/** "Start free" opens the sign-up form; Login reads `state.mode`. */
export function StartLink({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Link to="/login" state={{ mode: 'signup' }} className={className}>
      {children}
    </Link>
  );
}

export function SiteNav({ children, dark = false }: { children?: ReactNode; dark?: boolean }) {
  const stuck = useStuck();
  return (
    <header className={`lp-nav${stuck ? ' lp-stuck' : ''}${dark ? ' lp-nav-dark' : ''}`}>
      <div className="lp-wrap lp-nav-row">
        <Link to="/" className="lp-brand" aria-label={CHROME.home}>
          <AdaMark className="lp-brand-mark" />
          <span className="lp-brand-name">{CHROME.product}</span>
          <span className="lp-tag">{CHROME.tag}</span>
        </Link>
        {children}
        <div className="lp-nav-end">
          <Link to="/login" className="lp-nav-signin">
            {CHROME.signIn}
          </Link>
          <StartLink className="lp-btn lp-btn-sm">
            {CHROME.start}
            <ArrowRight aria-hidden="true" />
          </StartLink>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="lp-foot">
      <div className="lp-wrap lp-foot-row">
        <p className="lp-foot-line">
          <AdaMark className="lp-foot-mark" />
          {FOOTER.line}
        </p>
        <nav aria-label="Footer">
          {FOOTER.links.map((link) => (
            <Link key={link.to} to={link.to}>
              {link.text}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

/** A two-line section heading; the second line is the italic one. */
export function Heading({ lines, id }: { lines: readonly string[]; id?: string }) {
  return (
    <h2 className="lp-h2" id={id}>
      {lines[0]}
      {lines[1] && (
        <>
          {' '}
          <em>{lines[1]}</em>
        </>
      )}
    </h2>
  );
}
