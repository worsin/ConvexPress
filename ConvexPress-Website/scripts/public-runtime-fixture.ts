import { demoFormResult } from "../apps/web/block-demo/form-adapter";
import {calendarWindow} from "../apps/web/src/templates/sdk/block-data/portable/calendarContracts";
/** Offline-only fixture producer. It uses the same generated tree/data/DTO
 * validators as production, never a duplicate schema or a deployed endpoint. */
import { validateCanonicalTree } from "../apps/web/src/templates/sdk/block-data/portable/generated/instances";
import { canonicalContentDigest } from "../apps/web/src/templates/sdk/block-data/portable/documentContracts";
import { parsePublicCanonicalDocument } from "../apps/web/src/templates/sdk/block-data/portable/publicDocumentContracts";
import { resolveCanonicalData } from "../apps/web/src/templates/sdk/block-data/portable/resolve";
export async function publicRuntimeFixture(instanceKey: string, packId: string, type: "page" | "post" = "page", request: Record<string,string> = {}) {
  const title = "Canonical runtime fixture", id = `runtime-${type}`, scope = {websiteKey: "offline-runtime", instanceKey};
  const blocks = validateCanonicalTree([
    {id: "runtime-heading", name: "core/heading", version: 2, attrs: {level: 2, text: {type: "doc", content: [{type: "paragraph", content: [{type: "text", text: "Rendered canonical public story", marks: [{type: "bold"}]}]}]}}},
    {id: "runtime-image", name: "core/image", version: 2, attrs: {mediaId: "runtime-media", alt: "Resolved authored image", caption: "Authored caption"}},
    {id:"runtime-grid",name:"core/post-grid",version:1,attrs:{limit:1}},
    {id:"runtime-calendar",name:"events/calendar",version:1,attrs:{view:"agenda",timeZone:"America/Denver"}},
    {id:"runtime-next-event",name:"events/next-event",version:1,attrs:{category:"runtime-event-category"}},
    {id:"runtime-events",name:"events/upcoming",version:1,attrs:{count:1}},
    {id:"runtime-form",name:"core/form",version:1,attrs:{form:demoFormResult.form!._id}},
    {id:"runtime-newsletter",name:"core/newsletter-signup",version:2,attrs:{heading:"Runtime field notes",submitLabel:"Join runtime newsletter"}},
    {id:"runtime-cta-form",name:"core/cta-with-form",version:2,attrs:{heading:"Runtime correspondence",submitLabel:"Join runtime correspondence"}},
  ]);
  const policy = {enabledPlugins: ["events", "forms"], capabilities: ["reference.targetResolution", "form.submission"], disabledBlocks: []};
  const ready = parsePublicCanonicalDocument({contract: "canonical-public-document-v1", state: "ready", viewerSubject: null, accessLease: null, scope,
    document: {id, type, title, path: "/runtime-canonical", blocksVersion: 2, revision: 1, digest: canonicalContentDigest(title, blocks), blocks},
    presentation: {packId, revision: "a".repeat(64)}, policy,
    data: await resolveCanonicalData(blocks, scope, policy, async () => {throw Error("No page resolver is expected");}, undefined, undefined, async args => ({items:[{id:args.cursor?"older":"newest",title:args.cursor?"Older runtime story":"Newest runtime story",href:"/blog/runtime-source",excerpt:null,publishedAt:1,author:null,image:null}],cursor:args.cursor,nextCursor:args.cursor?null:"runtime-next"}), request, async()=>({asOf:Date.UTC(2026,8,1),items:[{id:"runtime-gathering",title:"Runtime studio gathering",href:"/events/runtime-gathering",description:"An authored event summary",startsAt:Date.UTC(2026,9,17,15),endsAt:Date.UTC(2026,9,17,18),timeZone:"America/Denver",venue:"Runtime workroom"}]}),async args=>({asOf:Date.UTC(2026,8,1),categoryId:args.category??null,event:{id:"runtime-next-gathering",title:"Runtime next gathering",href:"/events/runtime-next-gathering",description:"Category-bound event summary",startsAt:Date.UTC(2026,9,18,15),endsAt:Date.UTC(2026,9,18,18),timeZone:"America/Denver",venue:"Runtime next studio"}}),async args=>({...calendarWindow(args.month??"2026-10","America/Denver"),asOf:Date.UTC(2026,9,1,12),categoryId:args.category??null,items:[{id:"runtime-calendar-gathering",title:"Runtime calendar gathering",href:"/events/runtime-calendar-gathering",description:"Month-scoped event summary",startsAt:Date.UTC(2026,9,19,15),endsAt:Date.UTC(2026,9,19,18),timeZone:"America/Denver",venue:"Runtime calendar studio"}],cursor:args.cursor,nextCursor:null}), undefined, async () => demoFormResult),
    resources: {media: {"runtime-media": {src: "/runtime-fixture.png", alt: "Resolved authored image", width: 1536, height: 1024, mimeType: "image/png"}}},
  });
  const metadata = {_id: id, _creationTime: 1, type, title, slug: "runtime-canonical", path: "/runtime-canonical", status: "publish", visibility: "public", contentMode: "blocks", blocksVersion: 2, blocksRevision: 1, content: null, excerpt: "Public runtime fixture", pageTemplate: "full-width", author: null, publishedAt: 1, commentStatus: "closed", commentCount: 0, categories: [], tags: [], isPasswordProtected: false, isMembershipRestricted: false, membershipAccess: {allowed: true, reason: "plugin_disabled"}};
  return {ready, metadata};
}
