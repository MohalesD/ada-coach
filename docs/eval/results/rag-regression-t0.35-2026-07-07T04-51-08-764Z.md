# RAG Regression Run

Run at: 2026-07-07T04:51:08.765Z
Model: claude-haiku-4-5-20251001 · Embedding: text-embedding-3-small · threshold=0.35 · match_count=3

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
| Q06 | Tier 1 (High retrieval relevance) | 2 | 0.421 |
| Q07 | Tier 1 (High retrieval relevance) | 3 | 0.690 |
| Q08 | Tier 2 (Medium retrieval relevance) | 3 | 0.478 |
| Q09 | Tier 2 (Medium retrieval relevance) | 3 | 0.505 |
| Q10 | Tier 2 (Medium retrieval relevance) | 1 | 0.374 |
| Q11 | Tier 2 (Medium retrieval relevance) | 3 | 0.477 |
| Q12 | Tier 3 (Low retrieval relevance (off-topic/adversarial)) | 0 | — |
| Q13 | Tier 3 (Low retrieval relevance (off-topic/adversarial)) | 0 | — |
| Q14 | Tier 3 (Low retrieval relevance (off-topic/adversarial)) | 0 | — |
| Q15 | Tier 3 (Low retrieval relevance (off-topic/adversarial)) | 2 | 0.376 |

## Paired responses

### Q01 — Tier 1 (High retrieval relevance)

**Question:** What is the difference between customer discovery and customer validation?

**Retrieved chunks:**

1. (similarity 0.563) correct methods for ac- quiring and converting customers, and deployed the right resources to scale the business. At an abstract level, Customer Development is simply about questioning your core busi-...
2. (similarity 0.531) C-P-S (Customer-Problem-Solution) hypotheses that you test during Customer Discovery. For now, however, provide a concise description of the value you presume they will receive. ” The reason the defin...
3. (similarity 0.529) desired outcome of implementing Customer Development is a thriving, successful company; all Customer Development can promise is to maximize the potential to succeed. The second most desired outcome is...

**Arm A (RAG on):**

Good foundational question. Let me ground this in what each phase is actually testing.

**Customer Discovery** is about **problem-solution fit**: Does this problem exist for real people, and does your proposed solution address it in a way they'd actually want? You're asking "Have I understood the customer and their world correctly? Is there a real problem here? Could my idea work?"

**Customer Validation** is about **product-market fit**: Does your actual product (or near-final MVP) solve the problem well enough that customers will buy it, and can you build a repeatable, scalable sales model around it? You're asking "Will customers actually pay? Will they keep using it? Can I grow this?"

The practical difference: In Discovery, you're testing assumptions through conversations and lightweight prototypes—talking to 15–20 people, learning their workflows, watching them struggle with the current solution. In Validation, you're putting something closer to a real product in front of customers, tracking whether they adopt it, measuring retention, and proving you can repeat the sales motion.

Discovery answers "Should we build this?" Validation answers "Can we build a business around this?"

Are you deciding between these phases right now, or trying to understand where your current work sits?

**Arm B (RAG off):**

Good question—the distinction matters because it shapes what you're listening for in conversations.

**Customer discovery** is about understanding the problem space before you commit to a solution. You're talking to potential customers to learn: Does this problem actually exist? How do they experience it today? What have they already tried? Who else has this problem? You're mapping the landscape, not testing your idea.

**Customer validation** is about testing whether your specific solution resonates with the people who have the problem. You're showing them your approach (or describing it) and listening for whether they'd actually use it, pay for it, or change their behavior. You're pressure-testing a direction, not exploring a space.

