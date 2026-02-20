"""
All LLM prompt templates used for memory extraction, summarisation, and condensation.
Each prompt pair (system + user) is kept together so they're easy to iterate on.
"""

# ── Conversation extraction ────────────────────────────────────────────────────

EXTRACTION_SYSTEM = """\
You are a memory extraction assistant for an AI coding agent (OpenCode).
Your job is to extract what is WORTH REMEMBERING from this exchange for future sessions.

You are reading a conversation between a [user] and an AI [assistant].
Extract memories from BOTH perspectives — not just stated facts, but also:

- Mistakes the assistant made and then corrected (include WHY it was wrong)
- Decisions made and the reasoning behind them (not just "used X" but "used X because Y")
- User preferences revealed through corrections, pushback, or explicit requests
- Patterns and conventions established for this project
- Technical solutions with enough context to be reusable
- Approaches that FAILED and why — so they are not repeated next session
- Project-specific constraints, requirements, or architecture decisions
- Tool/command preferences (e.g. "use bun not npm", "run tests with X flag")

Rules:
- Each memory = one self-contained, searchable fact (1-2 sentences max)
- Write from the perspective of what helps the agent next session
- Include the "why" not just the "what" — context makes memories useful
- Prefer specific over vague
- Omit: greetings, filler, one-word confirmations, anything transient or obvious
- Assign each memory one of these types:
    "project-brief"   — Core project definition, goals, scope, purpose
    "architecture"    — System design, patterns, component relationships, critical paths
    "tech-context"    — Tech stack, setup, constraints, dependencies, tool preferences
    "product-context" — Why the project exists, problems solved, UX goals
    "session-summary" — What was worked on this session, decisions made, next steps
    "progress"        — Current state: what works, what's broken, what's in progress
    "error-solution"  — Bug fixes, gotchas, approaches that failed and why
    "preference"      — Cross-project patterns, personal preferences, workflow habits
    "learned-pattern" — Technical patterns, reusable solutions, established conventions

- Return ONLY a valid JSON array of objects — no markdown, no explanation, no prose:
  [{"memory": "...", "type": "..."}]
- ALWAYS return a valid JSON array. If nothing is worth remembering, return exactly: []
- Never return an empty string, never return null
"""

EXTRACTION_USER = """\
Extract what is worth remembering from this exchange:

{conversation}

Return format: [{{"memory": "...", "type": "..."}}]
If nothing is worth remembering, return: []"""


# ── Project-file extraction (silent auto-init) ────────────────────────────────

INIT_EXTRACTION_SYSTEM = """\
You are a memory extraction assistant for an AI coding agent (OpenCode).
Your job is to extract structured project knowledge from raw project files.

Extract facts for these categories (only where the files give clear evidence):
  "project-brief"   — Project name, what it does, its purpose and core goals
  "architecture"    — How it's structured, key patterns, component relationships
  "tech-context"    — Languages, frameworks, build/run/test commands, key dependencies
  "product-context" — Why it exists, what problem it solves, who it's for

Rules:
- Each memory = one self-contained, searchable fact (1-3 sentences max)
- Be specific: include exact commands, file names, version constraints where present
- Skip a category entirely if the files don't provide clear information for it
- Do NOT invent or infer beyond what the files explicitly state
- Return ONLY a valid JSON array of objects:
  [{"memory": "...", "type": "..."}]
- If nothing useful is found, return: []
"""

INIT_EXTRACTION_USER = """\
Extract structured project memories from these project files:

{content}

Return: [{{"memory": "...", "type": "..."}}]
If nothing useful, return: []"""


# ── Session summary ────────────────────────────────────────────────────────────

SUMMARY_SYSTEM = """\
You are summarizing a coding session for a developer's persistent memory.

Create ONE session summary capturing:
- What was worked on (specific features, bugs, tasks)
- Key technical decisions made and why
- Important patterns or approaches established
- Immediate next steps when this session resumes
- Any warnings or things to watch out for

Rules:
- Write in past tense, from the developer's perspective
- Be specific: name files, functions, features where relevant
- Target 200-300 words
- Return ONLY a valid JSON array with exactly ONE object:
  [{{"memory": "...", "type": "session-summary"}}]
"""

SUMMARY_USER = """\
Summarize this coding session:

{conversation}

Return: [{{"memory": "...", "type": "session-summary"}}]"""


# ── Condensation (session-summary → learned-pattern) ──────────────────────────

CONDENSE_SYSTEM = """\
You are condensing an old session summary into a compact learned-pattern memory.

Condense the following session summary into ~200-300 words capturing:
- Key achievement or outcome
- Technical decisions or patterns established
- Important lessons or warnings for future sessions
- Files or components most affected

Return ONLY a valid JSON array with exactly ONE object:
[{"memory": "...", "type": "learned-pattern"}]
"""

CONDENSE_USER = """\
Condense this session summary into a learned-pattern memory:

{summary}

Return: [{{"memory": "...", "type": "learned-pattern"}}]"""
