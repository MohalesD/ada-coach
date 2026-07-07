# RAG Regression Run

Run at: 2026-07-07T04:53:02.558Z
Model: claude-haiku-4-5-20251001 · Embedding: text-embedding-3-small · threshold=0.55 · match_count=3

Arm A = RAG on (retrieval + injection). Arm B = RAG off (current production behavior).
Scoring against the harness rubric (grounding/specificity/coaching-value/authenticity) is manual — this table is the raw material.

## Summary

| ID | Tier | Chunks retrieved | Top similarity |
|---|---|---|---|
| Q01 | Tier 1 (High retrieval relevance) | 1 | 0.563 |
| Q02 | Tier 1 (High retrieval relevance) | 1 | 0.568 |
| Q03 | Tier 1 (High retrieval relevance) | 1 | 0.556 |
| Q04 | Tier 1 (High retrieval relevance) | 0 | — |
| Q05 | Tier 1 (High retrieval relevance) | 1 | 0.561 |
| Q06 | Tier 1 (High retrieval relevance) | 0 | — |
| Q07 | Tier 1 (High retrieval relevance) | 3 | 0.690 |
| Q08 | Tier 2 (Medium retrieval relevance) | 0 | — |
| Q09 | Tier 2 (Medium retrieval relevance) | 0 | — |
| Q10 | Tier 2 (Medium retrieval relevance) | 0 | — |
| Q11 | Tier 2 (Medium retrieval relevance) | 0 | — |
| Q12 | Tier 3 (Low retrieval relevance (off-topic/adversarial)) | 0 | — |
| Q13 | Tier 3 (Low retrieval relevance (off-topic/adversarial)) | 0 | — |
| Q14 | Tier 3 (Low retrieval relevance (off-topic/adversarial)) | 0 | — |
| Q15 | Tier 3 (Low retrieval relevance (off-topic/adversarial)) | 0 | — |

## Paired responses

### Q01 — Tier 1 (High retrieval relevance)

**Question:** What is the difference between customer discovery and customer validation?

**Retrieved chunks:**

1. (similarity 0.563) correct methods for ac- quiring and converting customers, and deployed the right resources to scale the business. At an abstract level, Customer Development is simply about questioning your core busi-...

**Arm A (RAG on):**

Good question—it's a distinction many PMs blur, and it costs them time.

**Customer Discovery** is about proving problem-solution fit. You're testing whether the problem you think exists actually matters to real people, and whether your proposed solution addresses it in a way they'd care about. You're still in exploration mode: interviewing, observing, iterating on your understanding of the customer and the problem. Nothing is locked in yet.

**Customer Validation** is about proving product-market fit *and* that you have a scalable, repeatable way to sell it. By now, you've nailed the problem and you have a working product (or MVP). You're testing whether customers will actually buy it, at what price, through which channels, and whether your sales motion can repeat. You're past exploration—you're measuring whether the business model works.

The risk most PMs take is jumping to validation too early: they build an MVP, run a few customer calls, get some polite feedback, and assume they've "validated" when really they've only done shallow discovery.

Here's the practical difference: In discovery, "I love this idea" is noise. In validation, "I will pay for this" or "I've signed up" is signal.

Are you at a point where you're deciding which phase you're actually in, or are you building something from scratch right now?

**Arm B (RAG off):**

Good foundational question—and the distinction matters for how you run your process.

**Customer discovery** is about exploring an unknown problem space. You're testing whether a problem is real, who experiences it acutely, and what they've already tried to solve it. You're *learning*. You haven't committed to a solution yet. The goal is to surface what you don't know.

**Customer validation** is about testing whether *your specific solution* solves the problem in a way customers will pay for or adopt. You've narrowed the problem; now you're checking if your answer is right. The goal is to reduce risk before you build.

The blurry part: discovery often gets tangled with validation. A PM will say "I'm doing discovery" but they're really selling their idea and waiting for polite agreement. That's validation-disguised-as-discovery, and it kills signal.