Here's the trap: many PMs collapse these two together. They go talk to customers, describe their product idea, and call it discovery. But if you're leading with your solution, you've skipped discovery entirely—you're doing validation (badly, because you haven't validated the problem first).

**The sequence that works:** Discovery first (no product). Once you have high confidence in the problem, *then* validate that your approach solves it better than what they're doing today.

Are you in the exploration phase right now, or do you have a product idea you're trying to test?

---

### Q02 — Tier 1 (High retrieval relevance)

**Question:** How do I know when I've done enough customer interviews?

**Retrieved chunks:**

1. (similarity 0.568) test. STEP 5 62 The object of the first round of interviews is to test and confirm a core value proposition, matching your product idea with a market segment that suffers from the problem you are solv...
2. (similarity 0.527) rewording of your hypotheses or perhaps, you simply need to speak with more prospects. If all the data is looking the same, then either: • You have identified the right customer, who suffers the speci...
3. (similarity 0.511) You don’t want the con- versation to feel scripted. Through practice, you hope to find key phrases that frame the discussion and act as great on-topic conversa- tion starters. The key is to hold onto ...

**Arm A (RAG on):**

You've done enough when the patterns become clear and predictable—when new interviews stop teaching you something materially different about your core assumptions.

More specifically: if you're testing a tightly defined customer segment and their responses trend consistently in one direction (same problem, same workaround, same frustration), you've likely got signal. If the feedback is all over the map—contradictory problems, wildly different solutions, mixed interest—that's a sign you either need to narrow your segment definition, pivot one of your assumptions, or talk to more people.

The honest answer is: there's no magic number. It depends on how coherent your market is. A very specific niche (solo recruiter, 5-person team, bootstrapped SaaS founder) might cohere after 5-8 interviews. A broader segment might need 12-15 before patterns hold.

One more thing to watch: are you hearing from *early adopters*—people who already understand the problem deeply and might already be looking for a solution? Those conversations compress learning fast. If you're hearing from people who don't yet recognize the problem exists, you'll need more volume to build confidence.

What segment are you targeting, and how many interviews have you done so far?

**Arm B (RAG off):**

That's a pragmatic question, and the answer depends on what you're trying to learn.

If you're early-stage and still validating your core problem assumption, you typically need 5–8 interviews before patterns emerge. You'll start hearing the same frustrations, the same workarounds, the same language. When a new interview doesn't surface a *new* problem or contradicts what you've heard, you've probably hit saturation for that particular hypothesis.

But here's the trap: "done" doesn't mean comfortable. It means you've either found strong disconfirming evidence (which actually stops you faster) or you've stress-tested your assumptions enough to know what to build next. Most PMs stop too early because they've heard enough validation, not enough truth.

**What assumption are you actually trying to pressure-test right now?** That'll tell us whether you need three more interviews or thirty.

---

### Q03 — Tier 1 (High retrieval relevance)

**Question:** What makes a good customer discovery question versus a bad one?

**Retrieved chunks:**

1. (similarity 0.556) between what they tell you and what the real value of your product is to them. In addition, you should be going back to your group of prospects to learn more about them as potential customers. In othe...
2. (similarity 0.527) C-P-S (Customer-Problem-Solution) hypotheses that you test during Customer Discovery. For now, however, provide a concise description of the value you presume they will receive. ” The reason the defin...
3. (similarity 0.518) You don’t want the con- versation to feel scripted. Through practice, you hope to find key phrases that frame the discussion and act as great on-topic conversa- tion starters. The key is to hold onto ...

**Arm A (RAG on):**

A good question gets you honest signal about past behavior. A bad one gets you a polite lie about the future.

Here's the divide:

**Good questions** isolate one thing and ask what someone *actually did*, not what they think they'd do. "Walk me through the last time you got frustrated with your current tool—what happened?" beats "Would you use a product that does X?" every time. The first traps them in a specific memory. The second lets them agree because they're imagining the best version of your product in their head.

**Bad questions** are leading, future-focused, or abstract. "Don't you hate how fragmented recruiting tools are?" (leading). "Would you pay $50/month for this?" (future intention). "What features matter most to you?" (abstract—they'll name whatever sounds impressive, not what actually matters). 

The sharpest questions also have an asymmetry: a strong answer *means something concrete*, while a weak answer is easy to hide behind. For instance:

- "Tell me about the last time you switched tools for this task" → Strong answer: they describe a specific chain of events and what broke. Weak answer: "Oh, we just decided to try something new."
- "How often does this problem show up?" → Strong answer: a number tied to a real event. Weak answer: "Pretty often" or "whenever X happens."

The pattern: past behavior, specific detail, hard to fake agreement.

**What problem are you trying to validate with your discovery right now?** I can show you what a good question would sound like for your situation.

**Arm B (RAG off):**

A good discovery question gets you honest signal about how someone actually behaves or what they've already tried. A bad one gets you polite agreement or future intentions that evaporate the moment your product launches.

The clearest difference: **Good questions live in the past. Bad ones live in the future.**

"How do you currently manage your candidate pipeline?" is good. You'll hear real workflow, real tools, real friction—and you can watch them show you.

"Would you use a tool that automated candidate screening?" is bad. They'll say yes. Everyone says yes. It costs them nothing.

The second trap is leading questions disguised as open ones. "Don't you find it frustrating when candidates fall through the cracks?" nudges them toward the answer you want. "Walk me through what happened the last time you lost a strong candidate" doesn't. It lets them tell you whether it was friction or indifference.

A good question also passes the **Mom Test**: your mom could give you the same answer and it would still be true. If the answer changes because *you* asked it or because they want to impress you, the signal is contaminated.

The best discovery questions do three things at once: they're specific enough to get real detail, open-ended enough to surprise you, and rooted in something they've actually done.

Are you working on a specific discovery interview right now, or thinking through how to improve your question-asking generally?

---

### Q04 — Tier 1 (High retrieval relevance)

**Question:** What should I do when a customer tells me they love my idea?

**Retrieved chunks:**

1. (similarity 0.517) tips: Be Concise, Precise, and Entice. 6. JFDI! It’s worth repeating that online surveys, focus groups, user testing are not substitutes for prop- erly conducted Customer Discovery interviews. STEP 4 ...
2. (similarity 0.472) only want to convey the “big idea” as Steve puts it, and not a list of features. Describe your core differentiator and how it is going to solve the problem. Sit back again, and look for the response. ...
3. (similarity 0.463) you and your company target and deliver ads to mobile devices right now. ” Exercise: make a cold call You heard us. Do it. Do the thing you dread most: call someone you don’t know and ask them about y...

**Arm A (RAG on):**

That's the moment most PMs celebrate—and also the moment to get skeptical.

When someone says "I love your idea," you've usually hit the politeness wall, not product-market fit. People are kind, especially to founders. What you need to know is whether they'd actually change their behavior or pay for it.

Here's what I'd push you on: **Did they say they love the idea, or did they describe a real problem they're living with that your solution uniquely addresses?**

Those are wildly different signals. The first is validation theater. The second is discovery gold.

What did the conversation look like before they said they loved it? Walk me through what actually happened.

**Arm B (RAG off):**

That's actually the moment to get skeptical, not excited.

When someone says they love your idea, you've usually just gotten polite agreement—not signal that they'll actually use it or pay for it. The "Mom Test" principle nails this: people are *nice*, especially to someone who's pitched them something. Enthusiasm in a conversation is cheap.

The real question is: **Have they already tried to solve this problem in some other way, and are they actively frustrated with their current solution?**

If they haven't spent time or money trying to solve it themselves, their love for your idea doesn't tell you much. It tells you the idea sounds good in theory. That's not discovery—that's validation.

Here's what I'd push on: **When this customer told you they loved it, had you already asked them detailed questions about how they currently handle this problem, or did you pitch first and then ask what they thought?**

---

### Q05 — Tier 1 (High retrieval relevance)

**Question:** How should I structure a problem-solution fit interview?

**Retrieved chunks:**

1. (similarity 0.561) tips: Be Concise, Precise, and Entice. 6. JFDI! It’s worth repeating that online surveys, focus groups, user testing are not substitutes for prop- erly conducted Customer Discovery interviews. STEP 4 ...
2. (similarity 0.527) test. STEP 5 62 The object of the first round of interviews is to test and confirm a core value proposition, matching your product idea with a market segment that suffers from the problem you are solv...
3. (similarity 0.474) to Avoid Don’t be Lazy You are NOT creating investment or mar- keting materials. It is imperative that you exercise discipline when answering these questions; otherwise, garbage in, garbage out. Also,...

**Arm A (RAG on):**

That's the core question, and the answer depends on what you've already tested.

Are you at the *beginning* of discovery—testing whether a customer actually has the problem you think they have? Or are you further along, trying to confirm they care about *your specific solution* to it?

The structure shifts based on where you are, and I want to make sure we build the right sequence for your stage.

Where are you in the process right now?

**Arm B (RAG off):**

Before I give you structure, I need to know what you're actually testing. A problem-solution fit interview looks different depending on whether you're validating that a problem exists, that your customer cares enough to solve it, or that your particular solution is the one they'd reach for.

What stage are you at—have you already talked to customers about the problem itself, or are you going in cold to test whether the problem is real?

---

### Q06 — Tier 1 (High retrieval relevance)

**Question:** What signals indicate a customer is genuinely engaged versus just being polite?

**Retrieved chunks:**

1. (similarity 0.421) and col- leagues. While those people are likely to be friendly, their input is likely to be skewed. Use them to find people, not answers. , market segment) you speak with. Experimentation may be the k...
2. (similarity 0.386) You don’t want the con- versation to feel scripted. Through practice, you hope to find key phrases that frame the discussion and act as great on-topic conversa- tion starters. The key is to hold onto ...

**Arm A (RAG on):**

Good question—and one that catches a lot of PMs off guard when they're in the room.

The sharpest signals live in *behavior and specificity*, not tone. A genuinely engaged customer talks about past problems unprompted, tells you a story with details you didn't ask for, and corrects you when you misunderstand something. They lean in. They ask *you* questions. They pull a colleague over to show them something. They say "we actually tried that and it didn't work because..."

Polite disengagement sounds like agreement, vague enthusiasm, and hypotheticals. "Oh yeah, that could be useful." "I could see how people would want that." "Maybe we'd use it." "That's interesting." Notice the distance? They're not telling you what *they* do or what *they've* tried. They're speculating about a world where the product might matter.

The hardest one to catch: a prospect who nods and takes notes but never volunteers a specific problem. They're playing the role of "helpful interviewee," not thinking through their own reality.

**Are you in the middle of customer conversations right now, or gearing up to start them?** That'll help me point you toward the specific listening traps to watch for in your context.

**Arm B (RAG off):**

You're asking the right question—politeness is the enemy of good discovery. Here are the concrete signals:

**Genuine engagement:**
- They bring up problems unprompted, without you steering them there.
- They contradict themselves or admit uncertainty ("I'm not sure if this is the real issue, but...").
- They tell you about failed attempts to solve the problem—messy, specific details.
- They ask *you* questions back, especially skeptical ones.
- They reference the problem by name or shorthand when talking about their work ("Yeah, our fragmentation nightmare again").
- They get animated describing the pain, not the solution.

**Polite disengagement:**
- They agree with everything you say, especially your framing.
- They answer in the abstract or hypothetically ("I think most people would probably...").
- They talk about what they *should* do rather than what they actually do.
- They wait for you to ask the next question instead of elaborating unprompted.
- They describe the problem in your language, not theirs.
- Energy drops when you shift away from their pet solution.

The deepest signal: **Do they talk about the problem when the product isn't in the room?** If you ask about their current workflow and they naturally surface the pain—without you mentioning your idea—you've got real engagement.

Are you in the middle of interviews right now, or are you designing your discovery plan?

---

### Q07 — Tier 1 (High retrieval relevance)

**Question:** When is it appropriate to pivot during customer development?

**Retrieved chunks:**

1. (similarity 0.690) to: 1. Validate core hypotheses (customer- problem-solution). 2. Develop the minimum viable product. 3. Achieve Product-Market fit. 4. Produce a development and marketing roadmap for scaling. Creating...
2. (similarity 0.619) individual may already be thinking of and looking for solutions, developing one internally or perhaps has already cobbled together a workaround. When you’ve nailed your presentation of primary assumpt...
3. (similarity 0.579) who wish to track Prod- uct Development, test functionality and who are generally optimistic about its suitability to their needs. These two groups represent your “early adopters” or “earlyvangelists,...

**Arm A (RAG on):**

A pivot is appropriate the moment you have **evidence that an assumption is wrong**, not the moment you feel uncertain about it.

Here's the distinction: If you've spoken to dozens of prospects and consistently hear the same objection, or if a core hypothesis keeps failing validation tests, that's signal. If you've only talked to five people or you're interpreting silence as rejection, that's premature.

The risk most PMs face is pivoting *too early*—after a handful of conversations that happen to go badly—or pivoting *too late*—after months of conversations that all point the same way but you keep hoping the next customer will prove you right.

What specific situation are you in? Have you already started customer conversations, or are you at the stage where you're trying to decide what to validate first?

**Arm B (RAG off):**

That's the wrong question to ask before you've done customer development.

Here's what I see happen: PMs ask "when should I pivot?" as a way to stay flexible, but really they're asking permission to abandon an idea before they've stress-tested it. The timing question is actually a distraction from the harder work: *What would actually invalidate this assumption?*

Pivot decisions should come from specific, repeatable evidence that a core assumption is broken—not from one customer saying "that's not quite what I need" or from you feeling uncertain. You need to talk to enough people in your target customer segment to see a *pattern* of rejection on something fundamental: the problem doesn't exist, the customer can't afford a solution, or they're already solving it in a way you didn't anticipate.

Before you even think about pivoting, you need a discovery plan that tests your riskiest assumptions systematically. That's where the real clarity comes from.

Are you asking because you're worried your current idea might not work, or because you're in the middle of customer conversations and seeing signals that concern you?

---

### Q08 — Tier 2 (Medium retrieval relevance)

**Question:** I have an idea for a product. Where do I start?

**Retrieved chunks:**

1. (similarity 0.478) tips: Be Concise, Precise, and Entice. 6. JFDI! It’s worth repeating that online surveys, focus groups, user testing are not substitutes for prop- erly conducted Customer Discovery interviews. STEP 4 ...
2. (similarity 0.472) advanced labeling and other brand identity collateral will not be required initially. In other words, they will require merely “Mini- mum Viable Packaging”). The founders have hypothesized that the mi...
3. (similarity 0.466) rewording of your hypotheses or perhaps, you simply need to speak with more prospects. If all the data is looking the same, then either: • You have identified the right customer, who suffers the speci...

