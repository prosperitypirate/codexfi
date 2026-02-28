"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

const INSTALL_COMMAND = "curl -fsSL https://codexfi.com/install | bash";

export function InstallBlock() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(INSTALL_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="group relative inline-flex items-center gap-3 rounded-lg border border-border bg-card px-5 py-3 font-mono text-sm transition-colors hover:border-muted-foreground/30">
      <span className="text-terminal-green select-none">$</span>
      <span className="text-foreground">{INSTALL_COMMAND}</span>
      <button
        onClick={handleCopy}
        className="ml-2 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={copied ? "Copied!" : "Copy install command"}
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