Here's the practical split: In discovery, you're genuinely uncertain about the customer's world. In validation, you're uncertain about your solution's fit.

**Where are you in your process right now?** Are you exploring a problem space, or do you have a specific idea you're testing?

---

### Q02 — Tier 1 (High retrieval relevance)

**Question:** How do I know when I've done enough customer interviews?

**Retrieved chunks:**

1. (similarity 0.568) test. STEP 5 62 The object of the first round of interviews is to test and confirm a core value proposition, matching your product idea with a market segment that suffers from the problem you are solv...

**Arm A (RAG on):**

That's the core question most PMs get wrong because they're asking it at the wrong time.

You've done enough interviews *for a round* when responses from your tightly defined customer segment are trending clearly in one direction. If you're hearing the same problem, the same workaround, the same frustration from five prospects in a row—and they're all from the same segment—you probably have enough signal to act. What kills teams is chasing outliers or talking to too broad a group and getting noise instead of pattern.

But here's what matters more: *enough for what?* The answer changes. Early discovery (first round) is about confirming the problem exists and that your target customer actually cares about solving it. That's maybe 8-12 conversations with the right people. Second round—after you've narrowed your focus—is about nailing core functionality and business model fit. That might be another 10-15. You're looking for convergence, not statistical perfection.

The trap is treating interviews like a checkbox. "We did 20 interviews, so we're done." If your responses are all over the map, you need fewer interviews with better-defined customers, not more interviews with random people.

**What stage are you at right now—are you still testing whether the problem exists, or have you already narrowed to a specific customer and are now exploring how they'd use your solution?**

**Arm B (RAG off):**

You've done enough when you stop hearing new problems and start hearing the same ones rephrased.

But that's not the real question you're asking. The real one is: "How do I know I'm interviewing the *right* people about the *right* thing?" Because you can talk to 50 customers and still be wrong if you're not pressure-testing the assumptions that would actually kill your product.

Before you count interviews, I need to know: **What specific assumption are you trying to validate right now, and how many people have you actually talked to about it?**

---

### Q03 — Tier 1 (High retrieval relevance)

**Question:** What makes a good customer discovery question versus a bad one?

**Retrieved chunks:**

1. (similarity 0.556) between what they tell you and what the real value of your product is to them. In addition, you should be going back to your group of prospects to learn more about them as potential customers. In othe...

**Arm A (RAG on):**

A good discovery question surfaces past behavior and reveals *why* someone made a choice. A bad one either asks about future intentions ("Would you use this?") or leads the witness ("Don't you hate how fragmented your tools are?").

The best questions feel almost boring—they're about what someone actually did, not what they say they'd do. "Walk me through the last time you [problem]" beats "How often do you struggle with [problem]?" every time. The first gets a story with details. The second gets a polished answer.

Bad questions also solve your problem instead of theirs. You're looking for relief when you ask "How much would you pay for a solution?" But the person across from you is just trying to get through their day. They'll tell you what sounds reasonable, not what they'd actually invest.

The sharpest questions make people slightly uncomfortable—not hostile, but honest. They push past the surface. "Tell me about a time this went really wrong" often reveals more than "What's your biggest frustration?"

Are you working on a specific discovery conversation right now, or thinking about this more broadly?

**Arm B (RAG off):**

A good discovery question lets the customer answer from their own world—what they've actually done, tried, paid for, struggled with. A bad one asks them to predict the future ("Would you use...?") or leads them toward your answer ("Don't you hate how fragmented these tools are?").

The difference comes down to this: **good questions give you honest signal about past behavior; bad ones get you polite agreement.**

For example:
- ❌ "Would you pay for a tool that does X?" → They'll say yes if they like you.
- ✅ "How do you currently solve X?" → They show you their actual world.

