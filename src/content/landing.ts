// Every string on the public landing page. Components hold no copy.
// House rules for this file: no em or en dashes, no testimonials, no
// customer counts, nothing claimed that the product does not do today.

import type { AssumptionCategory } from '@/types/discovery';

export const NAV_LINKS = [
  { href: '#difference', text: 'The difference' },
  { href: '#sprint', text: 'The sprint' },
  { href: '#risk', text: 'Risk map' },
  { href: '#capabilities', text: 'What she does' },
  { href: '#voices', text: 'Voices' },
  { href: '#faq', text: 'Questions' },
] as const;

export const HERO = {
  // [text, emphasised]. The emphasised run is set in italic and underlined by hand.
  title: [
    ['Find out what’s', false],
    ['true', true],
    ['before you build it.', false],
  ] as const,
  lede: 'Ada is an AI customer discovery coach for product managers. She pressure-tests your assumptions, reframes your leading questions and walks you to evidence, one focused question at a time.',
  primary: 'Start free',
  secondary: 'See how she thinks',
  note: 'Free while Ada is in demo. No card.',
};

export interface Exchange {
  id: string;
  chip: string;
  said: string;
  reply: string;
  move: string;
}

export const DEMO = {
  figure: 'A sample coaching exchange',
  invite: 'Pick something a PM might say',
  you: 'You',
  ada: 'Ada',
  moveLabel: 'The move',
  disclaimer: 'Scripted sample. Sign in for the real conversation.',
  exchanges: [
    {
      id: 'love',
      chip: '“Users will love it”',
      said: 'Our users will love an AI summary of their weekly reports.',
      reply:
        '“Will love” is a prediction, and so far it is yours, not theirs. Before the summary exists, something else already happens with those reports every week. Who was the last person you watched read one, and what did they do right after?',
      move: 'Past behavior over predictions',
    },
    {
      id: 'pay',
      chip: '“They said they’d pay”',
      said: 'I asked ten customers if they would pay for it. Eight said yes.',
      reply:
        'A yes to a hypothetical costs nothing to give, so it tells you they are polite, not that they will pay. The stronger signal is what they already spend on this. What are those eight paying today, in money or hours, to get around the problem?',
      move: 'Commitment over compliments',
    },
    {
      id: 'churn',
      chip: '“Onboarding is the problem”',
      said: 'Churn is high because our onboarding is too long.',
      reply:
        'That is one explanation, and it arrived fully formed. Long onboarding could be the cause, or a symptom of people not yet seeing why the effort is worth it. When your last three customers left, what did they say they were going back to?',
      move: 'Five Whys',
    },
  ] satisfies Exchange[],
};

export const NEVER = {
  label: 'Things Ada will never tell you',
  lines: [
    'Great idea!',
    'Users will love this.',
    'You should definitely build it.',
    'That sounds validated.',
    'Here are twelve questions to ask.',
    'I’m sure they’ll pay.',
    'No need to talk to customers.',
  ],
};

export interface Reframe {
  /** The leading question, split into plain and flagged runs. */
  asked: readonly (readonly [text: string, flag?: string])[];
  better: string;
  why: string;
}

export const DIFFERENCE = {
  title: ['The question you ask', 'decides the answer you get.'],
  lede: 'Most discovery goes wrong before the customer says a word. Ada catches the question that leads the witness and hands back one that finds something out.',
  askedLabel: 'What you were going to ask',
  betterLabel: 'What Ada hands back',
  action: 'Reframe it',
  again: 'Show the original',
  next: 'Next question',
  count: (n: number, of: number) => `${n} of ${of}`,
  reframes: [
    {
      asked: [
        ['Would you use', 'Asks them to predict'],
        [' a tool that '],
        ['saves you time', 'Pitches the benefit'],
        [' on reports?'],
      ],
      better: 'Walk me through the last time you put a report together.',
      why: 'A real event instead of a forecast. You hear the actual steps, tools and annoyances, including the ones you did not think to ask about.',
    },
    {
      asked: [
        ['Don’t you find', 'Invites agreement'],
        [' it '],
        ['frustrating', 'Supplies the feeling'],
        [' to switch between five apps?'],
      ],
      better: 'How do you move work between the apps you use today?',
      why: 'No feeling is suggested, so whatever feeling shows up is theirs. If switching is fine for them, you find that out too.',
    },
    {
      asked: [
        ['How much '],
        ['would you pay', 'Hypothetical money'],
        [' for '],
        ['this feature', 'Assumes the solution'],
        ['?'],
      ],
      better: 'What have you already tried or bought to deal with this?',
      why: 'Money and effort already spent is evidence. A number said out loud in an interview is not.',
    },
  ] satisfies Reframe[],
};

