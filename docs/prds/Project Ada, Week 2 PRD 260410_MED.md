# **Project Ada, Week 2 PRD**

### **From Wizard of Oz to Real MVP**

**Author:** Mohales "Mo" Deis **Date:** April 11, 2026 **Course:** AI Coding for Product Managers (Maven, Rajesh Pentakota) **GitHub:** MohalesD **Status:** In Progress

---

## **1\. Context and Strategic Intent**

Ada is an AI-powered Customer Discovery Coach for product managers. In Week 1, she was built as a high-fidelity Wizard of Oz prototype: a polished landing page with rotating pre-written coaching responses that simulate AI interaction. She looks real, but she isn't.

Week 2 transforms Ada from a marketing demo into a functional MVP by connecting her to the Claude API through a Supabase backend. This accomplishes three things simultaneously:

1. Satisfies the Week 2 assignment (Supabase backend, CRUD with RLS, working API integration)  
2. Advances Ada from prototype to product  
3. Establishes the backend architecture that all future features will build on

The "Level Two" stretch goal adds a simplified RAG (Retrieval-Augmented Generation) system using Supabase's pgvector extension, allowing Ada to ground her coaching in a PM's own documents. This is a topic Rajesh has not yet taught in the course.

---

## **2\. User and Problem**

**Primary user:** Early-stage product managers conducting customer discovery interviews.

**Problem:** PMs preparing for customer discovery often ask leading questions, make untested assumptions, and lack structured frameworks for extracting genuine insights. Existing tools are either generic AI chatbots with no coaching methodology or expensive consulting engagements.

**Ada's value:** A coaching assistant that pressure-tests a PM's assumptions, reframes their questions, and guides them toward deeper customer insights, grounded in real discovery methodology.

---

## **3\. Architecture Overview**

### **System Diagram (Text)**

User (Browser)  
    |  
    v  
React Frontend (Vite \+ Tailwind)  
    |  
    | HTTPS POST to Supabase Edge Function  
    v  
Supabase Edge Function: /chat  
    |  
    |-- Reads ANTHROPIC\_API\_KEY from Supabase Secrets  
    |-- Calls Claude API with coaching system prompt  
    |-- Stores conversation in Supabase Postgres  
    |-- \[Layer 2\] Retrieves relevant context from pgvector  
    |  
    v  
Response returned to frontend

### **Tech Stack**

| Layer | Technology | Purpose |
| ----- | ----- | ----- |
| Frontend | Vite \+ React \+ Tailwind CSS | UI (existing from Week 1\) |
| Backend | Supabase Edge Functions (Deno runtime) | Server-side API calls, secret management |
| Database | Supabase Postgres | Conversation history, admin data, user sessions |
| AI | Claude API (Haiku for MVP, Sonnet for complex coaching) | Real-time coaching responses |
| Vector Search | pgvector (Supabase extension) | Layer 2 only: document retrieval |
| Deployment | Vercel (frontend), Supabase (backend) | Production hosting |
| Version Control | GitHub (MohalesD) | Code management, CI/CD trigger |

### **Why This Architecture (Not Express, Not Vercel Functions)**

Supabase Edge Functions are the right choice because:

* They run on Deno, which is secure by default (no file system or network access unless explicitly granted)  
* API keys stay in Supabase Secrets, never in frontend code or .env files committed to Git  
* The database and the serverless functions live in the same ecosystem, reducing latency and configuration overhead  
* pgvector is a native Postgres extension, meaning the RAG layer doesn't require a separate third-party service like Pinecone  
* This matches the course requirement (Supabase backend) while being a genuinely good architectural decision

---

## **4\. Layer 1: Core MVP (The Assignment)**

This layer is the complete, submittable Week 2 project. Everything below must work end to end before Layer 2 begins.

### **4A. Supabase Project Setup**

**What gets created:**

