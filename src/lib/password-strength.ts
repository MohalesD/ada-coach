// Lightweight password strength heuristic. Deliberately not zxcvbn — its
// dictionary payload (~400KB+ gzipped) is disproportionate for a single
// inline meter. Scores 0-4 from length, character-class variety, and a
// few common weak patterns. This is a UX nudge, not a security boundary.

export type PasswordStrengthScore = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  score: PasswordStrengthScore;
  label: string;
  tip: string;
}

const SEQUENTIAL_RUNS = [
  '0123456789',
  'abcdefghijklmnopqrstuvwxyz',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
];

function hasSequentialRun(lower: string, runLength = 4): boolean {
  for (const run of SEQUENTIAL_RUNS) {
    for (let i = 0; i <= run.length - runLength; i++) {
      const slice = run.slice(i, i + runLength);
      if (lower.includes(slice) || lower.includes([...slice].reverse().join(''))) {
        return true;
      }
    }
  }
  return false;
}

function hasRepeatedRun(value: string, runLength = 4): boolean {
  for (let i = 0; i <= value.length - runLength; i++) {
    if (new Set(value.slice(i, i + runLength)).size === 1) return true;
  }
  return false;
}

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  '12345678',
  '123456789',
  'qwerty123',
  'letmein',
  'welcome1',
  'iloveyou',
  'admin123',
  'monkey123',
]);

const LABELS: Record<PasswordStrengthScore, string> = {
  0: 'Too short',
  1: 'Weak',
  2: 'Fair',
  3: 'Good',
  4: 'Strong',
};

export function scorePasswordStrength(value: string): PasswordStrength {
  if (!value) {
    return { score: 0, label: LABELS[0], tip: 'Use at least 8 characters.' };
  }

  const lower = value.toLowerCase();
  let classes = 0;
  if (/[a-z]/.test(value)) classes++;
  if (/[A-Z]/.test(value)) classes++;
  if (/[0-9]/.test(value)) classes++;
  if (/[^a-zA-Z0-9]/.test(value)) classes++;

  let points = 0;
  if (value.length >= 8) points++;
  if (value.length >= 12) points++;
  if (value.length >= 16) points++;
  points += Math.max(0, classes - 1);

  const weak = COMMON_PASSWORDS.has(lower) || hasSequentialRun(lower) || hasRepeatedRun(lower);
  if (weak) points = Math.min(points, 1);

  const score = Math.max(0, Math.min(4, points)) as PasswordStrengthScore;

  const tip = weak
    ? 'Avoid common passwords and predictable patterns like "1234" or "qwerty".'
    : score <= 1
      ? 'Add more characters and mix in numbers or symbols.'
      : score === 2
        ? 'Try adding a symbol or making it longer for a stronger password.'
        : score === 3
          ? 'Solid — a bit more length would make this even stronger.'
          : 'Great password.';

  return { score, label: LABELS[score], tip };
}
