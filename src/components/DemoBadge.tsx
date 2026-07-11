// The "this is a demo" visual cue. One definition so the pill reads
// identically wherever it appears (app header, login). Hovering it
// explains what "demo" means here — expectation-setting for people
// Mo sends the link to, who arrive with zero context.

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export default function DemoBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="inline-flex cursor-default items-center rounded-full border border-[#B8853A]/50 bg-[#B8853A]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#8B6324] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8853A]/60"
        >
          Demo
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[240px]">
        Ada is an early build, moving fast. Explore freely — rough edges are expected, and the
        feedback button feeds directly into what gets built next.
      </TooltipContent>
    </Tooltip>
  );
}
