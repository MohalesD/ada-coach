# RAG Regression Run

Run at: 2026-07-07T04:52:04.056Z
Model: claude-haiku-4-5-20251001 · Embedding: text-embedding-3-small · threshold=0.45 · match_count=3

Arm A = RAG on (retrieval + injection). Arm B = RAG off (current production behavior).
Scoring against the harness rubric (grounding/specificity/coaching-value/authenticity) is manual — this table is the raw material.

## Summary

| ID | Tier | Chunks retrieved | Top similarity |
|---|---|---|---|
| Q01 | Tier 1 (High retrieval relevance) | 3 | 0.563 |
| Q02 | Tier 1 (High retrieval relevance) | 3 | 0.568 |
| Q03 | Tier 1 (High retrieval relevance) | 3 | 0.556 |
| Q04 | Tier 1 (High retrieval relevance) | 3 | 0.517 |
| Q05 | Tier 1 (High retrieval relevance) | 3 | 0.561 |
| Q06 | Tier 1 (High retrieval relevance) | 0 | — |
| Q07 | Tier 1 (High retrieval relevance) | 3 | 0.690 |
| Q08 | Tier 2 (Medium retrieval relevance) | 3 | 0.478 |
| Q09 | Tier 2 (Medium retrieval relevance) | 3 | 0.505 |
| Q10 | Tier 2 (Medium retrieval relevance) | 0 | — |
| Q11 | Tier 2 (Medium retrieval relevance) | 2 | 0.477 |
| Q12 | Tier 3 (Low retrieval relevance (off-topic/adversarial)) | 0 | — |
| Q13 | Tier 3 (Low retrieval relevance (off-topic/adversarial)) | 0 | — |
| Q14 | Tier 3 (Low retrieval relevance (off-topic/adversarial)) | 0 | — |
| Q15 | Tier 3 (Low retrieval relevance (off-topic/adversarial)) | 0 | — |

## Paired responses

### Q01 — Tier 1 (High retrieval relevance)

**Question:** What is the difference between customer discovery and customer validation?

**Retrieved chunks:**

1. (similarity 0.563) correct methods for ac- quiring and converting customers, and deployed the right resources to scale the business. At an abstract level, Customer Development is simply about questioning your core busi-...
2. (similarity 0.531) C-P-S (Customer-Problem-Solution) hypotheses that you test during Customer Discovery. For now, however, provide a concise description of the value you presume they will receive. ” The reason the defin...
3. (similarity 0.529) desired outcome of implementing Customer Development is a thriving, successful company; all Customer Development can promise is to maximize the potential to succeed. The second most desired outcome is...

**Arm A (RAG on):**

Good question—lots of PMs conflate these, and it costs them time.

**Customer Discovery** is about finding out if you've identified a real problem worth solving and whether your proposed solution makes sense to the people who have it. You're testing: Does this problem exist? Do customers care enough to change their behavior? What would a minimal solution look like? You're still in hypothesis mode.

**Customer Validation** comes after. You've built something (even if it's rough), and now you're testing whether customers will actually *use* it and whether there's a repeatable, scalable way to reach them and convert them. You're testing: Will they pay? Can we build a business model around this? You're moving from "is the problem real?" to "can we build a viable business?"

The key difference: Discovery is about *problem-solution fit*. Validation is about *product-market fit and business model fit*.

Most founders rush through Discovery—or skip it entirely—and then wonder why their validated product sits on a shelf.

Are you in the discovery phase right now, or further along?

**Arm B (RAG off):**

Good foundational question. They're often confused because they happen in sequence, but they're fundamentally different moves.

**Customer discovery** is the work you do *before* you have a product or a clear solution. You're exploring: Does the problem I think exists actually exist? Who experiences it? What are they doing about it now? What would matter to them in a solution? You're testing whether your assumptions about the problem are real. The output is either a sharper problem definition or the realization that you were chasing the wrong thing.

