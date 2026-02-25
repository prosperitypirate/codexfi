/**
 * Tag generation — produces deterministic user/project container tags from
 * git email + directory path. Copy from plugin/src/services/tags.ts with
 * import path adjustment.
 */

import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { basename } from "node:path";
import { PLUGIN_CONFIG } from "../plugin-config.js";

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
	if (PLUGIN_CONFIG.userContainerTag) {
		return PLUGIN_CONFIG.userContainerTag;
	}

	const email = getGitEmail();
	if (email) {
		return `${PLUGIN_CONFIG.containerTagPrefix}_user_${sha256(email)}`;
	}
	const fallback = process.env.USER || process.env.USERNAME || "anonymous";
	return `${PLUGIN_CONFIG.containerTagPrefix}_user_${sha256(fallback)}`;
}

export function getProjectTag(directory: string): string {
	if (PLUGIN_CONFIG.projectContainerTag) {
		return PLUGIN_CONFIG.projectContainerTag;
	}

	return `${PLUGIN_CONFIG.containerTagPrefix}_project_${sha256(directory)}`;
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
