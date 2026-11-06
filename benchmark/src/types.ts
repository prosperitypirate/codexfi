import type { LlmUsage } from "./llm/backend.js";

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
  /** Per-session ingest duration in ms (extraction + contradiction detection + embedding) */
  sessionDurations: number[];
  /** Total wall-clock time for entire ingest phase in ms */
  totalDurationMs: number;
}

export interface SearchResult {
  id: string;
  memory: string;
  /** Raw source conversation text stored alongside the memory (hybrid search). */
  chunk?: string;
  score: number;
  metadata?: Record<string, unknown>;
  /** Session date (YYYY-MM-DD) sourced from metadata.date — used for temporal reasoning. */
  date?: string;
}

export type IngestProgressCallback = (sessionId: string, added: number, updated: number, done: number, durationMs: number) => void;

export interface Provider {
  name: string;
  initialize(): Promise<void>;
  ingest(sessions: UnifiedSession[], runTag: string, onProgress?: IngestProgressCallback): Promise<IngestResult>;
  search(query: string, runTag: string, limit?: number, questionType?: string): Promise<SearchResult[]>;
  clear(runTag: string): Promise<void>;
}

// ── Retrieval metrics ───────────────────────────────────────────────────────────

export interface RetrievalMetrics {
  /** Did at least one relevant result appear in top-K? */
  hitAtK: number;           // 0 or 1
  /** Fraction of top-K results that are relevant */
  precisionAtK: number;     // 0..1
  /** F1 of precision and hit */
  f1AtK: number;            // 0..1
  /** Reciprocal rank of first relevant result (0 if none) */
  mrr: number;              // 0..1
  /** Normalised discounted cumulative gain */
  ndcg: number;             // 0..1
  /** K value used */
  k: number;
  /** Per-result relevance scores (0|1), length = min(k, results.length) */
  relevanceScores: number[];
}

// ── Latency stats ───────────────────────────────────────────────────────────────

export interface LatencyStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
  count: number;
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
  usage?: LlmUsage;
}

export interface BlockQualityPhaseResult {
  questionId: string;
  /** The assembled [MEMORY] block used as system context for this question. */
  block: string;
  durationMs: number;
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
  /** Retrieval quality metrics for this question (computed in parallel with answer judge) */
  retrievalMetrics?: RetrievalMetrics;
}

// ── Report types ────────────────────────────────────────────────────────────────

export interface QuestionTypeStats {
  total: number;
  correct: number;
  accuracy: number;
}

export interface AggregateRetrievalStats {
  hitAtK: number;
  precisionAtK: number;
  f1AtK: number;
  mrr: number;
  ndcg: number;
  k: number;
}

export interface BenchmarkReport {
  runId: string;
  provider: string;
  judgeModel: string;
  answeringModel: string;
  timestamp: string;
  /** Pipeline mode: standard retrieval or block-quality (Tier 2) evaluation. */
  mode: "retrieval" | "block-quality" | "memory-bank";
  summary: {
    totalQuestions: number;
    correctCount: number;
    accuracy: number;
  };
  byQuestionType: Record<string, QuestionTypeStats>;
  evaluations: EvaluationResult[];
  /** Latency stats per pipeline phase */
  latency?: {
    ingest: LatencyStats;
    search: LatencyStats;
    answer: LatencyStats;
    evaluate: LatencyStats;
  };
  /** Total ingest wall-clock time in ms */
  ingestTotalMs?: number;
  /** Total wall-clock time for the entire benchmark run in ms */
  totalDurationMs?: number;
  /** Aggregate retrieval metrics (retrieval mode only) */
  retrieval?: AggregateRetrievalStats;
  /** Per-category retrieval metrics (retrieval mode only) */
  retrievalByType?: Record<string, AggregateRetrievalStats>;
}

// ── Checkpoint ──────────────────────────────────────────────────────────────────

export type Phase =
  | "ingest" | "search" | "block-assembly" | "answer" | "evaluate" | "report"
  // memory-bank mode
  | "mb-build" | "mb-contexts" | "mb-answer" | "mb-evaluate";

