# RAG Regression Run

Run at: 2026-07-07T04:53:55.068Z
Model: claude-haiku-4-5-20251001 · Embedding: text-embedding-3-small · threshold=0.6 · match_count=3

Arm A = RAG on (retrieval + injection). Arm B = RAG off (current production behavior).
Scoring against the harness rubric (grounding/specificity/coaching-value/authenticity) is manual — this table is the raw material.

## Summary

| ID | Tier | Chunks retrieved | Top similarity |
|---|---|---|---|
| Q01 | Tier 1 (High retrieval relevance) | 0 | — |
| Q02 | Tier 1 (High retrieval relevance) | 0 | — |
| Q03 | Tier 1 (High retrieval relevance) | 0 | — |
| Q04 | Tier 1 (High retrieval relevance) | 0 | — |
| Q05 | Tier 1 (High retrieval relevance) | 0 | — |
| Q06 | Tier 1 (High retrieval relevance) | 0 | — |
| Q07 | Tier 1 (High retrieval relevance) | 2 | 0.690 |
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

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

Good foundational question. Let me clarify the distinction, because it matters for how you structure your work.

**Customer discovery** is about exploring an *unvalidated* problem space. You're interviewing to understand whether a problem exists, who feels it acutely, what they're doing now to solve it, and whether your framing of the problem matches reality. You're not testing a solution yet—you're testing your assumptions about the customer and the problem itself. It's open-ended, messy, and exploratory.

**Customer validation** happens *after* you've built or designed something. You're now testing whether customers will actually *use* what you've made, or whether they'd pay for it, or whether your solution actually solves the problem you discovered. It's more structured and outcome-focused: Does this work? Will they adopt it?

The dirty truth: most PMs skip discovery and jump straight to validation. They pitch a prototype and ask "Would you use this?" instead of first asking "Does this problem actually matter to you?" Discovery is harder because it requires you to sit with uncertainty. Validation feels faster because you have something concrete to show.

Are you trying to clarify where you are in your own process right now, or are you building a discovery plan from scratch?

**Arm B (RAG off):**

Good question to clarify before we dive in.

**Customer discovery** is about understanding whether a problem is real, who has it, and what they're currently doing about it. You're learning, not selling. The goal is to stress-test your assumptions about the problem space and customer before you've built anything—or early, before you've bet the farm.

**Customer validation** comes later. You've built something (even a prototype or MVP), and now you're testing whether customers will actually use it, pay for it, or choose it over their current solution. You're measuring intent and behavior change, not just problem acknowledgment.

The distinction matters because they require different questions, different evidence, and different customer conversations. In discovery, you're asking "Is this a real problem for you?" In validation, you're asking "Will you actually switch to my solution?"

**So here's my question for you: Are you starting from scratch with a problem idea, or do you already have a prototype and need to test whether people will adopt it?**

This will tell me where to focus our coaching.

---

### Q02 — Tier 1 (High retrieval relevance)

**Question:** How do I know when I've done enough customer interviews?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

That's a practical question, but it hinges on what you're actually trying to learn—and most PMs never get specific about that.

The honest answer: you've done enough when you've stopped hearing new patterns in the assumptions you set out to test. But that's only useful if you're running structured discovery. If you're just "talking to customers" without a hypothesis, you'll never know when to stop.

Before I give you a framework for this, what's your situation right now? Are you already mid-interviews trying to figure out when to wrap up, or are you at the planning stage deciding how many to do?

**Arm B (RAG off):**

You're asking the wrong question—and that's actually good news because it means you can fix it right now.

Most PMs stop interviewing when they feel confident. That's backwards. You should stop when you've *invalidated* your riskiest assumptions, not when you've validated your favorite ones. Confidence is a terrible metric. Specificity is the real one.

Here's what "enough" actually looks like: You can predict, with real precision, what a customer will say *before* you ask them—because you've heard the same pattern from enough people that surprises have stopped happening. You've also heard at least one or two customers describe your solution idea without you mentioning it first, which means the problem is real enough that it bubbles up on its own.

That usually takes 8–12 interviews, not 20 or 50. But it depends entirely on how narrow your customer definition is and how much you thought you already knew.

