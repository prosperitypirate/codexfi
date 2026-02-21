# opencode-memory plugin

This document explains **exactly** how the plugin integrates with OpenCode — which hooks are used, when they fire, what data flows through them, and why.

---

## How OpenCode loads this plugin

OpenCode loads plugins listed in `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["file:///path/to/opencode-memory/plugin"]
}
```

At startup OpenCode calls `MemoryPlugin(ctx)` once **per session** (not once per process). Each call receives a fresh `ctx` object:

```typescript
ctx.directory   // absolute path of the folder open in OpenCode
ctx.client      // SDK client for calling OpenCode server APIs
ctx.$           // Bun shell API
ctx.project     // project metadata
ctx.worktree    // git worktree path
```

`MemoryPlugin` returns an object mapping hook names to handler functions. OpenCode calls those handlers at the appropriate times.

---

## Identity: how users and projects are identified

Every memory is stored under a **container tag** — a stable, deterministic string that acts as the namespace key.

**User tag** (`opencode_user_<sha256(git-email)[:16]>`)
- Derived from `git config user.email` in the current directory
- Falls back to `$USER` / `$USERNAME` if git is not configured
- Overridable via `userContainerTag` in `~/.config/opencode/memory.jsonc`
- Same tag across every project on the same machine → cross-project memory

**Project tag** (`opencode_project_<sha256(directory)[:16]>`)
- Derived from the absolute path of `ctx.directory`
- Every folder gets a unique tag → per-project memory isolation
- Overridable via `projectContainerTag` in `~/.config/opencode/memory.jsonc`

Both tags are computed at plugin init and passed into every memory API call.

---

## Hook 1: `chat.message` — memory injection on first message

**When it fires:** Before the first user message is shown to the LLM, for every message in the session.

**What it actually does (first message only):**

```
User sends first message
         │
         ▼
chat.message fires
         │
         ├─ 1. Detect memory keywords in user text
         │      If matched → append synthetic [MEMORY TRIGGER DETECTED] part
         │      to inject a nudge telling the agent to call the memory tool
         │
         ├─ 2. Fetch in parallel:
         │      a. User profile (recent user-scoped memories)
         │      b. Semantic search on user scope (query = first message text)
         │      c. List all project-scoped memories (structured, by type)
         │      d. Semantic search on project scope
         │
         ├─ 3. If zero project memories exist AND the folder has code/config files:
         │      → triggerSilentAutoInit() — reads README/package.json/etc,
         │        POSTs them to the memory server for silent extraction.
         │        AWAITED so it completes before opencode run exits.
         │
         ├─ 4. If project memories exist but NO project-brief type among them:
         │      → seedProjectBrief() — reads first substantive README paragraph,
         │        POSTs it with type=project-brief as a fallback.
         │        AWAITED for same reason.
         │
         └─ 5. Build [MEMORY] block and prepend as synthetic text part:

               [MEMORY]

               ## Project Brief
               - ...

               ## Architecture
               - ...

               ## Tech Context
               - ...

               ## Product Context
               - ...

               ## Progress & Status
               - ...

               ## Last Session
               - (most recent session-summary)

               ## User Preferences
               - (user-scoped memories)

               ## Relevant to Current Task
               - [72%, 2026-02-21] ... (semantic hits ≥ similarity threshold)
```

**On subsequent messages in the same session:** the hook still fires but skips steps 2–5 (tracked via `injectedSessions` Set). It only checks for memory keywords.

**Why await auto-init:** In `opencode run` mode the process exits immediately after the response. Fire-and-forget HTTP calls were silently lost. Awaiting them blocks until the server confirms extraction.

---

## Hook 2: `experimental.chat.messages.transform` — cache the message list

**When it fires:** Before **every** LLM call in the session — once per turn, and once more before each tool-call round within a turn.

**What it does:**

```typescript
"experimental.chat.messages.transform": async (_input, output) => {
  updateMessageCache(output.messages);
}
```

`output.messages` is the full list of messages being sent to the LLM **right now**, including all previous turns. This is stored in the module-level `cachedMessages` array.

**Critical limitation:** Because this fires **before** the LLM call, the final assistant response for the current turn is never in this cache. The cache always lags one response behind.

---

## Hook 3: `event` — auto-save and compaction

The event hook receives all OpenCode server-sent events. Two subsystems use it.

### Auto-save subsystem

**Step A: Buffer assistant text while it streams**

```
event.type === "message.part.updated"
  └─ part.type === "text" && !part.synthetic
       └─ assistantTextBuffer["sessionID:messageID"] = part.text
```

`part.text` is the **full accumulated text** up to that moment (not just the delta). As the LLM streams, this overwrites repeatedly. When streaming ends, the buffer holds the complete final text for that message.

This runs for every text part update — user messages too — but only the messageID match matters when we pop it later.

**Step B: Inject final response and trigger save on turn completion**

