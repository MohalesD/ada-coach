# QA — Explicit Save/Cancel buttons on rename inputs (accessibility fix)

Date: 2026-07-10
Task slug: rename-input-save-cancel-buttons

## Files changed

- `src/components/ConversationSidebar.tsx` — conversation-row rename input and folder-row rename input: removed `onBlur={onCommitRename}` and added visible Check (save) / X (cancel) icon buttons next to the input, shown only while `isEditing`.
- `src/pages/Discovery.tsx` — product-card rename input (kebab menu → Rename): same fix — removed `onBlur={() => void commitRename()}` and added Check/X icon buttons next to the input.

## Logic

Rename inputs across the app only committed on `Enter` or on blur; there was no visible button to save or close out of rename mode, which is an accessibility problem (keyboard/screen-reader users had no discoverable affordance, and had to guess that clicking away would silently save). Fixed by adding explicit Save/Cancel icon buttons. `onBlur`-commit had to be removed, not just supplemented — with it in place, clicking the new Cancel button would fire blur (and silently commit the rename) before the Cancel click handler ran. Enter-to-save and Escape-to-cancel still work as before.

## Deviation flagged, not silently made

`src/pages/Sprint.tsx` has an unrelated, pre-existing uncommitted change (starter-prompt chips for a fresh sprint) that was already in the working tree before this task started. It was left untouched and NOT included in this commit — flagged to Mo separately rather than committed or discarded.

A syntax error was introduced mid-task (a duplicated `)}` closing the product-card rename ternary twice in `Discovery.tsx`, line 350) and was found and fixed in a follow-up turn before this QA pass — confirmed via `npm run type-check` and a clean throwaway `vite` dev server boot (port 5176), which was killed after verification.

## Verification actually performed

- `npm run type-check` — clean.
- `npm run test -- --run` — 48/48 passing (unaffected by this change).
- `npm run lint` — could not run; pre-existing environment issue unrelated to this change (`ESLint: Cannot find package 'eslint-plugin-react-hooks'` — missing from `node_modules`). Not touched, flagged only.
- Manual dev-server boot on a throwaway port confirmed no build/parse errors.
- Not manually clicked through in a browser this session (no Playwright/Chrome MCP run) — Mo confirmed "it works" after his own manual check before requesting this commit.

## Quiz

**Q: A screen-reader user tabs into a conversation row, double-clicks isn't an option for them — how do they get the row into rename mode at all, and does this change affect that path?**

A: Double-click-to-rename was never the only path — the kebab/dropdown menu's "Rename" `DropdownMenuItem` (`onSelect={onStartRename}`) is the accessible entry point, keyboard-operable via the trigger button. This change doesn't touch entry into rename mode at all; it only adds an accessible way to *exit* rename mode (save or cancel) once already in it, which is the specific gap Mo reported.

Quiz result: **pass**