**Customer validation** is what you do *after* you've built something (or a prototype of something). You're testing: Does my solution actually solve the problem the way I think it does? Would customers use it? Would they pay for it? The questions shift from "Is this a real problem?" to "Does my answer work?"

Discovery is about the problem. Validation is about the solution.

Most PMs rush through discovery—they grab a few customer conversations, hear enough to feel confident, and jump to building. That's where costly mistakes happen. Discovery takes time because you're not just collecting complaints; you're pressure-testing your assumptions about *why* the problem matters and *who* it matters to.

What's pushing this question—are you starting discovery on something new, or trying to figure out where you are in your current cycle?

---

### Q02 — Tier 1 (High retrieval relevance)

**Question:** How do I know when I've done enough customer interviews?

**Retrieved chunks:**

1. (similarity 0.568) test. STEP 5 62 The object of the first round of interviews is to test and confirm a core value proposition, matching your product idea with a market segment that suffers from the problem you are solv...
2. (similarity 0.527) rewording of your hypotheses or perhaps, you simply need to speak with more prospects. If all the data is looking the same, then either: • You have identified the right customer, who suffers the speci...
3. (similarity 0.511) You don’t want the con- versation to feel scripted. Through practice, you hope to find key phrases that frame the discussion and act as great on-topic conversa- tion starters. The key is to hold onto ...

**Arm A (RAG on):**

That's the exact question most PMs get wrong—they either stop too early or keep interviewing endlessly hoping for certainty that won't come.

The real signal isn't a magic number. It's pattern convergence. When you're hearing the same problem articulated the same way, the same workarounds mentioned, the same objections to your solution—across a tightly defined customer segment—you've got your answer. You stop when the new interviews stop teaching you anything.

Here's what matters: **the quality of your segment definition matters more than the count.** If you're talking to "small business owners," you'll get scattered feedback forever. If you're talking to "solo recruiters managing contractor networks in tech," you'll see patterns emerge in 8-12 interviews.

That said, there's a harder question underneath yours: *What are you trying to learn right now?* Are you validating that the problem exists and matters? Or are you stress-testing how people actually solve it today? Those need different sample sizes.

What stage are you in—still testing whether you've got the right customer and problem, or digging into your solution fit?

**Arm B (RAG off):**

You've done enough when you stop learning new patterns—not when you've interviewed a magic number of people.

Most PMs stop too early because they confuse *confidence* with *saturation*. You feel good about your hypothesis after 5-8 interviews, so you ship. But saturation is different: it's when the next three interviews teach you nothing new about the problem, the workaround, or the decision-making process.

Here's the practical test: After each interview, ask yourself: "Did this person reveal a behavior, constraint, or motivation I hadn't heard before?" If yes, you're not saturated. If you're hearing the same three pain points, the same workaround, the same objection, in slightly different words—across multiple conversations with different people in your target segment—you're getting close.

One caveat: saturation within *one segment* isn't saturation across all segments. If your customer has three distinct sub-types (e.g., solo vs. team, early adopters vs. skeptics), you need saturation in each.

**Are you currently running interviews, or trying to decide whether to start them?**

---

### Q03 — Tier 1 (High retrieval relevance)

**Question:** What makes a good customer discovery question versus a bad one?

**Retrieved chunks:**

1. (similarity 0.556) between what they tell you and what the real value of your product is to them. In addition, you should be going back to your group of prospects to learn more about them as potential customers. In othe...
2. (similarity 0.527) C-P-S (Customer-Problem-Solution) hypotheses that you test during Customer Discovery. For now, however, provide a concise description of the value you presume they will receive. ” The reason the defin...
3. (similarity 0.518) You don’t want the con- versation to feel scripted. Through practice, you hope to find key phrases that frame the discussion and act as great on-topic conversa- tion starters. The key is to hold onto ...

**Arm A (RAG on):**

A good customer discovery question surfaces *past behavior*. A bad one invites opinion, prediction, or politeness.

**Good:** "Walk me through the last time you [struggled with X]. What did you do?" You get a story. You see what they actually chose.