**Arm A (RAG on):**

Start by telling me what problem you're trying to solve and who you think has it.

Don't pitch the solution yet—just describe the pain point and the person experiencing it in 2-3 sentences. What made you notice this problem in the first place?

**Arm B (RAG off):**

I'd like to understand what you're working with first. **What problem or opportunity are you trying to explore—and how did you land on it?** 

Was this something you experienced yourself, something you heard from other people, or did you spot a gap in the market?

---

### Q09 — Tier 2 (Medium retrieval relevance)

**Question:** How do I prioritize which user segment to focus on first?

**Retrieved chunks:**

1. (similarity 0.505) a com- mon methodology to reach them. 3. ) of like individuals buying a product is a powerful influence. One of the basic tenets of Moore’s Crossing the Chasm is that one should choose one segment wit...
2. (similarity 0.491) owning the newest technology. • Don’t rely on references from others to make buying decisions. While they are in- fluenced by other early adopters, their main concern is solving a known problem. • Ear...
3. (similarity 0.456) site, etc. The last column includes questions that attempt to validate and optimize the assumptions in the previous columns. Once the visitor clicks on the link (column 4), he or she becomes a lead. T...

**Arm A (RAG on):**

Before I point you toward prioritization frameworks, I need to understand where you're starting from.

Do you already have multiple segments identified and validated with real customer conversations, or are you still deciding which segments *might* exist around your product idea?

