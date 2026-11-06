"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

// Typed inside Claude Code (terminal or VS Code), one after the other.
const INSTALL_COMMANDS = [
  "/plugin marketplace add prosperitypirate/codexfi",
  "/plugin install codexfi@codexfi",
] as const;

function InstallLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-terminal-green select-none">&gt;</span>
      <span className="text-foreground">{command}</span>
      <button
        onClick={handleCopy}
        className="ml-auto rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={copied ? "Copied!" : `Copy: ${command}`}
      >
        {copied ? (
          <Check className="h-4 w-4 text-terminal-green" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

export function InstallBlock() {
  return (
    <div className="group relative inline-flex flex-col gap-2 rounded-lg border border-border bg-card px-5 py-3 text-left font-mono text-sm transition-colors hover:border-muted-foreground/30">
      {INSTALL_COMMANDS.map((command) => (
        <InstallLine key={command} command={command} />
      ))}
    </div>
  );
}
