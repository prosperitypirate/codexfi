"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

const INSTALL_COMMAND = "bunx codexfi install";

export function InstallBlock() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(INSTALL_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="group relative inline-flex items-center gap-3 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-5 py-3 font-mono text-sm transition-colors hover:border-[#3a3a3a]">
      <span className="text-terminal-green select-none">$</span>
      <span className="text-[#f5f5f5]">{INSTALL_COMMAND}</span>
      <button
        onClick={handleCopy}
        className="ml-2 rounded p-1 text-[#a0a0a0] transition-colors hover:bg-[#2a2a2a] hover:text-[#f5f5f5]"
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
