import { describe, expect, it } from 'vitest';
import { bridgeReturnTo, safeReturnTo } from './return-to';

const SPRINT = '64f1a99f-9bb2-40cd-a80d-0f0dc36ac675';

describe('bridgeReturnTo', () => {
  it('builds the sprint arrival path', () => {
    expect(bridgeReturnTo(SPRINT, 'permanent')).toBe(`/sprint/${SPRINT}?arrived=bridge&mode=permanent`);
  });

  it('marks a self sign-in arrival differently, so the sprint banner can tell them apart', () => {
    expect(bridgeReturnTo(SPRINT, 'session', true)).toBe(
      `/sprint/${SPRINT}?arrived=bridge-self&mode=session`,
    );
  });
});

describe('safeReturnTo', () => {
  it('accepts exactly what bridgeReturnTo produces', () => {
    for (const mode of ['permanent', 'session'] as const) {
      for (const self of [false, true]) {
        const path = bridgeReturnTo(SPRINT, mode, self);
        expect(safeReturnTo(path)).toBe(path);
      }
    }
    expect(safeReturnTo(`/sprint/${SPRINT}`)).toBe(`/sprint/${SPRINT}`);
  });

  it('rejects anything that could leave the app', () => {
    for (const bad of [
      'https://evil.example/sprint/' + SPRINT,
      '//evil.example/sprint/' + SPRINT,
      '/\\evil.example',
      `/sprint/${SPRINT}/../../admin`,
      `/sprint/${SPRINT}?arrived=bridge&mode=permanent&next=https://evil.example`,
      `/sprint/${SPRINT}#//evil.example`,
      'javascript:alert(1)',
      '/admin',
      '/',
      '/sprint/not-a-uuid',
      ` /sprint/${SPRINT}`,
      `/sprint/${SPRINT}\n`,
      `/sprint/${SPRINT}?arrived=bridge-other&mode=session`,
    ]) {
      expect(safeReturnTo(bad), bad).toBeNull();
    }
  });

  it('rejects non-strings', () => {
    for (const bad of [null, undefined, 42, {}, [`/sprint/${SPRINT}`]]) {
      expect(safeReturnTo(bad)).toBeNull();
    }
  });
});
