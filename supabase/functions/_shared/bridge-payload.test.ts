import { describe, expect, it } from 'vitest';
import { BRIEF_MAX, parseBridgeBody, utcDayStart } from './bridge-payload';

const BJ_USER = '11111111-2222-4333-8444-555555555555';
const IDEA = '99999999-8888-4777-8666-555555555555';

function validHandoff(overrides: Record<string, unknown> = {}) {
  return {
    action: 'handoff',
    bj_user_id: BJ_USER,
    email: 'Builder@Example.com',
    display_name: '  Mo  ',
    link_mode: 'permanent',
    idea: {
      id: IDEA,
      title: 'TrailNote',
      brief: 'Idea from Builder Journal: TrailNote\n\nA hiking log that…',
      tags: ['outdoors', ' notes ', ''],
      status: 'captured',
      captured_at: '2026-09-01T10:00:00Z',
      url: 'https://aibuilderjournal.com/ideas/' + IDEA,
    },
    ...overrides,
  };
}

describe('parseBridgeBody', () => {
  it('parses a valid handoff, normalizing email and trimming names/tags', () => {
    const r = parseBridgeBody(validHandoff());
    expect(r.ok).toBe(true);
    if (!r.ok || r.body.action !== 'handoff') throw new Error('expected handoff');
    expect(r.body.email).toBe('builder@example.com');
    expect(r.body.display_name).toBe('Mo');
    expect(r.body.link_mode).toBe('permanent');
    expect(r.body.idea.tags).toEqual(['outdoors', 'notes']);
    expect(r.body.idea.url).toMatch(/^https:\/\//);
  });

  it('parses an unlink with only bj_user_id', () => {
    const r = parseBridgeBody({ action: 'unlink', bj_user_id: BJ_USER, email: 'ignored' });
    expect(r).toEqual({ ok: true, body: { action: 'unlink', bj_user_id: BJ_USER } });
  });

  it('rejects a brief over the intake limit', () => {
    const r = parseBridgeBody(
      validHandoff({ idea: { ...validHandoff().idea, brief: 'x'.repeat(BRIEF_MAX + 1) } }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.errors.join(' ')).toMatch(/brief/);
  });

  it('rejects a bad link_mode', () => {
    const r = parseBridgeBody(validHandoff({ link_mode: 'forever' }));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.errors.join(' ')).toMatch(/link_mode/);
  });

  it('rejects a non-uuid bj_user_id and idea.id', () => {
    const r = parseBridgeBody(
      validHandoff({ bj_user_id: '42', idea: { ...validHandoff().idea, id: 'idea-1' } }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.errors).toHaveLength(2);
  });

  it('rejects a missing email and a non-https url', () => {
    const r = parseBridgeBody(
      validHandoff({ email: undefined, idea: { ...validHandoff().idea, url: 'http://x' } }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.errors.join(' ')).toMatch(/email/);
    expect(r.errors.join(' ')).toMatch(/url/);
  });

  it('rejects an unknown action and a non-object body', () => {
    expect(parseBridgeBody(validHandoff({ action: 'delete' })).ok).toBe(false);
    expect(parseBridgeBody('nope').ok).toBe(false);
    expect(parseBridgeBody(null).ok).toBe(false);
  });

  it('treats display_name as optional', () => {
    const r = parseBridgeBody(validHandoff({ display_name: undefined }));
    expect(r.ok).toBe(true);
    if (!r.ok || r.body.action !== 'handoff') throw new Error();
    expect(r.body.display_name).toBeNull();
  });
});

describe('utcDayStart', () => {
  it('returns midnight UTC of the given instant, regardless of the local zone', () => {
    expect(utcDayStart(new Date('2026-09-07T23:59:59.999Z'))).toBe('2026-09-07T00:00:00.000Z');
    expect(utcDayStart(new Date('2026-09-08T00:00:00.000Z'))).toBe('2026-09-08T00:00:00.000Z');
  });
});
