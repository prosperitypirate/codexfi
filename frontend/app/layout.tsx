import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "opencode memory",
  description: "Persistent memory visualizer for OpenCode AI agent",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="flex min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <Sidebar />
        <main className="flex-1 overflow-y-auto min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
