import { source } from "@/lib/source";
import { DocsPage, DocsBody } from "fumadocs-ui/page";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { notFound } from "next/navigation";

import { DocsMemoryCycle } from "@/components/svg/docs/docs-memory-cycle";
import { DocsSessionFlow } from "@/components/svg/docs/docs-session-flow";
import { DocsParallelFetch } from "@/components/svg/docs/docs-parallel-fetch";
import { DocsCompactionSurvival } from "@/components/svg/docs/docs-compaction-survival";
import { DocsMemoryTaxonomy } from "@/components/svg/docs/docs-memory-taxonomy";
import { DocsAgingRules } from "@/components/svg/docs/docs-aging-rules";
import { DocsExtractionPipeline } from "@/components/svg/docs/docs-extraction-pipeline";
import { DocsProviderSpeed } from "@/components/svg/docs/docs-provider-speed";
import { DocsInstallSteps } from "@/components/svg/docs/docs-install-steps";
import { DocsDedupCosine } from "@/components/svg/docs/docs-dedup-cosine";
import { DocsKeyFeatures } from "@/components/svg/docs/docs-key-features";

const customComponents = {
  ...defaultMdxComponents,
  DocsMemoryCycle,
  DocsSessionFlow,
  DocsParallelFetch,
  DocsCompactionSurvival,
  DocsMemoryTaxonomy,
  DocsAgingRules,
  DocsExtractionPipeline,
  DocsProviderSpeed,
  DocsInstallSteps,
  DocsDedupCosine,
  DocsKeyFeatures,
};

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  return (
    <DocsPage toc={page.data.toc}>
      <DocsBody>
        <MDX components={customComponents} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}