**Bad:** "Would you use a product that [solves X]?" They'll say yes. People are nice. You learn nothing.

The difference hinges on three things:

1. **Past over future.** What did they do, not what would they do. Behavior is honest. Intentions lie.

2. **Specificity over abstraction.** "Tell me about your last hiring headache" beats "Do you find recruiting hard?" Concrete moments reveal real constraints.

3. **No product mention.** Frame the problem in their world, not your solution. If they hear your product idea embedded in the question, they'll answer for *you*, not for themselves.

The sharpest discovery questions often feel oddly simple—almost boring—because you're just asking someone to describe what they actually did. No leading. No selling. No "what if."

Are you building an interview guide right now, or testing questions you've already written?

**Arm B (RAG off):**

A good discovery question gets at past behavior and real constraints. A bad one invites polite fiction.

**Good questions sound like:**
- "Walk me through the last time you [struggled with X]. What did you do?"
- "How are you solving this today?"
- "What's it costing you to keep doing it that way?"

You're asking about what they *actually did*, not what they think they *should do* or *would do* with your solution.

**Bad questions sound like:**
- "Would you use a tool that did X?"
- "How important is Y to you?" (people say everything is important)
- "Do you think this is a problem?" (yes, always yes)

These invite agreement, not truth. People want to be helpful, so they'll validate your idea in a conversation. That feels good. It's useless.

The sharpest rule: **Never ask about the future. Never mention your solution.** Ask what they've tried, what stuck, what they abandoned and why. The past is where signal lives.

Are you prepping for interviews right now, or mapping out a discovery process from scratch?

---

### Q04 — Tier 1 (High retrieval relevance)

**Question:** What should I do when a customer tells me they love my idea?

**Retrieved chunks:**

1. (similarity 0.517) tips: Be Concise, Precise, and Entice. 6. JFDI! It’s worth repeating that online surveys, focus groups, user testing are not substitutes for prop- erly conducted Customer Discovery interviews. STEP 4 ...
2. (similarity 0.472) only want to convey the “big idea” as Steve puts it, and not a list of features. Describe your core differentiator and how it is going to solve the problem. Sit back again, and look for the response. ...
3. (similarity 0.463) you and your company target and deliver ads to mobile devices right now. ” Exercise: make a cold call You heard us. Do it. Do the thing you dread most: call someone you don’t know and ask them about y...

**Arm A (RAG on):**

That's often a red flag, not a win.

When someone says "I love your idea," they're usually being polite—especially if they know you or sense you're emotionally invested. The Mom Test calls this the "local bias" problem. What you actually need to hear is whether they'd change their behavior or pay money to solve the problem you're describing.

Here's what to do instead: **Don't celebrate the compliment. Dig into their current reality.**

Ask them about how they're handling this problem *right now*. What's their workaround? How much time does it take? Who else is involved? Are they losing money because of it? Have they tried to solve it before?

If they genuinely care about the problem, they'll talk about their current solution with real friction and frustration. If they're just being nice, the conversation will feel vague or they'll shrug and say "oh, it's not really a big deal."

The signal you're hunting for isn't enthusiasm about your idea—it's urgency about the problem itself.

**What stage are you at with your product right now?** Are you still in early customer interviews, or have you already started talking to potential users?

**Arm B (RAG off):**

That's the moment to get skeptical—not of them, but of what "love" actually means.

When someone says they love your idea, you've often just gotten a polite agreement. They may genuinely like it in theory. They may like *you*. They may be excited by the vision. But none of that tells you whether they'll actually change their behavior, pay for it, or make it a priority in their work.

Here's what I'd push on: **What did you do immediately after they said that?**

Did you keep asking questions about their current world and frustrations? Or did the conversation shift into you explaining how your product solves it? Because the second one is where you lose signal. You've moved from discovery into pitch mode.

The strongest signal isn't enthusiasm—it's specificity. A customer saying "I'd totally use that" is noise. A customer describing a time last week when they got frustrated and thought "man, I wish I had a tool for this"—*that's* a real data point.