// ── Memory-bank mode ────────────────────────────────────────────────────────────

export const MB_CONDITIONS = ["no-memory", "mb-only", "codexfi-only", "mb+codexfi", "full-context"] as const;
export type MbCondition = typeof MB_CONDITIONS[number];

export const MB_FILES = [
  "projectbrief.md",
  "productContext.md",
  "systemPatterns.md",
  "techContext.md",
  "activeContext.md",
  "progress.md",
] as const;
export type MbFile = typeof MB_FILES[number];
export type MemoryBankFiles = Record<MbFile, string>;

export interface MbBuildStep {
  sessionId: string;
  project: string;
  /** Estimated tokens per file after this session's update (chars / 4). */
  tokens: Record<MbFile, number>;
  totalTokens: number;
  durationMs: number;
  usage?: LlmUsage;
  /** True when the first update exceeded the hard cap and a condense pass ran. */
  condensed?: boolean;
  /** Set when the LLM output could not be parsed and the previous bank was kept. */
  error?: string;
}

export interface MemoryBankState {
  model: string;
  /** Current bank per project. */
  banks: Record<string, MemoryBankFiles>;
  /** "<sessionId>::<project>" keys already applied (resume support). */
  applied: string[];
  /** Per-update size log, in application order. */
  history: MbBuildStep[];
}

export interface MbContextEntry {
  /** codexfi [MEMORY] block, memoryBankAware=false (codexfi-only condition). */
  codexfi?: string;
  /** codexfi [MEMORY] block, memoryBankAware=true (mb+codexfi condition). */
  codexfiMbAware?: string;
  durationMs: number;
}

export interface MbAnswer {
  questionId: string;
  condition: MbCondition;
  answer: string;
  durationMs: number;
  contextChars: number;
  usage?: LlmUsage;
}

export interface MbEvaluation {
  questionId: string;
  questionType: string;
  condition: MbCondition;
  question: string;
  groundTruth: string;
  hypothesis: string;
  score: 0 | 1;
  label: "correct" | "incorrect";
  explanation: string;
  contextChars: number;
  answerDurationMs: number;
  judgeDurationMs: number;
}

export interface Checkpoint {
  runId: string;
  runTag: string;
  provider: string;
  judgeModel: string;
  answeringModel: string;
  startedAt: string;
  completedAt?: string;
  /** Total wall-clock time for the entire benchmark run in ms */
  totalDurationMs?: number;
  completedPhases: Phase[];
  /** Pipeline mode — determines which phases run and how answers are generated. */
  mode?: "retrieval" | "block-quality" | "memory-bank";
  /** Dataset id (v1 = src/dataset/, v2 = src/dataset-v2/). Absent on old checkpoints = v1. */
  dataset?: "v1" | "v2";
  /** LLM backend used for answer/judge (BENCH_LLM_BACKEND). */
  llmBackend?: string;
  /** True when ingest was skipped and an existing runTag reused (--skip-ingest). */
  skipIngest?: boolean;
  ingestResult?: IngestResult;
  searchResults?: SearchPhaseResult[];
  /** Assembled [MEMORY] blocks per question (block-quality mode only). */
  blockQualityResults?: BlockQualityPhaseResult[];
  answerResults?: AnswerPhaseResult[];
  evaluations?: EvaluationResult[];

  // ── memory-bank mode ──
  mbConditions?: MbCondition[];
  memoryBank?: MemoryBankState;
  /** Per-question codexfi blocks for the codexfi conditions. */
  mbContexts?: Record<string, MbContextEntry>;
  /** Note recorded when full-context was skipped (over BENCH_FULL_CONTEXT_MAX_CHARS). */
  fullContextNote?: string;
  /** condition → questionId → answer */
  mbAnswers?: Partial<Record<MbCondition, Record<string, MbAnswer>>>;
  /** condition → questionId → evaluation */
  mbEvaluations?: Partial<Record<MbCondition, Record<string, MbEvaluation>>>;
}
