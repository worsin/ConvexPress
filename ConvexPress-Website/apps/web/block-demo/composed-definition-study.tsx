import { useMemo, useState } from "react";
import type { PackPartsRegistry } from "../src/templates/sdk/primitives";
import { CanonicalDocumentView } from "../src/templates/sdk/block-preview/CanonicalDocumentView";
import { useDisplayInstallation } from "../src/templates/sdk/block-data/use-display-installation";
import { canonicalContentDigest, canonicalPreviewDocument, parseCanonicalDocumentRead } from "../src/templates/sdk/block-data/portable/documentContracts";
import { planCanonicalData } from "../src/templates/sdk/block-data/portable/planner";
import { encodeComposedDefinition } from "../src/templates/sdk/block-data/portable/composedDefinitions";
import type { Composition } from "../src/templates/sdk/block-data/portable/composition";
import { demoProducts } from "./products-adapter";

const scope = { websiteKey: "blockdemo-composed", instanceKey: "local", deploymentOrigin: "https://blockdemo.invalid" };
function composition(version: number, tone: "default" | "muted" | "accent" = "default", headingSize: "lg" | "md" = "lg"): Composition {
  return { version: 1, root: { el: "Card", props: { variant: "filled", tone, padding: "spacious" }, children: [
    { el: "Split", props: { gap: "lg", align: "center" }, children: [
      { el: "Stack", props: { gap: "md" }, children: [
        { el: "Eyebrow", bind: version === 1 ? "'From the studio'" : "'The current edit'" },
        { el: "Heading", props: { level: 2, size: headingSize }, bind: "attrs.title" },
        { el: "Text", props: { size: "lg" }, bind: "attrs.description" },
        { el: "Slot", props: { name: "children" } },
      ] },
      { el: "Image", props: { aspect: "4/5" }, bind: { media: "attrs.image" } },
    ] },
  ] } };
}
const snapshots = [1, 2].map(version => {
  const encoded = encodeComposedDefinition({
    spec: { name: "composed/studio-introduction", title: "Studio introduction", description: "Internal exact-version renderer study", category: "marketing", role: "opener", version,
      keywords: [], ai: { useFor: "Studio introduction", avoid: "Navigation" }, fields: [{ id: "title", type: "text", max: 100 }, { id: "description", type: "text", max: 500 }, { id: "image", type: "media" }],
      supports: { children: true, styles: false, layout: ["width", "spacing"], anchor: true, visibility: false }, data: null, preview: "{title}",
      examples: [{ title: "Everyday, made intentional.", description: "Useful objects. Unhurried rituals.", image: { id: "studio-mug" } }] },
    composition: composition(version), packTreatments: { journal: composition(version, "muted"), depot: composition(version, "accent", "md") },
  });
  return { name: "composed/studio-introduction", version, digest: encoded.digest, definitionJson: encoded.json };
});
/** Internal synthetic snapshots exercise the real renderer without publishing a
 * definition or creating a site/database. The media already belongs to BlockDemo. */
export function ComposedDefinitionStudy({ packId }: { packId: string; registry: PackPartsRegistry }) {
  const [version, setVersion] = useState(1);
  const document = useMemo(() => {
  const snapshot = snapshots[version - 1];
  const product = demoProducts[0];
  const tree = [{ id: "studio-introduction", name: snapshot.name, version, attrs: {
    title: "Everyday, made intentional.", description: "A generous cup. A fresh page. Small, considered things that make room for the moments you want to keep.", image: { id: "studio-mug", alt: product.alt },
  }, children: [{ id: "studio-note", name: "core/paragraph", version: 2, attrs: { body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Made to be used. Chosen to be kept." }] }] } } }] }];
  const composed = { scope, definitions: { scope, definitions: [snapshot] } };
  const dataScope = { websiteKey: scope.websiteKey, instanceKey: scope.instanceKey };
  const policy = { enabledPlugins: [], capabilities: ["tree.children"], disabledBlocks: [] };
  const plan = planCanonicalData(tree, dataScope, policy, {}, composed);
  // Static fixture only. Live documents receive their resolver envelope from
  // the server; this fixture traverses the actual document/preview/host gates.
  const source = parseCanonicalDocumentRead({ contract: "canonical-document-v1", scope: dataScope, policy,
    presentation: { packId, revision: "a".repeat(64) },
    document: { id: "studio-study", type: "page", title: "Studio study", status: "draft", path: "/studio-study", blocksVersion: 2, revision: version,
      blocks: tree, digest: canonicalContentDigest("Studio study", tree, composed), composedDefinitions: composed.definitions },
    data: { contract: "canonical-data-v1", scope: dataScope, dataByBlock: {}, definitionsDigest: plan.definitionsDigest },
    resources: { media: { "studio-mug": { src: product.src.startsWith("/") ? product.src : `/${product.src}`, alt: product.alt } } },
  });
  if (!source || source.contract !== "canonical-document-v1") throw Error("Invalid composed study fixture");
  return canonicalPreviewDocument(source);
  }, [packId, version]);
  const installed = useDisplayInstallation(document, "internal-composed-study");
  return <section id="composed-definitions" className="composition-study" aria-labelledby="composed-definitions-title">
    <div className="composition-study-tools"><div><p className="lab-kicker">Custom block study</p><h2 id="composed-definitions-title">A block with its own history.</h2><p>Preview fixtures · two immutable versions · nested editable content.</p></div>
      <label>Definition version <select value={version} onChange={event => setVersion(Number(event.target.value))}><option value={1}>Version 1 — original</option><option value={2}>Version 2 — current edit</option></select></label>
    </div>
    <div className="composition-study-canvas" data-composed-version={version}>
      <CanonicalDocumentView tree={document.document.blocks} policy={document.policy} resources={document.resources}
        data={installed.data} composed={installed.composed} packId={packId} />
    </div>
  </section>;
}
