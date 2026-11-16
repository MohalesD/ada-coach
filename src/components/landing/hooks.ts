// Small scroll and motion hooks shared by the public pages (landing, roadmap).

import { useEffect, useState, type RefObject } from 'react';

const REDUCED = '(prefers-reduced-motion: reduce)';

/** True when the visitor asked for reduced motion. Everything that moves on its own checks this. */
export function useStill(): boolean {
  const [still, setStill] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(REDUCED).matches === true,
  );
  useEffect(() => {
    const query = window.matchMedia?.(REDUCED);
    if (!query) return;
    const read = () => setStill(query.matches);
    query.addEventListener('change', read);
    return () => query.removeEventListener('change', read);
  }, []);
  return still;
}

/** True once the page has scrolled past the top, for the sticky bar. */
export function useStuck(): boolean {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const read = () => setStuck(window.scrollY > 16);
    read();
    window.addEventListener('scroll', read, { passive: true });
    return () => window.removeEventListener('scroll', read);
  }, []);
  return stuck;
}

/**
 * Elements marked `data-rv` rise in as they scroll into view. Anything
 * already on screen, reduced motion, and browsers without an observer get
 * the finished page at once, so content is never hidden behind an animation.
 */
export function useReveal(root: RefObject<HTMLElement | null>, still: boolean): void {
  useEffect(() => {
    const host = root.current;
    if (still || !host || typeof IntersectionObserver !== 'function') return;
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('lp-in');
          seen.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    host.querySelectorAll<HTMLElement>('[data-rv]').forEach((el) => {
      if (el.getBoundingClientRect().top > window.innerHeight * 0.92) {
        el.classList.add('lp-rv');
        seen.observe(el);
      }
    });
    return () => seen.disconnect();
  }, [root, still]);
}

/** The id of the section currently under the top third of the viewport. */
export function useSpy(ids: readonly string[]): string | null {
  const [here, setHere] = useState<string | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver !== 'function') return;
    const spy = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setHere(entry.target.id);
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) spy.observe(el);
    }
    return () => spy.disconnect();
  }, [ids]);
  return here;
}

/**
 * A step that advances on a timer and waits while `held`. The timer is the
 * source of truth; the CSS fill on the active step is decoration with the
 * same duration.
 */
export function useAutoStep(count: number, ms: number, paused: boolean) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => setStep((s) => (s + 1) % count), ms);
    return () => window.clearTimeout(timer);
  }, [count, ms, paused, step]);
  return [step, setStep] as const;
}
