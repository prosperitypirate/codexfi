const BOLD  = "\x1b[1m";
const DIM   = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED   = "\x1b[31m";
const CYAN  = "\x1b[36m";
const RESET = "\x1b[0m";

function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

export const log = {
  info:    (msg: string, ...args: unknown[]) =>
    console.log(`${DIM}${ts()}${RESET} ${msg}`, ...args),
  success: (msg: string, ...args: unknown[]) =>
    console.log(`${GREEN}${BOLD}✓${RESET} ${msg}`, ...args),
  warn:    (msg: string, ...args: unknown[]) =>
    console.log(`${YELLOW}⚠ ${msg}${RESET}`, ...args),
  error:   (msg: string, ...args: unknown[]) =>
    console.error(`${RED}✗ ${msg}${RESET}`, ...args),
  phase:   (msg: string) =>
    console.log(`\n${CYAN}${BOLD}── ${msg} ${"─".repeat(Math.max(0, 50 - msg.length))}${RESET}`),
  dim:     (msg: string) =>
    console.log(`${DIM}  ${msg}${RESET}`),
};
