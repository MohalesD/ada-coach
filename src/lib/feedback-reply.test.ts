import { describe, expect, it } from 'vitest';
import { buildReplyMailto, firstName, replyBody, REPLY_SUBJECT } from './feedback-reply';

describe('firstName', () => {
  it('takes the first token of a display name', () => {
    expect(firstName('Mohales Deis')).toBe('Mohales');
  });

  it('falls back to a neutral greeting when there is no name', () => {
    expect(firstName(null)).toBe('there');
    expect(firstName(undefined)).toBe('there');
    expect(firstName('   ')).toBe('there');
  });
});

describe('replyBody', () => {
  it('quotes the feedback so the admin does not have to re-find it', () => {
    const body = replyBody('Mo Deis', 'The composer only shows two lines.');
    expect(body).toContain('Hi Mo,');
    expect(body).toContain('> The composer only shows two lines.');
  });

  it('prefixes every line of a multi-line comment', () => {
    const body = replyBody('Mo', 'first line\nsecond line');
    expect(body).toContain('> first line');
    expect(body).toContain('> second line');
  });

  it('omits the quote block when there is no comment', () => {
    const body = replyBody('Mo', null);
    expect(body).toContain('Hi Mo,');
    expect(body).not.toContain('>');
  });

  it('trims a very long comment with a visible marker', () => {
    const body = replyBody('Mo', 'x'.repeat(5000));
    expect(body).toContain('… [trimmed]');
    expect(body.length).toBeLessThan(1500);
  });

  it('leaves room to write below the quote', () => {
    expect(replyBody('Mo', 'short')).toMatch(/\n\n$/);
  });
});

describe('buildReplyMailto', () => {
  it('encodes the subject and body into a mailto link', () => {
    const href = buildReplyMailto('user@example.com', 'Mo', 'nice work');
    expect(href.startsWith('mailto:user@example.com?')).toBe(true);
    expect(href).toContain(`subject=${encodeURIComponent(REPLY_SUBJECT)}`);
    expect(href).toContain(encodeURIComponent('> nice work'));
  });

  it('escapes characters that would otherwise break the URL', () => {
    const href = buildReplyMailto('user@example.com', 'Mo', 'a&b=c #d');
    expect(href).not.toContain('a&b=c');
    expect(href).toContain(encodeURIComponent('a&b=c #d'));
  });
});
