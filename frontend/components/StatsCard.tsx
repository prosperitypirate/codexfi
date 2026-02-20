export function StatsCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-1">
      <span className="text-xs text-zinc-500 uppercase tracking-wider font-mono">{label}</span>
      <span className="text-3xl font-bold text-white font-mono">{value}</span>
      {sub && <span className="text-xs text-zinc-500">{sub}</span>}
    </div>
  );
}
