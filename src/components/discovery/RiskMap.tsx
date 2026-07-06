// Confidence-by-impact risk map (Run 2 Must-Have). Renders the session's
// assumptions on a 5×5 grid: X = how strong the evidence is, Y = how
// badly the idea breaks if the assumption is false. The top-left
// quadrant (high impact, weak evidence) is where discovery goes first.
//
// All colors are inline attributes, not CSS classes, so the same SVG
// serializes cleanly to PNG for the PDF export. Color is never the only
// signal: every dot is numbered against the legend, categories also
// differ by label, and prioritized dots carry a ring + the legend badge.

import type { AssumptionCategory } from '@/types/discovery';

export interface RiskMapAssumption {
  id: string;
  statement: string;
  category: AssumptionCategory;
  confidence: number;
  impact: number;
  is_prioritized: boolean;
}

// Warm-harmonized category colors (from the Run 2 palette; all deep
// enough to carry cream numerals).
export const CATEGORY_COLORS: Record<AssumptionCategory, string> = {
  desirability: '#B8853A',
  viability: '#A34E0D',
  feasibility: '#46688B',
  usability: '#4A7031',
};

const ESPRESSO = '#2C2214';
const CREAM = '#FAF7F0';
const GRID = '#DCCDB2';

const W = 560;
const H = 470;
const M = { top: 26, right: 22, bottom: 58, left: 64 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

// value 1..5 → cell-centered position fraction
const fx = (v: number) => M.left + ((v - 0.5) / 5) * PW;
const fy = (v: number) => M.top + PH - ((v - 0.5) / 5) * PH;

// Cluster offsets so co-located dots stay readable.
const JITTER = [
  [0, 0],
  [16, 0],
  [-16, 0],
  [0, 16],
  [0, -16],
  [16, 16],
  [-16, -16],
  [16, -16],
  [-16, 16],
] as const;

export default function RiskMap({
  assumptions,
  svgId,
  showLegend = true,
  threatenedIds,
}: {
  assumptions: RiskMapAssumption[];
  svgId?: string;
  showLegend?: boolean;
  // Run 5: assumptions a competitive threat pressures (from the gap
  // analysis) carry a flag marker + a legend badge.
  threatenedIds?: Set<string>;
}) {
  const cellCounts = new Map<string, number>();
  const midX = M.left + PW / 2;
  const midY = M.top + PH / 2;

  return (
    <div>
      <svg
        id={svgId}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Risk map of ${assumptions.length} assumptions plotted by confidence and impact`}
        className="h-auto w-full"
        style={{ maxWidth: 640 }}
      >
        <title>Confidence-by-impact risk map</title>
        {/* canvas */}
        <rect x={0} y={0} width={W} height={H} fill={CREAM} rx={12} />

        {/* quadrant tints */}
        <rect x={M.left} y={M.top} width={PW / 2} height={PH / 2} fill="#A93226" opacity={0.09} />
        <rect x={midX} y={M.top} width={PW / 2} height={PH / 2} fill="#B8853A" opacity={0.1} />
        <rect x={midX} y={midY} width={PW / 2} height={PH / 2} fill="#4A7031" opacity={0.07} />

        {/* grid */}
        {[1, 2, 3, 4, 5].map((v) => (
          <g key={v}>
            <line
              x1={fx(v)}
              y1={M.top}
              x2={fx(v)}
              y2={M.top + PH}
              stroke={GRID}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
            <line
              x1={M.left}
              y1={fy(v)}
              x2={M.left + PW}
              y2={fy(v)}
              stroke={GRID}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
            <text
              x={fx(v)}
              y={M.top + PH + 18}
              textAnchor="middle"
              fontSize={12}
              fill={ESPRESSO}
              opacity={0.7}
            >
              {v}
            </text>
            <text
              x={M.left - 14}
              y={fy(v) + 4}
              textAnchor="end"
              fontSize={12}
              fill={ESPRESSO}
              opacity={0.7}
            >
              {v}
            </text>
          </g>
        ))}

        {/* frame */}
        <rect
          x={M.left}
          y={M.top}
          width={PW}
          height={PH}
          fill="none"
          stroke={ESPRESSO}
          strokeOpacity={0.35}
          strokeWidth={1.25}
        />

        {/* quadrant labels */}
        <text
          x={M.left + 10}
          y={M.top + 18}
          fontSize={11}
          fontWeight={700}
          letterSpacing="0.08em"
          fill="#A93226"
        >
          TEST THESE FIRST
        </text>
        <text
          x={M.left + PW - 10}
          y={M.top + 18}
          textAnchor="end"
          fontSize={11}
          fontWeight={700}
          letterSpacing="0.08em"
          fill="#8B6324"
        >
          CORE BETS
        </text>
        <text
          x={M.left + 10}
          y={M.top + PH - 10}
          fontSize={11}
          fontWeight={700}
          letterSpacing="0.08em"
          fill={ESPRESSO}
          opacity={0.45}
        >
          PARK FOR NOW
        </text>
        <text
          x={M.left + PW - 10}
          y={M.top + PH - 10}
          textAnchor="end"
          fontSize={11}
          fontWeight={700}
          letterSpacing="0.08em"
          fill="#4A7031"
        >
          SAFE ENOUGH
        </text>

        {/* axis titles */}
        <text
          x={M.left + PW / 2}
          y={H - 14}
          textAnchor="middle"
          fontSize={13}
          fontWeight={600}
          fill={ESPRESSO}
        >
          Confidence — how strong your evidence is →
        </text>
        <text
          x={18}
          y={M.top + PH / 2}
          textAnchor="middle"
          fontSize={13}
          fontWeight={600}
          fill={ESPRESSO}
          transform={`rotate(-90 18 ${M.top + PH / 2})`}
        >
          Impact if wrong →
        </text>

        {/* dots */}
        {assumptions.map((a, i) => {
          const key = `${a.confidence}-${a.impact}`;
          const n = cellCounts.get(key) ?? 0;
          cellCounts.set(key, n + 1);
          const [dx, dy] = JITTER[Math.min(n, JITTER.length - 1)];
          const cx = fx(a.confidence) + dx;
          const cy = fy(a.impact) + dy;
          return (
            <g key={a.id}>
              {a.is_prioritized && (
                <circle cx={cx} cy={cy} r={17} fill="none" stroke={ESPRESSO} strokeWidth={2} />
              )}
              <circle cx={cx} cy={cy} r={13} fill={CATEGORY_COLORS[a.category]} />
              <text
                x={cx}
                y={cy + 4.5}
                textAnchor="middle"
                fontSize={13}
                fontWeight={700}
                fill={CREAM}
              >
                {i + 1}
              </text>
              {threatenedIds?.has(a.id) && (
                <path
                  d={`M ${cx + 9} ${cy - 17} l 11 6.5 l -11 6.5 z`}
                  fill="#A34E0D"
                  stroke={CREAM}
                  strokeWidth={1.25}
                />
              )}
            </g>
          );
        })}
      </svg>

      {showLegend && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {(Object.keys(CATEGORY_COLORS) as AssumptionCategory[]).map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLORS[c] }}
                />
                {c}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full border-2 border-foreground"
              />
              prioritized
            </span>
            {threatenedIds && threatenedIds.size > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-0 w-0 border-y-[5px] border-l-[9px] border-y-transparent"
                  style={{ borderLeftColor: '#A34E0D' }}
                />
                competitive threat
              </span>
            )}
          </div>
          <ol className="space-y-1 text-sm">
            {assumptions.map((a, i) => (
              <li key={a.id} className="flex gap-2">
                <span
                  className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-primary-foreground"
                  style={{ backgroundColor: CATEGORY_COLORS[a.category] }}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span className="text-foreground/90">
                  {a.statement}
                  {a.is_prioritized && (
                    <span className="ml-1.5 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      prioritized
                    </span>
                  )}
                  {threatenedIds?.has(a.id) && (
                    <span className="ml-1.5 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                      competitive threat
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
