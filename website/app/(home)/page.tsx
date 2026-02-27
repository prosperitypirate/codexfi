import type { Metadata } from "next";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Footer } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "codexfi — Persistent Memory for OpenCode",
  description:
    "Automatically capture, organize, and retrieve project knowledge across coding sessions. Semantic search and LLM-powered memory extraction for OpenCode.",
  openGraph: {
    title: "codexfi — Persistent Memory for OpenCode",
    description:
      "Automatically capture, organize, and retrieve project knowledge across coding sessions.",
    url: "https://codexfi.com",
    siteName: "codexfi",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "codexfi — Persistent Memory for OpenCode",
    description:
      "Automatically capture, organize, and retrieve project knowledge across coding sessions.",
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
