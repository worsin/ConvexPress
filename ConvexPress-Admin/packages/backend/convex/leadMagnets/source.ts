import type {Doc} from "../_generated/dataModel";
import type {QueryCtx} from "../_generated/server";
import {RequestReadLedger} from "../helpers/requestReadLedger";
import {isPluginEnabled} from "../helpers/plugins";
import {getCurrentUser} from "../helpers/permissions";
import {readPublicContent,canDiscoverContent} from "../helpers/publicContent";
import {timingSafeEquals} from "../helpers/timingSafe";
import {listFieldsSchema} from "../audiences/policy";
import {loadSecuritySettings,type EffectiveSecuritySettings} from "../extensions/forms/spam";
import {readPublishedBlockPath,permitsPublishedBlockPath} from "../canonicalDocuments/publishedBlockPath";
import type {RuntimeCanonicalTree} from "../canonicalDocuments/foundation/composedRegistry";
import {authoringRevision} from "../canonicalDocuments/foundation/documentState";
import {sha256Hex,canonicalJson} from "../canonicalDocuments/foundation/shared/fingerprints";
import {leadMagnetRequestSchema,leadMagnetOfferSchema,type LeadMagnetOffer,type LeadMagnetRequest} from "../canonicalDocuments/foundation/leadMagnetContracts";

export type LeadMagnetSource={offer:LeadMagnetOffer;post:Doc<"posts">;tree:RuntimeCanonicalTree;list:Doc<"mailingLists">;media:Doc<"media">;site:Doc<"convexpress_siteIdentity">;fileFingerprint:string;security:EffectiveSecuritySettings};
/** This is a server-only authority read. The public endpoint projects offer;
 * publication, parent visibility, audience ownership and file bytes are current. */
export async function readLeadMagnetSource(ctx:QueryCtx,input:LeadMagnetRequest,budget=new RequestReadLedger(), trustedPasswordHash?:string):Promise<LeadMagnetSource|null>{
 const args=leadMagnetRequestSchema.parse(input),now=Date.now();
 if(!(await isPluginEnabled(ctx,"forms",budget)))return null;
 const postId=ctx.db.normalizeId("posts",args.postId);if(!postId)return null;
 budget.beforeRead();const post=budget.record(await ctx.db.get("posts",postId));
 if(!post||post.status!=="publish"||post.blocksVersion!==2||(post.publishedAt!==undefined&&post.publishedAt>now))return null;
 const passwordVerified=post.visibility==="password"&&!!post.password&&((typeof args.password==="string"&&timingSafeEquals(args.password,post.password))||(trustedPasswordHash!==undefined&&timingSafeEquals(trustedPasswordHash,sha256Hex(post.password))));
 const permitted=await readPublicContent(ctx,post,{passwordVerified},budget);
 if(!permitted||permitted.isMembershipRestricted||permitted.isPasswordProtected&&!permitted.passwordVerified)return null;
 budget.beforeRead();const settings=budget.record(await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","blocks")).unique());
 const disabled=(settings?.values as {disabledBlockNames?:unknown}|undefined)?.disabledBlockNames;
 if(disabled!==undefined&&(!Array.isArray(disabled)||disabled.some(name=>typeof name!=="string")))return null;
 const denied=new Set<string>(Array.isArray(disabled)?disabled:[]);
 const viewer=await getCurrentUser(ctx,budget),signedIn=!!viewer&&viewer.status==="active";
 const source=await readPublishedBlockPath(ctx,post.blocks,args.blockId,budget,post.composedDefinitions);
 if(!source||!await permitsPublishedBlockPath(ctx,source,denied,signedIn,budget))return null;
 const node=source.path[source.path.length-1]!.node;if(node.name!=="core/lead-magnet")return null;
 const fileValue=node.attrs.file;
 const fileId=typeof fileValue==="string"?fileValue:fileValue?.id;
 const mediaId=fileId?ctx.db.normalizeId("media",fileId):null;
 const listId=node.attrs.list?ctx.db.normalizeId("mailingLists",node.attrs.list):null;
 if(!mediaId||!listId)return null;
 budget.beforeRead();const site=budget.record(await ctx.db.query("convexpress_siteIdentity").withIndex("by_identity_key",q=>q.eq("identityKey","site-identity")).unique());
 if(!site)return null;
 budget.beforeRead();const list=budget.record(await ctx.db.get("mailingLists",listId));
 if(!list||list.status!=="active"||list.websiteKey!==site.websiteKey||list.instanceKey!==site.instanceKey)return null;
 if(!listFieldsSchema.safeParse({name:list.name,description:list.description,consentText:list.consentText,privacyUrl:list.privacyUrl,status:list.status}).success)return null;
 budget.beforeRead();const media=budget.record(await ctx.db.get("media",mediaId));
 // Commerce digital-file IDs and arbitrary remote URLs never enter this path.
 if(!media||media.status!=="active"||!media.storageId)return null;
 if(media.attachedTo){budget.beforeRead();const parent=budget.record(await ctx.db.get("posts",media.attachedTo));if(!parent||!await canDiscoverContent(ctx,parent,budget))return null;}
 budget.beforeRead();const storage=budget.record(await ctx.db.system.get("_storage",media.storageId));
 if(!storage||!Number.isSafeInteger(storage.size)||storage.size<0)return null;
 const revision=authoringRevision(post);
 const fileFingerprint=sha256Hex(canonicalJson([media._id,media.storageId,media.updatedAt,storage.size,storage.sha256,media.fileName,media.mimeType]));
 const security=await loadSecuritySettings(ctx,budget);
 const digest=sha256Hex(canonicalJson({version:1,websiteKey:site.websiteKey,instanceKey:site.instanceKey,deploymentOrigin:site.deploymentOrigin,postId,blockId:node.id,revision,attrs:node.attrs,...(source.sourceChain.length?{sourceChain:source.sourceChain}:{}),fileFingerprint,listId,listRevision:list.revision,consentText:list.consentText,privacyUrl:list.privacyUrl,security:Object.fromEntries(Object.entries(security).map(([key,value])=>[key,value??null]))}));
 const parsed=leadMagnetOfferSchema.safeParse({postId,blockId:node.id,revision,digest,file:{name:media.fileName,bytes:storage.size,mimeType:media.mimeType},audience:{name:list.name,consentText:list.consentText,privacyUrl:list.privacyUrl},security:{honeypotEnabled:security.honeypotEnabled,honeypotFieldName:security.honeypotFieldName,minFillMs:security.minFillMs,maxFormAgeMs:security.maxFormAgeMs,captchaEnabled:security.captchaEnabled,captchaProvider:security.captchaProvider,captchaSiteKey:security.captchaSiteKey??null}});
 if(!parsed.success)return null;
 return {offer:parsed.data,post,tree:source.tree,list,media,site,fileFingerprint,security};
}
