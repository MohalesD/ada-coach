import { describe, expect, it } from 'vitest';
import {
  TIMESTAMP_WINDOW_S,
  signBridgeRequest,
  timingSafeEqual,
  verifyBridgeRequest,
} from './bridge-signature';

const SECRET = 'test-secret-do-not-use';
const NOW = 1_800_000_000; // fixed "server clock" in seconds
const BODY = JSON.stringify({ action: 'handoff', bj_user_id: 'x' });

async function signed(overrides: Partial<{ ts: number; id: string; body: string; secret: string }> = {}) {
  const ts = String(overrides.ts ?? NOW);
  const id = overrides.id ?? 'req-1';
  const body = overrides.body ?? BODY;
  const signature = await signBridgeRequest(overrides.secret ?? SECRET, ts, id, body);
  return { ts, id, body, signature };
}

describe('verifyBridgeRequest', () => {
  it('accepts a correctly signed request inside the window', async () => {
    const { ts, id, body, signature } = await signed();
    const r = await verifyBridgeRequest({
      secret: SECRET, timestamp: ts, requestId: id, signature, body, nowSeconds: NOW + 10,
    });
    expect(r).toEqual({ ok: true });
  });

  it('accepts an uppercase hex signature (case-insensitive on the wire)', async () => {
    const { ts, id, body, signature } = await signed();
    const r = await verifyBridgeRequest({
      secret: SECRET, timestamp: ts, requestId: id, signature: signature.toUpperCase(), body, nowSeconds: NOW,
    });
    expect(r.ok).toBe(true);
  });

  it('rejects a signature made with a different secret', async () => {
    const { ts, id, body, signature } = await signed({ secret: 'other' });
    const r = await verifyBridgeRequest({
      secret: SECRET, timestamp: ts, requestId: id, signature, body, nowSeconds: NOW,
    });
    expect(r).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a tampered body', async () => {
    const { ts, id, signature } = await signed();
    const r = await verifyBridgeRequest({
      secret: SECRET, timestamp: ts, requestId: id, signature, body: BODY + ' ', nowSeconds: NOW,
    });
    expect(r).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a swapped request id (the id is part of the signed base)', async () => {
    const { ts, body, signature } = await signed({ id: 'req-1' });
    const r = await verifyBridgeRequest({
      secret: SECRET, timestamp: ts, requestId: 'req-2', signature, body, nowSeconds: NOW,
    });
    expect(r).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a timestamp older than the window even with a valid signature', async () => {
    const { ts, id, body, signature } = await signed({ ts: NOW - TIMESTAMP_WINDOW_S - 1 });
    const r = await verifyBridgeRequest({
      secret: SECRET, timestamp: ts, requestId: id, signature, body, nowSeconds: NOW,
    });
    expect(r).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a timestamp too far in the future (clock skew is bounded both ways)', async () => {
    const { ts, id, body, signature } = await signed({ ts: NOW + TIMESTAMP_WINDOW_S + 1 });
    const r = await verifyBridgeRequest({
      secret: SECRET, timestamp: ts, requestId: id, signature, body, nowSeconds: NOW,
    });
    expect(r).toEqual({ ok: false, reason: 'expired' });
  });

  it('accepts exactly at the window edge', async () => {
    const { ts, id, body, signature } = await signed({ ts: NOW - TIMESTAMP_WINDOW_S });
    const r = await verifyBridgeRequest({
      secret: SECRET, timestamp: ts, requestId: id, signature, body, nowSeconds: NOW,
    });
    expect(r.ok).toBe(true);
  });

  it('rejects missing or malformed headers before touching the secret', async () => {
    expect(
      await verifyBridgeRequest({ secret: SECRET, timestamp: null, requestId: 'a', signature: 'b', body: BODY }),
    ).toEqual({ ok: false, reason: 'malformed' });
    expect(
      await verifyBridgeRequest({ secret: SECRET, timestamp: 'now', requestId: 'a', signature: 'b', body: BODY }),
    ).toEqual({ ok: false, reason: 'malformed' });
    expect(
      await verifyBridgeRequest({ secret: SECRET, timestamp: String(NOW), requestId: null, signature: 'b', body: BODY }),
    ).toEqual({ ok: false, reason: 'malformed' });
    expect(
      await verifyBridgeRequest({ secret: SECRET, timestamp: String(NOW), requestId: 'a', signature: null, body: BODY }),
    ).toEqual({ ok: false, reason: 'malformed' });
  });
});

describe('timingSafeEqual', () => {
  it('is true only for identical strings, including a length mismatch', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'ab')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
  });
});
