// Owner report view (Run 2): the compiled discovery report with the
// actions the PM actually takes on it — export a PDF, copy the public
// share link, regenerate after score edits — all attached to the report
// itself (Locality-First), never buried in a settings page.

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, FileDown, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import ReportView from '@/components/discovery/ReportView';
import { exportReportPdf } from '@/lib/report-pdf';
import {
  compileReport,
  getReport,
  getSession,
} from '@/lib/discovery-api';
import type { Report } from '@/types/discovery';

const RISK_MAP_SVG_ID = 'report-risk-map';

export default function ReportPage() {
  const { sessionId = '' } = useParams();
  const [report, setReport] = useState<Report | null>(null);
  const [state, setState] = useState<'loading' | 'compiling' | 'ready' | 'missing' | 'error'>(
    'loading',
  );
  const [regenerating, setRegenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const existing = await getReport(sessionId);
      if (existing) {
        setReport(existing);
        setState('ready');
        return;
      }
      // No report yet — compile one on the spot if the session is real.
      const session = await getSession(sessionId).catch(() => null);
      if (!session) {
        setState('missing');
        return;
      }
      setState('compiling');
      const compiled = await compileReport(sessionId);
      setReport(compiled);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const shareUrl = report
    ? `${window.location.origin}/share/${report.share_token}`
    : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't reach the clipboard. The link: " + shareUrl);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const fresh = await compileReport(sessionId);
      setReport(fresh);
      toast.success('Report regenerated from the latest scores. The share link is unchanged.');
    } catch {
      toast.error("Couldn't regenerate. The current report is untouched.");
    } finally {
      setRegenerating(false);
    }
  };

  const handleExport = async () => {
    if (!report) return;
    setExporting(true);
    try {
      await exportReportPdf(report.snapshot, RISK_MAP_SVG_ID);
      toast.success('PDF downloaded.');
    } catch {
      toast.error("The PDF didn't build. Try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            to="/discovery"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <ArrowLeft size={15} aria-hidden />
            Discovery
          </Link>
          {state === 'ready' && report && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => void handleRegenerate()}
                disabled={regenerating}
              >
                <RefreshCw
                  size={14}
                  aria-hidden
                  className={regenerating ? 'animate-spin' : undefined}
                />
                {regenerating ? 'Regenerating…' : 'Regenerate'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => void handleCopy()}
              >
                {copied ? (
                  <Check size={14} aria-hidden className="text-success" />
                ) : (
                  <Copy size={14} aria-hidden />
                )}
                {copied ? 'Link copied' : 'Copy share link'}
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => void handleExport()}
                disabled={exporting}
              >
                <FileDown size={14} aria-hidden />
                {exporting ? 'Building PDF…' : 'Export PDF'}
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {(state === 'loading' || state === 'compiling') && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {state === 'compiling'
              ? 'Compiling your report from everything the sprint produced…'
              : 'Opening your report…'}
          </p>
        )}

        {state === 'missing' && (
          <div className="mx-auto max-w-md py-16 text-center">
            <p className="text-sm text-muted-foreground">
              No report lives here — the sprint may have been removed.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/discovery">Back to Discovery</Link>
            </Button>
          </div>
        )}

        {state === 'error' && (
          <div className="mx-auto max-w-md rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-4 text-center">
            <p className="text-sm text-destructive">
              Couldn't load the report. Everything is still stored — try
              again.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void load()}
            >
              Try again
            </Button>
          </div>
        )}

        {state === 'ready' && report && (
          <ReportView snapshot={report.snapshot} riskMapSvgId={RISK_MAP_SVG_ID} />
        )}
      </main>
    </div>
  );
}
