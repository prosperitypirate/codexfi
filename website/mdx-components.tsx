import type { MDXComponents } from "mdx/types";
import defaultMdxComponents from "fumadocs-ui/mdx";

import { DocsMemoryCycle } from "./components/svg/docs/docs-memory-cycle";
import { DocsSessionFlow } from "./components/svg/docs/docs-session-flow";
import { DocsParallelFetch } from "./components/svg/docs/docs-parallel-fetch";
import { DocsCompactionSurvival } from "./components/svg/docs/docs-compaction-survival";
import { DocsMemoryTaxonomy } from "./components/svg/docs/docs-memory-taxonomy";
import { DocsAgingRules } from "./components/svg/docs/docs-aging-rules";
import { DocsExtractionPipeline } from "./components/svg/docs/docs-extraction-pipeline";
import { DocsProviderSpeed } from "./components/svg/docs/docs-provider-speed";
import { DocsInstallSteps } from "./components/svg/docs/docs-install-steps";
import { DocsDedupCosine } from "./components/svg/docs/docs-dedup-cosine";
import { DocsKeyFeatures } from "./components/svg/docs/docs-key-features";
import { RelevantToTaskCallout } from "./components/docs/relevant-to-task-callout";
import { DocsBenchmarkScoreboard } from "./components/svg/docs/docs-benchmark-scoreboard";
import { DocsBenchmarkPipeline } from "./components/svg/docs/docs-benchmark-pipeline";
import { DocsBenchmarkDataset } from "./components/svg/docs/docs-benchmark-dataset";
import { DocsTestTiers } from "./components/svg/docs/docs-test-tiers";
import { DocsE2eScenarioMap } from "./components/svg/docs/docs-e2e-scenario-map";
import { DocsTestIsolation } from "./components/svg/docs/docs-test-isolation";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
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
    RelevantToTaskCallout,
    DocsBenchmarkScoreboard,
    DocsBenchmarkPipeline,
    DocsBenchmarkDataset,
    DocsTestTiers,
    DocsE2eScenarioMap,
    DocsTestIsolation,
    ...components,
  };
}
