// Public roadmap data. One file, so the roadmap can be kept honest without
// touching a component. Source of truth for status is Linear (team Deus
// Labs, project Ada Coach); this list is the public wording of it.
//
// Rules for editing:
// - "live" means merged and running in production, nothing less.
// - No dates, anywhere. Three stages only: live, working on, coming soon.
// - Security issues are described by what the visitor gains, never by the hole.

// Now, next, later.
export type RoadmapStatus = 'live' | 'working' | 'soon';
export type RoadmapTheme = 'coaching' | 'evidence' | 'trust' | 'platform';

export interface RoadmapItem {
  id: string;
  title: string;
  summary: string;
  status: RoadmapStatus;
  theme: RoadmapTheme;
}

// Page chrome for /roadmap.
export const ROADMAP_COPY = {
  title: 'Where Ada is',
  titleEm: 'headed.',
  lede: 'What is in the product now, what is being built, and where Ada goes after that.',
  route: 'Roadmap stages',
  themes: 'Filter by theme',
  all: 'Everything',
  clear: 'Clear filters',
  showing: (n: number, of: number) => `Showing ${n} of ${of}`,
  empty: 'Nothing in this corner yet.',
  closeTitle: 'Something missing?',
  closeBody:
    'The feedback button inside Ada goes straight to the person who builds her, and it shapes what gets built next.',
  back: 'What Ada does',
};

export const STATUS_ORDER: RoadmapStatus[] = ['live', 'working', 'soon'];

export const STATUS_COPY: Record<RoadmapStatus, { label: string; blurb: string }> = {
  live: { label: 'Live', blurb: 'In the product now. Sign in and use it.' },
  working: { label: 'Working on', blurb: 'Scoped and in progress. This is what lands next.' },
  soon: { label: 'Coming soon', blurb: 'Where Ada goes after that. The order can still change.' },
};

export const THEME_COPY: Record<RoadmapTheme, string> = {
  coaching: 'Coaching',
  evidence: 'Evidence',
  trust: 'Trust and privacy',
  platform: 'Platform',
};

