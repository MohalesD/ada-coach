export type ExportMeta = { title: string | null; created_at: string };
export type ExportMessage = { role: 'user' | 'assistant'; content: string; kind?: string };

export function exportConversation(meta: ExportMeta, messages: ExportMessage[]): void {
  const date = new Date(meta.created_at);
  const dateStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const title = meta.title?.trim() || 'Untitled Session';

  const body = messages.filter((m) => m.kind !== 'summary');
  const summaries = messages.filter((m) => m.kind === 'summary');

  let md = `# ${title}\n\n**Date:** ${dateStr}\n\n---\n\n`;
  for (const m of body) {
    md += m.role === 'user' ? `**You:** ${m.content}\n\n` : `**Ada:** ${m.content}\n\n`;
  }
  if (summaries.length > 0) {
    md += `---\n\n## Session Summary\n\n`;
    for (const s of summaries) md += `${s.content}\n\n`;
  }

  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'session';
  const fileDate = date.toISOString().slice(0, 10);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ada-session-${slug}-${fileDate}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
