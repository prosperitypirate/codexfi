"use client";

import { motion } from "motion/react";
import { Terminal, Code2, Sparkles } from "lucide-react";

const steps = [
  {
    number: "1",
    icon: Terminal,
    title: "Install",
    description: "One command. Works with OpenCode. No configuration needed.",
    code: "bunx codexfi install",
  },
  {
    number: "2",
    icon: Code2,
    title: "Code",
    description:
      "You code with your AI agent as usual. codexfi silently extracts memories in the background.",
    code: null,
  },
  {
    number: "3",
    icon: Sparkles,
    title: "Remember",
    description:
      "Next session, your AI has full context. Architecture, decisions, patterns — all injected automatically.",
    code: null,
  },
] as const;

export function HowItWorks() {
  return (
    <section className="px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mb-4 text-center text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
        >
          How it works
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          className="mx-auto mb-14 max-w-2xl text-center text-muted-foreground"
        >
          Three steps. No ongoing maintenance. Your AI gets smarter with every
          session.
        </motion.p>

        <div className="grid gap-8 sm:grid-cols-3">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1, ease: "easeOut" }}
              className="relative flex flex-col items-center text-center"
            >
              {/* Step number badge */}
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full border border-brand/30 bg-brand/10 text-lg font-bold text-brand">
                {step.number}
              </div>

              <div className="mb-3 inline-flex rounded-lg bg-card p-2.5">
                <step.icon className="h-5 w-5 text-muted-foreground" />
              </div>

              <h3 className="mb-2 text-lg font-semibold text-foreground">
                {step.title}
              </h3>

              <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>

              {step.code && (
                <div className="rounded-lg border border-border bg-secondary px-4 py-2 font-mono text-xs">
                  <span className="text-terminal-green select-none">$ </span>
                  <span className="text-foreground">{step.code}</span>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