**Arm B (RAG off):**

Good starting point, but I need to rewind a bit—you're asking a sequencing question before I know what you're actually testing.

Before you can sensibly prioritize segments, I need to understand: **Do you already have a product idea and some initial assumptions about who it's for, or are you still exploring the problem space?**

If you've got a clear direction, I can help you build a discovery plan that tests the riskiest assumptions first (which often points you to the segment worth starting with). But if you're still fuzzy on the problem or the customer, prioritizing segments now might lock you into the wrong bet.

What's your situation?

---

### Q10 — Tier 2 (Medium retrieval relevance)

**Question:** I'm getting mixed signals from interviews. Some say yes, some say no. What does this tell me?

**Retrieved chunks:**

1. (similarity 0.374) test. STEP 5 62 The object of the first round of interviews is to test and confirm a core value proposition, matching your product idea with a market segment that suffers from the problem you are solv...

**Arm A (RAG on):**

Mixed signals at this stage usually mean one of three things—and they're not all bad news.

First: you might be talking to the wrong segment. "Yes" people and "no" people could be fundamentally different in how they experience the problem or what they're willing to tolerate. That's worth mapping.

Second: your problem statement is fuzzy. If prospects hear different things when you describe the problem, they'll answer differently. The inconsistency might be in how you're framing it, not in the market itself.

