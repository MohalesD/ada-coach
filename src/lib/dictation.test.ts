import { describe, expect, it } from 'vitest';
import { appendDictated, dictationErrorText, mergeTranscript, takeDictation } from './dictation';

describe('mergeTranscript', () => {
  it('appends distinct pieces with one space', () => {
    expect(mergeTranscript('hello', 'world')).toBe('hello world');
  });

  it('collapses the growing prefix Android Chrome re-emits', () => {
    expect(mergeTranscript('just', 'just the')).toBe('just the');
    expect(mergeTranscript('just the', 'just the test')).toBe('just the test');
  });

  it('collapses a sliding-window overlap', () => {
    expect(mergeTranscript('a b c d', 'c d e f')).toBe('a b c d e f');
  });

  it('returns the other side when one is empty', () => {
    expect(mergeTranscript('', 'x')).toBe('x');
    expect(mergeTranscript('x', '  ')).toBe('x');
  });
});

describe('takeDictation', () => {
  it('returns only the words that are new to this session', () => {
    let s = takeDictation('', 'who is the customer');
    expect(s).toEqual({ session: 'who is the customer', delta: 'who is the customer' });
    s = takeDictation(s.session, 'who is the customer really');
    expect(s.delta).toBe('really');
    s = takeDictation(s.session, 'and what do they pay for');
    expect(s.delta).toBe('and what do they pay for');
  });

  it('gives an empty delta for a verbatim re-fire', () => {
    const s = takeDictation('one two', 'one two');
    expect(s.delta).toBe('');
    expect(s.session).toBe('one two');
  });
});

describe('appendDictated', () => {
  it('adds a space only where the words would otherwise touch', () => {
    expect(appendDictated('', 'hello')).toBe('hello');
    expect(appendDictated('I think', 'so')).toBe('I think so');
    expect(appendDictated('I think ', 'so')).toBe('I think so');
    expect(appendDictated('line one\n', 'line two')).toBe('line one\nline two');
  });

  it('leaves the text alone when nothing was heard', () => {
    expect(appendDictated('typed', '')).toBe('typed');
    expect(appendDictated('typed', '   ')).toBe('typed');
  });
});

describe('dictationErrorText', () => {
  it('tells a blocked microphone apart from silence', () => {
    expect(dictationErrorText('not-allowed')).toMatch(/microphone/i);
    expect(dictationErrorText('service-not-allowed')).toMatch(/microphone/i);
    expect(dictationErrorText('no-speech')).toMatch(/hear/i);
  });

  it('has a plain fallback and never shows the raw code', () => {
    const msg = dictationErrorText('audio-capture-weird');
    expect(msg).not.toContain('audio-capture-weird');
    expect(msg.length).toBeGreaterThan(10);
  });

  it('says nothing when the person stopped it themselves', () => {
    expect(dictationErrorText('aborted')).toBeNull();
  });
});
