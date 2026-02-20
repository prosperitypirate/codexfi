// ── Shared types — compatible with MemoryBench's UnifiedSession/UnifiedQuestion format ──

export interface UnifiedMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export interface UnifiedSession {
  sessionId: string;
  messages: UnifiedMessage[];
  metadata?: Record<string, unknown>;
}

export interface UnifiedQuestion {
  questionId: string;
  questionType: string;
  question: string;
  groundTruth: string;
  haystackSessionIds: string[];
  metadata?: Record<string, unknown>;
}

// ── Question types ──────────────────────────────────────────────────────────────

export const QUESTION_TYPES = {
  "tech-stack": {
    alias: "tech",
    description: "Recall of technology choices: languages, frameworks, databases, tools",
  },
  architecture: {
    alias: "arch",
    description: "Recall of system design decisions: auth, APIs, data flow",
  },
  "session-continuity": {
    alias: "continuity",
    description: "Recall of what was done in previous sessions",
  },
  preference: {
    alias: "pref",
    description: "Recall of developer coding style, tool, and workflow preferences",
  },
  "error-solution": {
    alias: "error",
    description: "Recall of bugs encountered and how they were resolved",
  },
  "knowledge-update": {
    alias: "update",
    description: "Recall of the latest state when information changed over time",
  },
  "cross-session-synthesis": {
    alias: "synthesis",
    description: "Combining facts from multiple sessions to answer a question",
  },
  abstention: {
    alias: "abstain",
    description: "Questions about information never mentioned — system should say it does not know",
  },
} as const;

export type QuestionType = keyof typeof QUESTION_TYPES;

// ── Provider interface ──────────────────────────────────────────────────────────

export interface IngestResult {
  memoriesAdded: number;
  memoriesUpdated: number;
  sessionIds: string[];
}

export interface SearchResult {
  id: string;
  memory: string;
  /** Raw source conversation text stored alongside the memory (hybrid search). */
  chunk?: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface Provider {
  name: string;
  initialize(): Promise<void>;
  ingest(sessions: UnifiedSession[], runTag: string): Promise<IngestResult>;
  search(query: string, runTag: string, limit?: number): Promise<SearchResult[]>;
  clear(runTag: string): Promise<void>;
}

// ── Pipeline result types ───────────────────────────────────────────────────────

export interface SearchPhaseResult {
  questionId: string;
  results: SearchResult[];
  durationMs: number;
}

export interface AnswerPhaseResult {
  questionId: string;
  answer: string;
  durationMs: number;
  searchResults: SearchResult[];
}

export interface EvaluationResult {
  questionId: string;
  questionType: string;
  question: string;
  groundTruth: string;
  hypothesis: string;
  score: 0 | 1;
  label: "correct" | "incorrect";
  explanation: string;
  searchResults: SearchResult[];
  searchDurationMs: number;
  answerDurationMs: number;
}

// ── Report types ────────────────────────────────────────────────────────────────

export interface QuestionTypeStats {
  total: number;
  correct: number;
  accuracy: number;
}

export interface BenchmarkReport {
  runId: string;
  provider: string;
  judgeModel: string;
  answeringModel: string;
  timestamp: string;
  summary: {
    totalQuestions: number;
    correctCount: number;
    accuracy: number;
  };
  byQuestionType: Record<string, QuestionTypeStats>;
  evaluations: EvaluationResult[];
}

// ── Checkpoint ──────────────────────────────────────────────────────────────────

export type Phase = "ingest" | "search" | "answer" | "evaluate" | "report";

export interface Checkpoint {
  runId: string;
  runTag: string;
  provider: string;
  judgeModel: string;
  answeringModel: string;
  startedAt: string;
  completedPhases: Phase[];
  ingestResult?: IngestResult;
  searchResults?: SearchPhaseResult[];
  answerResults?: AnswerPhaseResult[];
  evaluations?: EvaluationResult[];
}
