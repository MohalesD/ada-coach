# The 53-Second Hang

**One request to Anthropic that never came back, and the two lines of policy that were missing**

| | |
|---|---|
| **Date** | 2026-09-11 |
| **Product** | Ada Coach |
| **Component** | `supabase/functions/_shared/anthropic.ts` |
| **Found by** | The first live run of the Builder Journal bridge |
| **Author** | Mohales Deis |

---

## 1. What happened

A product manager sent an idea from Builder Journal to Ada. The bridge did its
job: it created the account link, the product, the sprint and the conversation,
and then called Anthropic to generate Ada's opening read so it would be waiting
when they arrived.

That call never came back. Here is the log, verbatim:

```
04:19:03  stage_classification recorded, sprint created
04:19:56  kickoff coach turn failed: Error: Anthropic API 500
          at callClaude (_shared/anthropic.ts:24:11)
          at async kickoffSprint (_shared/sprint-kickoff.ts:74:13)
04:19:56  bridge-intake kickoff skipped: model_failed
04:19:57  POST | 201 | /functions/v1/bridge-intake
```

**Fifty-three seconds inside a single `fetch`**, and then a `500` carrying
`{"type":"timeout_error","message":"Request timeout"}`.

Ada's design held. `kickoffSprint` never throws; it returns
`{ error: true, reason }` so the sprint survives a failed read. The bridge
returned `201`, the PM landed in a real sprint with their idea and the starter
questions, and nothing was corrupted or lost. That is the behaviour we wanted
and it is worth saying plainly, because everything else here is a criticism.

Then it happened again. Their first message in that sprint hit the same fault:

```
04:21:36  discovery-turn unhandled error: Error: Anthropic API 500:
          {"type":"timeout_error","message":"Request timeout"}
```

They saw "Ada is taking a moment. Your message is in the thread, try again."
They refreshed, which did nothing, because their message had already been saved
and the failure was on the reply. They pasted it again.

**That third attempt succeeded in six seconds.**

---

## 2. Why that six seconds is the whole story

| Attempt | Outcome | Time |
|---|---|---|
| 1 (automatic, on arrival) | `500 timeout_error` | 53s |
| 2 (user clicked a starter question) | `500 timeout_error` | 63s |
| 3 (user pasted the same text again) | **succeeded** | **6s** |

Nothing about the request changed between attempt 2 and attempt 3. Same model,
same prompt, same account, same everything. The fault was transient, on
Anthropic's side, and it cleared on its own within a couple of minutes.

A transient fault that clears on retry is the single most forgiving kind of
failure a system can have. Ada turned it into a two-minute ordeal for a
first-time user because of two things that were not in the code:

1. **No timeout.** `fetch` was called with no `signal`, so there was no upper
   bound on how long one attempt could take. Anthropic's own server-side
   timeout is what eventually ended it, at 53 seconds.
2. **No retry.** One failure was the final answer. The user became the retry
   mechanism, by hand, twice.

The second point is the one that matters for a coaching product. Ada's whole
premise is that she has already read your idea by the time you get there. When
the read fails, she has not just lost a feature; she has broken the promise the
arrival was built on. Making that promise depend on a single un-retried network
call was the actual defect.

---

## 3. The fix

### A bound on every attempt

```ts
signal: AbortSignal.timeout(timeoutMs)   // default 20_000
```

**Why 20 seconds.** A normal Haiku coaching turn on a sprint intake measures
5 to 7 seconds in this codebase, so 20 is comfortably above the real p99 and
does not cut off a slow-but-healthy call. It is also far enough under the edge
gateway's own idle limit that a failed attempt still leaves budget to try
again, which a 50-second timeout would not. The number is a deliberate
compromise between those two ceilings, not a round guess.

### One retry, on the faults a retry can fix

```ts
export function isRetryableFailure(status: number | null): boolean {
  if (status === null) return true;              // aborted, or no response at all
  return status === 408 || status === 429 || status >= 500;
}
```