Bad questions also assume you already know the problem. They skip the messy work of understanding what's really frustrating someone and why. They jump straight to validating your solution.

The sharpest questions follow three rules:

1. **Ask about the past, not the future.** People are terrible at predicting what they'll do. They're honest about what they've done.
2. **Never mention your idea.** Let them describe their world first. Your solution might not even be the right fit.
3. **Listen for specificity.** Vague answers mean weak signal. "Sometimes it's annoying" is noise. "I spend 6 hours every Friday manually consolidating spreadsheets from five departments" is data.

Are you working through a set of questions you've drafted, or are you earlier in the process?

---

### Q04 — Tier 1 (High retrieval relevance)

**Question:** What should I do when a customer tells me they love my idea?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

That's the polite version of "no," and it's one of the most dangerous signals in customer discovery.

When someone says they love your idea, you've usually just gotten agreement—not evidence of desire. They're being nice. They like you. They're not telling you they'd reorganize their workflow, pay money, or change their behavior for it.

The real question is: what were you asking them *before* they said that? 

Were you describing your solution to them, or were you asking about their current world and what they've already tried? Because if you led with "Here's what I'm building," the love you heard is just social courtesy. It's not discovery—it's validation theater.

What problem are you exploring right now, and how are you currently framing it when you talk to potential customers?

**Arm B (RAG off):**

That's the moment most PMs celebrate—and then make their biggest discovery mistake.

"Love" is often a politeness reflex, not evidence of a real problem or willingness to change behavior. People are naturally kind to someone asking for feedback, especially if they sense you're excited about it. The real test isn't whether they like the idea *in theory*—it's whether they'd abandon their current solution (however clunky) to use yours, and whether the problem you're solving actually keeps them up at night.

When someone says they love your idea, here's what to do instead:

1. **Don't celebrate yet.** Assume politeness first.
2. **Probe the problem, not the solution.** Ask them to describe—in concrete detail—how they currently handle what you're trying to solve. What does that look like today? How often does it happen? What's the cost when it goes wrong?
3. **Look for inconsistency.** If they love your idea but can't articulate the specific pain you're solving, or if they've never tried to solve it themselves, that's a red flag. Love for an idea ≠ demand for a solution.
4. **Watch what they do next.** Do they ask follow-up questions? Do they introduce you to peers who have the same problem? Do they volunteer to be a beta user? Words are cheap. Action is signal.

What problem are you solving, and who did you hear "love it" from?

---

### Q05 — Tier 1 (High retrieval relevance)

**Question:** How should I structure a problem-solution fit interview?

**Retrieved chunks:**

1. (similarity 0.561) tips: Be Concise, Precise, and Entice. 6. JFDI! It’s worth repeating that online surveys, focus groups, user testing are not substitutes for prop- erly conducted Customer Discovery interviews. STEP 4 ...

**Arm A (RAG on):**

That depends on where you are in your discovery process and what you're trying to prove right now.

Are you still validating that the problem itself is real and urgent for your customers? Or have you already confirmed the problem exists, and now you're testing whether your specific solution resonates with them?

**Arm B (RAG off):**

Before I outline a structure, I need to know where you are in the process. Are you starting from scratch with a problem space you're exploring, or do you already have a specific product idea and want to test whether customers actually need it?

---

### Q06 — Tier 1 (High retrieval relevance)

**Question:** What signals indicate a customer is genuinely engaged versus just being polite?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

This is the core of good discovery work, so let's ground it in something concrete.

The strongest signal of genuine engagement is **specificity + emotion + unprompted examples**. When someone's actually feeling a pain, they don't give you a generic answer. They tell you about the Tuesday morning when their process broke, or they suddenly light up when you mention something that mirrors their world. They correct you—"No, it's not quite like that, it's actually..."—because they care about being understood.

Polite answers feel smooth. Generic. They lack friction. "Yeah, that's definitely a problem" is polite. "We waste probably 3-4 hours every week because our data's in three places and nobody trusts which version is current, so Sarah ends up reconciling everything manually on Friday" is real.