Third: you're asking leading questions. People say yes to things they think you want to hear, especially early on.

Before we dig deeper—**how many interviews have you done, and what percentage are saying yes versus no?**

**Arm B (RAG off):**

Mixed signals usually mean you're talking to different customer segments—or you're asking questions that don't map to real behavior. Before we diagnose it, I need to know: **what exactly did the "yes" people say they do or have done, and what did the "no" people say?**

Don't paraphrase. Give me the specific behaviors or statements that felt like a yes versus a no.

---

### Q11 — Tier 2 (Medium retrieval relevance)

**Question:** How do I avoid leading questions in user interviews?

**Retrieved chunks:**

1. (similarity 0.477) You don’t want the con- versation to feel scripted. Through practice, you hope to find key phrases that frame the discussion and act as great on-topic conversa- tion starters. The key is to hold onto ...
2. (similarity 0.464) only want to convey the “big idea” as Steve puts it, and not a list of features. Describe your core differentiator and how it is going to solve the problem. Sit back again, and look for the response. ...
3. (similarity 0.431) tips: Be Concise, Precise, and Entice. 6. JFDI! It’s worth repeating that online surveys, focus groups, user testing are not substitutes for prop- erly conducted Customer Discovery interviews. STEP 4 ...

**Arm A (RAG on):**

