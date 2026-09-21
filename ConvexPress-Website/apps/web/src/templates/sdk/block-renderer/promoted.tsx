import { Children } from "react";
import { decodeBlockPromotion } from "../block-data/portable/blockPromotion";
import { installedPromotions } from "../block-data/portable/generated/promotions";
import type { BlockName } from "../block-data/portable/generated/types";
import type { ResolverName } from "../block-data/portable/contracts";
import { resolveComposedPresentation } from "../block-data/portable/composedPresentation";
import { usePrimitivePackId } from "../primitives";
import { ResolvedCompositionView } from "./composition";
import { defineBlock, defineDataBlock, type RenderInput, type RendererDefinition } from "./model";

/** Installed source retains the reviewed primitive composition and pack
 * treatments. The page host also preflights its anchors and aggregate budgets. */
export function definePromotedBlock<N extends BlockName>(name: N, bundle: unknown): RendererDefinition {
  const source = decodeBlockPromotion(JSON.stringify(bundle));
  const installed = installedPromotions[name];
  if (source.bundle.targetName !== name || !installed || installed.sourceName !== source.bundle.sourceName || installed.sourceVersion !== source.bundle.sourceVersion || installed.sourceDigest !== source.bundle.sourceDigest || installed.packageDigest !== source.bundle.packageDigest || installed.specDigest !== source.specDigest)
    throw Error(`Promoted renderer does not match installed source: ${name}`);
  const composition = source.definition;
  function View(props: RenderInput) {
    const packId = usePrimitivePackId();
    if (!packId) throw Error("Promoted rendering requires an installed template provider");
    const result = resolveComposedPresentation(composition, props.attrs, { packId, data: props.data, childCount: Children.count(props.children),
      readMedia: id => Object.hasOwn(props.resources.media, id) ? props.resources.media[id] : undefined });
    return <ResolvedCompositionView root={result.root} packId={packId} slots={{ children: props.children }} />;
  }
  const renderer = composition.spec.data
    ? defineDataBlock(name, composition.spec.data.resolver as ResolverName, View)
    : defineBlock(name, View);
  return { ...renderer, promotedComposition: composition };
}
