import type { Metadata } from "next";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Footer } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "codexfi — Persistent Memory for Claude Code",
  description:
    "Persistent, searchable memory for Claude Code. Automatic extraction after every turn, relevant memories injected per prompt, on-device embeddings — runs on your Claude Code login, no API keys.",
  openGraph: {
    title: "codexfi — Persistent Memory for Claude Code",
    description:
      "Claude Code remembers every decision, fix and convention across sessions. No API keys.",
    url: "https://codexfi.com",
    siteName: "codexfi",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "codexfi — Persistent Memory for Claude Code",
    description:
      "Claude Code remembers every decision, fix and convention across sessions. No API keys.",
  },
};

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <Hero />
      <Features />
      <HowItWorks />
      <Footer />
    </main>
  );
}