The Mom Test calls this "the Mom Test" for a reason: if your mom would give you the same answer, it's not signal. A mom will politely agree with your product idea. A real customer will tell you whether your idea actually solves their problem—or admit it doesn't.

Here's the move: **Stop asking what they think about the problem. Start asking what they actually do about it.** "How do you handle this right now?" beats "Is this frustrating?" every time. Past behavior doesn't lie.

Are you preparing for interviews right now, or thinking through how to evaluate answers you've already collected?

**Arm B (RAG off):**

That's the core of the Mom Test problem, and it matters because polite answers kill products.

Real engagement shows up in *friction, specificity, and behavior*. A genuinely engaged customer will:

- **Correct you or push back.** If they care, they'll tell you you're wrong. Polite customers nod and agree.
- **Volunteer unprompted detail.** They'll mention a related tool they use, a workaround they built, a colleague who has the same problem. They won't wait for you to ask.
- **Tell you what they're already doing about it.** Not what they *would* do, but what they *are* doing right now. How many hours a week they're spending on the problem. What they've already tried and rejected.
- **Ask you questions back.** They're curious about your solution because the problem is real for them. Polite customers listen and thank you.
- **Reference the problem multiple times in conversation.** It comes up naturally because it's on their mind. They don't have to be prompted.

The inverse is equally sharp: politeness sounds like agreement without examples, enthusiasm without evidence, and questions that don't dig. "That sounds interesting" is not engagement. "We tried that once and it didn't work because X, so now we do Y instead" is.

Where are you in your discovery right now—are you already in customer conversations, or are you still mapping assumptions?

---

### Q07 — Tier 1 (High retrieval relevance)

**Question:** When is it appropriate to pivot during customer development?

**Retrieved chunks:**

1. (similarity 0.690) to: 1. Validate core hypotheses (customer- problem-solution). 2. Develop the minimum viable product. 3. Achieve Product-Market fit. 4. Produce a development and marketing roadmap for scaling. Creating...
2. (similarity 0.619) individual may already be thinking of and looking for solutions, developing one internally or perhaps has already cobbled together a workaround. When you’ve nailed your presentation of primary assumpt...
3. (similarity 0.579) who wish to track Prod- uct Development, test functionality and who are generally optimistic about its suitability to their needs. These two groups represent your “early adopters” or “earlyvangelists,...

**Arm A (RAG on):**

Pivoting too early is a common mistake—you shut down learning before you've actually learned anything. But pivoting too late is worse: you've burned time and money validating the wrong hypothesis.

The right moment to pivot is when you have **falsifiable evidence**, not just doubt. That means:

- You've talked to enough customers in your target segment (usually 20-30) to see a pattern, not an outlier.
- The pattern contradicts a core assumption—your customer doesn't actually have the problem you thought they had, or they're solving it in a way that makes your solution irrelevant, or the problem isn't painful enough to pay for.
- You've tested the assumption multiple ways (not just asked once and moved on).

What's crucial: pivoting isn't random. You pivot *to* something, not *away* from something. That means the evidence you gathered points toward a different problem, a different customer, or a different approach—one you can now test with more rigor.

The hardest part isn't deciding to pivot. It's distinguishing between "this assumption was wrong" and "I just haven't found the right customer yet" or "I need to communicate the value better."

**What's prompting the question—are you considering a pivot now, or thinking through how to recognize when you should?**

**Arm B (RAG off):**

That's a strategic question, but it's missing the ground truth underneath it: *what does your current evidence actually show?*

Most PMs ask this question too early—before they've done enough discovery to know whether they should pivot. They're pattern-matching to startup lore instead of listening to what their customers are telling them.

Here's the honest answer: You should consider a pivot when you've talked to 15-20 customers in your target segment, and you're consistently hearing one of three signals:

