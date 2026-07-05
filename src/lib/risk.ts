// Risk ranking for assumptions (Run 2). One definition of "riskiest",
// used by the evidence step (which assumptions get market-grounded), the
// prioritize step (pre-suggestions), and the risk map (quadrants).
//
// Risk = how badly it breaks (impact) × how little we know (inverted
// confidence). Scores 1..25; a 5-impact pure guess scores 25.

interface Scorable {
  confidence: number;
  impact: number;
}

export function riskScore(a: Scorable): number {
  return a.impact * (6 - a.confidence);
}

// Descending by risk; ties broken by impact (a high-impact known beats a
// low-impact unknown at equal score), then by confidence ascending.
export function rankByRisk<T extends Scorable>(list: T[]): T[] {
  return [...list].sort(
    (a, b) =>
      riskScore(b) - riskScore(a) ||
      b.impact - a.impact ||
      a.confidence - b.confidence,
  );
}

export function pickRiskiest<T extends Scorable>(list: T[], n = 3): T[] {
  return rankByRisk(list).slice(0, n);
}