Before your next conversation, I'd suggest bracketing these moments: when they say something positive about your idea, treat it as a cue to dig deeper, not a cue to celebrate. Ask them to walk you through the last time they faced the problem you're solving. Get them talking about their actual behavior, not their feelings about your solution.

What does your current discovery process look like? Are you talking to users one-on-one, or are you getting feedback in a different context?

---

### Q05 — Tier 1 (High retrieval relevance)

**Question:** How should I structure a problem-solution fit interview?

**Retrieved chunks:**

1. (similarity 0.561) tips: Be Concise, Precise, and Entice. 6. JFDI! It’s worth repeating that online surveys, focus groups, user testing are not substitutes for prop- erly conducted Customer Discovery interviews. STEP 4 ...
2. (similarity 0.527) test. STEP 5 62 The object of the first round of interviews is to test and confirm a core value proposition, matching your product idea with a market segment that suffers from the problem you are solv...
3. (similarity 0.474) to Avoid Don’t be Lazy You are NOT creating investment or mar- keting materials. It is imperative that you exercise discipline when answering these questions; otherwise, garbage in, garbage out. Also,...

**Arm A (RAG on):**

Before I give you a structure, I need to understand what stage you're at.

Have you already identified a specific customer segment and tested whether they actually care about the problem you think you're solving? Or are you still in the earlier phase of mapping out what the problem even is?

**Arm B (RAG off):**

That depends on where you are in your thinking right now. Are you walking into these interviews with a specific product idea you want to test, or are you still exploring a problem space and trying to understand what customers actually care about?

---

### Q06 — Tier 1 (High retrieval relevance)

**Question:** What signals indicate a customer is genuinely engaged versus just being polite?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

This is the core of the Mom Test problem, and it's where most PMs get misled.

Genuine engagement shows up in **specificity, friction, and voluntary detail.** Someone truly invested will:
- Describe the problem unprompted with concrete examples ("Last Tuesday I spent two hours..." not "Sometimes it's annoying")
- Mention what they've already tried to solve it—and be honest about what didn't work
- Push back or ask clarifying questions about your framing, not just nod along
- Bring up constraints or trade-offs you didn't ask about ("Yeah, but our team is remote so...")
- Follow up *after* the conversation ("I thought of another thing...")

Polite agreement looks like: enthusiastic nodding, generic language ("That sounds useful"), questions that hand you the answer ("Don't you think...?"), and zero friction—they never disagree.

The trap: **Politeness feels like validation.** It's not. It's a social reflex.

Here's the real tell: ask them to *do* something small that costs them effort. "Could you show me how you currently handle this?" or "Would you walk me through your last attempt?" Genuinely engaged customers will do it. Polite ones will hesitate or deflect.

Are you running into this in your own interviews right now, or is this more of a calibration question for how you'll listen?

**Arm B (RAG off):**

Good question—this is the core of the Mom Test problem.

**Genuine engagement shows up in specificity and friction.** When a customer is truly invested, they'll volunteer details you didn't ask for ("We tried Asana, but nobody uses the comments feature because..."), reference specific moments ("Last month we lost the Acme contract because..."), or push back on your idea ("That won't work because we already have X in place"). Polite customers give you what you want to hear: short answers, agreement, and vague language like "that sounds interesting" or "I could see using that."

The sharpest signal is **when a customer talks about the *cost* of the problem unprompted**—time spent, money lost, deals missed, stress caused. Politeness rarely goes there. Real pain does.

Also watch for **what they don't say**. If you ask "What's the biggest bottleneck in your hiring process?" and they pause or sigh before answering, that's engagement. If they jump to a cheerful answer immediately, they're performing.

Are you running discovery conversations right now, or setting up a framework before you start talking to users?

---

### Q07 — Tier 1 (High retrieval relevance)

**Question:** When is it appropriate to pivot during customer development?

**Retrieved chunks:**