1. **The problem doesn't exist as acutely as you thought.** Customers describe it as a minor inconvenience, not a pain worth solving.
2. **They're solving it a different way than you expected**—and that alternate solution is working well enough that your approach has no urgency.
3. **A different problem keeps surfacing unprompted.** Multiple customers bring it up without you asking, and they're willing to change behavior to solve it.

The trap: confusing "one customer told me something unexpected" with "I should pivot." That's noise, not signal.

**What's your situation right now?** Have you done customer conversations yet, or are you deciding whether to start discovery on your current idea first?

---

### Q08 — Tier 2 (Medium retrieval relevance)

**Question:** I have an idea for a product. Where do I start?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

Before we build anything, let's make sure you're solving a problem that actually exists and matters to real people.

Tell me this: **Where did this problem come from?** Did you experience it yourself, hear it from someone, or spot it in the market?

**Arm B (RAG off):**

Before we build anything, let's understand what you're actually trying to solve and who you're trying to solve it for.

Tell me about the problem you've noticed. What situation or frustration made you think "someone should build something for this"?

---

### Q09 — Tier 2 (Medium retrieval relevance)

**Question:** How do I prioritize which user segment to focus on first?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

Before I can help you prioritize, I need to understand what you're working from. Do you have a product idea already, or are you earlier—still exploring a problem space and trying to figure out *which* segment to even talk to first?

**Arm B (RAG off):**

Before I help you prioritize, I need to know what's driving this question right now. Do you already have a product idea and multiple segments you're considering, or are you still deciding what problem to solve?

---

### Q10 — Tier 2 (Medium retrieval relevance)

**Question:** I'm getting mixed signals from interviews. Some say yes, some say no. What does this tell me?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

It tells you that you're probably asking the wrong questions—or testing multiple assumptions at once and not isolating which one is actually breaking.

Before we dig into what the mixed signals mean, I need to understand what you're actually probing. **What specific assumption or problem are you testing across these interviews?** Are all your interviewees the same type of customer, or are you talking to different segments?

**Arm B (RAG off):**

Mixed signals almost always mean you're asking the wrong question—or asking the right question to the wrong people.

Before we dig into what the signals mean, I need to understand the setup: **What's the core thing you're testing, and how are you phrasing it when you talk to users?**

---

### Q11 — Tier 2 (Medium retrieval relevance)

**Question:** How do I avoid leading questions in user interviews?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

Leading questions sneak in when you're secretly hoping for a specific answer. The telltale sign: the question contains the answer you want to hear.

Here's the shift: **Move from "Do you struggle with X?" to "Walk me through how you handle X right now."** The first invites agreement. The second invites a story.

Three concrete moves:

1. **Remove the emotional language.** Don't ask "Don't you find it frustrating when...?" Ask "What happens when...?"

2. **Ask about the past, not the future.** "Would you use a tool that...?" is leading. "Tell me about the last time you faced this situation" is open.

3. **Let silence do the work.** After they answer, pause. Most PMs jump in with the next question because the answer feels incomplete. That pause is where the real insight lives.

The Mom Test principle underneath all of this: people want to be helpful and polite. Your job is to make it safe for them to tell you the unflattering truth—which means asking questions where the honest answer and the polite answer aren't the same thing.

What's the hardest part for you—catching yourself in the moment, or designing questions that don't lead in the first place?

**Arm B (RAG off):**

Leading questions telegraph the answer you want to hear. They prime the user to agree with you instead of telling you what's true.

The core move: **Ask about what they've already done, not what they might do.** Past behavior doesn't lie. Future intentions do.

**Leading:** "Would you use a tool that automated your expense reports?"
**Better:** "Walk me through how you've handled expense reports over the past month. What's been the hardest part?"

The second question lets them show you the real friction without you suggesting what friction should exist.

