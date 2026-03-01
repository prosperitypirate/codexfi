async function getLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch("https://registry.npmjs.org/codexfi/latest", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.version ?? null;
  } catch {
    return null;
  }
}

export async function SidebarVersionBadge() {
  const version = await getLatestVersion();
  if (!version) return null;

  return (
    <div className="px-3 pb-3 pt-1">
      <a
        href="https://www.npmjs.com/package/codexfi"
        target="_blank"
        rel="noopener noreferrer"
        className="group relative block w-full rounded-xl transition-all duration-300"
      >
        {/* glow — only on hover */}
        <span
          className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            boxShadow: "0 0 16px 3px rgba(168,85,247,0.4), 0 0 40px 8px rgba(168,85,247,0.15)",
          }}
        />

        {/* gradient background — muted at rest, vivid on hover */}
        <span
          className="absolute inset-0 rounded-xl opacity-[0.06] transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 40%, #c084fc 70%, #e879f9 100%)",
          }}
        />

        {/* content */}
        <span className="relative flex items-center justify-between px-3 py-2">
          <span className="flex items-center gap-2">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
            <span className="font-mono text-xs font-bold tracking-tight text-white drop-shadow-sm">
              v{version}
            </span>
          </span>
          <span className="font-mono text-[9px] font-bold tracking-[0.18em] text-white/60 group-hover:text-white transition-colors duration-200">
            NPM
          </span>
        </span>
      </a>
    </div>
  );
}