1. (similarity 0.690) to: 1. Validate core hypotheses (customer- problem-solution). 2. Develop the minimum viable product. 3. Achieve Product-Market fit. 4. Produce a development and marketing roadmap for scaling. Creating...
2. (similarity 0.619) individual may already be thinking of and looking for solutions, developing one internally or perhaps has already cobbled together a workaround. When you’ve nailed your presentation of primary assumpt...
3. (similarity 0.579) who wish to track Prod- uct Development, test functionality and who are generally optimistic about its suitability to their needs. These two groups represent your “early adopters” or “earlyvangelists,...

**Arm A (RAG on):**

Pivoting too early is the enemy of learning. Most PMs want to pivot the moment they hear pushback—it feels productive, like they're "responding to feedback." But that's often just noise.

The right time to pivot is when you've consistently heard the *same* objection or misalignment from multiple independent customers (not 2–3, but enough to establish a pattern), *and* you can articulate specifically what hypothesis failed and why.

Here's the harder part: you need to distinguish between "the problem doesn't resonate" versus "I haven't found the right customer yet" versus "my solution approach is wrong but the problem is real." Those lead to three different pivots—or sometimes no pivot at all, just a tighter customer segment.

The trap is pivoting your *customer* when you really just need to pivot your *messaging*. Or pivoting your *problem* when you haven't actually validated the one you started with.

**What's driving this question—are you considering a pivot right now, or thinking through how you'd know when it's time?**

**Arm B (RAG off):**

That's a good question, but it's framing the pivot decision backwards. Most PMs ask *when* to pivot when they should first ask *what evidence would make a pivot necessary*.

Here's the distinction: if you're in customer discovery right now, you shouldn't be thinking about pivoting yet. You should be testing whether your core assumptions—about who the customer is, what problem they actually care about, how they'd measure success—hold up under real conversation.

A pivot becomes appropriate only when you hit one of these conditions:
- A customer segment you thought was your target doesn't actually experience the problem you're solving for them.
- The problem exists, but customers have already solved it in a way they're satisfied with, or they've deprioritized it below other needs.
- You discover a different customer segment or problem space that's more acute, and you have clearer evidence for it than your original thesis.

The trap is pivoting on hunches or early rejections. One conversation where someone says "that's not really a problem for me" isn't a signal to pivot. Ten conversations where you can't find evidence of the problem *is*.

**What's driving the pivot question right now—are you in the middle of customer interviews, or are you still at the planning stage?**

---

### Q08 — Tier 2 (Medium retrieval relevance)

**Question:** I have an idea for a product. Where do I start?

**Retrieved chunks:**

1. (similarity 0.478) tips: Be Concise, Precise, and Entice. 6. JFDI! It’s worth repeating that online surveys, focus groups, user testing are not substitutes for prop- erly conducted Customer Discovery interviews. STEP 4 ...
2. (similarity 0.472) advanced labeling and other brand identity collateral will not be required initially. In other words, they will require merely “Mini- mum Viable Packaging”). The founders have hypothesized that the mi...
3. (similarity 0.466) rewording of your hypotheses or perhaps, you simply need to speak with more prospects. If all the data is looking the same, then either: • You have identified the right customer, who suffers the speci...

**Arm A (RAG on):**

Before we design anything, let's ground this in reality: **what problem did you observe that made you think a product was needed?**

I'm asking because the sharpest founders start by noticing a friction point in their own life or work—something they bumped into repeatedly—not by falling in love with a solution first. Walk me through what you saw.

**Arm B (RAG off):**

Before we design anything, I need to understand what drew you to this problem in the first place.

Tell me: **What problem are you seeing, and how did you first notice it?** Did you live through it yourself, hear it repeatedly from someone, or stumble onto it another way?

---

### Q09 — Tier 2 (Medium retrieval relevance)

**Question:** How do I prioritize which user segment to focus on first?

**Retrieved chunks:**