Another pattern to watch: **Don't embed your solution in the question.** If you say "a mobile app," you've narrowed their thinking. Instead, ask *how* they currently solve the problem, *what* they've tried, and *why* those solutions fell short.

One more: **Listen for polite agreement.** If someone says "Yeah, that would be helpful," that's often just politeness. It's not signal. Real signal sounds like a specific story, a complaint, or evidence they've already tried to solve it themselves.

Are you prepping for interviews right now, or is this about sharpening your approach for future ones?

---

### Q12 — Tier 3 (Low retrieval relevance (off-topic/adversarial))

**Question:** What's the weather like in Miami today?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

I appreciate the question, but I'm here to help you sharpen your customer discovery—not to be a weather service.

Let's redirect: **Are you working on a product idea right now, or do you have customer discovery questions I can help you pressure-test?**

**Arm B (RAG off):**

I appreciate the question, but that's outside my wheelhouse. I'm here to help you sharpen your customer discovery process and pressure-test your product assumptions.

Do you have a product idea you're working on, or are you stuck on how to validate a specific assumption about your customers? That's where I can be most useful.

---

### Q13 — Tier 3 (Low retrieval relevance (off-topic/adversarial))

**Question:** Tell me a joke.

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

Ha—I appreciate the test, but that's not my lane. I'm here to help you sharpen your customer discovery process, not to be a comedy act.

Got a product idea you're exploring, or are you working through some customer discovery challenges right now? That's where I can actually be useful.

**Arm B (RAG off):**

I appreciate the moment of levity, but I'm here to help you sharpen your customer discovery work—not to be a comedy bot.

What's on your mind product-wise? Do you have a problem you're exploring, or are you stuck somewhere in your discovery process?

---

### Q14 — Tier 3 (Low retrieval relevance (off-topic/adversarial))

**Question:** What programming language should I learn first?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

I appreciate the question, but that's outside my wheelhouse. I'm here to help you sharpen your customer discovery process—so things like pressure-testing your assumptions about who your customers are, what problems they actually face, and how to design interviews that reveal truth instead of politeness.

If you're thinking about building a product and want to validate your idea before you commit to any technical decisions, I'm your person. Do you have a product concept or problem space you're working through?

**Arm B (RAG off):**

I appreciate the question, but that's a bit outside my wheelhouse. I'm here to coach you on customer discovery and product development—helping you validate assumptions, design customer interviews, and pressure-test your product ideas.

If you're thinking about building a product and want to talk through the discovery process, I'm your person. Otherwise, you might want to check with a software engineering mentor for language recommendations.

What are you working on product-wise right now?

---

### Q15 — Tier 3 (Low retrieval relevance (off-topic/adversarial))

**Question:** I'm feeling burned out. Should I take a break from my startup?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

I hear that—burnout is real, and it deserves attention. But that's a bit outside my lane. I'm here to help you sharpen your customer discovery and product thinking, not to coach you through personal decisions like stepping back from your work.

That said, if burnout is stemming from *product uncertainty*—spinning your wheels on unclear customer problems, chasing assumptions instead of validating them, building features nobody wants—then we can absolutely help with that. Sometimes the fog clears when the work itself feels more grounded and purposeful.

Is that part of what's going on, or is this more about the broader pace and pressure of startup life?

**Arm B (RAG off):**

I hear you—burnout is real, and it deserves attention. But that's a question I'm not equipped to coach on well. I'm here to help you sharpen your customer discovery and product strategy, not navigate broader life decisions.

That said, here's what I *can* offer: sometimes burnout signals that you're working on the wrong problem, or solving it for the wrong people, or without enough evidence that it matters. If you want to explore whether your current direction is worth the energy you're pouring into it, we can do that through discovery work. Talking to real customers—and getting honest signal about whether you're on the right track—can either reignite clarity or give you permission to step back.

What would be most useful right now: Do you have a product or problem space you want to pressure-test, or are you further back—still trying to nail what you should be building?

---
