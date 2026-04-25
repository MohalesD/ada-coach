# Ada Coach — Task Tracker

## ✅ Completed — Security Sprint (2026-04-25)

- [x] Apply migration `20260418150000_lockdown_user_profiles.sql` — column-level GRANTs on `user_profiles` (display_name only) and `messages` (feedback only)
- [x] Replace wildcard CORS with `ALLOWED_ORIGINS` allowlist in `_shared/auth.ts`; thread `req` through all four edge functions
- [x] Set `ALLOWED_ORIGINS` secret in Supabase production (`localhost:5175` + `ada-coach.vercel.app`)
- [x] Redeploy `chat`, `admin-conversations`, `admin-prompts`, `admin-insights`
- [x] Merge `security-hardening` → `main` (commit `fd9b5b6`)
- [x] Update `docs/security-audit-2026-04-18.md` — mark #1 and #2 deployed/verified, document remaining items #3–#10
- [x] Document Vercel preview URL CORS caveat in `CLAUDE.md`

---

## 🔜 Next — Week 3: RAG Knowledge Base

Give Ada access to a curated knowledge base (discovery frameworks, JTBD primers, assumption-mapping guides) so she can ground coaching responses in specific methodology references rather than relying solely on the system prompt.

### Subtasks

- [ ] Decide knowledge base format and storage (Supabase `pgvector` extension vs. flat file embedded in the prompt vs. external vector store)
- [ ] Create `knowledge_chunks` table (or equivalent) with embedding column; write migration
- [ ] Build ingestion script: chunk source documents, generate embeddings via Anthropic or OpenAI embeddings API, upsert into DB
- [ ] Update `chat` Edge Function: on each user turn, embed the message, run similarity search, inject top-k chunks into the system prompt as context
- [ ] Add `knowledge_source` to the `chat` response (optional, for admin debugging)
- [ ] Test retrieval quality: send 5 canonical discovery questions and verify relevant chunks are returned
- [ ] Update `CLAUDE.md` with RAG architecture (table schema, embedding model, chunk strategy)

### Open questions before starting

- Which embedding model? (`text-embedding-3-small` is cheap; Anthropic doesn't expose a standalone embeddings API yet)
- Is `pgvector` already enabled on the Supabase project? (`supabase extensions list`)
- Source documents: JTBD primers, Five Whys guides, assumption-mapping templates — do these exist or need to be authored?

---

## 🗂 Backlog (ordered by priority)

| ID | Item | Notes |
|----|------|-------|
| B-003 | Rate limiting per user on `/chat` and admin endpoints | Blocks abuse of Anthropic credits; use Supabase Edge Function + Redis or Upstash |
| B-008 | Password reset flow | Required before real users; wire `resetPasswordForEmail` + add `/auth/callback` route |
| B-003b | Email enumeration fix | UX trade-off decision pending (see security audit #3) |
| B-005 | Rebrand "Vera" → "Ada" | Grep codebase for remaining "Vera" references |
| B-002 | Token usage admin view | `token_count` column exists; just needs a UI surface in the Insights tab |
| B-010 | Audit trail for role changes | Nice-to-have post-RAG |
