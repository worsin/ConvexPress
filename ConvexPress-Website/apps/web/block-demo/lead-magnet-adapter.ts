import {resolveCanonicalData} from "../src/templates/sdk/block-data/portable/resolve";
import type {LeadMagnetOffer} from "../src/templates/sdk/block-data/portable/leadMagnetContracts";
export const sampleGuide="FIELD NOTES\nA small guide to noticing more.\n\n1. Find a place you pass every day. Sit there for ten minutes.\n2. Record five textures, three sounds and one changing shadow.\n3. Draw something without naming it.\n4. Return tomorrow. Write down what changed.\n\nConvexPress BlockDemo — original sample guide.\n";
export async function resolveLeadMagnetDemo(
 tree:Parameters<typeof resolveCanonicalData>[0],
 scope:Parameters<typeof resolveCanonicalData>[1],
 policy:Parameters<typeof resolveCanonicalData>[2],
 scenario="ready",
){
 const params:Parameters<typeof resolveCanonicalData>=[tree,scope,policy,async()=>null];
 params[42]=async args=>{
  const offer:LeadMagnetOffer={postId:"demo-page",blockId:args.blockId,revision:1,digest:"a".repeat(64),file:{name:"field-notes.txt",bytes:new TextEncoder().encode(sampleGuide).length,mimeType:"text/plain"},audience:{name:"Field Notes",consentText:"I would also like occasional studio notes and new reading recommendations. I can unsubscribe at any time.",privacyUrl:"#demo-privacy"},security:{honeypotEnabled:true,honeypotFieldName:"website_url",minFillMs:0,maxFormAgeMs:86400000,captchaEnabled:false,captchaProvider:"none",captchaSiteKey:null}};
  return {blockId:args.blockId,offer:scenario==="unavailable"?null:offer};
 };
 return resolveCanonicalData(...params);
}
