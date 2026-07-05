// Portfolio Coaching dashboard (Run 4): the aspiring PM's home surface.
// One column, one story — ground Ada in who you are, get project ideas
// matched to you, pick the one you'd defend in an interview. Each stage
// lives in its own card with local loading/error/feedback (Locality Law
// 6), and a resume-work card pins to the top once an artifact is in
// progress (the Discovery dashboard's re-entry pattern).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileUp, Play, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import {
  chooseProject,
  createPortfolioSession,
  generateIdeas,
  listPortfolioProfiles,
  listProjects,
  saveProfile,
  uploadResumeFile,
} from '@/lib/portfolio-api';
import { InlineError, WorkingNote } from '@/components/portfolio/notes';
import { ARTIFACT_TYPE_LABELS } from '@/types/portfolio';
import type { ArtifactType, PortfolioProfile, PortfolioProject } from '@/types/portfolio';

const TEXT_MAX = 50_000;

const ARTIFACT_CHOICES: { type: ArtifactType; detail: string }[] = [
  {
    type: 'prd',
    detail:
      'The classic. Problem, users, requirements, AI-native features — the deepest proof you can think like a PM.',
  },
  {
    type: 'brief',
    detail:
      'Tighter and faster. Context, problem, opportunity, direction — good when your story matters more than specs.',
  },
  {
    type: 'prototype_spec',
    detail:
      'Show, don’t tell. Flows, screens, AI interaction patterns — strongest for design-leaning roles.',
  },
];

