// Client-side PDF export for the discovery report (Run 2 Must-Have).
// Follows the repo's export.ts precedent: the file is built in the
// browser and downloaded, no server round-trip. The risk map is the same
// SVG the page renders, rasterized to PNG; text sections come from the
// snapshot so the PDF always matches the shared report.

import { jsPDF } from 'jspdf';
import type { ReportSnapshot } from '@/types/discovery';

const PAGE_W = 595.28; // A4 portrait, pt
const PAGE_H = 841.89;
const MARGIN = 52;
const CONTENT_W = PAGE_W - MARGIN * 2;

const ESPRESSO: [number, number, number] = [44, 34, 20];
const OCHRE: [number, number, number] = [139, 99, 36];
const MUTED: [number, number, number] = [107, 93, 74];

// Strip markdown down to printable plain text (headings kept as their own
// lines, links become "text (url)").
export function markdownToPlainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function svgToPngDataUrl(
  svgId: string,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const el = document.getElementById(svgId);
  if (!(el instanceof SVGSVGElement)) return null;

  const viewBox = el.viewBox.baseVal;
  const width = viewBox?.width || 560;
  const height = viewBox?.height || 470;

  const xml = new XMLSerializer().serializeToString(el);
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('risk map rasterization failed'));
    img.src = src;
  });

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL('image/png'), width, height };
}

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
    opts: { size?: number; color?: [number, number, number]; style?: 'normal' | 'italic' | 'bold' } = {},
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

export async function exportReportPdf(
  snapshot: ReportSnapshot,
  riskMapSvgId: string,
): Promise<void> {
  const w = new PdfWriter();

  // Title block
  w.doc.setFont('helvetica', 'bold').setFontSize(22).setTextColor(...ESPRESSO);
  w.doc.text(
    w.doc.splitTextToSize(snapshot.product.name, CONTENT_W) as string[],
    MARGIN,
    w.y + 10,
  );
  w.y += 34;
  w.body(
    `Discovery Report · generated ${new Date(snapshot.generated_at).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}${snapshot.session.stage ? ` · entry point: ${snapshot.session.stage.replace('_', ' ')}` : ''}`,
    { color: MUTED },
  );
  if (snapshot.product.description) {
    w.gap(2);
    w.body(snapshot.product.description, { color: MUTED });
  }

  if (snapshot.problem_framing) {
    w.heading('Where this started');
    w.body(snapshot.problem_framing, { style: 'italic' });
  }

  // Risk map image
  const png = await svgToPngDataUrl(riskMapSvgId).catch(() => null);
  if (png) {
    w.heading('Risk map — confidence by impact');
    const imgW = CONTENT_W;
    const imgH = (png.height / png.width) * imgW;
    w.ensure(imgH + 8);
    w.doc.addImage(png.dataUrl, 'PNG', MARGIN, w.y, imgW, imgH);
    w.y += imgH + 6;
    w.body(
      'Top-left quadrant = high impact, weak evidence: test these first.',
      { size: 9, color: MUTED },
    );
  }

  // Assumptions
  w.heading('Assumption map');
  snapshot.assumptions.forEach((a, i) => {
    w.body(
      `${i + 1}. [${a.category}] ${a.statement}`,
      { style: 'bold' },
    );
    w.body(
      `    confidence ${a.confidence}/5 · impact ${a.impact}/5 · ${a.status}${a.is_prioritized ? ' · PRIORITIZED' : ''}`,
      { size: 9, color: MUTED },
    );
    w.gap(4);
  });

  // Evidence
  if (snapshot.evidence.length > 0) {
    w.heading('Market evidence');
    snapshot.assumptions.forEach((a, i) => {
      const items = snapshot.evidence.filter((e) => e.assumption_id === a.id);
      if (items.length === 0) return;
      w.body(`${i + 1}. ${a.statement}`, { style: 'bold' });
      for (const e of items) {
        w.body(`• [${e.stance}] ${e.title ?? e.source_url}`, { size: 9 });
        if (e.snippet) w.body(`   ${e.snippet}`, { size: 9, color: MUTED });
        w.body(`   ${e.source_url}`, { size: 8, color: MUTED });
        w.gap(2);
      }
      w.gap(4);
    });
  }

  // Blind spots
  if (snapshot.blind_spots.length > 0) {
    w.heading('Blind spots');
    snapshot.blind_spots.forEach((b, i) => {
      w.body(
        `${i + 1}. ${b.statement} ${b.evidence_backed ? '[evidence-backed]' : '[socratic — reasoning only]'}`,
        { style: 'bold' },
      );
      if (b.socratic_question) {
        w.body(`   ${b.socratic_question}`, { style: 'italic', size: 9 });
      }
      for (const u of b.source_urls) {
        w.body(`   ${u}`, { size: 8, color: MUTED });
      }
      w.gap(4);
    });
  }

  // Interview guide
  if (snapshot.interview_guide) {
    w.heading(
      `Interview guide (v${snapshot.interview_guide.version}${snapshot.interview_guide.question_count ? ` · ${snapshot.interview_guide.question_count} questions` : ''})`,
    );
    w.body(markdownToPlainText(snapshot.interview_guide.content_md));
  }

  // Session summary
  if (snapshot.session.summary) {
    w.heading('Session summary');
    w.body(markdownToPlainText(snapshot.session.summary));
  }

  // Disclaimer
  w.gap(10);
  w.body(snapshot.disclaimer, { size: 8.5, color: MUTED, style: 'italic' });

  const slug = snapshot.product.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
  w.doc.save(`ada-discovery-report-${slug || 'session'}.pdf`);
}
