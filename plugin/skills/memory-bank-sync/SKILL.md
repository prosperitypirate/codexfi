---
name: memory-bank-sync
description: Fold codexfi's automatic session notes into the project's memory-bank/ files. Use when the user says "save bank", "update memory bank", "update the memory bank", or asks to bring memory-bank files up to date, and the project has a memory-bank/ directory.
---

# Memory Bank sync with codexfi

codexfi records every session automatically (session summaries, progress, decisions, fixes, conventions). A Memory Bank is only as current as its last "save bank". When updating the bank, use codexfi to recover what happened since then — including sessions that ended or were compacted without a save.

## Steps

1. Read the core bank files in `memory-bank/` (projectbrief, productContext, systemPatterns, techContext, activeContext, progress). Note when each was last updated, if it says.
2. Pull codexfi's notes for this project with the codexfi MCP tools:
   - `memory_list` with `type: "session-summary"` (limit 10) — what was done in recent sessions.
   - `memory_list` with `type: "progress"` and `type: "active-context"` — the latest status snapshot.
   - `memory_search` for decisions and fixes since the last save, for example "decisions made recently", "bugs fixed and why", or "new conventions or commands".
3. Merge what is genuinely new into the right files:
   - activeContext.md: current focus, recent changes and next steps, from the newest summaries and active-context.
   - progress.md: milestones completed, from progress and summaries.
   - systemPatterns.md / techContext.md: durable architecture decisions, patterns, commands and stack changes.
   Keep the bank's own structure, budgets and aging rules. Do not paste raw memory lists.
4. When a codexfi note contradicts the bank, prefer the newer, more specific fact. If you can't tell, ask the user.
5. Report the result in one or two lines, for example: "Bank updated with 3 sessions since the last save."

codexfi notes are machine-extracted. Verify anything surprising against the code before writing it into the bank.
