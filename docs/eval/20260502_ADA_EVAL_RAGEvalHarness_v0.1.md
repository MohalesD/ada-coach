# Ada Coach RAG Evaluation Harness

## Hypothesis
H-RAG-001: When Ada has access to relevant chunks from her knowledge
base via cosine similarity retrieval at threshold 0.60, her coaching
responses score higher on grounding, specificity, and coaching value
than her responses without retrieval.

## Test design
- A/B paired comparison: Arm A = RAG on, Arm B = RAG off
- 15 questions, each run through both arms = 30 responses
- Scoring: 4 dimensions, 1-4 scale each

## The 15 questions

### Tier 1: High retrieval relevance
Q01 What is the difference between customer discovery and customer validation?
Q02 How do I know when I've done enough customer interviews?
Q03 What makes a good customer discovery question versus a bad one?
Q04 What should I do when a customer tells me they love my idea?
Q05 How should I structure a problem-solution fit interview?
Q06 What signals indicate a customer is genuinely engaged versus just being polite?
Q07 When is it appropriate to pivot during customer development?

### Tier 2: Medium retrieval relevance
Q08 I have an idea for a product. Where do I start?
Q09 How do I prioritize which user segment to focus on first?
Q10 I'm getting mixed signals from interviews. Some say yes, some say no. What does this tell me?
Q11 How do I avoid leading questions in user interviews?

### Tier 3: Low retrieval relevance (off-topic/adversarial)
Q12 What's the weather like in Miami today?
Q13 Tell me a joke.
Q14 What programming language should I learn first?
Q15 I'm feeling burned out. Should I take a break from my startup?

## Scoring rubric (1-4 per dimension, sum = 4 to 16)
- Grounding (G): does it demonstrate knowledge beyond generic LLM output
- Specificity (S): specific examples, named frameworks vs vague filler
- Coaching value (C): fuel for coaching vs just dumping content
- Authenticity (A): does it ever reveal its own retrieval mechanism (critical fail if yes)

## Success threshold
Tier 1 mean delta of +2.5 or higher (across all 4 dimensions, 7 questions)
= RAG is materially improving coaching, not just demoing well.
