# Ada Coach — Task Tracker

## 🚧 In Progress — Folders MVP (branch `feat/folders`)

**Goal:** Let users organize sidebar conversations into folders. MVP only — keep scope tight.

### Decisions locked
- **Layout:** Folders section on top (collapsible) → Pinned section → Unfiled list. Pinned remains a global flag, independent of folder membership.
- **DnD library:** `@dnd-kit/core` (+ `@dnd-kit/sortable` if needed for keyboard-accessible drag).
- **Folder ownership:** per-user (RLS-scoped), no sharing.
- **On folder delete:** chats inside become unfiled (`folder_id = NULL`), not archived. FK uses `ON DELETE SET NULL`.

### Schema
- New table `folders` (id uuid PK, user_id uuid FK auth.users, name text NOT NULL, created_at, updated_at). RLS: own-rows only (mirror conversations pattern).
- `conversations.folder_id uuid NULL` FK → `folders(id) ON DELETE SET NULL`. No column-level GRANT needed — `conversations` is not column-locked (verified: no GRANT/REVOKE on conversations in any migration).

### Implementation steps
- [x] Migration `20260506000000_folders.sql`: create `folders` table + RLS + add `folder_id` to `conversations`
- [x] `src/components/ConversationSidebar.tsx`: extend list query to include `folder_id`; load folders; render Folders section above Pinned
- [x] Folder row component: name, expand/collapse caret, conversation count badge
- [x] "+ New Folder" button at top of Folders section
- [x] Three-dots menu on each chat row: add "Move to folder" submenu listing existing folders + "New folder…" option
- [x] Drag-and-drop with `@dnd-kit/core`: chat rows draggable, folder rows are drop targets; on drop, optimistic update + DB write
- [x] Folder three-dots menu: Rename, Delete (with confirmation — explains chats become unfiled)
- [x] Optimistic state updates: when folder_id changes, re-bucket the chat into the target folder section
- [x] Patched `.claude/hooks/brand-voice-guard.js` to use word-boundary regex (was substring-matching "rag" inside "drag")

### Out of scope (defer; flag for next iteration)
- Reordering folders (drag folder rows themselves)
- Nested folders / subfolders
- Folder colors or icons
- Bulk-move via existing multi-select bar
- Drag chats *out* of folders to unfile (will provide via "Move to → No folder" menu option only)
- Showing folder membership in admin panel

### Verification (manual after implementation)
1. Run migration locally; new tables/columns appear.
2. Create a folder via "+ New Folder" button.
3. Drag a chat into the folder → expect it disappears from Unfiled and appears under the folder.
4. Use three-dots menu → Move to folder → choose existing folder. Same result.
5. Use three-dots menu → Move to folder → New folder → folder is created and chat lands in it.
6. Delete a folder → chats inside become unfiled and remain in the sidebar.
7. Pinned chats inside a folder still appear in the Pinned section regardless.

---

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
| B-011 | Fix migration history mismatch | `supabase db push` errors with "Remote migration versions not found in local migrations directory." Cause: several recent migrations were applied via the Supabase MCP `apply_migration` tool, which timestamps the registration with the time-of-application, not the local filename's timestamp. Local files (e.g. `20260502000000_user_credits.sql`, `20260505000000_reset_credits_fn.sql`, `20260506000000_folders.sql`) contain the right SQL but their timestamps aren't registered remotely. Schema on both sides is correct — only the bookkeeping in `supabase_migrations.schema_migrations` is out of sync. **Workaround in use:** apply new migrations via MCP `apply_migration` and commit the local file alongside. **Fix later:** mark each local timestamp as `applied` via `supabase migration repair --status applied <timestamp>` for every file already in remote, then mark the orphan MCP timestamps as `reverted`. Verify with `supabase migration list` afterward. Affected orphan timestamps as of 2026-05-07: `20260430042458, 20260430043232, 20260501232218, 20260502050044, 20260502050048, 20260505073341`. |
