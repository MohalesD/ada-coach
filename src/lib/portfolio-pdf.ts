// Client-side PDF export for a portfolio artifact (Run 4). Follows the
// report-pdf.ts precedent exactly: built in the browser with jsPDF, no
// server round-trip. Sections come from the same artifact_content the
// workspace and share view render, so the PDF always matches the screen.

import { jsPDF } from 'jspdf';
import { markdownToPlainText } from '@/lib/report-pdf';
import { ARTIFACT_TYPE_LABELS } from '@/types/portfolio';
import type { ArtifactContent, ArtifactType, EffortPlan } from '@/types/portfolio';

const PAGE_W = 595.28; // A4 portrait, pt
const PAGE_H = 841.89;
const MARGIN = 52;
const CONTENT_W = PAGE_W - MARGIN * 2;

const ESPRESSO: [number, number, number] = [44, 34, 20];
const OCHRE: [number, number, number] = [139, 99, 36];
const MUTED: [number, number, number] = [107, 93, 74];

class PdfWriter {
  doc: jsPDF;
  y = MARGIN;

  constructor() {
    this.doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
  }

  ensure(height: number) {
    if (this.y + height > PAGE_H - MARGIN) {
      this.doc.addPage();
      this.y = MARGIN;
    }
  }

  heading(text: string, size = 15) {
    this.ensure(size + 18);
    this.y += 10;
    this.doc
      .setFont('helvetica', 'bold')
      .setFontSize(size)
      .setTextColor(...OCHRE);
    this.doc.text(text, MARGIN, this.y);
    this.y += size + 6;
  }

  body(
    text: string,
    opts: {
      size?: number;
      color?: [number, number, number];
      style?: 'normal' | 'italic' | 'bold';
    } = {}
  ) {
    const size = opts.size ?? 10;
    const lineH = size * 1.45;
    this.doc
      .setFont('helvetica', opts.style ?? 'normal')
      .setFontSize(size)
      .setTextColor(...(opts.color ?? ESPRESSO));
    const lines = this.doc.splitTextToSize(text, CONTENT_W) as string[];
    for (const line of lines) {
      this.ensure(lineH);
      this.doc.text(line, MARGIN, this.y);
      this.y += lineH;
    }
  }

  gap(h = 8) {
    this.y += h;
  }
}

export function exportPortfolioPdf(artifact: {
  idea_title: string;
  ai_angle: string | null;
  artifact_type: ArtifactType | null;
  artifact_content: ArtifactContent;
  effort_estimate: EffortPlan | null;
}): void {
  const w = new PdfWriter();

  // Title block
  w.doc
    .setFont('helvetica', 'bold')
    .setFontSize(22)
    .setTextColor(...ESPRESSO);
  w.doc.text(w.doc.splitTextToSize(artifact.idea_title, CONTENT_W) as string[], MARGIN, w.y + 10);
  w.y += 34;
  const typeLabel = artifact.artifact_type
    ? ARTIFACT_TYPE_LABELS[artifact.artifact_type]
    : 'Portfolio artifact';
  w.body(
    `${typeLabel} · exported ${new Date().toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}`,
    { color: MUTED }
  );

  if (artifact.ai_angle) {
    w.gap(2);
    w.body(`AI angle: ${artifact.ai_angle}`, { style: 'italic', color: OCHRE });
  }

  if (artifact.artifact_content.idea?.description) {
    w.heading('The idea');
    w.body(artifact.artifact_content.idea.description);
  }

  for (const section of artifact.artifact_content.sections ?? []) {
    w.heading(section.title);
    w.body(markdownToPlainText(section.content_md));
  }

  const plan = artifact.effort_estimate;
  if (plan) {
    w.heading('Effort plan');
    w.body(`About ${plan.total_hours} hours · ${plan.cadence} · ${plan.timeline}`, {
      style: 'bold',
    });
    w.gap(4);
    for (const tool of plan.tools) {
      w.body(`• ${tool.name} — ${tool.purpose}${tool.cost_note ? ` (${tool.cost_note})` : ''}`, {
        size: 9,
      });
    }
    w.gap(4);
    w.body(plan.honesty_note, { style: 'italic', size: 9, color: MUTED });
  }

  w.gap(10);
  w.body(
    'Drafted with Ada, an AI product coach. The thinking, decisions, and defense of this artifact are the author’s own.',
    { size: 8.5, color: MUTED, style: 'italic' }
  );

  const slug = artifact.idea_title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
  w.doc.save(`ada-portfolio-${slug || 'artifact'}.pdf`);
}
