"use client";

import { motion } from "motion/react";
import {
  Brain,
  Tags,
  Search,
  Shield,
  Zap,
  BookOpen,
  EyeOff,
  RefreshCw,
} from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "Auto-Extraction",
    description:
      "After every turn, a background worker extracts decisions, fixes, conventions, and progress from the transcript — each turn exactly once.",
  },
  {
    icon: Search,
    title: "Relevant per Prompt",
    description:
      "Each prompt is embedded on your machine and the matching memories are injected — once per session, never repeated.",
  },
  {
    icon: Tags,
    title: "Typed Memory",
    description:
      "10+ memory types — architecture, tech-context, error-solution, progress, preferences, and more.",
  },
  {
    icon: Shield,
    title: "Compaction Survival",
    description:
      "A session summary is saved before compaction and the project picture is re-injected after it — nothing is lost.",
  },
  {
    icon: Zap,
    title: "Zero Setup",
    description:
      "Two commands in Claude Code. No API keys, no daemon, no Docker. Extraction runs on your own Claude Code login.",
  },
  {
    icon: BookOpen,
    title: "Memory-Bank Aware",
    description:
      "Keep a memory-bank/? codexfi stops duplicating it and adds only the specifics a curated bank can't hold.",
  },
  {
    icon: EyeOff,
    title: "Local & Private",
    description:
      "Everything lives in ~/.codexfi on your machine. <private> tags and excludePaths keep sensitive work out of memory.",
  },
  {
    icon: RefreshCw,
    title: "Smart Aging",
    description:
      "Stale facts are superseded when they change, and old session summaries condense into lasting patterns.",
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
          Everything Claude needs to remember
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          className="mx-auto mb-14 max-w-2xl text-center text-muted-foreground"
        >
          codexfi extracts, stores, and retrieves project knowledge
          automatically — so Claude has full context from the first prompt.
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