* New Supabase project (name: `ada-mvp`)  
* Anthropic API key stored as a Supabase secret  
* Database tables created via migration  
* Edge Function scaffolded and deployed

**Database Schema (Migration 001):**

sql  
\-- Table: conversations  
\-- Stores each coaching session  
CREATE TABLE conversations (  
  id UUID DEFAULT gen\_random\_uuid() PRIMARY KEY,  
  created\_at TIMESTAMPTZ DEFAULT now(),  
  updated\_at TIMESTAMPTZ DEFAULT now(),  
  title TEXT, \-- Auto-generated from first user message  
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted'))  
);

\-- Table: messages  
\-- Stores individual messages within a conversation  
CREATE TABLE messages (  
  id UUID DEFAULT gen\_random\_uuid() PRIMARY KEY,  
  conversation\_id UUID REFERENCES conversations(id) ON DELETE CASCADE,  
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),  
  content TEXT NOT NULL,  
  created\_at TIMESTAMPTZ DEFAULT now(),  
  token\_count INTEGER \-- Track usage for cost monitoring  
);

\-- Table: coaching\_prompts  
\-- Admin-managed system prompts for Ada's coaching behavior  
CREATE TABLE coaching\_prompts (  
  id UUID DEFAULT gen\_random\_uuid() PRIMARY KEY,  
  name TEXT NOT NULL,  
  prompt\_text TEXT NOT NULL,  
  is\_active BOOLEAN DEFAULT false, \-- Only one active at a time  
  version INTEGER DEFAULT 1,  
  created\_at TIMESTAMPTZ DEFAULT now(),  
  updated\_at TIMESTAMPTZ DEFAULT now(),  
  notes TEXT \-- Admin notes about what changed  
);

\-- Index for fast message retrieval by conversation  
CREATE INDEX idx\_messages\_conversation ON messages(conversation\_id, created\_at);

\-- Index for active prompt lookup  
CREATE INDEX idx\_coaching\_prompts\_active ON coaching\_prompts(is\_active) WHERE is\_active \= true;

**Row-Level Security (RLS):**

