// Risk ranking tests (Run 2): the one definition of "riskiest" that the
// evidence step, prioritize pre-suggestions, and risk map all share.

import { describe, expect, it } from 'vitest';
import { pickRiskiest, rankByRisk, riskScore } from './risk';

describe('riskScore', () => {
  it('scores a high-impact pure guess as the maximum', () => {
    expect(riskScore({ confidence: 1, impact: 5 })).toBe(25);
  });

  it('scores a validated low-impact assumption as the minimum', () => {
    expect(riskScore({ confidence: 5, impact: 1 })).toBe(1);
  });
});

describe('rankByRisk', () => {
  it('orders by risk descending', () => {
    const ranked = rankByRisk([
      { id: 'safe', confidence: 5, impact: 2 },
      { id: 'deadly-guess', confidence: 1, impact: 5 },
      { id: 'middling', confidence: 3, impact: 3 },
    ]);
    expect(ranked.map((a) => a.id)).toEqual([
      'deadly-guess',
      'middling',
      'safe',
    ]);
  });

  it('breaks score ties by impact, then lower confidence', () => {
    // 2*(6-2)=8 vs 4*(6-4)=8 — the higher-impact one wins.
    const ranked = rankByRisk([
      { id: 'low-impact', confidence: 2, impact: 2 },
      { id: 'high-impact', confidence: 4, impact: 4 },
    ]);
    expect(ranked[0].id).toBe('high-impact');
  });

  it('does not mutate the input', () => {
    const input = [
      { id: 'a', confidence: 5, impact: 1 },
      { id: 'b', confidence: 1, impact: 5 },
    ];
    rankByRisk(input);
    expect(input[0].id).toBe('a');
  });
});

describe('pickRiskiest', () => {
  it('returns the top n', () => {
    const picked = pickRiskiest(
      [
        { id: 'a', confidence: 5, impact: 1 },
        { id: 'b', confidence: 1, impact: 5 },
        { id: 'c', confidence: 2, impact: 4 },
        { id: 'd', confidence: 3, impact: 3 },
      ],
      3,
    );
    expect(picked.map((a) => a.id)).toEqual(['b', 'c', 'd']);
  });
});
