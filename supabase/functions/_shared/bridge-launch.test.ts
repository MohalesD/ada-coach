import { describe, expect, it } from 'vitest';
import { buildLaunchUrl, launchSignIn, TARGET_DAILY_HANDOFF_CAP } from './bridge-launch';
import { DAILY_HANDOFF_CAP } from './bridge-payload';

const APP = 'https://ada-coach.vercel.app';
const SPRINT = '64f1a99f-9bb2-40cd-a80d-0f0dc36ac675';

describe('launchSignIn', () => {
  it('mints a sign-in only for the plain user role', () => {
    expect(launchSignIn('user')).toBe('magiclink');
  });

  it('never mints one for an admin or an owner', () => {
    expect(launchSignIn('admin')).toBe('self');
    expect(launchSignIn('owner')).toBe('self');
  });

  it('fails closed on a role it does not know', () => {
    // An allowlist, not a denylist: a role added later (or a corrupted value)
    // must not inherit one-click sign-in by default.
    for (const role of ['', 'superadmin', 'Owner', 'USER', ' user', 'moderator']) {
      expect(launchSignIn(role)).toBe('self');
    }
    expect(launchSignIn(null)).toBe('self');
    expect(launchSignIn(undefined)).toBe('self');
  });
});

describe('buildLaunchUrl', () => {
  it('carries the token hash for a magic-link launch', () => {
    const url = new URL(
      buildLaunchUrl(APP, { sessionId: SPRINT, mode: 'permanent', signIn: 'magiclink', tokenHash: 'abc123' }),
    );
    expect(url.origin + url.pathname).toBe(`${APP}/bridge`);
    expect(url.searchParams.get('th')).toBe('abc123');
    expect(url.searchParams.get('sprint')).toBe(SPRINT);
    expect(url.searchParams.get('mode')).toBe('permanent');
    expect(url.searchParams.has('signin')).toBe(false);
  });

  it('carries no credential at all for a self sign-in launch', () => {
    const raw = buildLaunchUrl(APP, { sessionId: SPRINT, mode: 'session', signIn: 'self', tokenHash: null });
    const url = new URL(raw);
    expect(url.searchParams.get('signin')).toBe('self');
    expect(url.searchParams.get('sprint')).toBe(SPRINT);
    expect(url.searchParams.has('th')).toBe(false);
    // Nothing in it is secret: the whole string is a sprint id and two flags.
    expect([...url.searchParams.keys()].sort()).toEqual(['mode', 'signin', 'sprint']);
  });

  it('drops a token hash handed to a self launch rather than leaking it', () => {
    const raw = buildLaunchUrl(APP, { sessionId: SPRINT, mode: 'session', signIn: 'self', tokenHash: 'leak-me' });
    expect(raw).not.toContain('leak-me');
    expect(new URL(raw).searchParams.has('th')).toBe(false);
  });

  it('refuses to build a magic-link launch with no token', () => {
    expect(
      buildLaunchUrl(APP, { sessionId: SPRINT, mode: 'session', signIn: 'magiclink', tokenHash: null }),
    ).toBeNull();
    expect(
      buildLaunchUrl(APP, { sessionId: SPRINT, mode: 'session', signIn: 'magiclink', tokenHash: '' }),
    ).toBeNull();
  });

  it('always lands on APP_URL, whatever path it was configured with', () => {
    const url = new URL(
      buildLaunchUrl(`${APP}/some/old/path?x=1`, { sessionId: SPRINT, mode: 'session', signIn: 'self', tokenHash: null })!,
    );
    expect(url.origin).toBe(APP);
    expect(url.pathname).toBe('/bridge');
    expect(url.searchParams.has('x')).toBe(false);
  });
});

describe('TARGET_DAILY_HANDOFF_CAP', () => {
  it('is no looser than the per-sender cap', () => {
    expect(TARGET_DAILY_HANDOFF_CAP).toBeLessThanOrEqual(DAILY_HANDOFF_CAP);
  });
});
