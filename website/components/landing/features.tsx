"use client";

import { motion } from "motion/react";
import {
  Brain,
  Tags,
  Search,
  Shield,
  Zap,
  Link2,
  EyeOff,
  RefreshCw,
} from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "Auto-Extraction",
    description:
      "Automatically extracts architecture, decisions, and patterns from every conversation.",
  },
  {
    icon: Tags,
    title: "Typed Memory",
    description:
      "10+ memory types — architecture, tech-context, progress, preferences, and more.",
  },
  {
    icon: Search,
    title: "Semantic Search",
    description:
      "Voyage AI embeddings find relevant context for every new task.",
  },
  {
    icon: Shield,
    title: "Compaction Survival",
    description:
      "Memory persists through context window compaction — nothing is lost.",
  },
  {
    icon: Zap,
    title: "Zero Config",
    description:
      "One command install. No Docker, no external database. Bring your own LLM + Voyage AI keys.",
  },
  {
    icon: Link2,
    title: "Session Continuity",
    description:
      "Pick up exactly where you left off — your AI knows the full project history.",
  },
  {
    icon: EyeOff,
    title: "Local & Private",
    description:
      "Memory storage is fully local. No cloud sync, no external persistence layer.",
  },
  {
    icon: RefreshCw,
    title: "Smart Aging",
    description:
      "Old memories are automatically consolidated and evolved, never duplicated.",
  },
] as const;

export function Features() {
  return (
    <section className="px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mb-4 text-center text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
        >
          Everything your AI needs to remember
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          className="mx-auto mb-14 max-w-2xl text-center text-muted-foreground"
        >
          codexfi extracts, stores, and retrieves project knowledge
          automatically — so your AI agent has full context from day one.
        </motion.p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.07, ease: "easeOut" }}
              className="group rounded-xl border border-border bg-card p-6 transition-[border-color,box-shadow] hover:border-brand/30 hover:shadow-[0_0_30px_-10px_rgba(168,85,247,0.15)]"
            >
              <div className="mb-4 inline-flex rounded-lg bg-brand/10 p-2.5">
                <feature.icon className="h-5 w-5 text-brand" />
              </div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