export type SprintStepKey =
  | 'grounding'
  | 'mapping'
  | 'evidence'
  | 'blind_spots'
  | 'prioritize'
  | 'guide'
  | 'report';

export interface SprintStep {
  key: SprintStepKey;
  label: string;
  title: string;
  body: string;
}

export const SPRINT = {
  title: ['From a rough idea', 'to a plan worth testing.'],
  lede: 'A Discovery Sprint is seven guided steps. Ada does the reading, sorting and searching. You make every call.',
  stepsLabel: 'Steps of a Discovery Sprint',
  figure: 'A sample Discovery Sprint',
  sample: 'Sample sprint: Tally, meal planning for shift workers',
  steps: [
    {
      key: 'grounding',
      label: 'Ground',
      title: 'Tell her where you are',
      body: 'Describe the product in your own words or paste a brief. Ada reads it, works out how far along your discovery is, and asks about what is missing.',
    },
    {
      key: 'mapping',
      label: 'Map',
      title: 'See what you are betting on',
      body: 'She pulls out the assumptions hiding in the plan and sorts them: desirability, viability, feasibility, usability. Each one gets a score for confidence and for impact.',
    },
    {
      key: 'evidence',
      label: 'Evidence',
      title: 'Check the riskiest against the market',
      body: 'The assumptions that could sink the idea are searched on the web. You get what supports them, what contradicts them, and links you can open.',
    },
    {
      key: 'blind_spots',
      label: 'Blind spots',
      title: 'Hear what you did not say',
      body: 'A plan is also the things it leaves out. Ada names the gaps so you can decide which ones matter.',
    },
    {
      key: 'prioritize',
      label: 'Prioritize',
      title: 'Choose what to test first',
      body: 'Everything lands on a risk map: how badly it breaks against how little you know. Ada suggests the top three. You pick.',
    },
    {
      key: 'guide',
      label: 'Guide',
      title: 'Walk in with better questions',
      body: 'An interview guide built around the assumptions you chose, with questions about what people did, not what they think they would do.',
    },
    {
      key: 'report',
      label: 'Report',
      title: 'Leave with something to show',
      body: 'A report you can export as a PDF or share by link. Come back after the interviews and record what you learned.',
    },
  ] satisfies SprintStep[],
  art: {
    intake:
      'Shift workers can’t plan meals around rotating schedules. Tally builds a weekly plan from your roster and orders the groceries.',
    stageLabel: 'Ada’s read',
    stage: 'Problem not yet validated',
    asks: 'Who have you watched plan a week of meals on a rotating roster?',
    supports: 'Supports',
    contradicts: 'Contradicts',
    evidenceFor: 'They will pay $6 a month',
    sources: [
      { kind: 'supports', text: 'Meal-kit subscriptions hold steady among night-shift nurses', from: 'industry survey' },
      { kind: 'contradicts', text: 'Most planning apps lose free users inside two weeks', from: 'app retention report' },
    ] as const,
    blind: [
      'Who does the shopping in a shift worker’s household?',
      'What happens when the roster changes mid-week?',
      'Nothing here says how people find Tally.',
    ],
    guideFor: 'Testing: shift workers plan meals a week ahead',
    guide: [
      'Tell me about the last week your shifts changed. What did you eat?',
      'When did you last plan meals in advance? What made you start?',
      'What do you do when the plan falls apart?',
    ],
    reportTitle: 'Tally: discovery report',
    reportMeta: '6 assumptions · 3 prioritized · 4 sources',
    pdf: 'Export PDF',
    share: 'Share link',
    top: 'Test first',
  },
};

export interface SampleAssumption {
  id: string;
  statement: string;
  category: AssumptionCategory;
  confidence: number;
  impact: number;
}

export const CATEGORY_LABEL: Record<AssumptionCategory, string> = {
  desirability: 'Desirability',
  viability: 'Viability',
  feasibility: 'Feasibility',
  usability: 'Usability',
};