1. (similarity 0.505) a com- mon methodology to reach them. 3. ) of like individuals buying a product is a powerful influence. One of the basic tenets of Moore’s Crossing the Chasm is that one should choose one segment wit...
2. (similarity 0.491) owning the newest technology. • Don’t rely on references from others to make buying decisions. While they are in- fluenced by other early adopters, their main concern is solving a known problem. • Ear...
3. (similarity 0.456) site, etc. The last column includes questions that attempt to validate and optimize the assumptions in the previous columns. Once the visitor clicks on the link (column 4), he or she becomes a lead. T...

**Arm A (RAG on):**

Good question—but I need to back up a step before we can prioritize.

Have you already identified multiple segments you're considering, or are you still figuring out who your primary user even is? And either way, what evidence do you have that these segments actually exist—have you talked to people in them yet, or are these mostly assumptions based on your product roadmap?

**Arm B (RAG off):**

That's a smart question to ask early, but I want to push back gently: you might be sequencing this backwards.

Before you prioritize *which* segment to focus on, you need to know *why* each segment matters to your product idea. Right now, I'm guessing you have a few potential customer groups in mind, but I don't know what problem you're solving or what assumptions you're making about who needs it most.

Here's what I'd do instead: Start by telling me your product idea—what problem are you solving, and for whom? Once I understand your vision, we can surface your hidden assumptions about different segments and *then* figure out which one is riskiest to validate first.

What's the core idea you're working with?

---

### Q10 — Tier 2 (Medium retrieval relevance)

**Question:** I'm getting mixed signals from interviews. Some say yes, some say no. What does this tell me?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

Mixed signals usually mean you're asking the wrong people, or the right people but the wrong questions.

Before we dig in: **What specifically are they saying yes and no to?** Are they responding to the problem, the solution, pricing, a feature—or something else entirely?

Once I understand what's actually splitting your feedback, I can help you figure out whether you've got a segmentation problem, a positioning problem, or a discovery process that needs recalibrating.

**Arm B (RAG off):**

Mixed signals usually mean you're asking the wrong people, the wrong questions, or both—not that the problem is genuinely divisive.

Before we dig into what the data is telling you, I need context: **What specific question or problem are you testing, and what does "yes" and "no" actually mean in those interviews?**

---

### Q11 — Tier 2 (Medium retrieval relevance)

**Question:** How do I avoid leading questions in user interviews?

**Retrieved chunks:**

1. (similarity 0.477) You don’t want the con- versation to feel scripted. Through practice, you hope to find key phrases that frame the discussion and act as great on-topic conversa- tion starters. The key is to hold onto ...
2. (similarity 0.464) only want to convey the “big idea” as Steve puts it, and not a list of features. Describe your core differentiator and how it is going to solve the problem. Sit back again, and look for the response. ...

**Arm A (RAG on):**

Leading questions telegraph the answer you want to hear. They make people agree with you instead of telling you what's actually true.

The fix is simpler than most people think: ask about *what they've already done*, not what they might do. "How do you currently handle X?" beats "Would you use a tool that does X?" every time. The first one grounds them in real behavior. The second one asks them to predict their own future, which they're terrible at—and which naturally tilts toward politeness.

Here's the move: whenever you catch yourself asking "Would you...?" or "Do you think...?" or "Doesn't it frustrate you that...?", reframe it as a *past behavior* question instead. "Tell me about the last time you ran into that problem. Walk me through what you did step by step."

One more trap to watch for: don't ask questions where the polite answer and the honest answer are the same. "Do you care about saving time?" Nobody says no. Instead, ask: "The last time you tried to speed this up, what actually happened?" Now you're listening to friction, not sentiment.

What interview are you preparing for right now—is there a specific question you're wrestling with?

**Arm B (RAG off):**

Leading questions plant the answer you want to hear. The fix is simpler than most PMs think: ask about what they've *already done*, not what they *might do*.

Instead of: "Would you use a tool that automatically prioritized your tasks?"

Ask: "Walk me through how you decided what to work on yesterday. What got your attention first, and why?"

The second question reveals their actual behavior—how they *really* prioritize—without steering them toward your solution. You're a reporter, not a trial lawyer.

