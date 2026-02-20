export type MemoryType =
  | "project-brief"
  | "architecture"
  | "tech-context"
  | "product-context"
  | "session-summary"
  | "progress"
  | "error-solution"
  | "preference"
  | "learned-pattern"
  | "project-config"
  | "unknown";

export interface Memory {
  id: string;
  memory: string;
  user_id: string;
  metadata: { type?: MemoryType; [key: string]: unknown };
  created_at: string;
  updated_at: string;
}

export interface Project {
  user_id: string;
  name: string | null;        // human-readable: folder name or git email/username
  scope: "project" | "user";
  count: number;
  type_counts: Record<string, number>;
  last_updated: string;
}

export interface Stats {
  total: number;
  by_type: Record<string, number>;
  by_scope: { project: number; user: number };
  projects: number;
  users: number;
}

export interface Costs {
  xai: {
    calls: number;
    prompt_tokens: number;
    cached_tokens: number;
    completion_tokens: number;
    cost_usd: number;
  };
  voyage: {
    calls: number;
    tokens: number;
    cost_usd: number;
  };
  total_cost_usd: number;
  last_updated: string;
}

export interface SearchResult {
  id: string;
  memory: string;
  score: number;
  metadata: { type?: MemoryType; [key: string]: unknown };
  created_at: string;
}