For the MVP, Ada does not have user authentication (that's a future feature). RLS will be configured to:

* Allow the Edge Function (service role) full CRUD access to all tables  
* Block direct browser access to all tables (anon role gets nothing)  
* This satisfies the assignment requirement for RLS while being the correct security posture for an unauthenticated MVP

sql  
\-- Enable RLS on all tables  
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;  
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;  
ALTER TABLE coaching\_prompts ENABLE ROW LEVEL SECURITY;

\-- Service role (Edge Functions) gets full access  
\-- No policies for anon role \= anon is blocked entirely  
CREATE POLICY "Service role full access to conversations"  
  ON conversations FOR ALL  
  USING (auth.role() \= 'service\_role');

CREATE POLICY "Service role full access to messages"  
  ON messages FOR ALL  
  USING (auth.role() \= 'service\_role');

CREATE POLICY "Service role full access to coaching\_prompts"  
  ON coaching\_prompts FOR ALL  
  USING (auth.role() \= 'service\_role');

### **4B. Edge Function: /chat**

**Purpose:** Accept a user message, call Claude API with coaching context, store the exchange, return the response.

**Request shape:**

json  
{  
  "message": "I'm building a task management app for freelancers",  
  "conversation\_id": "optional-uuid-if-continuing"  
}

**Response shape:**

json  
{  
  "reply": "Interesting. Before we dig into the solution, tell me: how did you discover that freelancers struggle with task management? Was it something you observed firsthand, or is it an assumption you're carrying into the build?",  
  "conversation\_id": "uuid-of-conversation",  
  "message\_id": "uuid-of-this-message"  
}

**System prompt for Ada (v1):**

You are Ada, an AI-powered Customer Discovery Coach. Your role is to help product managers sharpen their customer discovery process.

Your coaching style:  
\- Never validate assumptions. Always pressure-test them.  
\- Ask one focused follow-up question at a time, not a list.  
\- Reframe leading questions into open-ended ones.  
\- Push PMs to distinguish between symptoms and root causes.  
\- Reference discovery frameworks when relevant (Jobs to Be Done, Five Whys, assumption mapping).  
\- Keep responses concise: 2-4 sentences plus one question.  
\- Be warm but direct. You're a coach, not a cheerleader.

When a PM describes their product idea, start by probing how they identified the problem, who they've talked to, and what assumptions they're making. Don't jump to solutions.

If a PM asks a question that isn't related to customer discovery or product development, gently redirect them back to the coaching context.

**Edge Function logic (pseudocode):**

1\. Parse request body (message, conversation\_id)  
2\. If no conversation\_id, create new conversation record  
3\. Fetch conversation history (last 20 messages for context window)  
4\. Fetch active coaching prompt from coaching\_prompts table  
5\. Build Claude API request:  
   \- system: active coaching prompt  
   \- messages: conversation history \+ new user message  
   \- model: claude-haiku-4-5-20251001  
   \- max\_tokens: 500  
6\. Call Claude API using ANTHROPIC\_API\_KEY from secrets  
7\. Store user message in messages table  
8\. Store assistant response in messages table  
9\. Return response to frontend

### **4C. Admin Panel (CRUD \+ RLS Demonstration)**

**Purpose:** A simple admin interface for managing Ada's coaching behavior. This is the CRUD component the assignment requires.

**Admin features:**

1. **View all conversations** with message counts and timestamps  
2. **Read individual conversations** (full message history)  
3. **Create/edit coaching prompts** (the system prompt that defines Ada's personality)  
4. **Activate/deactivate prompts** (toggle which prompt version is live)  
5. **Delete/archive conversations** (cleanup)

**Admin access control:**

For the MVP, admin access is protected by a simple shared secret (an admin password stored as a Supabase secret, checked by the admin Edge Function). This is not production-grade auth, but it's appropriate for a course project and demonstrates the principle of access control.

**Admin Edge Functions:**

* `/admin/conversations` (GET: list, DELETE: archive)  
* `/admin/conversations/:id` (GET: read full conversation)  
* `/admin/prompts` (GET: list, POST: create, PUT: update, DELETE: remove)

### **4D. Frontend Updates**

**Changes to the existing Ada landing page:**

The demo widget on the landing page currently cycles through pre-written responses. It will be updated to:

1. Call the `/chat` Edge Function instead of rotating static responses  
2. Maintain conversation context within a session (multi-turn coaching)  
3. Show a proper loading state while waiting for Claude's response (the bouncing dot animation already exists)  
4. Display error states gracefully if the API call fails  
5. Add a "New Conversation" button to start fresh

**New route: /admin**

A separate admin page (not linked from the main navigation) with:

* Login screen (password input, validated against admin secret)  
* Conversation browser  
* Prompt editor with version history  
* Simple, functional design (doesn't need to match the landing page's polish)

---

## **5\. Layer 2: Simplified RAG (The Stretch)**

This layer adds grounded retrieval to Ada's coaching, allowing her to reference a PM's own documents when providing guidance. It builds on top of Layer 1 without modifying any of Layer 1's functionality.

### **5A. What RAG Means for Ada**

Without RAG, Ada coaches from Claude's general knowledge. With RAG, Ada can say things like: "In the product brief you uploaded, you mentioned three target segments. Have you validated all three with actual conversations, or are some still assumptions?"

This transforms Ada from a generic coaching bot into a contextual coaching partner.

### **5B. pgvector Setup**

**Enable the extension:**

sql  
\-- Migration 002  
CREATE EXTENSION IF NOT EXISTS vector;

\-- Table: documents  
CREATE TABLE documents (  
  id UUID DEFAULT gen\_random\_uuid() PRIMARY KEY,  
  title TEXT NOT NULL,  
  content TEXT NOT NULL, \-- Full original text  
  doc\_type TEXT DEFAULT 'general' CHECK (doc\_type IN ('product\_brief', 'interview\_notes', 'research', 'general')),  
  created\_at TIMESTAMPTZ DEFAULT now()  
);

\-- Table: document\_chunks  
CREATE TABLE document\_chunks (  
  id UUID DEFAULT gen\_random\_uuid() PRIMARY KEY,  
  document\_id UUID REFERENCES documents(id) ON DELETE CASCADE,  
  chunk\_text TEXT NOT NULL,  
  chunk\_index INTEGER NOT NULL, \-- Order within the document  
  embedding VECTOR(1536), \-- OpenAI text-embedding-3-small dimension  
  created\_at TIMESTAMPTZ DEFAULT now()  
);

\-- Enable RLS  
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;  
ALTER TABLE document\_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to documents"  
  ON documents FOR ALL  
  USING (auth.role() \= 'service\_role');

CREATE POLICY "Service role full access to document\_chunks"  
  ON document\_chunks FOR ALL  
  USING (auth.role() \= 'service\_role');

\-- Index for vector similarity search  
CREATE INDEX idx\_chunks\_embedding ON document\_chunks  
  USING ivfflat (embedding vector\_cosine\_ops) WITH (lists \= 100);

**Terminology check:**

* **Embedding:** A numerical representation of text as a list of numbers (a vector). Similar texts produce similar vectors. This is how the system measures "relevance" between a user's question and stored document chunks.  
* **Chunking:** Splitting a large document into smaller passages (typically 200-500 words each) so the system can retrieve the most relevant pieces rather than the whole document.  
* **Vector similarity search:** Finding the chunks whose embeddings are closest to the user's question embedding. "Closest" is measured by cosine similarity (the angle between two vectors in high-dimensional space).  
* **pgvector:** A PostgreSQL extension that stores vectors directly in database columns and supports similarity search queries. No external service needed.  
* **IVFFlat index:** An approximate nearest-neighbor index type that speeds up vector searches by clustering vectors into lists. The `lists = 100` parameter defines how many clusters to create.

### **5C. Edge Function: /ingest**

**Purpose:** Accept text content, chunk it, generate embeddings, store everything.

**Flow:**

1\. Receive document text and metadata (title, type)  
2\. Store full document in documents table  
3\. Split text into chunks (\~300 words each, with 50-word overlap)  
4\. For each chunk:  
   a. Call OpenAI embedding API (text-embedding-3-small)  
   b. Store chunk text \+ embedding in document\_chunks table  
5\. Return success with document\_id and chunk count

**Why OpenAI embeddings instead of Claude?**

Claude does not currently offer a dedicated embedding endpoint. OpenAI's text-embedding-3-small is the industry standard for this purpose, costs $0.02 per million tokens (effectively free at our scale), and produces high-quality vectors. This is a pragmatic architectural decision, not a loyalty question.

### **5D. Enhanced /chat with Retrieval**

**Modification to the existing /chat Edge Function:**

1-3. (Same as Layer 1\)  
4\. Fetch active coaching prompt  
5\. NEW: Generate embedding for user's message  
6\. NEW: Query pgvector for top 3-5 relevant chunks  
7\. NEW: If relevant chunks found, append them to system prompt as context:  
   "The PM has shared the following documents. Reference them when relevant:  
   \[chunk 1 text\]  
   \[chunk 2 text\]  
   \[chunk 3 text\]"  
8\. Build Claude API request with enhanced context  
9-11. (Same as Layer 1\)

### **5E. Admin Upload Interface**

**Addition to the admin panel:**

* A text area for pasting document content (PDF upload is a future feature, keep it simple)  
* Document type selector (product brief, interview notes, research, general)  
* A title field  
* Upload button that calls /ingest  
* A document list showing all ingested documents with chunk counts

