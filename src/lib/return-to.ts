// Where Login sends someone after they sign in, when they were on their way
// somewhere (Spec 4 addendum, 2026-11-15).
//
// One job: decide whether a "return to" value is safe to navigate to. It is an
// exact-shape allowlist, not a sanitizer: the only destination anything in the
// app asks Login to remember is a sprint a Builder Journal handoff just made,
// so that is the only shape accepted. Anything else, including every other
// in-app path, is refused and Login falls back to "/". Widen the pattern
// deliberately if a second caller ever needs it; do not loosen it to "any
// path starting with /", which is how open redirects get written.

const RETURN_TO_RE =
  /^\/sprint\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\?arrived=(bridge|bridge-self)&mode=(permanent|session))?$/i;

/**
 * `self` marks an arrival where Ada did NOT sign the person in (an admin or
 * owner account). The sprint page words its banner from this, so it never
 * claims "signed in through Builder Journal" to someone who typed a password.
 */
export function bridgeReturnTo(
  sessionId: string,
  mode: 'permanent' | 'session',
  self = false,
): string {
  return `/sprint/${sessionId}?arrived=${self ? 'bridge-self' : 'bridge'}&mode=${mode}`;
}

export function safeReturnTo(value: unknown): string | null {
  return typeof value === 'string' && RETURN_TO_RE.test(value) ? value : null;
}