You're identifying the right problem—leading questions are one of the fastest ways to gather false positives and waste interview time.

The core issue is that leading questions invite agreement rather than honest signal. They're shaped around what you want to hear, not what the user actually experiences. "Don't you find it frustrating when X happens?" already assumes X is frustrating. They'll nod along.

The antidote has two parts:

**1. Ask about past behavior, never future intentions.** "Have you tried to solve this before?" beats "Would you pay for a tool that does X?" The first gets you what actually happened. The second gets you politeness.

**2. Stay neutral and specific.** Instead of "Isn't it hard to manage all your spreadsheets?" try "Walk me through how you currently handle your data." No assumption embedded. They own the narrative.

The trap most PMs fall into: they're so attached to their solution that they unconsciously shape questions to validate it. You end up asking "How much time would you save with my tool?" instead of "How much time do you spend on this today, and what happens when you fall behind?"

Here's the test: if a stranger could answer your question the same way regardless of whether your product existed, you're on solid ground.

**Before your next interview, what's one question you're planning to ask that you suspect might be leading?** I can help you reframe it.

**Arm B (RAG off):**

The cleanest way is to flip your instinct: instead of asking what you *want* to hear, ask what actually happened.

Leading questions predict the answer. "Did you find the onboarding confusing?" practically begs for agreement. Open questions let the user surprise you. "Walk me through the last time you set up an account like that—what was that experience like?" forces them to reconstruct reality, not validate your hypothesis.

Here's the pattern: whenever you're tempted to ask a yes/no question or offer them multiple choice answers, pause and ask instead: *What did they actually do, and what did they actually say about it at the time?*

The Mom Test calls this "specificity and past tense." Specific past behavior doesn't lie. Future intentions and generalizations do.

Are you prepping for interviews right now, or are you in the middle of a discovery project where you're noticing you're getting too much polite agreement?

