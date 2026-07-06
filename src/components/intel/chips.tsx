// Shared chips for the intel surfaces (Run 5). Every stored intel claim
// is dated and confidence-labeled; these chips are the one visual
// vocabulary for both, so the market brief, competitor profiles, gap
// analysis, and report all read the same way (Locality Law 7: preserve
// learned placement and meaning).

import { CalendarDays } from 'lucide-react';
import type { ConfidenceLabel } from '@/types/discovery';

// Never color alone: the label text always carries the meaning.
const CONFIDENCE_STYLES: Record<ConfidenceLabel, string> = {
  strong: 'bg-success/10 text-success border-success/30',
  moderate: 'bg-info/10 text-info border-info/30',
  thin: 'bg-warning/10 text-warning border-warning/30',
  none: 'bg-destructive/10 text-destructive border-destructive/30',
};

const CONFIDENCE_COPY: Record<ConfidenceLabel, string> = {
  strong: 'Strong evidence',
  moderate: 'Moderate evidence',
  thin: 'Thin evidence',
  none: 'No usable evidence',
};

export function ConfidenceChip({ label }: { label: ConfidenceLabel }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CONFIDENCE_STYLES[label]}`}
    >
      {CONFIDENCE_COPY[label]}
    </span>
  );
}

export function formatRetrieved(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function RetrievedChip({ iso, prefix = 'Retrieved' }: { iso: string; prefix?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <CalendarDays size={11} aria-hidden />
      {prefix} {formatRetrieved(iso)}
    </span>
  );
}

// Anthropic web search server-tool fee, mirrored from
// _shared/models.ts WEB_SEARCH_COST_PER_REQUEST_USD — surfaced so the PM
// sees the cost of a run BEFORE starting it.
export const SEARCH_FEE_USD = 0.01;

// Per-run search allocations, mirrored from _shared/intel-config.ts so
// the cost notes the PM reads match what the server will actually spend.
export function briefRunSearches(budget: number): number {
  return Math.max(1, Math.min(6, budget));
}

export function identifyRunSearches(budget: number): number {
  return Math.max(1, Math.min(3, budget));
}

export function perCompetitorSearches(budget: number, count: number): number {
  if (count < 1 || count > budget) return 0;
  return Math.min(5, Math.floor(budget / count));
}

export function searchFeeNote(maxSearches: number): string {
  const fee = (maxSearches * SEARCH_FEE_USD).toFixed(2);
  return `Uses up to ${maxSearches} web search${maxSearches === 1 ? '' : 'es'} (~$${fee} in search fees, plus model tokens).`;
}
