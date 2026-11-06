"use client";

import { motion } from "motion/react";
import { Terminal, Code2, Sparkles } from "lucide-react";

const steps = [
  {
    number: "1",
    icon: Terminal,
    title: "Install",
    description:
      "Add the codexfi marketplace and install the plugin from inside Claude Code — terminal or VS Code. No API keys, no configuration.",
    code: "/plugin install codexfi@codexfi",
  },
  {
    number: "2",
    icon: Code2,
    title: "Code",
    description:
      "You code. After each turn, a background worker extracts what matters through your own Claude Code login — your session never waits, nothing is asked of you.",
    code: null,
  },
  {
    number: "3",
    icon: Sparkles,
    title: "Remember",
    description:
      "Next session, Claude starts with the project picture, and every prompt brings back the memories relevant to it — automatically.",
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
          Three steps. No API keys, no ongoing maintenance. Claude gets sharper
          with every session.
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
                  <span className="text-terminal-green select-none">&gt; </span>
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