---

### Q12 — Tier 3 (Low retrieval relevance (off-topic/adversarial))

**Question:** What's the weather like in Miami today?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

That's outside my wheelhouse—I'm here to help you sharpen your customer discovery process, not check the forecast.

Do you have a product idea you're testing, or are you working through a customer discovery challenge right now?

**Arm B (RAG off):**

I appreciate the question, but that's outside my wheelhouse. I'm here to help you sharpen your customer discovery work—whether that's pressure-testing assumptions, building interview guides, or figuring out what you actually need to learn about your customers before you build.

Do you have a product idea you're working through, or are you at an earlier stage trying to identify a real problem worth solving?

---

### Q13 — Tier 3 (Low retrieval relevance (off-topic/adversarial))

**Question:** Tell me a joke.

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

I appreciate the ask, but that's not really my lane—I'm here to help you sharpen your customer discovery process, not to be a comedy routine.

What are you working on right now? Do you have a product idea you're testing, or are you stuck somewhere in your customer conversations?

**Arm B (RAG off):**

Ha—I appreciate the test, but I'm going to gently redirect us here.

I'm Ada, your customer discovery coach. My wheelhouse is helping you sharpen how you talk to customers, pressure-test your assumptions, and build products people actually want. Comedy writing isn't on the menu.

So let me ask you this instead: **Do you have a product idea or a discovery challenge you're working through right now, or are you just exploring what this session looks like?**

---

### Q14 — Tier 3 (Low retrieval relevance (off-topic/adversarial))

**Question:** What programming language should I learn first?

**Retrieved chunks:** none above threshold

**Arm A (RAG on):**

I appreciate the question, but that's a bit outside my wheelhouse. I'm here to help you sharpen your customer discovery process and validate product ideas—not programming fundamentals.

That said, if you're asking because you're building a product and wondering what to learn *for your customers* or *for your MVP*, that's a different conversation. That's about validating whether you should build at all before you invest in learning the tech stack.

Are you working on a product idea right now, or is this just general curiosity?

**Arm B (RAG off):**

I appreciate the question, but that's outside my wheelhouse. I coach product managers on customer discovery—helping you figure out what to build and validating it with real users before you build it.

If you're asking because you're thinking about building a product, or you're wondering whether to learn to code *before* validating an idea with customers, I'm happy to help with that angle instead.

What's driving the question?

---

### Q15 — Tier 3 (Low retrieval relevance (off-topic/adversarial))

**Question:** I'm feeling burned out. Should I take a break from my startup?

**Retrieved chunks:**

1. (similarity 0.376) is to question and test fun- damental business assumptions upon which you may have already built an organization. If, for example, you must report revenue growth to your investors next month, it may b...
2. (similarity 0.370) your vision reflected in your business model? Do you have strong opinions about external funding? One poten- tial benefit of embracing Customer Develop- ment principles is that it teaches you how to b...

**Arm A (RAG on):**

I appreciate you sharing that, and it sounds like something real is happening. But that's a bit outside my wheelhouse—I coach on customer discovery and product development, not founder wellness or life decisions.

That said, I will tell you this: the most common reason PMs and founders feel burned out is that they're building something nobody wants, or they're solving a problem that doesn't matter as much as they thought. Both of those are discovery problems, not rest problems.

If you want to dig into whether your product is actually resonating with customers, or whether you're chasing assumptions that don't hold up under real conversation, I'm here for that. Sometimes clarity on *what you're actually building and why* makes the burn feel different.

Is there a discovery question or product assumption you'd like to pressure-test?

**Arm B (RAG off):**

I hear you—burnout is real, and it deserves attention. But that's a bit outside my lane. I'm here to help you sharpen your customer discovery and product thinking, not to coach you through bigger life decisions.

That said, if your burnout is connected to *product* uncertainty—like you're building something but haven't validated whether customers actually want it, or you're spinning on feature decisions without customer signal—that's where I can help. Sometimes clarity on what you should be building next can shift how you feel about the work itself.

Is there a product or discovery question I can help you pressure-test?

---
