import Link from "next/link";
import { getProjects } from "@/lib/api";
import { TypeBadge } from "@/components/TypeBadge";
import { shortId, timeAgo } from "@/lib/utils";

export const revalidate = 0;

export default async function ProjectsPage() {
  let projects;
  try {
    projects = await getProjects();
  } catch {
    return (
      <div className="p-8 text-red-400 font-mono text-sm">
        Could not reach memory backend.
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white font-mono">Projects</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {projects.length} memory scope{projects.length !== 1 ? "s" : ""}
        </p>
      </div>

      {projects.length === 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-zinc-500 font-mono text-sm">No memories stored yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {projects.map((p) => {
          const topTypes = Object.entries(p.type_counts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 4);

          return (
            <Link
              key={p.user_id}
              href={`/projects/${encodeURIComponent(p.user_id)}`}
              className="block bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-5 transition-colors group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {/* Scope badge + display name */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                      p.scope === "user"
                        ? "text-pink-400 border-pink-500/30 bg-pink-500/10"
                        : "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                    }`}>
                      {p.scope}
                    </span>
                    <span className="text-base font-mono font-semibold text-white group-hover:text-emerald-300 transition-colors truncate">
                      {p.name ?? shortId(p.user_id)}
                    </span>
                  </div>

                  {/* Full hash ID */}
                  <p className="text-xs font-mono text-zinc-600 truncate mb-3">{p.user_id}</p>

                  {/* Type breakdown */}
                  <div className="flex flex-wrap gap-1.5">
                    {topTypes.map(([type, count]) => (
                      <div key={type} className="flex items-center gap-1">
                        <TypeBadge type={type} />
                        <span className="text-xs font-mono text-zinc-600">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-2xl font-bold text-white font-mono">{p.count}</div>
                  <div className="text-xs text-zinc-600 font-mono mt-1">
                    {timeAgo(p.last_updated)}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