```
event.type === "message.updated"
  properties = { info: AssistantMessage }   ← no parts, only metadata
  info.role === "assistant"
  info.finish === "stop"  (not "tool-calls" — that's mid-turn)
  !info.summary           (not a compaction summary)
         │
         ├─ popAssistantText(sessionID, messageID)
         │    └─ returns the buffered final text, deletes from buffer
         │
         ├─ injectFinalAssistantMessage({ info, parts: [{ type:"text", text }] })
         │    └─ appends to cachedMessages if not already present
         │       NOW cachedMessages has: [user, ...tool_rounds..., final_assistant_text]
         │
         └─ autoSaveHook.onSessionIdle(sessionID)
```

**Why `message.updated` has no parts:** Confirmed from the official SDK type:
```typescript
EventMessageUpdated = { type: "message.updated", properties: { info: Message } }
```
`info` is metadata only (id, role, finish, tokens, cost). Parts are never included.

**Why not use `session.messages()` SDK call:**
The plugin's `ctx.client` returns `Unauthorized` for `session.messages()` in TUI mode. This is intentional — plugins cannot list arbitrary session history. The buffer approach bypasses this entirely.

**Step C: Inside `onSessionIdle`**

```
cooldown check (15s between saves for the same session)
         │
         ├─ snapshot = [...cachedMessages]   ← NOW includes final assistant text
         │
         ├─ fetchMessages(sessionID, snapshot, client)
         │    └─ single SDK attempt (works in opencode-run E2E harness,
         │       returns Unauthorized in TUI — logged, falls back to snapshot)
         │
         ├─ filter: keep only user/assistant messages with non-synthetic text parts
         │    realCount must be ≥ 2 (at least one user + one assistant)
         │
         ├─ if realCount < 2:
         │    log part-type debug dump and return
         │
         ├─ totalChars must be ≥ 100
         │
         └─ memoryClient.addMemoryFromMessages(messages, projectTag)
              └─ POST /memories with the filtered message array
                 server extracts atomic facts, deduplicates, stores
```

**Session summary (every N turns):**
Every `turnSummaryInterval` turns (default: 5), a second parallel call fires:
```
memoryClient.addMemoryFromMessagesAsSummary(messages, projectTag)
  └─ POST /memories with summary_mode: true
     server produces a single session-summary memory instead of atomic facts
```

### Compaction subsystem

Watches `message.updated` events, checks token usage ratio against context limit. If usage exceeds `compactionThreshold` (default: 80%):

1. Fetch recent project memories
2. Write a structured compaction prompt to `~/.opencode/messages/<sessionID>/`
3. Call `session.summarize()` which triggers OpenCode's built-in compaction
4. Capture the resulting summary message and save it as a `session-summary` memory

---

## Hook 4: `tool.memory` — explicit memory management

A custom tool exposed to the LLM. Triggered when the agent decides to use it (either from a keyword nudge or on its own initiative).

```
memory({ mode: "add",    content, type?, scope? })  → POST /memories
memory({ mode: "search", query,   scope? })          → POST /memories/search
memory({ mode: "list",   scope?,  limit? })          → GET  /memories?user_id=...
memory({ mode: "forget", memoryId })                 → DELETE /memories/:id
memory({ mode: "profile" })                          → GET /memories?user_id=<userTag>
```

Scope `"project"` (default) → uses project tag. Scope `"user"` → uses user tag.

---

## The keyword trigger

On every `chat.message` call, user text is scanned (after stripping code blocks) against:

```
/\b(remember|memorize|save\s+this|note\s+this|keep\s+in\s+mind|
    don'?t\s+forget|learn\s+this|store\s+this|...)\b/i
```

If matched, a synthetic `[MEMORY TRIGGER DETECTED]` part is appended to the user message. This part instructs the agent it **must** call the `memory` tool with `mode: "add"`. The agent sees this as part of the user message context.

---

## Full event timeline for a first-turn TUI session

```
OpenCode starts session in new folder
│
├─ Plugin init: MemoryPlugin(ctx) called
│   ├─ compute userTag, projectTag
│   ├─ registerNames (non-fatal background call to label project in web UI)
│   ├─ fetch model context limits (for compaction math)
│   └─ create autoSaveHook and compactionHook
│
User types message → presses Enter
│
├─ chat.message fires (BEFORE LLM sees the message)
│   ├─ check keywords
│   ├─ fetch user profile + user search + project list + project search (parallel)
│   ├─ if 0 project memories → triggerSilentAutoInit (awaited)
│   ├─ build [MEMORY] block → prepend as synthetic part
│   └─ return (user message now has [MEMORY] prepended)
│
├─ experimental.chat.messages.transform fires
│   └─ cachedMessages = [user_message_with_memory_block]   count=1
│
LLM begins generating response
│
├─ message.part.updated fires repeatedly as text streams
│   └─ assistantTextBuffer["sessionID:msgID"] = "The directory is empty..." (grows)
│
├─ (if agent calls a tool):
│   ├─ experimental.chat.messages.transform fires again
│   │   └─ cachedMessages = [user, assistant_tool_call]   count=2
│   ├─ tool executes
│   └─ LLM continues generating
│
LLM finishes final text response
│
├─ message.updated fires: { info: { role:"assistant", finish:"stop", id:"msg_X" } }
│   ├─ popAssistantText("sessionID", "msg_X")
│   │   └─ returns "The directory is empty. What would you like to build?"
│   │      deletes from buffer
│   ├─ injectFinalAssistantMessage({ info, parts:[{type:"text", text:"..."}] })
│   │   └─ cachedMessages = [user, assistant_tool_call, assistant_final_text]   count=3
│   └─ onSessionIdle("sessionID")
│       ├─ cooldown check: ok (first save)
│       ├─ snapshot = [user, assistant_tool_call, assistant_final_text]
│       ├─ fetchMessages → Unauthorized → use snapshot
│       ├─ filter: user(has text) + assistant_final_text(has text) → realCount=2
│       ├─ chars=319 ≥ 100: ok
│       └─ POST /memories → server extracts "velodrome is a Go benchmark runner"
│
Memory saved ✓
```

