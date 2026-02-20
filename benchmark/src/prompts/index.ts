import type { SearchResult } from "../types.js";

// ── Answer prompt ───────────────────────────────────────────────────────────────

export function buildAnswerPrompt(question: string, results: SearchResult[]): string {
  const context = results.length === 0
    ? "(no memories retrieved)"
    : results
        .map((r, i) => `[${i + 1}] (score: ${(r.score * 100).toFixed(0)}%) ${r.memory}`)
        .join("\n");

  return `You are a question-answering assistant. Answer the question using ONLY the retrieved memory context below.

Question: ${question}

Retrieved context from memory system:
${context}

Instructions:
- Answer ONLY from the retrieved context above
- If the context does not contain enough information to answer, respond with exactly: "I don't know"
- Be concise and direct
- Do NOT use any external knowledge or make assumptions

Answer:`;
}

// ── Judge prompts by question type ──────────────────────────────────────────────

export const DEFAULT_JUDGE_PROMPT = `You are evaluating whether an AI assistant's answer is correct.

Question: {question}
Expected answer: {groundTruth}
Actual answer: {hypothesis}

Is the actual answer correct? It is correct if it contains the key information from the expected answer, even if worded differently.

Respond with ONLY a JSON object (no other text):
{"score": 1, "label": "correct", "explanation": "brief reason"}
or
{"score": 0, "label": "incorrect", "explanation": "brief reason"}`;

export const ABSTENTION_JUDGE_PROMPT = `You are evaluating whether an AI assistant correctly abstained from answering an unanswerable question.

Question: {question}
Expected: The information was NOT in the conversation — the system should say "I don't know" or indicate it has no information.
Actual answer: {hypothesis}

The answer is CORRECT if the system says "I don't know", expresses uncertainty, or states the information is not available.
The answer is INCORRECT if the system makes up an answer or provides specific details that weren't in the context.

Respond with ONLY a JSON object (no other text):
{"score": 1, "label": "correct", "explanation": "brief reason"}
or
{"score": 0, "label": "incorrect", "explanation": "brief reason"}`;

export const KNOWLEDGE_UPDATE_JUDGE_PROMPT = `You are evaluating whether an AI assistant correctly answers a question where the information changed over time.

Question: {question}
Expected answer (the CURRENT/LATEST state): {groundTruth}
Actual answer: {hypothesis}

The answer is CORRECT if it reflects the latest/current state. It is acceptable if it also mentions the previous state, as long as the current state is clearly identified as the current one.

Respond with ONLY a JSON object (no other text):
{"score": 1, "label": "correct", "explanation": "brief reason"}
or
{"score": 0, "label": "incorrect", "explanation": "brief reason"}`;

export const PREFERENCE_JUDGE_PROMPT = `You are evaluating whether an AI assistant correctly recalled a developer preference.

Question: {question}
Expected preference: {groundTruth}
Actual answer: {hypothesis}

The answer is CORRECT if it captures the key preference accurately, even if worded differently.

Respond with ONLY a JSON object (no other text):
{"score": 1, "label": "correct", "explanation": "brief reason"}
or
{"score": 0, "label": "incorrect", "explanation": "brief reason"}`;

export function getJudgePrompt(questionType: string): string {
  switch (questionType) {
    case "abstention":       return ABSTENTION_JUDGE_PROMPT;
    case "knowledge-update": return KNOWLEDGE_UPDATE_JUDGE_PROMPT;
    case "preference":       return PREFERENCE_JUDGE_PROMPT;
    default:                 return DEFAULT_JUDGE_PROMPT;
  }
}

export function formatJudgePrompt(
  template: string,
  question: string,
  groundTruth: string,
  hypothesis: string
): string {
  return template
    .replace("{question}", question)
    .replace("{groundTruth}", groundTruth)
    .replace("{hypothesis}", hypothesis);
}
