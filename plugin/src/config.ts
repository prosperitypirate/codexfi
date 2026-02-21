import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { stripJsoncComments } from "./services/jsonc.js";

const CONFIG_DIR = join(homedir(), ".config", "opencode");
const CONFIG_FILES = [
  join(CONFIG_DIR, "memory.jsonc"),
  join(CONFIG_DIR, "memory.json"),
];

interface MemoryConfig {
  memoryBaseUrl?: string;
  similarityThreshold?: number;
  maxMemories?: number;
  maxProjectMemories?: number;
  maxStructuredMemories?: number;
  maxProfileItems?: number;
  injectProfile?: boolean;
  containerTagPrefix?: string;
  userContainerTag?: string;
  projectContainerTag?: string;
  keywordPatterns?: string[];
  compactionThreshold?: number;
  turnSummaryInterval?: number;
}

const DEFAULT_KEYWORD_PATTERNS = [
  "remember",
  "memorize",
  "save\\s+this",
  "note\\s+this",
  "keep\\s+in\\s+mind",
  "don'?t\\s+forget",
  "learn\\s+this",
  "store\\s+this",
  "record\\s+this",
  "make\\s+a\\s+note",
  "take\\s+note",
  "jot\\s+down",
  "commit\\s+to\\s+memory",
  "remember\\s+that",
  "never\\s+forget",
  "always\\s+remember",
];

const DEFAULTS: Required<
  Omit<MemoryConfig, "memoryBaseUrl" | "userContainerTag" | "projectContainerTag">
> = {
  similarityThreshold: 0.45,
  maxMemories: 10,
  maxProjectMemories: 10,
  maxStructuredMemories: 30,
  maxProfileItems: 5,
  injectProfile: true,
  containerTagPrefix: "opencode",
  keywordPatterns: [],
  compactionThreshold: 0.80,
  turnSummaryInterval: 5,
};

function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function validateCompactionThreshold(value: number | undefined): number {
  if (value === undefined || typeof value !== "number" || isNaN(value)) {
    return DEFAULTS.compactionThreshold;
  }
  if (value <= 0 || value > 1) return DEFAULTS.compactionThreshold;
  return value;
}

function loadConfig(): MemoryConfig {
  for (const path of CONFIG_FILES) {
    if (existsSync(path)) {
      try {
        const content = readFileSync(path, "utf-8");
        const json = stripJsoncComments(content);
        return JSON.parse(json) as MemoryConfig;
      } catch {
        // Invalid config, use defaults
      }
    }
  }
  return {};
}

const fileConfig = loadConfig();

function getMemoryBaseUrl(): string {
  if (process.env.MEMORY_BASE_URL) return process.env.MEMORY_BASE_URL;
  if (fileConfig.memoryBaseUrl) return fileConfig.memoryBaseUrl;
  return "http://localhost:8020";
}

export const MEMORY_BASE_URL = getMemoryBaseUrl();

export const CONFIG = {
  similarityThreshold: fileConfig.similarityThreshold ?? DEFAULTS.similarityThreshold,
  maxMemories: fileConfig.maxMemories ?? DEFAULTS.maxMemories,
  maxProjectMemories: fileConfig.maxProjectMemories ?? DEFAULTS.maxProjectMemories,
  maxStructuredMemories: fileConfig.maxStructuredMemories ?? DEFAULTS.maxStructuredMemories,
  maxProfileItems: fileConfig.maxProfileItems ?? DEFAULTS.maxProfileItems,
  injectProfile: fileConfig.injectProfile ?? DEFAULTS.injectProfile,
  containerTagPrefix: fileConfig.containerTagPrefix ?? DEFAULTS.containerTagPrefix,
  userContainerTag: fileConfig.userContainerTag,
  projectContainerTag: fileConfig.projectContainerTag,
  keywordPatterns: [
    ...DEFAULT_KEYWORD_PATTERNS,
    ...(fileConfig.keywordPatterns ?? []).filter(isValidRegex),
  ],
  compactionThreshold: validateCompactionThreshold(fileConfig.compactionThreshold),
  turnSummaryInterval: fileConfig.turnSummaryInterval ?? DEFAULTS.turnSummaryInterval,
  memoryBaseUrl: getMemoryBaseUrl(),
};

export function isConfigured(): boolean {
  // The plugin only needs a reachable memory server URL.
  // API keys live in .env and are only needed by the Docker container — not this process.
  return !!MEMORY_BASE_URL;
}
