import { Button } from '@/components/ui/button';

export default function Index() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <main className="mx-auto max-w-3xl px-6 pt-32 pb-24">
        <span className="inline-flex items-center rounded-full bg-secondary/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary ring-1 ring-secondary">
          AI Customer Discovery Coach
        </span>

        <h1 className="mt-8 text-5xl font-extrabold tracking-tight md:text-6xl">
          Meet <span className="gradient-text">Ada</span>.
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Ada pressure-tests your assumptions, reframes leading questions, and
          helps product managers run sharper customer discovery interviews.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button size="lg" className="rounded-xl px-6">
            Start a coaching session
          </Button>
          <Button size="lg" variant="outline" className="rounded-xl px-6">
            See how it works
          </Button>
        </div>

        <div className="mt-24 rounded-2xl border border-border bg-card p-8 shadow-sm">
          <p className="text-xs uppercase tracking-[0.2em] text-accent">
            Coming in Week 2
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Live Claude-powered coaching backed by Supabase. This page is the
            starting scaffold — the real chat widget lands next.
          </p>
        </div>
      </main>
    </div>
  );
}