**Why this list.** A timeout, a rate limit and any 5xx are all the server or
the network having a bad moment, and a moment is exactly what a retry buys.
Everything else in the 4xx range is a statement about the request itself: a
malformed body, a bad key, a blocked model. Those fail identically the second
time, so retrying them only doubles the wait before the caller finds out.

`status === null` is the important case. It means the attempt produced no
response at all, which is what our own abort looks like, and it is precisely
the shape of the 53-second hang.

**Why only one retry, and what it actually costs.** Do the arithmetic rather
than taking the intuition: two attempts that both time out cost
20 + 0.6 + 20 = **40.6 seconds** and still end in a failure. That is better
than the 53 seconds the single unbounded attempt took, but only a little, and
latency is not where the win is.

The win is that the realistic case stops being a failure at all. One upstream
blip followed by a healthy call now ends in a **first read at about 26
seconds** instead of no first read, which is exactly the shape of what
happened on 2026-09-11. Trading a 53-second failure for a 26-second success is
the whole return on this change.

A third attempt would push the worst case past a minute, which is worse than
what we started with, and if two attempts 600ms apart have both failed the
fault is usually not the kind a third will clear.

**Why 600ms between them.** Long enough not to hammer an API that is already
struggling, short enough to be invisible next to a 5-second model call.

### What deliberately did not change

- **The error shape.** A final failure still throws `Anthropic API 500: …`, so
  every existing catch site behaves exactly as before, including the non-fatal
  kickoff path that reads it. The fix changes how often failure happens and how
  long it takes to arrive, not what it looks like.
- **`callClaudeWithWebSearch` is untouched.** Grounded research calls
  legitimately run 60 to 120 seconds and already have their own continuation
  budget. A 20-second bound there would break working behaviour.

---

## 4. An empty reply counts as a failure

One case that is easy to miss: a `200` response whose content array is empty.
That is an HTTP success with nothing in it, usually a truncation or a content
filter, and the old code already threw on it. It is now marked retryable
(`status: null`), because it is the same class of problem as a dropped socket:
the request was fine, the response was not, and asking again often works.

---

## 5. What was verified

Twelve tests in `supabase/functions/_shared/anthropic.test.ts`, **ten of them
confirmed to fail against the previous version**. They cover:

- an abort signal is actually passed to `fetch` (the absence of which is the bug)
- the default budget sits between 10 and 60 seconds
- a `500 timeout_error` followed by a success recovers, in two calls
- an aborted attempt is retried
- a `400` is **not** retried, and fails in one call
- an empty reply is retried
- after the final attempt, the thrown error still matches `/^Anthropic API 500:/`
- `maxAttempts: 1` disables the retry for a caller that wants it off

Type-check clean, full suite passing, build clean.

**Not verified:** the fix against a real upstream outage. That fault lasted
about two minutes and cannot be summoned on demand. The tests prove the policy;
only the next outage proves the outcome.

---

## 6. What this does not fix

Retries reduce how often the first read fails. They cannot make it never fail.
Two things remain true and are handled on the Builder Journal side rather than
here:

- The tab that waits for the handoff now escalates its copy at 14 and 40
  seconds instead of promising "about ten seconds" indefinitely.
- Builder Journal now surfaces `kickoff: { error: true }` instead of discarding
  it, so a PM who arrives without a first read is told so rather than left to
  wonder.

Those are documented in **The Last Mile of a Cross-Product Bridge**
(`docs/portfolio/ada-bridge-last-mile/` in the Builder Journal repo). This
document and that one are two halves of the same incident: one app made the
failure less likely, the other made it legible.

---

## Appendix: change index

| File | Change |
|---|---|
| `supabase/functions/_shared/anthropic.ts` | `AbortSignal.timeout` on every attempt; one retry on a retryable fault; `isRetryableFailure`, `REQUEST_TIMEOUT_MS`, `MAX_ATTEMPTS`, `RETRY_DELAY_MS` exported for the tests. |
| `supabase/functions/_shared/anthropic.test.ts` | New. Twelve tests. |

**Deploy:** `callClaude` is imported by every function that talks to Claude, so
redeploy the ones that matter for the bridge first:
`supabase functions deploy bridge-intake` and
`supabase functions deploy discovery-turn`.