export const RISK = {
  title: ['Not every unknown', 'deserves an interview.'],
  lede: 'Risk is how badly an assumption breaks the idea, multiplied by how little you know about it. Move the sliders and watch what rises to the top.',
  figure: 'Risk map of the sample assumptions',
  tryIt: 'Pick an assumption, then change how sure you are.',
  confidence: 'How strong is the evidence?',
  impact: 'How badly does it break?',
  confidenceEnds: ['A guess', 'Proven'],
  impactEnds: ['Shrug', 'Fatal'],
  axisX: 'Evidence',
  axisY: 'Impact',
  zone: 'Test first',
  ranking: 'What to test first',
  score: 'Risk',
  formula: 'impact × (6 − confidence)',
  reset: 'Reset',
  assumptions: [
    { id: 'a1', statement: 'Shift workers plan meals a week ahead', category: 'desirability', confidence: 2, impact: 5 },
    { id: 'a2', statement: 'They will pay $6 a month', category: 'viability', confidence: 1, impact: 4 },
    { id: 'a3', statement: 'A rotating roster is easy to enter on a phone', category: 'usability', confidence: 2, impact: 3 },
    { id: 'a4', statement: 'Grocery services cover their local stores', category: 'feasibility', confidence: 3, impact: 3 },
    { id: 'a5', statement: 'Night-shift workers cook at home', category: 'desirability', confidence: 4, impact: 4 },
    { id: 'a6', statement: 'Employers will share shift calendars', category: 'feasibility', confidence: 1, impact: 2 },
  ] satisfies SampleAssumption[],
};

export const TRACKS = {
  title: ['Two ways in.', 'Ada asks which one is yours.'],
  tablist: 'Where are you starting from?',
  tabs: [
    {
      id: 'sprint',
      tab: 'I have a product or an idea',
      sub: 'Discovery Sprint',
      heading: 'Pressure-test it before you spend the quarter on it.',
      body: 'Bring a product, a feature or a hunch. Ada maps the assumptions underneath it, checks the riskiest ones against the market and sends you into customer interviews with a guide.',
      points: [
        'Assumptions scored and plotted on a risk map',
        'Market evidence with sources you can open',
        'Competitor profiles and a gap analysis',
        'An interview guide and a shareable report',
      ],
    },
    {
      id: 'portfolio',
      tab: 'I’m working toward a PM role',
      sub: 'Portfolio track',
      heading: 'Build the artifact that gets you the interview.',
      body: 'Share your background and the roles you want. Ada proposes project ideas that fit, each with an AI-native angle, then coaches one into a PRD, a product brief or a prototype spec you can defend.',
      points: [
        'Project ideas matched to your experience',
        'Coaching through the plan, section by section',
        'A PRD, brief or prototype spec at the end',
        'A public link for your portfolio',
      ],
    },
  ],
} as const;

export const CAPABILITIES = {
  title: ['Everything Ada does', 'today.'],
  lede: 'Not a roadmap. Each of these is in the product now.',
  items: [
    {
      id: 'chat',
      name: 'Coaching chat',
      body: 'Bring an idea, a draft interview script or a hunch. Ada answers in a few sentences and one question, drawing on Jobs to Be Done, Five Whys and assumption mapping.',
    },
    {
      id: 'sprint',
      name: 'Discovery Sprint',
      body: 'Seven guided steps from a rough idea to a prioritized test plan. Leave mid-sprint and pick up where you stopped.',
    },
    {
      id: 'intel',
      name: 'Market and competitor research',
      body: 'Ada searches the web, profiles the competitors you confirm and lays out the gaps. You see the search budget before it is spent.',
    },
    {
      id: 'portfolio',
      name: 'Portfolio track',
      body: 'For people working toward a first PM role: project ideas matched to your background, coached into an artifact you can show.',
    },
    {
      id: 'notes',
      name: 'Your research, redacted',
      body: 'Paste interview notes into a sprint. Emails and the names Ada can identify are stripped before anything is stored, and she flags what she is unsure about.',
    },
    {
      id: 'reports',
      name: 'Reports and exports',
      body: 'Sprint reports as a PDF or a share link. Any conversation as markdown, with its session summary.',
    },
    {
      id: 'voice',
      name: 'Dictation',
      body: 'Think out loud. Dictate into the chat and sprint composers in browsers that support speech input.',
    },
    {
      id: 'privacy',
      name: 'Your data, your call',
      body: 'Your sessions are visible to your account only. Delete the account yourself from Settings, and read exactly what is kept in the privacy page.',
    },
  ],
} as const;

export const RULES = {
  title: 'How Ada coaches',
  items: [
    { name: 'She never validates.', body: 'An assumption gets tested, not applauded.' },
    { name: 'One question at a time.', body: 'A list of twelve gets none of them answered.' },
    { name: 'Short on purpose.', body: 'A few sentences, then your turn.' },
    { name: 'Evidence over opinion.', body: 'Yours, hers and the customer’s.' },
  ],
} as const;

