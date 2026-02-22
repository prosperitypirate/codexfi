/**
 * Scenario 06 — Existing Codebase Auto-Init
 *
 * Verifies that triggerSilentAutoInit correctly extracts memories from real
 * project files (package.json, tsconfig.json, README.md, source files) when
 * a user opens an existing codebase for the first time in OpenCode.
 *
 * This is the highest-risk untested path: the user has an existing project
 * with many files and starts chatting without any prior memory. The plugin
 * must silently read project files and extract useful context.
 *
 * Unlike scenario 02 (README-only), this test creates a realistic codebase
 * structure with multiple file types to exercise the full auto-init pipeline.
 */

import { createTestDir, runOpencode } from "../opencode.js";
import { waitForMemories, getMemoriesForDir } from "../memory-api.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { ScenarioResult } from "../report.js";

// A realistic-looking TypeScript project with multiple files
const PROJECT_FILES: Record<string, string> = {
  "README.md": `# invoicekit

A TypeScript library for generating PDF invoices with line items, taxes, and multi-currency support.
Designed for SaaS platforms that need programmatic invoice generation.

## Features
- PDF generation via pdfkit
- Multi-currency with live exchange rates (fixer.io)
- VAT/GST calculation for EU and AU regions
- Stripe invoice sync
- Node.js 20+, ESM-first
`,

  "package.json": JSON.stringify({
    name: "invoicekit",
    version: "0.4.2",
    description: "TypeScript PDF invoice generation library",
    type: "module",
    main: "./dist/index.js",
    scripts: {
      build: "tsc",
      test: "vitest",
      lint: "eslint src/"
    },
    dependencies: {
      pdfkit: "^0.15.0",
      stripe: "^14.0.0",
      zod: "^3.22.0"
    },
    devDependencies: {
      typescript: "^5.3.0",
      vitest: "^1.2.0"
    }
  }, null, 2),

  "tsconfig.json": JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      outDir: "./dist",
      declaration: true
    },
    include: ["src/**/*"]
  }, null, 2),

  "src/index.ts": `export { InvoiceBuilder } from "./invoice.js";
export { CurrencyConverter } from "./currency.js";
export type { Invoice, LineItem, TaxConfig } from "./types.js";
`,

  "src/types.ts": `export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
}

export interface Invoice {
  id: string;
  date: Date;
  dueDate: Date;
  currency: string;
  lineItems: LineItem[];
  customerName: string;
  customerEmail: string;
}

export interface TaxConfig {
  region: "EU" | "AU" | "US" | "none";
  vatNumber?: string;
}
`,

  "src/invoice.ts": `import PDFDocument from "pdfkit";
import type { Invoice, TaxConfig } from "./types.js";

export class InvoiceBuilder {
  constructor(private invoice: Invoice, private taxConfig: TaxConfig) {}

  generate(): Buffer {
    const doc = new PDFDocument();
    // ... PDF generation logic
    return Buffer.alloc(0);
  }

  calculateTotal(): number {
    return this.invoice.lineItems.reduce((sum, item) => {
      const subtotal = item.quantity * item.unitPrice;
      const tax = item.taxRate ? subtotal * item.taxRate : 0;
      return sum + subtotal + tax;
    }, 0);
  }
}
`,
};

export async function run(): Promise<ScenarioResult> {
  const id = "06";
  const name = "Existing Codebase Auto-Init";
  const details: string[] = [];
  const start = Date.now();

  // Create a realistic project directory with actual files
  const dir = createTestDir("existing-codebase");
  details.push(`test dir: ${dir}`);

  // Write all project files
  mkdirSync(join(dir, "src"), { recursive: true });
  for (const [filename, content] of Object.entries(PROJECT_FILES)) {
    writeFileSync(join(dir, filename), content, "utf-8");
  }
  details.push(`created ${Object.keys(PROJECT_FILES).length} project files (README, package.json, tsconfig, src/)`);

  try {
    // ── Session 1: First ever session, no prior memories ────────────────────────
    // Use a minimal, generic opening message — like a real user would.
    // triggerSilentAutoInit must do all the heavy lifting from the files.
    details.push("Session 1: opening project for first time with generic message…");
    const s1 = await runOpencode(
      "Hey, I just opened this project. What can you tell me about it?",
      dir,
      { timeoutMs: 90_000 }
    );

    details.push(`  exitCode: ${s1.exitCode}, duration: ${(s1.durationMs/1000).toFixed(1)}s`);
    details.push(`  response: ${s1.text.slice(0, 200)}`);

    if (s1.exitCode !== 0) {
      return {
        id, name, status: "FAIL", durationMs: Date.now() - start, details,
        error: `Session 1 failed: ${s1.stderr.slice(0, 200)}`
      };
    }

    // ── Wait for auto-init and auto-save to complete ────────────────────────────
    details.push("Waiting up to 35s for auto-init memories…");
    const memories = await waitForMemories(dir, 1, 35_000);
    details.push(`  memories saved: ${memories.length}`);

    const types = memories.map((m) => m.metadata?.type ?? "unknown");
    const typeCounts: Record<string, number> = {};
    for (const t of types) typeCounts[t] = (typeCounts[t] ?? 0) + 1;
    details.push(`  types: ${JSON.stringify(typeCounts)}`);

    const allContent = memories.map((m) => m.memory.toLowerCase()).join(" ");
    for (const m of memories) {
      details.push(`  - [${m.metadata?.type ?? "?"}] "${m.memory.slice(0, 80)}"`);
    }

    // ── Session 2: Verify recall without any seeding ────────────────────────────
    details.push("Session 2: asking about the project to verify auto-init recall…");
    const s2 = await runOpencode(
      "What is this project called and what does it do? What's the tech stack?",
      dir,
      { timeoutMs: 90_000 }
    );

    details.push(`  exitCode: ${s2.exitCode}, duration: ${(s2.durationMs/1000).toFixed(1)}s`);
    const response = s2.text;
    details.push(`  response: ${response.slice(0, 250)}`);

    // ── Assertions ──────────────────────────────────────────────────────────────
    const assertions = [
      {
        label: "At least 2 memories extracted from project files",
        pass: memories.length >= 2,
      },
      {
        label: "Memories contain tech facts (TypeScript/Node/pdfkit/Stripe)",
        // Extraction model stores tech facts without always repeating the project name
        pass: /typescript|node|pdfkit|stripe|vitest|zod|esm/i.test(allContent),
      },
      {
        label: "Session 2 recalls project name 'invoicekit'",
        pass: response.toLowerCase().includes("invoicekit"),
      },
      {
        label: "Session 2 recalls purpose (invoice/PDF)",
        pass: /invoice|pdf/i.test(response),
      },
      {
        label: "Session 2 recalls tech (TypeScript/pdfkit/Stripe)",
        pass: /typescript|pdfkit|stripe|node/i.test(response),
      },
    ];

    for (const a of assertions) {
      details.push(`  [${a.pass ? "✓" : "✗"}] ${a.label}`);
    }

    return {
      id, name,
      status: assertions.every((a) => a.pass) ? "PASS" : "FAIL",
      durationMs: Date.now() - start,
      details,
      evidence: {
        memoriesCount: memories.length,
        typeCounts,
        responsePreview: response.slice(0, 500),
      },
      testDirs: [dir],
    };

  } catch (err) {
    return { id, name, status: "ERROR", durationMs: Date.now() - start, details, error: String(err) };
  }
}
