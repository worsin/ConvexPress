import type {QueryCtx} from "../_generated/server";
import {RequestReadLedger} from "../helpers/requestReadLedger";
import {readLeadMagnetSource} from "../leadMagnets/source";
import {validateCanonicalTree} from "./foundation/generated/instances";
import {createComposedRegistry,type RuntimeCanonicalTree} from "./foundation/composedRegistry";
import type {ComposedDataContext} from "./foundation/planner";
import {stableKey} from "./foundation/contracts";
import type {NavigationSource} from "./navigation";
import {leadMagnetArgsSchema,type LeadMagnetArgs,type LeadMagnetResult} from "./foundation/leadMagnetContracts";
/** Unsaved previews cannot borrow the previous published offer. */
export async function readLeadMagnet(ctx:QueryCtx,input:LeadMagnetArgs,source:NavigationSource,budget=new RequestReadLedger(),password?:string,composed?:ComposedDataContext):Promise<LeadMagnetResult>{
 const args=leadMagnetArgsSchema.parse(input),missing:LeadMagnetResult={blockId:args.blockId,offer:null};
 const current=await readLeadMagnetSource(ctx,{postId:source.document._id,blockId:args.blockId,...(password!==undefined?{password}:{})},budget);
 const visible=composed?createComposedRegistry(composed.definitions,composed.scope).validateTree(source.tree):validateCanonicalTree(source.tree);
 // authoringTree is the already validated server projection. Its equality to
 // the current persisted, validated tree prevents an unsaved preview borrowing
 // a published offer without demanding hidden definitions in display context.
 const authored=composed?(source.authoringTree??visible):validateCanonicalTree(source.authoringTree??source.tree);
 if(!current||current.post.title!==source.document.title||stableKey(current.tree)!==stableKey(authored))return missing;
 const find=(nodes:RuntimeCanonicalTree):RuntimeCanonicalTree[number]|undefined=>{
  for(const node of nodes){if(node.id===args.blockId)return node;const child=node.children&&find(node.children);if(child)return child;}return undefined;
 };
 const candidate=find(visible),published=find(current.tree);
 if(!candidate||!published||stableKey(candidate)!==stableKey(published))return missing;
 return {blockId:args.blockId,offer:current.offer};
}
