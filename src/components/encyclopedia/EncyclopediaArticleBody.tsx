// Composite article renderer — calls every section. Each child component
// renders nothing when its slice is empty, so shallow entries (title +
// summary only) remain visually clean.

import type { EncyclopediaArticle } from "@/types/encyclopediaArticle";
import { EncyclopediaOverview } from "./EncyclopediaOverview";
import { EncyclopediaTimeline } from "./EncyclopediaTimeline";
import { EncyclopediaSections } from "./EncyclopediaSections";
import { EncyclopediaFacts } from "./EncyclopediaFacts";
import { EncyclopediaRelatedEntities } from "./EncyclopediaRelatedEntities";
import { EncyclopediaSources } from "./EncyclopediaSources";

export function EncyclopediaArticleBody({ article }: { article: EncyclopediaArticle }) {
  return (
    <>
      <EncyclopediaOverview overview={article.overview} />
      <EncyclopediaTimeline timeline={article.timeline} />
      <EncyclopediaSections sections={article.sections} />
      <EncyclopediaFacts   facts={article.facts} />
      <EncyclopediaRelatedEntities related={article.related} />
      <EncyclopediaSources sources={article.sources} />
    </>
  );
}

export { EncyclopediaOverview } from "./EncyclopediaOverview";
export { EncyclopediaTimeline } from "./EncyclopediaTimeline";
export { EncyclopediaSections } from "./EncyclopediaSections";
export { EncyclopediaFacts } from "./EncyclopediaFacts";
export { EncyclopediaRelatedEntities } from "./EncyclopediaRelatedEntities";
export { EncyclopediaSources } from "./EncyclopediaSources";