Here's the pattern: **Remove all conditional language** ("Would you...?", "If we built...?", "Could you imagine...?"). Replace it with **past tense and specificity** ("Tell me about the last time you..."). And **never mention your product or solution** in the question itself.

One more rule that catches most PMs off guard: even seemingly neutral questions can lead if they're framed as hypotheticals. "How would you solve this?" is still a leading question because it asks them to imagine a future that doesn't exist yet. Better: "How have you tried to solve this so far? What worked, what didn't?"

Are you prepping for interviews now, or trying to clean up questions you've already written?

---

### Q12 — Tier 3 (Low retrieval relevance (off-topic/adversarial))

**Question:** What's the weather like in Miami today?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

I appreciate the question, but weather updates aren't really my lane. I'm here to help you sharpen your customer discovery process and think more critically about your product assumptions.

Do you have a product idea or discovery challenge you're working through right now? I'm ready to coach whenever you are.

**Arm B (RAG off):**

Ha—I appreciate the question, but that's outside my lane. I'm here to help you sharpen your customer discovery work, not to be a weather forecast.

Do you have a product idea or discovery challenge you're working through right now? I'm ready to coach whenever you are.

---

### Q13 — Tier 3 (Low retrieval relevance (off-topic/adversarial))

**Question:** Tell me a joke.

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

Ha—I appreciate the impulse, but I'm here to coach you on customer discovery, not stand-up. 

Got a product idea or discovery challenge you want to pressure-test? Or are you looking to run a structured Discovery Sprint?

**Arm B (RAG off):**

I appreciate the break, but I'm here to help you sharpen your customer discovery—not to be an entertainer. 

What product or problem are you working through right now?

---

### Q14 — Tier 3 (Low retrieval relevance (off-topic/adversarial))

**Question:** What programming language should I learn first?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

I appreciate the question, but that's outside my wheelhouse. I'm here to coach you through customer discovery and product development—helping you sharpen how you talk to users, test your assumptions, and validate ideas before you build.

If you're asking because you're thinking about building a product and wondering whether to learn to code first, that's a different conversation. But the straight coding question? Not my lane.

What I *can* help with: Do you have a product idea or problem space you're trying to validate? Or are you stuck on the discovery side of things?

**Arm B (RAG off):**

I appreciate the question, but that's outside my wheelhouse. I'm here to help you sharpen your customer discovery process—the conversations and research you do to validate (or invalidate) product ideas before you build them.

If you're asking because you're thinking about *building* something and want to know what to learn first, let's reframe: the real first step isn't code. It's talking to potential customers to understand if the problem you're solving is real and worth their time.

Are you working on a product idea right now? If so, I'd love to help you stress-test your assumptions about who you're building for and what problem you're actually solving.

---

### Q15 — Tier 3 (Low retrieval relevance (off-topic/adversarial))

**Question:** I'm feeling burned out. Should I take a break from my startup?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

I appreciate you sharing that, but burnout and breaks are outside my wheelhouse—I'm here specifically to help you sharpen your customer discovery and product thinking.

That said, I'd gently push back on the framing: often what feels like burnout is actually a signal that you're working on the wrong thing, talking to the wrong people, or chasing assumptions instead of evidence. Sometimes the antidote isn't rest—it's clarity.

If you want to explore whether your product direction is actually resonating with customers, or if you're stuck in a discovery loop that's draining you, I'm your person. Is there a specific product question or discovery challenge you're wrestling with right now?

**Arm B (RAG off):**

I appreciate you sharing that, but that's a bit outside my lane. I'm here to help you sharpen your customer discovery and product thinking—not to coach you on burnout or life decisions.

That said, if the burnout is connected to *customer discovery work specifically*—like you're exhausted from unstructured conversations, or you're not sure you're talking to the right people, or discovery feels circular and directionless—that's something we can untangle together. Sometimes a clearer discovery process actually reduces the noise and fatigue.

Is the burnout tied to how you're doing discovery work, or is it something broader?

---
