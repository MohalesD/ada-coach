// Public portfolio artifact view (Run 4) — what a hiring manager sees
// when the PM shares their artifact link. Read-only, logged out, served
// by portfolio-project-public via the unguessable token. Mirrors
// ShareReport's shape: amber identity, generous reading layout, and the
// AI-coach transparency footer (the PM's credibility survives someone
// asking "did an AI write this?" — the answer is printed on the page).

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { fetchPublicArtifact } from '@/lib/portfolio-api';
import { ARTIFACT_TYPE_LABELS } from '@/types/portfolio';
import type { PublicArtifact } from '@/types/portfolio';

const PROSE = cn(
  'prose prose-sm max-w-none text-foreground sm:prose-base',
  '[&_p]:my-2 first:[&_p]:mt-0 last:[&_p]:mb-0',
  '[&_strong]:font-semibold [&_em]:italic',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1',
  '[&_a]:text-primary [&_a]:underline',
  '[&_h1]:font-display [&_h2]:font-display [&_h3]:font-display'
);

export default function SharePortfolio() {
  const { token = '' } = useParams();
  const [artifact, setArtifact] = useState<PublicArtifact | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = await fetchPublicArtifact(token);
        if (cancelled) return;
        if (!a) {
          setState('missing');
        } else {
          setArtifact(a);
          setState('ready');
        }
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Opening the artifact…</p>
      </div>
    );
  }

  if (state === 'missing' || state === 'error') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {state === 'missing' ? 'This link doesn’t lead anywhere' : 'Couldn’t load the artifact'}
        </h1>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          {state === 'missing'
            ? 'The share link may have been mistyped or the artifact may no longer be shared. Ask the person who sent it for a fresh link.'
            : 'Something went wrong on the way here. Refresh to try again.'}
        </p>
      </div>
    );
  }

  if (!artifact) return null;

  const sections = artifact.artifact_content.sections ?? [];
  const plan = artifact.effort_estimate;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <main className="mx-auto max-w-2xl px-6 py-12 sm:py-16">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
          {artifact.artifact_type
            ? ARTIFACT_TYPE_LABELS[artifact.artifact_type]
            : 'Portfolio artifact'}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {artifact.idea_title}
        </h1>
        {artifact.ai_angle && (
          <p className="mt-4 border-l-2 border-accent/60 pl-4 text-sm leading-relaxed text-foreground/85 sm:text-base">
            <span className="mr-2 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
              AI angle
            </span>
            {artifact.ai_angle}
          </p>
        )}
        {artifact.artifact_content.idea?.description && (
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            {artifact.artifact_content.idea.description}
          </p>
        )}

        <div className="mt-10 space-y-8">
          {sections.map((s) => (
            <section key={s.key} aria-label={s.title}>
              <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
                {s.title}
              </h2>
              <div className={cn(PROSE, 'mt-2')}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.content_md}</ReactMarkdown>
              </div>
            </section>
          ))}

          {plan && (
            <section
              aria-label="Effort plan"
              className="rounded-xl border border-accent/50 bg-secondary/40 px-5 py-4"
            >
              <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
                How it gets built
              </h2>
              <p className="mt-2 text-sm font-semibold text-foreground">
                ~{plan.total_hours} hours · {plan.cadence} · {plan.timeline}
              </p>
              <ul className="mt-2.5 space-y-1.5">
                {plan.tools.map((t) => (
                  <li key={t.name} className="text-sm leading-relaxed text-foreground/85">
                    <span className="font-semibold">{t.name}</span> — {t.purpose}
                    {t.cost_note && <span className="text-muted-foreground"> ({t.cost_note})</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <footer className="mt-14 border-t border-border pt-6">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Drafted with <span className="font-semibold text-primary">Ada</span>, an AI product
            coach that pressure-tests thinking rather than writing it unchallenged. The framing,
            decisions, and defense of this artifact are the author's own. Updated{' '}
            {new Date(artifact.updated_at).toLocaleDateString([], {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
            .
          </p>
        </footer>
      </main>
    </div>
  );
}