**What problem are you trying to solve right now—do you have a product idea you're validating, or are you still in the problem-space exploration phase?**

---

### Q03 — Tier 1 (High retrieval relevance)

**Question:** What makes a good customer discovery question versus a bad one?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

A good discovery question gets you honest signal about past behavior. A bad one gets you a polite lie about future intentions.

Here's the difference:

**Bad:** "Would you use a tool that automatically organized your emails?" (They'll say yes. Everyone says yes.)

**Good:** "Walk me through the last time your email inbox felt out of control. What did you actually do about it?" (Now you see what they *really* prioritize when friction hits.)

Bad discovery questions share three tells:

1. **They ask about the future.** "Would you...?" "Would you pay...?" "Do you think you'd...?" Future is speculation. Past is evidence.

2. **They mention your solution.** The moment you describe your idea, you've primed them to be polite. They're now trying to be helpful to *you*, not honest about *themselves*.

3. **They're leading.** "Don't you think X is a big problem?" Yes, they do now—because you suggested it.

Good questions are boring. They're about what actually happened. How they solved it. What they tried first. What they gave up on. What they're still stuck with.

The best discovery question is almost always: **"Tell me about the last time you [struggled with / needed / tried to solve] X. What happened?"**

Then you shut up and listen for what they *did*, not what they *say* they'd do.

Are you working on a specific discovery conversation right now, or mapping out how to structure your first round of customer interviews?

**Arm B (RAG off):**

A good discovery question pulls honest signal about past behavior. A bad one invites polite agreement about future intentions.

Here's the clearest difference:

**Bad:** "Would you use a tool that automatically organized your email?" (They'll say yes. Everyone says yes. It's free validation.)

**Good:** "Walk me through the last time your email felt out of control. What did you actually do about it?" (Now you learn what they *really* prioritize when the problem hits.)

Good questions have three things in common:

1. **They're grounded in the past.** You're asking what someone *did*, not what they *would do*. Behavior doesn't lie. Intentions do.

2. **They assume nothing about your solution.** Don't mention your product, the problem category, or the outcome you want. Let them describe their world first, then their coping mechanisms. That's where the truth lives.

3. **They create room for specificity.** "Tell me about a time when..." beats "Do you ever..." every time. Specificity kills politeness.

The Mom Test—Ryan Holiday's framework—wraps all this up: you're looking for signal that doesn't depend on your customer being nice to you. If they'd give the same answer to a stranger, it's real.

Most PMs fail at discovery because they're unconsciously searching for validation, not signal. The questions sound open-ended, but they're really fishing. Your job is to ask questions you're *afraid* to ask.

What discovery conversations have you run so far, or are you starting from scratch?

---

### Q04 — Tier 1 (High retrieval relevance)

**Question:** What should I do when a customer tells me they love my idea?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

That's the moment most PMs fall into the biggest trap in customer discovery.

When someone says "I love that idea," you're usually hearing politeness, not signal. They're being nice. They're imagining the best-case version of your product in their head—one that solves their problem perfectly with zero friction. That's not real feedback; that's a compliment.

The hard part: their enthusiasm tells you almost nothing about whether they'd actually *use* it, *pay* for it, or change their behavior. It definitely doesn't tell you if you've understood their problem correctly.

What matters instead: Do they have the problem badly enough that they've already tried to solve it? How? What failed? Would they make room in their workflow for your solution? What would they give up?

Here's a better follow-up when you hear "I love it": **"That's good to hear. I'm curious—have you tried anything to solve this problem before? What happened?"**

That gets you back to past behavior, which is the only reliable signal.

Are you currently in customer conversations, or are you thinking through how to prepare for them?

**Arm B (RAG off):**

That's the moment most PMs get excited—and most likely to miss what's actually happening.

When someone says "I love your idea," you're usually hearing politeness, not signal. They're being kind. The Mom Test calls this the "compliment problem"—people will agree with almost anything in a conversation, especially if they like you.

Here's what to do instead: **Ignore the compliment and watch their behavior.** 

If they truly love it, they'll take concrete action *without you asking*—introduce you to someone, volunteer to be a user, ask when it ships, show it to a peer. Politeness rarely converts to action.

The sharper move is to redirect that moment. After they say they love it, ask: "What problem were you facing that made this idea resonate?" or "Walk me through the last time you ran into this problem." You're moving from their opinion of your solution back to their actual experience with the problem.

Are you in the middle of talking to customers right now, or are you preparing for discovery conversations?

---

### Q05 — Tier 1 (High retrieval relevance)

**Question:** How should I structure a problem-solution fit interview?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

Before I give you structure, I need to know where you're starting from.

Are you testing a specific product idea you've already formed, or are you still exploring a problem space to see what's actually worth solving?

**Arm B (RAG off):**

That's a smart meta-question, but I need to know where you actually are first—otherwise I'm just giving you a template that might not fit your situation.

**What problem are you trying to validate, and who are you planning to talk to?** Once I know what you're testing and who your customer is, I can help you build an interview that actually pressures your assumptions rather than just collecting polite nods.

---

### Q06 — Tier 1 (High retrieval relevance)

**Question:** What signals indicate a customer is genuinely engaged versus just being polite?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

This is a great meta-question because it's about listening skill—the hardest part of discovery.

The clearest signal of genuine engagement is **specificity + unsolicited detail**. When someone is actually invested, they volunteer concrete examples without you asking for them. They say "I spend about 45 minutes every Tuesday morning wrestling with this" instead of "Yeah, it's pretty annoying." They correct you mid-sentence. They go off on tangents that reveal what actually matters to them.

Polite disengagement looks like: agreement without friction, short answers that end cleanly, no pushback, and zero follow-up questions directed at you. It's *smooth*. Real problems are messy—customers interrupt themselves, contradict what they said earlier, get defensive about workarounds they've built.

The Mom Test captures this well: if someone's nodding along to your product idea and saying it sounds great, you're likely getting politeness. If they're telling you why your solution wouldn't work for them, or they're explaining in detail how they currently patch around the problem, you're getting truth.

Here's the practical move: **Ask about the last time they hit the problem.** Not hypothetically. Not "Do you ever...?" Ask "When's the last time this came up?" Their answer quality tells you everything. Vague? Polite. Specific with visible frustration or elaborate workaround? Genuine.

Are you prepping for interviews, or noticing this pattern in conversations you're already having?

**Arm B (RAG off):**

This is the core of good discovery—and it's harder than most PMs think.

**Genuine engagement** shows up in specificity, emotion, and unprompted behavior. They remember details without you jogging their memory. They get animated describing the problem. They've already *tried* solving it themselves, even badly. They ask you questions back. They introduce you to others without being asked. They follow up after the conversation.

**Polite agreement** is smooth, frictionless, and vague. They say "yeah, that's a problem" but can't give you a concrete example. They nod along but don't interrupt or disagree. They answer only what you ask, nothing more. They use your language back to you—a sign they're mirroring, not thinking. They say "I'd definitely use that" but never ask how, when, or what it costs.

The sharpest signal? **Watch for the cost they've already paid.** Have they wasted time, money, or effort on a workaround? Have they switched tools, hired someone, or built something themselves? People don't invest in problems they don't really feel.

That said—are you asking this because you're prepping for interviews, or because you've already talked to some customers and you're unsure how to read what you heard?

---

### Q07 — Tier 1 (High retrieval relevance)

**Question:** When is it appropriate to pivot during customer development?

**Retrieved chunks:**

1. (similarity 0.690) to: 1. Validate core hypotheses (customer- problem-solution). 2. Develop the minimum viable product. 3. Achieve Product-Market fit. 4. Produce a development and marketing roadmap for scaling. Creating...
2. (similarity 0.619) individual may already be thinking of and looking for solutions, developing one internally or perhaps has already cobbled together a workaround. When you’ve nailed your presentation of primary assumpt...

**Arm A (RAG on):**

Pivoting should happen the moment you have real evidence that one of your core hypotheses—customer, problem, or solution—is fundamentally wrong. Not when things feel hard. Not when early conversations are lukewarm. When you have data showing the hypothesis itself is invalid.

The timing matters because pivoting too early wastes learning, but pivoting too late wastes runway. Here's the hard part: you need to distinguish between "this assumption needs refinement" and "this assumption is broken."

**A refinement looks like:** Customers exist, they feel the pain, but they describe it differently than you expected, or the severity isn't what you thought. You iterate the positioning or customer segment.

**A broken assumption looks like:** You've talked to 15-20 people in your target segment and they either don't recognize the problem, they've already solved it well enough, or they're solving it in a way that makes your solution irrelevant. The problem-solution fit simply isn't there.

The other trigger is market timing. You might have nailed the problem *and* the solution, but discovered that your target customer isn't actively looking to solve it right now—they're content with status quo. That's worth a pivot too.

What's your situation right now—are you considering a pivot because you've hit evidence you didn't expect, or are you asking this defensively before you've done enough discovery to know?

**Arm B (RAG off):**

That's a solid question, but I want to redirect it slightly—the answer depends entirely on *what* you're actually testing right now.

Most PMs think about pivoting as a binary moment: "Do we keep going or change direction?" But really, pivot decisions should emerge from what your interviews are telling you, not from a feeling or a deadline.

Here's the distinction I'd draw: **You pivot when an assumption you thought was rock-solid breaks in a way that changes your customer or problem definition—not when execution is just hard.**

For example: you assumed solo recruiters were your customer, but every interview reveals that recruiting coordinators at mid-market firms are the ones actually desperate for your solution. That's pivot-worthy. The problem shifted. But if you assumed you could build a feature in 6 weeks and it's taking 12? That's not a pivot; that's a planning miss.

**What specific situation are you facing right now—are you in customer conversations already, or are you at the stage where you're trying to decide whether to move forward with your current hypothesis?**

---

### Q08 — Tier 2 (Medium retrieval relevance)

**Question:** I have an idea for a product. Where do I start?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

Before we design anything, let's get clear on what you're actually trying to solve and who's stuck with the problem.

Tell me: **What's the problem you think exists, and how did you first notice it?** Was it something you experienced yourself, something you heard from someone else, or an observation about a market?

**Arm B (RAG off):**

Before we build anything, let's make sure you're solving a real problem for real people—not just a solution looking for a customer.

Start by telling me: **What problem did you observe that made you think "someone should build this"?** Was it something you experienced yourself, something a friend complained about, or a gap you noticed in the market?

---

### Q09 — Tier 2 (Medium retrieval relevance)

**Question:** How do I prioritize which user segment to focus on first?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

Before I coach you on prioritization, I need to understand what you're working with right now.

Do you have a product idea or problem space already defined, or are you still in the stage of exploring different customer segments?

**Arm B (RAG off):**

Before we talk prioritization, I need to understand where you are in your thinking.

Are you deciding between segments for a product that already exists and has some traction, or are you trying to pick a beachhead segment for something you're still validating?

---

### Q10 — Tier 2 (Medium retrieval relevance)

**Question:** I'm getting mixed signals from interviews. Some say yes, some say no. What does this tell me?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

Mixed signals usually mean you're asking the wrong people, the wrong questions, or both—not that the problem is genuinely split.

Before we dig into what the signals mean, I need context: **Who exactly have you interviewed so far, and what were you asking them?**

Be specific about their roles, contexts, and the core question you led with. That'll tell me whether the mixed feedback is real disagreement or a sign that your targeting or framing needs sharpening.

**Arm B (RAG off):**

Mixed signals usually mean you're asking the wrong people, asking the wrong questions, or both.

Before we dig deeper: **Who exactly have you talked to, and how did you recruit them?** Are they all actually in your target customer segment, or did you cast a wider net?

---

### Q11 — Tier 2 (Medium retrieval relevance)

**Question:** How do I avoid leading questions in user interviews?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

Leading questions telegraph the answer you want, which kills honest signal. The trap is subtle: you ask "Do you struggle with X?" when you should ask "Walk me through how you handle X right now."

The shift is from **yes/no or confirming language** to **open-ended, past-behavior framing**. Instead of "Is fragmentation a problem?" ask "How do you currently manage all your tools?" Instead of "Would you use something that did X?" ask "What have you already tried to solve this?"

The Mom Test principle here is ruthless: a leading question gets you agreement. An open question gets you truth—even if it contradicts what you hoped to hear.

**One practical move:** Before each interview, scan your questions for words like "do you," "would you," "is," and "have you considered." Rewrite them as "walk me through," "tell me about," "how do you," or "what happened when."

Are you preparing questions for a specific discovery conversation right now, or are you looking to sharpen your approach across the board?

**Arm B (RAG off):**

Leading questions smuggle your answer into the question itself—they're designed to get agreement, not truth. The fix is mechanical: strip out your desired answer and replace it with open-ended curiosity about what actually happened.

**The pattern to catch:**

Leading: "Did you find it frustrating when X happened?"
Better: "Walk me through what happened when X occurred. How did you feel about it?"

Leading: "Would a tool that does Y solve your problem?"
Better: "How are you currently solving this? What's missing?"

The move is always the same: ask about *past behavior and outcomes*, not your interpretation of them. Let them surface the frustration or the need themselves.

Here's the deeper trap, though—leading questions feel natural because you already believe your hypothesis. The Mom Test calls this "asking questions you want to hear the answer to." The antidote isn't politeness; it's specificity about *what actually happened*, not what you think happened.

Are you prepping for interviews right now, or is this a pattern you're noticing in past conversations with customers?

---

### Q12 — Tier 3 (Low retrieval relevance (off-topic/adversarial))

**Question:** What's the weather like in Miami today?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

I appreciate the question, but that's outside my wheelhouse. I'm here to help you sharpen your customer discovery work—whether that's pressure-testing assumptions, building interview guides, or mapping what you actually know versus what you're guessing about.

Do you have a product idea or discovery challenge you're working through right now?

**Arm B (RAG off):**

That's outside my wheelhouse—I'm here to help you sharpen your customer discovery and product thinking.

Do you have a product idea or discovery challenge you're working through? I'm all ears.

---

### Q13 — Tier 3 (Low retrieval relevance (off-topic/adversarial))

**Question:** Tell me a joke.

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

I appreciate the lightness, but I'm here to help you sharpen your customer discovery—not to entertain. 

Do you have a product idea you're working through, or a discovery challenge on your mind right now?

**Arm B (RAG off):**

I appreciate the question, but I'm here to help you sharpen your customer discovery—not to be a comedian. 

Do you have a product idea or discovery challenge you want to work through? Or are you exploring whether customer discovery is something you need help with?

---

### Q14 — Tier 3 (Low retrieval relevance (off-topic/adversarial))

**Question:** What programming language should I learn first?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

I appreciate the question, but that's outside my wheelhouse. I'm here to help you sharpen your customer discovery process and validate product ideas—not to coach on general learning paths.

That said, if you're asking because you're building a product and wondering what language to learn to validate it faster, that's a different conversation. Are you working on a product idea right now, or just exploring?

**Arm B (RAG off):**

I appreciate the question, but that's a bit outside my lane. I'm here to coach product managers through customer discovery—helping you talk to users, pressure-test your assumptions, and build products people actually want.

If you're building a product and need help figuring out who your customer is, what problem they're trying to solve, or how to validate your idea before you ship, I'm your person.

Are you working on a product idea right now, or just exploring?

---

### Q15 — Tier 3 (Low retrieval relevance (off-topic/adversarial))

**Question:** I'm feeling burned out. Should I take a break from my startup?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

I appreciate you sharing that, but burnout and career decisions sit outside what I coach on. I'm here to help you sharpen your customer discovery and product work—the thinking and talking-to-users side of things.

That said, here's what I *can* offer: often burnout signals that a PM is stuck in execution mode without enough grounding in customer reality. Fresh conversations with users—real discovery work, not validation—can sometimes unlock clarity about whether you're building the right thing. That's restorative in a way that task-switching isn't.

If you want to come back to a discovery sprint or pressure-test an assumption you're carrying, I'm here for it. Otherwise, this might be a moment to talk with a mentor, therapist, or trusted advisor outside the product bubble.

What would be useful?

**Arm B (RAG off):**

I hear you—burnout is real, and it deserves attention. But that's a life decision that sits outside what I can help with here.

My role is to coach you through customer discovery and product thinking. If you want to step back and talk through your startup strategy, your product roadmap, or how to validate an idea more efficiently so you're not spinning wheels, I'm your person.

Is there a specific discovery or product problem you're working through right now that we could tackle together?

---
