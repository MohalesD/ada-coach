// Grounding notes for a sprint (agent-loop redesign). One job: collect
// pasted notes and file them with redaction feedback. Lives in a dialog off
// the composer now that the fixed "grounding" step is gone — the PM can add
// notes at any point in the loop and Ada coaches from them on the next turn.

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { DiscoveryApiError, ingestPastedText, listSessionDocuments } from '@/lib/discovery-api';
import type { SessionDocument } from '@/types/discovery';

const PASTE_MAX = 50_000;

export default function NotesDialog({
  open,
  onOpenChange,
  sessionId,
  docs,
  onFiled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  docs: SessionDocument[];
  onFiled: (docs: SessionDocument[]) => void;
}) {
  const [pasteText, setPasteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<string[]>([]);
  const [redactions, setRedactions] = useState<number | null>(null);

  const handleIngest = async () => {
    const text = pasteText.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await ingestPastedText(sessionId, text);
      setPasteText('');
      setRedactions(result.redaction?.redacted_count ?? 0);
      setFlagged((result.redaction?.flagged ?? []).map((f) => f.token));
      onFiled(await listSessionDocuments(sessionId));
    } catch (err) {
      setError(
        err instanceof DiscoveryApiError && err.detail
          ? err.detail
          : "Couldn't save your notes. They're still in the box — try again."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Ground the sprint in your notes</DialogTitle>
          <DialogDescription>
            Paste a brief, research notes, or interview scraps — Ada coaches from what you've
            actually written, not generic advice. Names and emails are stripped before anything is
            stored.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value.slice(0, PASTE_MAX))}
            rows={6}
            placeholder="Paste a product brief, positioning doc, or raw interview notes…"
            aria-label="Paste grounding notes"
          />
          <p className="-mt-2 text-right text-[11px] text-muted-foreground">
            {pasteText.length.toLocaleString()} / {PASTE_MAX.toLocaleString()}
          </p>
          {error && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5"
            >
              <p className="text-sm text-destructive">{error}</p>
              <Button size="sm" variant="outline" onClick={() => void handleIngest()}>
                Try saving again
              </Button>
            </div>
          )}
          {busy && (
            <p className="text-sm text-muted-foreground" role="status">
              Redacting personal details, then filing your notes…
            </p>
          )}
          {redactions !== null && !busy && (
            <div className="rounded-lg border border-success/40 bg-success/10 px-3 py-2.5 text-sm text-foreground/85">
              Notes added.{' '}
              {redactions > 0
                ? `${redactions} personal detail${redactions === 1 ? '' : 's'} redacted before storage.`
                : 'No personal details needed redacting.'}
              {flagged.length > 0 && (
                <span className="mt-1 block text-warning">
                  Couldn't confidently redact: <strong>{flagged.join(', ')}</strong> — kept in the
                  text; edit and re-paste if any of these is a person.
                </span>
              )}
            </div>
          )}
          {docs.length > 0 && (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-2">
                  <span aria-hidden>📄</span>
                  {d.filename}
                  <span className="text-xs">({d.status})</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={() => void handleIngest()} disabled={!pasteText.trim() || busy}>
              Add these notes
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
