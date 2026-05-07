// Brand Voice Guard: catches Ada-specific language failures in user-facing files
// Flags strings that break the product illusion or reveal internal mechanics
// Project hook: ada-coach only

const path = require('path');
const chunks = [];

process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  try {
    const raw = Buffer.concat(chunks).toString();
    const event = JSON.parse(raw);
    const filePath = event?.tool_input?.file_path || '';

    // Only scan user-facing source files, not config, migrations, or edge functions
    const isUserFacing = (
      /[/\\]src[/\\]|^src[/\\]/.test(filePath)
    ) && (
      filePath.endsWith('.tsx') ||
      filePath.endsWith('.ts') ||
      filePath.endsWith('.jsx') ||
      filePath.endsWith('.js')
    );

    if (!isUserFacing) {
      process.exit(0);
    }

    // Strings that break Ada's product illusion or reveal internal mechanics
    const bannedPhrases = [
      // RAG and retrieval mechanics
      'knowledge base',
      'docs store',
      'doc store',
      'document store',
      'document repository',
      'vector store',
      'from the documents',
      'from my documents',
      'i retrieved',
      'i fetched',
      'retrieval',
      'based on the context provided',
      'according to the uploaded',
      'from my training data',
      'based on what i found',
      'my sources',
      // AI identity exposure
      'as an ai',
      'language model',
      'i am an ai',
      // Technical internals
      'vector',
      'embedding',
      'rag',
      'chunk',
      'pgvector',
      'similarity search',

    ];

    const toolName = event?.tool_name || '';
    let contentToScan = '';
    if (toolName === 'Write') {
      contentToScan = event?.tool_input?.content || '';
    } else if (toolName === 'Edit') {
      contentToScan = event?.tool_input?.new_string || '';
    } else if (toolName === 'MultiEdit') {
      const edits = event?.tool_input?.edits || [];
      contentToScan = edits.map(e => e.new_string || '').join('\n');
    }

    const lines = contentToScan.toLowerCase().split('\n');
    const violations = [];

    // Word-boundary match so "rag" doesn't false-positive on "drag",
    // "embedding" doesn't match "embedded", etc. Banned phrases are
    // already lowercase; lines are lowercased above.
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    lines.forEach((line, index) => {
      bannedPhrases.forEach(phrase => {
        const re = new RegExp(`\\b${escapeRegex(phrase)}\\b`);
        if (re.test(line)) {
          violations.push(`  Line ${index + 1}: "${phrase}" found`);
        }
      });
    });

    if (violations.length > 0) {
      process.stderr.write(
        `\n[BRAND VOICE GUARD] BLOCKED: Ada-breaking language detected in ${path.basename(filePath)}\n` +
        violations.join('\n') +
        `\n\nAda must never reveal her retrieval mechanics or AI nature. Rewrite without these terms.\n\n`
      );
      process.exit(2);
    }

    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});