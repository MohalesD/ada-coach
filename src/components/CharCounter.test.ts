import { describe, expect, it } from 'vitest';
import { isOverLimit } from './CharCounter';

// The contract that matters: inputs using CharCounter must not truncate, so
// callers need a truthful "are they over?" to gate submit on. Being exactly at
// the limit is allowed — the DB CHECK constraints are `<= max`, not `< max`.
describe('isOverLimit', () => {
  it('is false below the limit', () => {
    expect(isOverLimit('a'.repeat(3999), 4000)).toBe(false);
  });

  it('is false exactly at the limit', () => {
    expect(isOverLimit('a'.repeat(4000), 4000)).toBe(false);
  });

  it('is true one character past the limit', () => {
    expect(isOverLimit('a'.repeat(4001), 4000)).toBe(true);
  });

  it('is false for empty input', () => {
    expect(isOverLimit('', 4000)).toBe(false);
  });
});
