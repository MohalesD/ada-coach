import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  callClaude,
  isRetryableFailure,
  MAX_ATTEMPTS,
  REQUEST_TIMEOUT_MS,
  RETRY_DELAY_MS,
} from './anthropic';

/**
 * The 53-second hang, 2026-09-11.
 *
 * A single fetch to Anthropic sat for 53 seconds and then returned
 * 500 {"type":"timeout_error"}. The caller was Ada's zero-click first read on
 * a sprint arriving from Builder Journal, so the user landed in a sprint with
 * no read waiting. The same fault hit their next turn; their third attempt
 * succeeded in 6 seconds. Transient, and nothing retried it because there was
 * nothing to retry with.
 *
 * These pin both halves of the fix: every attempt is bounded, and a fault a
 * second attempt can plausibly fix gets one.
 */

const okBody = {
  content: [{ type: 'text', text: 'Ada says hello.' }],
  usage: { input_tokens: 10, output_tokens: 5 },
};

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

const OPTS = {
  apiKey: 'k',
  model: 'claude-haiku-4-5',
  system: 's',
  messages: [{ role: 'user' as const, content: 'hi' }],
  maxTokens: 100,
  // Keep the suite fast; the retry policy is what is under test, not the wait.
  maxAttempts: MAX_ATTEMPTS,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isRetryableFailure', () => {
  it('retries the faults a second attempt can fix', () => {
    // null = no response at all: our own abort, or a dead socket. This is the
    // exact case that produced the 53-second hang.
    expect(isRetryableFailure(null)).toBe(true);
    expect(isRetryableFailure(408)).toBe(true);
    expect(isRetryableFailure(429)).toBe(true);
    expect(isRetryableFailure(500)).toBe(true);
    expect(isRetryableFailure(529)).toBe(true);
  });

  it('does not retry a request that will fail the same way again', () => {
    // A bad key, a malformed body or a blocked model does not improve on the
    // second try; retrying only doubles the wait before the caller finds out.
    expect(isRetryableFailure(400)).toBe(false);
    expect(isRetryableFailure(401)).toBe(false);
    expect(isRetryableFailure(403)).toBe(false);
    expect(isRetryableFailure(404)).toBe(false);
  });
});

describe('callClaude bounds every attempt', () => {
  it('passes an abort signal, so a hung request ends on our clock', async () => {
    fetchMock.mockResolvedValue(jsonResponse(okBody));
    await callClaude(OPTS);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal, 'an unbounded fetch is what hung for 53 seconds').toBeDefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('defaults to a budget below the edge gateway idle limit', () => {
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThan(10_000);
    expect(REQUEST_TIMEOUT_MS).toBeLessThan(60_000);
  });

  it('reports the budget it gave up on, not a bare network error', async () => {
    const abort = Object.assign(new Error('The signal has been aborted'), {
      name: 'TimeoutError',
    });
    fetchMock.mockRejectedValue(abort);
    await expect(callClaude({ ...OPTS, timeoutMs: 5, maxAttempts: 1 })).rejects.toThrow(
      /request failed after 5ms/,
    );
  });
});

describe('callClaude retries a transient fault once', () => {
  it('recovers when the second attempt succeeds', async () => {
    // Exactly the shape of the real incident: a 500 carrying timeout_error,
    // then a clean reply.
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ type: 'error', error: { type: 'timeout_error' } }, 500),
      )
      .mockResolvedValueOnce(jsonResponse(okBody));

    const result = await callClaude(OPTS);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.text).toBe('Ada says hello.');
    expect(result.inputTokens).toBe(10);
  });

  it('retries an aborted attempt, which is the hang itself', async () => {
    fetchMock
      .mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))
      .mockResolvedValueOnce(jsonResponse(okBody));

    const result = await callClaude({ ...OPTS, timeoutMs: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.text).toBe('Ada says hello.');
  });

  it('gives up after MAX_ATTEMPTS and keeps the original error shape', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'boom' }, 500));

    // Every existing catch site, including the non-fatal kickoff path, matches
    // on this string. The retry must not change what failure looks like.
    await expect(callClaude(OPTS)).rejects.toThrow(/^Anthropic API 500:/);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it('does not retry a 400, so a bad request fails fast', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'bad request' }, 400));

    await expect(callClaude(OPTS)).rejects.toThrow(/^Anthropic API 400:/);
    expect(fetchMock, 'a 400 will fail identically on the second try').toHaveBeenCalledTimes(1);
  });

  it('retries an empty reply, which is a success with nothing in it', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ content: [], usage: {} }))
      .mockResolvedValueOnce(jsonResponse(okBody));

    const result = await callClaude(OPTS);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.text).toBe('Ada says hello.');
  });

  it('honours maxAttempts: 1 for a caller that wants no retry', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'boom' }, 500));

    await expect(callClaude({ ...OPTS, maxAttempts: 1 })).rejects.toThrow(/500/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('waits between attempts rather than hammering a struggling API', () => {
    expect(RETRY_DELAY_MS).toBeGreaterThan(0);
    expect(RETRY_DELAY_MS).toBeLessThan(2_000);
  });
});
