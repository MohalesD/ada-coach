// Intake router (Run 4, JTBD-1): two tap questions and one optional
// free-text detail, then Ada recommends a track. Reads like a
// typographic interview — one oversized Fraunces question at a time,
// tap-target answers, no chrome. Routing guides, never gates: the
// "Skip — take me to the platform" control sits under the questions on
// every step (locality: the escape hatch lives where the questions do).
// A contradictory or thin read never guesses silently — Ada offers both
// tracks side by side.

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Compass, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { routeIntake } from '@/lib/portfolio-api';
import { InlineError, WorkingNote } from '@/components/portfolio/notes';
import type { RouteResult } from '@/types/portfolio';

const Q1 = {
  question: 'Which is closer to you today?',
  options: [
    {
      key: 'aspiring',
      label: "I'm working toward my first PM role",
      detail: 'No PM title yet — building the case that I can do the job.',
    },
    {
      key: 'practicing',
      label: "I'm already doing PM work",
      detail: 'A product, feature, or idea is on my desk right now.',
    },
  ],
};

const Q2 = {
  question: 'What are you bringing in?',
  options: [
    { key: 'idea', label: 'Just an idea', detail: 'Nothing built, nothing validated yet.' },
    { key: 'product', label: 'A live product', detail: 'Real users, real signals, real stakes.' },
    {
      key: 'feature',
      label: "A feature I'm scoping",
      detail: 'The product exists; this piece is new.',
    },
    {
      key: 'portfolio',
      label: "A portfolio I'm building",
      detail: 'I need artifacts that get me hired.',
    },
  ],
};

const DETAIL_MAX = 1000;

export default function StartRouter() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [a1, setA1] = useState<string | null>(null);
  const [a2, setA2] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RouteResult | null>(null);

  const submit = async (finalDetail: string) => {
    setBusy(true);
    setError(null);
    const q1Label = Q1.options.find((o) => o.key === a1)?.label ?? '';
    const q2Label = Q2.options.find((o) => o.key === a2)?.label ?? '';
    const answers = [
      `Q: ${Q1.question} A: ${q1Label}`,
      `Q: ${Q2.question} A: ${q2Label}`,
      finalDetail.trim() ? `Q: Anything else about where you are? A: ${finalDetail.trim()}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      setResult(await routeIntake(answers));
      setStep(3);
    } catch {
      setError(
        "Ada couldn't read your answers just now. Nothing is lost — try once more, or skip straight in."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-6 py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <ArrowLeft size={15} aria-hidden />
            Chat
          </Link>
          <h1 className="font-display text-xl font-semibold tracking-tight">
            <span className="gradient-text">Ada</span>{' '}
            <span className="text-sm font-medium text-muted-foreground">· Find your track</span>
          </h1>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-10">
        {step < 3 && (
          <p className="mb-8 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
            {step === 2 ? 'One more — optional' : `Question ${step + 1} of 2`}
          </p>
        )}

        {/* ── Q1: persona ── */}
        {step === 0 && (
          <QuestionBlock question={Q1.question}>
            {Q1.options.map((o) => (
              <AnswerCard
                key={o.key}
                label={o.label}
                detail={o.detail}
                selected={a1 === o.key}
                onSelect={() => {
                  setA1(o.key);
                  setStep(1);
                }}
              />
            ))}
          </QuestionBlock>
        )}

        {/* ── Q2: context ── */}
        {step === 1 && (
          <QuestionBlock question={Q2.question}>
            {Q2.options.map((o) => (
              <AnswerCard
                key={o.key}
                label={o.label}
                detail={o.detail}
                selected={a2 === o.key}
                onSelect={() => {
                  setA2(o.key);
                  setStep(2);
                }}
              />
            ))}
          </QuestionBlock>
        )}

        {/* ── Q3: optional detail ── */}
        {step === 2 && (
          <QuestionBlock question="Anything else about where you are?">
            <Textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value.slice(0, DETAIL_MAX))}
              rows={4}
              placeholder="Optional — a sentence or two helps Ada place you more confidently…"
              aria-label="Anything else about where you are"
              autoFocus
            />
            {error && <InlineError message={error} onRetry={() => void submit(detail)} />}
            {busy ? (
              <WorkingNote label="Ada is reading your answers…" />
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void submit(detail)}>Point me to my track</Button>
                <Button variant="ghost" onClick={() => void submit('')}>
                  Skip this question
                </Button>
              </div>
            )}
          </QuestionBlock>
        )}

        {/* ── Recommendation ── */}
        {step === 3 && result && (
          <section aria-label="Ada's recommendation" className="space-y-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
              Ada's read
            </p>
            <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              {result.recommended_track === 'portfolio' &&
                'Build the portfolio that gets you hired.'}
              {result.recommended_track === 'discovery' && 'Pressure-test what you’re building.'}
              {result.recommended_track === 'both' && 'Two doors fit — you pick.'}
            </h2>
            <p className="max-w-lg text-base leading-relaxed text-muted-foreground">
              {result.reason}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <TrackCard
                icon={<Sparkles size={18} strokeWidth={1.75} aria-hidden />}
                title="Portfolio Coaching"
                detail="Resume in, real project ideas out — then Ada coaches you through one artifact, end to end."
                emphasized={result.recommended_track !== 'discovery'}
                onClick={() => navigate('/portfolio')}
              />
              <TrackCard
                icon={<Compass size={18} strokeWidth={1.75} aria-hidden />}
                title="Discovery Sprint"
                detail="Map your assumptions, check them against the live market, walk out with a Mom Test interview guide."
                emphasized={result.recommended_track !== 'portfolio'}
                onClick={() => navigate('/discovery')}
              />
            </div>
          </section>
        )}

        {/* Skip is present on every step — routing guides, never gates. */}
        {step < 3 && (
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-sm font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              Skip — take me to the platform
            </button>
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="text-sm text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                Back a question
              </button>
            )}
          </div>
        )}
        {step === 3 && (
          <div className="mt-10">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-sm font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              Neither right now — take me to the platform
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function QuestionBlock({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <h2 className="max-w-xl font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
        {question}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function AnswerCard({
  label,
  detail,
  selected,
  onSelect,
}: {
  label: string;
  detail: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'block w-full rounded-xl border px-5 py-4 text-left transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        selected
          ? 'border-accent bg-secondary/60'
          : 'border-accent/40 bg-card hover:border-accent/80 hover:bg-secondary/40 hover:shadow-sm'
      )}
    >
      <p className="font-display text-lg font-semibold tracking-tight text-foreground">{label}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{detail}</p>
    </button>
  );
}

function TrackCard({
  icon,
  title,
  detail,
  emphasized,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  emphasized: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col gap-2 rounded-xl border p-5 text-left transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        emphasized
          ? 'border-accent/70 bg-secondary/50 hover:border-accent hover:bg-secondary/70 hover:shadow-sm'
          : 'border-border bg-card opacity-80 hover:border-accent/50 hover:opacity-100'
      )}
    >
      <span className={cn(emphasized ? 'text-accent' : 'text-muted-foreground')}>{icon}</span>
      <p className="font-display text-lg font-semibold tracking-tight text-foreground">{title}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{detail}</p>
      <span
        className={cn(
          'mt-1 text-sm font-semibold',
          emphasized ? 'text-primary' : 'text-muted-foreground'
        )}
      >
        {emphasized ? 'Start here →' : 'Open →'}
      </span>
    </button>
  );
}