---

## Config file

`~/.config/opencode/memory.jsonc` (optional):

```jsonc
{
  // URL of the memory server (default: http://localhost:8020)
  "memoryBaseUrl": "http://localhost:8020",

  // Similarity threshold for semantic search results shown in [MEMORY] block (0.0–1.0)
  "similarityThreshold": 0.45,

  // Max memories retrieved per scope per session (user + project searched separately)
  // Total semantic memories available = up to 2× this value
  "maxMemories": 10,

  // Max memories listed per project (for structured sections)
  "maxStructuredMemories": 30,

  // Max user profile facts shown
  "maxProfileItems": 5,

  // Whether to show user-scoped memories in [MEMORY] block
  "injectProfile": true,

  // Prefix for auto-generated container tags
  "containerTagPrefix": "opencode",

  // Pin a specific user or project tag (overrides auto-generation)
  "userContainerTag": "opencode_user_myteam",
  "projectContainerTag": "opencode_project_myrepo",

  // Extra memory keyword patterns (added to built-in list)
  "keywordPatterns": ["track this", "log this"],

  // Context usage ratio that triggers compaction (0.0–1.0)
  "compactionThreshold": 0.80,

  // How many turns between session-summary auto-saves
  "turnSummaryInterval": 5
}
```

---

## What the memory server receives

Every write to the memory server goes to `POST /memories` with this shape:

```json
{
  "messages": [
    { "role": "user",      "content": "My project is called velodrome..." },
    { "role": "assistant", "content": "The directory is empty..." }
  ],
  "user_id": "opencode_project_a84ff7b810abb77e",
  "metadata": {}
}
```

The server runs an LLM extraction pass over the messages and stores atomic facts (e.g. `"Velodrome is a benchmark runner for Go HTTP handlers."`). Deduplication and type classification happen server-side.

Special modes:
- `init_mode: true` → project file content, uses a stricter extraction prompt that always emits a `project-brief`
- `summary_mode: true` → produces one `session-summary` memory instead of atomic facts

---

## Log file

Everything the plugin does is logged to `~/.opencode-memory.log`.

Useful filter:
```bash
tail -f ~/.opencode-memory.log | grep -E 'auto-save|auto-init|seed-brief|chat.message'
```

Key log lines and what they mean:

| Log line | Meaning |
|---|---|
| `auto-save: triggered { project: "opencode_project_...", snapshotSize: N }` | Save attempt started, N messages in cache |
| `auto-save: injected final assistant message into cache { newCacheSize: N }` | Streaming buffer injection worked |
| `auto-save: filtered { realCount: N }` | N messages passed the text-content filter |
| `auto-save: skipped (realCount<2)` | Not enough real messages; part debug dump follows |
| `auto-save: skipped (too short)` | Total chars < 100 |
| `auto-save: skipped (cooldown)` | < 15s since last save for this session |
| `auto-save: done { count: N }` | N memories extracted and saved |
| `auto-save: SDK fetch failed (expected in TUI mode)` | Unauthorized — normal, using cache instead |
| `auto-init: sending project files for extraction` | First session in an existing codebase |
| `seed-brief: seeding project-brief from README` | Fallback brief injection |
| `chat.message: context injected` | [MEMORY] block prepended to user message |

---

## Known limitations

**`session.messages()` is Unauthorized in TUI mode**
The plugin's `ctx.client` cannot list session messages when running in the desktop app. This is apparently intentional — plugins are sandboxed from reading session history. The `message.part.updated` buffer approach works around this without needing any SDK access.

**`experimental.chat.messages.transform` lags one response**
The transform cache always reflects the state **before** the current LLM call. Without the streaming buffer, single-turn sessions where the agent responds with text only would always have `realCount=1` and skip saving.

**Auto-init adds latency on first message for existing projects**
`triggerSilentAutoInit` reads and POSTs project files synchronously on the first message. This can take 2–5 seconds for the memory server to extract and respond. It is awaited deliberately — fire-and-forget causes silent failures in `opencode run` mode where the process exits immediately.

**First session in a new folder does not inject [MEMORY] into that same session**
Auto-init and auto-save both write memories to the server during session 1. But the `chat.message` injection already ran at the start of that turn, before the memories existed. The [MEMORY] block appears from session 2 onward.
