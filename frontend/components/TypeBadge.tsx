import { getTypeColor } from "@/lib/utils";

export function TypeBadge({ type }: { type: string }) {
  const color = getTypeColor(type);
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border ${color.bg} ${color.text} ${color.border}`}
    >
      {type}
    </span>
  );
}
