// Demo Privacy Notice & Terms. Public route.
// Written for demo mode: plain language, honest about what is kept after
// account deletion and why. Spec 3 (DEU-91) may expand this; the retention
// section here must always match what the delete-account function does.

import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import DemoBadge from '@/components/DemoBadge';

export const PRIVACY_LAST_UPDATED = 'September 7, 2026';

export default function Privacy() {
  return (
    <div className="flex min-h-[100dvh] items-start justify-center bg-background px-6 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-accent hover:underline"
          >
            ← Back
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-extrabold tracking-tight">
              <span className="gradient-text">Ada</span>
            </h1>
            <DemoBadge />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Demo Privacy Notice &amp; Terms</CardTitle>
            <CardDescription>Last updated {PRIVACY_LAST_UPDATED}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 text-sm leading-relaxed text-foreground">
            <section className="space-y-2">
              <h2 className="text-base font-semibold">What Ada is right now</h2>
              <p>
                Ada Coach is an early demo built by one person as a portfolio project. It is not a
                commercial service. Using it means you are helping test and improve an AI coach,
                and this notice describes the trade you are making in plain terms.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold">What we collect</h2>
              <ul className="list-disc space-y-1 pl-5">
                <li>Your email, display name, and password (handled by Supabase Auth).</li>
                <li>Your conversations with Ada, including Discovery Sprint transcripts.</li>
                <li>Thumbs-up and thumbs-down ratings you give to Ada&apos;s replies.</li>
                <li>Anything you send through the feedback button or Settings.</li>
                <li>Products, assumptions, portfolio items, and files you create or upload.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold">Why we keep some of it after you leave</h2>
              <p>
                The point of a demo is to learn from it. When you rate a reply as soulless, or
                tell us Ada asked a leading question, the only way to fix that is to look at the
                exact exchange, grade it, and test the next version against it. So when you
                delete your account, we keep the material that teaches us something, and we
                remove everything that identifies you.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold">What deleting your account does</h2>
              <p className="font-medium">Removed immediately and permanently:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Your login, email, display name, and profile.</li>
                <li>Products, portfolio profiles and projects, and reports.</li>
                <li>Uploaded files and documents.</li>
                <li>Market and competitor research generated for you.</li>
                <li>Any reply-to email you attached to feedback.</li>
              </ul>
              <p className="font-medium">Kept, with your identity removed:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  Conversation transcripts and the ratings on them. The link to your account is
                  severed; they are no longer tied to your name or email.
                </li>
                <li>Discovery Sprint sessions and the assumptions Ada extracted, de-linked the same way.</li>
                <li>
                  Feedback you sent through the feedback button or Settings. This stays linked
                  to a record holding only your name, email, signup date, and deletion date, so
                  we can still follow up on a bug you reported.
                </li>
              </ul>
              <p>
                Deletion is immediate and cannot be undone. You will get one confirmation email,
                and after that, nothing else from us.
              </p>
              <p>
                Ideas can also arrive here from AI Builder Journal, a separate app. When you send
                an idea from there, Ada may create an account for you, matched to the email you
                verified in Builder Journal, and the idea text becomes the first message of a
                Discovery Sprint. Everything above applies to that account exactly as to one you
                created here: the retained, de-identified transcript can include the idea that was
                sent over, and you can delete the account from Settings at any time.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold">How the kept material is used</h2>
              <p>
                Only to evaluate and improve Ada: grading responses, building test cases, and
                spotting where the coaching goes wrong. It is never sold, published, or used to
                contact you. Access is limited to the app&apos;s owner through the admin panel.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold">Where things run</h2>
              <p>
                Data is stored with Supabase (United States) and AI replies are generated by
                Anthropic&apos;s Claude models. Ada is built for a US audience during the demo.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold">Terms, briefly</h2>
              <ul className="list-disc space-y-1 pl-5">
                <li>Ada gives coaching prompts, not professional advice. Use your own judgment.</li>
                <li>Do not paste other people&apos;s personal information into Ada.</li>
                <li>Features, limits, and this notice will change as the demo evolves.</li>
                <li>You can delete your account at any time from Settings.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold">Questions</h2>
              <p>
                Use the feedback button in the app, or email{' '}
                <a className="underline" href="mailto:mohalesdeis@gmail.com">
                  mohalesdeis@gmail.com
                </a>
                .
              </p>
              <p className="text-muted-foreground">
                Thank you for helping make Ada better. Every rating and every note gets read.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
