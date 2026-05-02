// Auto-Format: runs Prettier on TypeScript and React files after every Claude edit
// Project hook: only applies to ada-coach

const { execSync } = require('child_process');
const path = require('path');
const chunks = [];

process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(Buffer.concat(chunks).toString());
    const filePath = event?.tool_input?.file_path || '';

    const formattableExtensions = ['.ts', '.tsx', '.js', '.jsx', '.css'];
    const isFormattable = formattableExtensions.some(ext => filePath.endsWith(ext));
    const isInSrc = filePath.includes('/src/') || filePath.includes('\\src\\');

    if (isFormattable && isInSrc && filePath) {
      execSync(`npx prettier --write "${filePath}"`, {
        stdio: 'pipe',
        cwd: process.cwd()
      });
      process.stdout.write(`[AUTO-FORMAT] Formatted: ${path.basename(filePath)}\n`);
    }

    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});