export const VOICES = {
  title: ['What we want PMs', 'to say.'],
  note: 'Sample voices. Ada is an early demo, so these are the reactions we are building toward, not customer quotes yet.',
  group: 'Sample voices',
  chip: 'Sample voice',
  prev: 'Previous voice',
  next: 'Next voice',
  of: (of: number) => `of ${of}`,
  // [text, emphasised]
  items: [
    {
      quote: [
        ['I walked in sure about the feature. Twenty minutes later I had ', false],
        ['three assumptions I had never said out loud', true],
        ['.', false],
      ],
      who: 'An early-stage PM',
      where: 'B2B software',
      initials: 'PM',
    },
    {
      quote: [
        ['She would not tell me the idea was good. ', false],
        ['That turned out to be the useful part.', true],
      ],
      who: 'A founder doing her own discovery',
      where: 'Pre-seed startup',
      initials: 'FD',
    },
    {
      quote: [
        ['My interview guide used to be a list of yes or no questions. Now ', false],
        ['customers tell me stories', true],
        ['.', false],
      ],
      who: 'A product manager',
      where: 'Marketplace team',
      initials: 'MT',
    },
    {
      quote: [
        ['We dropped a quarter of the roadmap before writing a line of code. ', false],
        ['The risk map made it an easy call.', true],
      ],
      who: 'A head of product',
      where: 'Growing startup',
      initials: 'HP',
    },
    {
      quote: [
        ['I had no PM title and no portfolio. I left with ', false],
        ['a PRD I could defend in an interview', true],
        ['.', false],
      ],
      who: 'An aspiring PM',
      where: 'Career switcher',
      initials: 'AP',
    },
  ] as { quote: [string, boolean][]; who: string; where: string; initials: string }[],
};

export const ROADMAP_TEASER = {
  title: ['Built in the open.', 'Here’s what is next.'],
  lede: 'Ada is an early build that moves fast. The roadmap is public: what is live, what is being worked on and what is coming soon.',
  link: 'Open the full roadmap',
  highlights: ['evals', 'audit', 'twin'],
};

export const FAQ = {
  title: 'Questions',
  items: [
    {
      q: 'What is Ada, in one breath?',
      a: 'An AI coach for customer discovery. You bring a product idea or a question you plan to ask customers. Ada pushes on the assumptions underneath it and helps you find out whether they hold, before you build.',
    },
    {
      q: 'Does Ada replace talking to customers?',
      a: 'No. She gets you ready for it. Ada helps you decide what to test, checks what the market already says and writes the interview guide. The conversations with customers are still yours to have.',
    },
    {
      q: 'Why won’t she just tell me my idea is good?',
      a: 'Because she cannot know, and neither can you yet. Agreement feels helpful and teaches you nothing. Ada is built to ask the question that finds out.',
    },
    {
      q: 'What does “Demo” mean?',
      a: 'Ada is an early build, moving fast. Explore freely. Rough edges are expected, and the feedback button feeds directly into what gets built next.',
    },
    {
      q: 'What does it cost?',
      a: 'Nothing while Ada is in demo. There is a daily message allowance that refills on its own, which keeps the demo free to run.',
    },
    {
      q: 'What happens to what I type?',
      a: 'Your conversations and sprints are visible to your account only. You can delete your account from Settings at any time. Deleting removes your identity; the privacy page explains what is kept afterward, without your name, and why.',
    },
    {
      q: 'Which AI is behind Ada?',
      a: 'Anthropic’s Claude models: a fast one for conversation, and a stronger one for assumption mapping and web research.',
    },
  ],
} as const;

export const CLOSE = {
  title: ['Bring the idea you’re', 'most sure about.'],
  lede: 'That is the one worth testing.',
  primary: 'Start free',
  secondary: 'I already have an account',
};

export const FOOTER = {
  line: 'Ada Coach. An AI customer discovery coach for product managers.',
  links: [
    { to: '/roadmap', text: 'Roadmap' },
    { to: '/privacy', text: 'Privacy' },
    { to: '/login', text: 'Sign in' },
  ],
} as const;

export const CHROME = {
  skip: 'Skip to content',
  home: 'Ada Coach, home',
  product: 'Ada',
  tag: 'Demo',
  signIn: 'Sign in',
  start: 'Start free',
  roadmap: 'Roadmap',
  onThisPage: 'On this page',
};
