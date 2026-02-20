import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { basename } from "node:path";
import { CONFIG } from "../config.js";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export function getGitEmail(): string | null {
  try {
    const email = execSync("git config user.email", { encoding: "utf-8" }).trim();
    return email || null;
  } catch {
    return null;
  }
}

export function getUserTag(): string {
  // If userContainerTag is explicitly set, use it
  if (CONFIG.userContainerTag) {
    return CONFIG.userContainerTag;
  }

  // Otherwise, auto-generate based on containerTagPrefix
  const email = getGitEmail();
  if (email) {
    return `${CONFIG.containerTagPrefix}_user_${sha256(email)}`;
  }
  const fallback = process.env.USER || process.env.USERNAME || "anonymous";
  return `${CONFIG.containerTagPrefix}_user_${sha256(fallback)}`;
}

export function getProjectTag(directory: string): string {
  // If projectContainerTag is explicitly set, use it
  if (CONFIG.projectContainerTag) {
    return CONFIG.projectContainerTag;
  }

  // Otherwise, auto-generate based on containerTagPrefix
  return `${CONFIG.containerTagPrefix}_project_${sha256(directory)}`;
}

export function getTags(directory: string): { user: string; project: string } {
  return {
    user: getUserTag(),
    project: getProjectTag(directory),
  };
}

export function getDisplayNames(directory: string): { project: string; user: string } {
  const projectName = basename(directory) || directory;

  let userName: string;
  const email = getGitEmail();
  if (email) {
    userName = email;
  } else {
    userName = process.env.USER || process.env.USERNAME || "anonymous";
  }

  return { project: projectName, user: userName };
}