export const ROADMAP: RoadmapItem[] = [
  // ── Live ────────────────────────────────────────────────────────────
  {
    id: 'landing-roadmap',
    title: 'A front door and this roadmap',
    summary:
      'A landing page that shows what Ada does before you sign in, and a public roadmap. You are looking at it.',
    status: 'live',
    theme: 'platform',
  },
  {
    id: 'dictation',
    title: 'Dictation',
    summary:
      'Talk instead of type in the chat and sprint composers, in browsers that support speech input.',
    status: 'live',
    theme: 'coaching',
  },
  {
    id: 'bridge',
    title: 'Arrive from Builder Journal',
    summary:
      'Hand an idea over from Builder Journal and Ada opens a sprint with her first read already written.',
    status: 'live',
    theme: 'platform',
  },
  {
    id: 'account-deletion',
    title: 'Delete your own account',
    summary:
      'One button in Settings. Your identity is removed, and the privacy page says plainly what is kept and why.',
    status: 'live',
    theme: 'trust',
  },
  {
    id: 'feedback',
    title: 'Feedback that gets answered',
    summary:
      'A feedback button on every screen, thumbs on every reply, and a real person who can write back.',
    status: 'live',
    theme: 'platform',
  },
  {
    id: 'sign-in',
    title: 'Sturdier sign-in',
    summary: 'Password strength checks, reset by email, sign-in links and a welcome email.',
    status: 'live',
    theme: 'trust',
  },
  {
    id: 'market-intel',
    title: 'Market and competitor research',
    summary:
      'Ada searches the web, profiles the competitors you confirm and lays out the gaps. You see the search budget before it is spent.',
    status: 'live',
    theme: 'evidence',
  },
  {
    id: 'portfolio',
    title: 'Portfolio track',
    summary:
      'For people working toward a first PM role: project ideas matched to your background, coached into a PRD, brief or prototype spec.',
    status: 'live',
    theme: 'coaching',
  },
  {
    id: 'reports',
    title: 'Interview guides and shareable reports',
    summary:
      'A guide built around the assumptions you chose to test, and a report you can export as a PDF or share by link.',
    status: 'live',
    theme: 'evidence',
  },
  {
    id: 'sprint',
    title: 'Discovery Sprint',
    summary:
      'Seven guided steps from a rough idea to a prioritized test plan: ground, map, evidence, blind spots, prioritize, guide, report.',
    status: 'live',
    theme: 'coaching',
  },
  {
    id: 'risk-map',
    title: 'Assumption mapping and the risk map',
    summary:
      'Ada pulls the assumptions out of your plan, scores each for confidence and impact, and plots what to test first.',
    status: 'live',
    theme: 'evidence',
  },
  {
    id: 'library',
    title: 'Coaching grounded in a discovery library',
    summary:
      'Replies draw on a curated library of discovery practice when it is relevant, not only on the model.',
    status: 'live',
    theme: 'evidence',
  },
  {
    id: 'allowance',
    title: 'Daily message allowance',
    summary: 'A daily allowance that refills on its own, so the demo stays free to try.',
    status: 'live',
    theme: 'platform',
  },
  {
    id: 'chat',
    title: 'Coaching chat',
    summary:
      'Multi-turn coaching with search, pins, folders, session summaries and markdown export.',
    status: 'live',
    theme: 'coaching',
  },

  // ── Working on ─────────────────────────────────────────────────────────
  {
    id: 'terms',
    title: 'Terms of use, and a fuller privacy page',
    summary: 'The plain-language privacy page gets a sibling, so the rules are written down in one place.',
    status: 'working',
    theme: 'trust',
  },
  {
    id: 'unlink',
    title: 'Unlink Builder Journal from Settings',
    summary: 'Break the connection from Ada’s side, without going back to Builder Journal.',
    status: 'working',
    theme: 'platform',
  },
  {
    id: 'rate-limits',
    title: 'Request rate limits',
    summary: 'The daily allowance caps how much you can send. This caps how fast, to keep Ada steady for everyone.',
    status: 'working',
    theme: 'trust',
  },
  {
    id: 'notes',
    title: 'Engineering notes, published',
    summary:
      'Write-ups of what went wrong while building Ada and what was decided, starting with “The 53-Second Hang”.',
    status: 'working',
    theme: 'platform',
  },

  // ── Coming soon ─────────────────────────────────────────────────────────
  {
    id: 'audit',
    title: 'Independent isolation audit before the beta opens',
    summary:
      'A full review of who can read what, run before any wider group is invited. The beta does not open until it passes.',
    status: 'soon',
    theme: 'trust',
  },
  {
    id: 'evals',
    title: 'Coaching quality, measured in public',
    summary:
      'A hand-labelled test set and a published score for how well Ada coaches, so the claim can be checked.',
    status: 'soon',
    theme: 'evidence',
  },
  {
    id: 'citations',
    title: 'See what informed an answer',
    summary: 'When Ada draws on the discovery library, show which passages she used.',
    status: 'soon',
    theme: 'evidence',
  },
  {
    id: 'redaction',
    title: 'Stronger redaction for pasted research',
    summary:
      'Emails and identified names are already stripped before storage. This widens what counts as identifying.',
    status: 'soon',
    theme: 'trust',
  },
  {
    id: 'docs',
    title: 'Docs page',
    summary: 'How Ada works, how to get the most from a sprint, and how she was built.',
    status: 'soon',
    theme: 'platform',
  },
  {
    id: 'roles',
    title: 'Roles for teams',
    summary: 'Manager and owner roles with their own views, the groundwork for shared workspaces.',
    status: 'soon',
    theme: 'platform',
  },
  {
    id: 'save-later',
    title: 'Save for later',
    summary: 'Park a question or an assumption mid-session and come back to it from a queue.',
    status: 'soon',
    theme: 'coaching',
  },
  {
    id: 'speed',
    title: 'Faster, steadier replies',
    summary: 'Caching for the parts of a prompt that never change, and automatic recovery when a reply comes back malformed.',
    status: 'soon',
    theme: 'platform',
  },
  {
    id: 'feedback-copy',
    title: 'A copy of your feedback',
    summary: 'Tick a box and get what you sent by email, so you have a record of it.',
    status: 'soon',
    theme: 'platform',
  },
  {
    id: 'referrals',
    title: 'Referral credits',
    summary: 'Invite another PM and both of you get extra messages.',
    status: 'soon',
    theme: 'platform',
  },

  {
    id: 'twin',
    title: 'A discovery twin',
    summary: 'A second agent that plays your customer, so you can rehearse an interview before the real one.',
    status: 'soon',
    theme: 'coaching',
  },
  {
    id: 'whats-new',
    title: 'What’s new page and update emails',
    summary: 'Short notes on what changed, and a way to hear about it without checking back.',
    status: 'soon',
    theme: 'platform',
  },
  {
    id: 'reviewer',
    title: 'Reviewer mode',
    summary: 'Scoped, read-only access for someone evaluating Ada, without a full account.',
    status: 'soon',
    theme: 'trust',
  },
  {
    id: 'model-choice',
    title: 'Model choice',
    summary: 'Route different jobs to different model providers, and let the comparison show in the scores.',
    status: 'soon',
    theme: 'platform',
  },
  {
    id: 'pricing',
    title: 'Pricing and more export formats',
    summary: 'What a paid plan would include, and which formats people want reports in.',
    status: 'soon',
    theme: 'platform',
  },
];

export function countByStatus(items: RoadmapItem[] = ROADMAP): Record<RoadmapStatus, number> {
  const counts: Record<RoadmapStatus, number> = { live: 0, working: 0, soon: 0 };
  for (const item of items) counts[item.status] += 1;
  return counts;
}
