import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";
import { SidebarVersionBadge } from "@/components/sidebar-version-badge";
import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      {...baseOptions()}
      tree={source.pageTree}
      sidebar={{ banner: <SidebarVersionBadge /> }}
    >
      {children}
    </DocsLayout>
  );
}