export default function Portfolio() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [profile, setProfile] = useState<PortfolioProfile | null>(null);
  const [projects, setProjects] = useState<PortfolioProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [startBusy, setStartBusy] = useState(false);

  // Grounding intake
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [resumeText, setResumeText] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [background, setBackground] = useState('');
  const [targetCompanies, setTargetCompanies] = useState('');
  const [targetArchetype, setTargetArchetype] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [redactions, setRedactions] = useState<number | null>(null);
  const [flagged, setFlagged] = useState<string[]>([]);
  const [extractionNote, setExtractionNote] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Ideas
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [adaQuestions, setAdaQuestions] = useState<string[]>([]);

  // Choosing
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [chooseBusy, setChooseBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const profiles = await listPortfolioProfiles();
      const p = profiles[0] ?? null;
      setProfile(p);
      if (p) {
        setProjects(await listProjects(p.id));
        setBackground(p.background ?? '');
        setTargetCompanies(p.target_companies ?? '');
        setTargetArchetype(p.target_archetype ?? '');
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grounded = !!profile && (!!profile.resume_text || !!profile.background);
  const chosen = useMemo(() => projects.find((p) => p.chosen) ?? null, [projects]);

  const handleStart = async () => {
    setStartBusy(true);
    try {
      const p = await createPortfolioSession();
      setProfile(p);
      setIntakeOpen(true);
    } catch {
      toast.error("Couldn't start your portfolio session. Try again.");
    } finally {
      setStartBusy(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profile) return;
    setSaveBusy(true);
    setSaveError(null);
    try {
      let resumeFilePath: string | undefined;
      if (resumeFile && user) {
        resumeFilePath = await uploadResumeFile(user.id, resumeFile);
      }
      const result = await saveProfile(profile.id, {
        ...(resumeText.trim() ? { resume_text: resumeText.trim() } : {}),
        ...(resumeFilePath ? { resume_file_path: resumeFilePath } : {}),
        background: background.trim(),
        target_companies: targetCompanies.trim(),
        target_archetype: targetArchetype.trim(),
      });
      setProfile(result.profile);
      setRedactions(result.redaction?.redacted_count ?? 0);
      setFlagged((result.redaction?.flagged ?? []).map((f) => f.token));
      setExtractionNote(result.extraction_error === true);
      setResumeText('');
      setResumeFile(null);
      setIntakeOpen(false);
      setAdaQuestions([]);
    } catch (err) {
      setSaveError(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't save your details. Everything you typed is still here — try again."
      );
    } finally {
      setSaveBusy(false);
    }
  };

  const handleIdeas = async () => {
    if (!profile) return;
    setIdeasBusy(true);
    setIdeasError(null);
    setAdaQuestions([]);
    try {
      const result = await generateIdeas(profile.id);
      if (result.kind === 'questions') {
        setAdaQuestions(result.questions);
      } else {
        setProjects(result.projects);
      }
    } catch (err) {
      setIdeasError(
        err instanceof Error && err.message === 'malformed_model_output'
          ? "Ada's ideas came back scrambled. Nothing was saved — try again."
          : "Idea generation didn't finish. Nothing was lost — try again."
      );
    } finally {
      setIdeasBusy(false);
    }
  };

  const handleChoose = async (projectId: string, type: ArtifactType) => {
    setChooseBusy(true);
    try {
      const project = await chooseProject(projectId, type);
      navigate(`/portfolio/project/${project.id}`);
    } catch {
      toast.error("Couldn't lock that one in. Try again.");
      setChooseBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <ArrowLeft size={15} aria-hidden />
            Chat
          </Link>
          <h1 className="font-display text-xl font-semibold tracking-tight">
            <span className="gradient-text">Ada</span>{' '}
            <span className="text-sm font-medium text-muted-foreground">· Portfolio Coaching</span>
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        {loading && (
          <p className="py-16 text-center text-sm text-muted-foreground">Opening your portfolio…</p>
        )}

        {!loading && loadError && (
          <div className="mx-auto max-w-md rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-4 text-center">
            <p className="text-sm text-destructive">
              Couldn't load your portfolio. Your work is safe — this is just a connection hiccup.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setLoading(true);
                void load();
              }}
            >
              Try again
            </Button>
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && !loadError && !profile && (
          <div className="mx-auto max-w-md py-14 text-center">
            <Sparkles size={40} strokeWidth={1.5} className="mx-auto text-accent" aria-hidden />
            <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight">
              Build the artifact that gets you hired
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Ada reads your actual background, proposes portfolio projects with a real AI angle,
              then coaches you through one artifact — a PRD, brief, or prototype spec — until it's
              interview-ready.
            </p>
            <Button
              className="mt-5 gap-1.5"
              onClick={() => void handleStart()}
              disabled={startBusy}
            >
              {startBusy ? 'Starting…' : 'Start your portfolio session'}
            </Button>
          </div>
        )}

        {/* ── Resume-work card ── */}
        {!loading && chosen && (
          <button
            type="button"
            onClick={() => navigate(`/portfolio/project/${chosen.id}`)}
            className="flex w-full items-center justify-between gap-4 rounded-xl border border-accent/60 bg-secondary/50 px-5 py-4 text-left transition-colors hover:border-accent hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">
                {chosen.status === 'complete' ? 'Your artifact' : 'Continue your artifact'}
              </p>
              <p className="mt-0.5 font-display text-lg font-semibold text-foreground">
                {chosen.idea_title}
              </p>
              <p className="text-xs text-muted-foreground">
                {chosen.artifact_type ? ARTIFACT_TYPE_LABELS[chosen.artifact_type] : ''}
                {' · '}
                {(chosen.artifact_content.sections ?? []).length} section
                {(chosen.artifact_content.sections ?? []).length === 1 ? '' : 's'} drafted
                {chosen.effort_estimate ? ' · effort plan ready' : ''}
              </p>
            </div>
            <Play size={20} className="shrink-0 text-primary" aria-hidden />
          </button>
        )}

        {/* ── Grounding card ── */}
        {!loading && profile && (!grounded || intakeOpen) && (
          <section
            aria-label="Ground Ada in your background"
            className="rounded-2xl border border-accent/50 bg-card p-5 shadow-sm"
          >
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Ground Ada in who you are
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Paste your resume or upload it, then say where you're aiming. Names and emails are
              stripped before anything is stored — Ada keeps a digest, never the raw file.
            </p>
            <div className="mt-4 space-y-3">
              <Textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value.slice(0, TEXT_MAX))}
                rows={5}
                placeholder="Paste your resume text here…"
                aria-label="Paste resume text"
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.txt,application/pdf,text/plain"
                  className="hidden"
                  onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => fileRef.current?.click()}
                >
                  <FileUp size={14} aria-hidden />
                  {resumeFile ? resumeFile.name : '…or upload a PDF / text file'}
                </Button>
                {resumeFile && (
                  <button
                    type="button"
                    onClick={() => setResumeFile(null)}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Remove
                  </button>
                )}
              </div>
              <Textarea
                value={background}
                onChange={(e) => setBackground(e.target.value.slice(0, TEXT_MAX))}
                rows={3}
                placeholder="Beyond the resume: what are you good at, what's blocked you, how much time can you give this?"
                aria-label="Background"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={targetCompanies}
                  onChange={(e) => setTargetCompanies(e.target.value)}
                  maxLength={500}
                  placeholder="Target companies (e.g. AI-first B2B startups)"
                  aria-label="Target company types"
                />
                <Input
                  value={targetArchetype}
                  onChange={(e) => setTargetArchetype(e.target.value)}
                  maxLength={500}
                  placeholder="Target PM archetype (e.g. AI PM, platform PM)"
                  aria-label="Target PM archetype"
                />
              </div>
              {saveError && (
                <InlineError message={saveError} onRetry={() => void handleSaveProfile()} />
              )}
              {saveBusy && (
                <WorkingNote label="Redacting personal details, then reading your background…" />
              )}
              {!saveBusy && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    onClick={() => void handleSaveProfile()}
                    disabled={!resumeText.trim() && !resumeFile && !background.trim()}
                  >
                    Save my background
                  </Button>
                  {grounded && (
                    <Button variant="ghost" onClick={() => setIntakeOpen(false)}>
                      Cancel
                    </Button>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Redaction + digest feedback ── */}
        {!loading && redactions !== null && !intakeOpen && (
          <div className="rounded-lg border border-success/40 bg-success/10 px-3 py-2.5 text-sm text-foreground/85">
            Background saved.{' '}
            {redactions > 0
              ? `${redactions} personal detail${redactions === 1 ? '' : 's'} redacted before storage.`
              : 'No personal details needed redacting.'}
            {extractionNote && (
              <span className="mt-1 block text-warning">
                Ada stored your redacted text as-is (the structured digest didn't come together) —
                coaching still works from it.
              </span>
            )}
            {flagged.length > 0 && (
              <span className="mt-1 block text-warning">
                Couldn't confidently redact: <strong>{flagged.join(', ')}</strong> — kept in the
                text; update your details if any of these is a person.
              </span>
            )}
          </div>
        )}

        {/* ── Profile summary ── */}
        {!loading && profile && grounded && !intakeOpen && (
          <section
            aria-label="Your background on file"
            className="rounded-xl border border-border bg-card px-5 py-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">
                  Ada's read on you
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                  {profile.resume_text ?? profile.background}
                </p>
                {(profile.target_companies || profile.target_archetype) && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Aiming at:{' '}
                    {[profile.target_archetype, profile.target_companies]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setIntakeOpen(true)}>
                Update
              </Button>
            </div>
          </section>
        )}

        {/* ── Ideas ── */}
        {!loading && profile && grounded && !intakeOpen && (
          <section aria-label="Portfolio project ideas" className="space-y-3">
            {adaQuestions.length > 0 && (
              <div className="rounded-2xl border border-accent/50 bg-card p-5 shadow-sm">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                  Ada needs a little more before proposing ideas
                </h2>
                <ul className="mt-2 space-y-1.5">
                  {adaQuestions.map((q, i) => (
                    <li
                      key={i}
                      className="border-l-2 border-accent/60 pl-3 text-sm italic text-foreground/85"
                    >
                      {q}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm text-muted-foreground">
                  Add your answers to your background, then ask again.
                </p>
                <Button className="mt-3" variant="outline" onClick={() => setIntakeOpen(true)}>
                  Add to my background
                </Button>
              </div>
            )}

            {projects.length === 0 && adaQuestions.length === 0 && (
              <div className="rounded-2xl border border-accent/50 bg-card p-5 shadow-sm">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                  Get project ideas matched to you
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  3–5 portfolio projects you could actually execute and defend — each with a
                  specific AI-native angle, because that's the portfolio that gets AI PM interviews.
                </p>
                <div className="mt-4 space-y-3">
                  {ideasError && (
                    <InlineError message={ideasError} onRetry={() => void handleIdeas()} />
                  )}
                  {ideasBusy ? (
                    <WorkingNote label="Ada is matching ideas to your background — usually 15–30 seconds…" />
                  ) : (
                    <Button onClick={() => void handleIdeas()}>Generate my project ideas</Button>
                  )}
                </div>
              </div>
            )}

            {projects.length > 0 && (
              <>
                <div className="flex items-baseline justify-between gap-3 pt-2">
                  <h2 className="font-display text-lg font-semibold tracking-tight">
                    {chosen ? 'Your project ideas' : 'Pick the one you’d defend in an interview'}
                  </h2>
                  {!chosen && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleIdeas()}
                      disabled={ideasBusy}
                    >
                      {ideasBusy ? 'Regenerating…' : 'Regenerate'}
                    </Button>
                  )}
                </div>
                {ideasBusy && <WorkingNote label="Ada is rethinking the list…" />}
                {ideasError && (
                  <InlineError message={ideasError} onRetry={() => void handleIdeas()} />
                )}
                <div className="space-y-3">
                  {projects.map((p, i) => (
                    <IdeaCard
                      key={p.id}
                      project={p}
                      index={i + 1}
                      isChosen={p.chosen}
                      anyChosen={!!chosen}
                      pickerOpen={pickerFor === p.id}
                      chooseBusy={chooseBusy}
                      onOpenPicker={() => setPickerFor(pickerFor === p.id ? null : p.id)}
                      onChoose={(type) => void handleChoose(p.id, type)}
                      onOpen={() => navigate(`/portfolio/project/${p.id}`)}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function IdeaCard({
  project,
  index,
  isChosen,
  anyChosen,
  pickerOpen,
  chooseBusy,
  onOpenPicker,
  onChoose,
  onOpen,
}: {
  project: PortfolioProject;
  index: number;
  isChosen: boolean;
  anyChosen: boolean;
  pickerOpen: boolean;
  chooseBusy: boolean;
  onOpenPicker: () => void;
  onChoose: (type: ArtifactType) => void;
  onOpen: () => void;
}) {
  const idea = project.artifact_content.idea;
  return (
    <article
      className={cn(
        'rounded-xl border px-5 py-4 transition-colors',
        isChosen
          ? 'border-accent/70 bg-secondary/40'
          : anyChosen
            ? 'border-border bg-card opacity-70'
            : 'border-border bg-card hover:border-accent/50'
      )}
    >
      <div className="flex items-start gap-3">
        <span className="font-display text-2xl font-semibold text-accent/70" aria-hidden>
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-semibold leading-snug tracking-tight text-foreground">
            {project.idea_title}
            {isChosen && (
              <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wider text-accent">
                chosen
              </span>
            )}
          </h3>
          {idea?.description && (
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">{idea.description}</p>
          )}
          {project.ai_angle && (
            <p className="mt-2 border-l-2 border-accent/60 pl-3 text-sm leading-relaxed text-foreground/85">
              <span className="mr-1.5 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                AI angle
              </span>
              {project.ai_angle}
            </p>
          )}
          {idea?.why_you && (
            <p className="mt-2 text-xs italic text-muted-foreground">Why you: {idea.why_you}</p>
          )}

          <div className="mt-3">
            {isChosen ? (
              <Button size="sm" onClick={onOpen} className="gap-1.5">
                <Play size={14} aria-hidden />
                Open the workspace
              </Button>
            ) : pickerOpen ? (
              <div className="space-y-2 rounded-lg border border-accent/40 bg-background/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  What will you build?
                </p>
                {ARTIFACT_CHOICES.map((c) => (
                  <button
                    key={c.type}
                    type="button"
                    disabled={chooseBusy}
                    onClick={() => onChoose(c.type)}
                    className="block w-full rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-accent/70 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
                  >
                    <span className="text-sm font-semibold text-foreground">
                      {ARTIFACT_TYPE_LABELS[c.type]}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                      {c.detail}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={onOpenPicker}
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Not this idea
                </button>
              </div>
            ) : (
              <Button size="sm" variant={anyChosen ? 'ghost' : 'outline'} onClick={onOpenPicker}>
                {anyChosen ? 'Switch to this one' : 'Build this one'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
