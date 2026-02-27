"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";
import { ArrowRight, ExternalLink } from "lucide-react";
import { fadeInUp, staggerContainer } from "@/lib/animations";
import { MemoryFlowSVG } from "@/components/svg/memory-flow";
import { InstallBlock } from "@/components/landing/install-block";

export function Hero() {
  return (
    <section className="relative flex flex-col items-center px-4 pt-20 pb-16 text-center sm:pt-32 sm:pb-24">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-50px" }}
        variants={staggerContainer}
        className="flex max-w-4xl flex-col items-center"
      >
        {/* Exclusively for OpenCode badge */}
        <motion.a
          variants={fadeInUp}
          href="https://opencode.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-4 py-1.5 text-sm font-medium text-brand transition-colors hover:bg-brand/20"
        >
          <Image
            src="https://opencode.ai/favicon.ico"
            alt="OpenCode"
            width={16}
            height={16}
            className="rounded-sm"
            unoptimized
          />
          Exclusively for OpenCode
        </motion.a>

        <motion.h1
          variants={fadeInUp}
          className="mb-6 text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl"
        >
          Persistent memory for{" "}
          <span className="text-gradient-brand">AI coding agents</span>
        </motion.h1>

        <motion.p
          variants={fadeInUp}
          className="mb-10 max-w-2xl text-lg text-muted-foreground sm:text-xl"
        >
          Your AI remembers everything — architecture, decisions, patterns,
          progress — across every session, automatically.
        </motion.p>

        <motion.div variants={fadeInUp} className="mb-12">
          <InstallBlock />
        </motion.div>

        <motion.div variants={fadeInUp} className="flex flex-wrap justify-center gap-4">
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-light"
          >
            Get Started
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="https://github.com/prosperitypirate/codexfi"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            View on GitHub
            <ExternalLink className="h-4 w-4" />
          </a>
        </motion.div>
      </motion.div>

      {/* Placeholder SVG — will be replaced in Phase 4 with Gemini-designed animation */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
        className="mt-16 w-full max-w-4xl sm:mt-20"
      >
        <MemoryFlowSVG />
      </motion.div>
    </section>
  );
}
