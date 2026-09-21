import type {QueryCtx} from "../_generated/server";
import {RequestReadLedger} from "../helpers/requestReadLedger";
import {findRsvpSource} from "./rsvpSources";
import {rsvpArgsSchema,type RsvpArgs,type RsvpResult} from "./foundation/rsvpContracts";
import type {DataScope} from "./foundation/contracts";
import {validateCanonicalTree} from "./foundation/generated/instances";
import {createComposedRegistry,type RuntimeCanonicalTree} from "./foundation/composedRegistry";
import type {ComposedDataContext} from "./foundation/planner";
import type {NavigationSource} from "./navigation";

/** Only the authorized document service supplies the page and installation.
 * An unsaved event replacement cannot borrow the saved event's registration. */
export async function readEventRsvp(ctx:QueryCtx,input:RsvpArgs,scope:DataScope,source:NavigationSource,budget=new RequestReadLedger(),password?:string,composed?:ComposedDataContext):Promise<RsvpResult>{
 const args=rsvpArgsSchema.parse(input);
 const missing:RsvpResult={eventId:args.event??null,blockId:args.blockId,rsvp:null,asOf:Date.now(),nextChangeAt:null};
 const find=(nodes:RuntimeCanonicalTree):RuntimeCanonicalTree[number]|undefined=>{
  for(const node of nodes){if(node.id===args.blockId)return node;const child=node.children&&find(node.children);if(child)return child;}
 };
 const tree=composed?createComposedRegistry(composed.definitions,composed.scope).validateTree(source.tree):validateCanonicalTree(source.tree);
 const node=find(tree);
 if(node?.name!=="core/event-rsvp" || node.attrs.event!==args.event || !args.event)return missing;
 const provider=findRsvpSource(ctx,args.event);if(!provider)return missing;
 const rsvp=await provider.readSnapshot(ctx,{postId:source.document._id,blockId:args.blockId,instanceKey:scope.instanceKey,password},budget);
 if(!rsvp || rsvp.eventId!==args.event)return missing;
 return {eventId:args.event,blockId:args.blockId,rsvp,asOf:rsvp.asOf,nextChangeAt:rsvp.nextChangeAt};
}
