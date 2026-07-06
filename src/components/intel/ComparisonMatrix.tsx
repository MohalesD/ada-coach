// Comparison matrix (Run 5). Rendered straight from the stored,
// source-cited competitor rows — no model restatement, so nothing here
// can drift from the evidence. Wide content scrolls inside its own
// container at small widths; the page never scrolls sideways.

import { RetrievedChip } from '@/components/intel/chips';
import type { Competitor } from '@/types/discovery';

export default function ComparisonMatrix({ competitors }: { competitors: Competitor[] }) {
  const profiled = competitors.filter((c) => c.profiled_at !== null);
  if (profiled.length < 2) return null;

  const latest = profiled
    .map((c) => c.retrieved_at)
    .sort()
    .at(-1);

  return (
    <div className="rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
        <h3 className="font-display text-base font-semibold tracking-tight">Side by side</h3>
        {latest && <RetrievedChip iso={latest} prefix="As of" />}
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">
                Competitor
              </th>
              <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">
                Positioning
              </th>
              <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">
                Pricing
              </th>
              <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">
                Recent moves
              </th>
            </tr>
          </thead>
          <tbody>
            {profiled.map((c) => (
              <tr key={c.id} className="border-b border-border/60 align-top last:border-0">
                <th scope="row" className="px-5 py-3 font-medium text-foreground">
                  {c.name}
                </th>
                <td className="max-w-[16rem] px-4 py-3 leading-relaxed text-muted-foreground">
                  {c.positioning ?? '—'}
                </td>
                <td className="max-w-[12rem] px-4 py-3 leading-relaxed text-muted-foreground">
                  {c.pricing_signal ?? '—'}
                </td>
                <td className="max-w-[16rem] px-4 py-3 leading-relaxed text-muted-foreground">
                  {c.recent_moves ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
