"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/",          label: "Dashboard",  icon: "▦" },
  { href: "/projects",  label: "Projects",   icon: "◈" },
  { href: "/search",    label: "Search",     icon: "⌕" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 bg-zinc-950 border-r border-zinc-800 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-emerald-400 text-lg">◉</span>
          <div>
            <div className="text-sm font-bold text-white font-mono">opencode</div>
            <div className="text-xs text-zinc-500 font-mono">memory</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-mono transition-colors ${
                active
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-zinc-800">
        <div className="text-xs text-zinc-600 font-mono">memory server · :8020</div>
      </div>
    </aside>
  );
}
