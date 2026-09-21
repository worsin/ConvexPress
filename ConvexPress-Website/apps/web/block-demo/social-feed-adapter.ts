import {resolveCanonicalData} from "../src/templates/sdk/block-data/portable/resolve";
import {socialAccount,type SocialFeedResult} from "../src/templates/sdk/block-data/portable/socialFeedContracts";
export async function resolveSocialFeedDemo(tree:Parameters<typeof resolveCanonicalData>[0],scope:Parameters<typeof resolveCanonicalData>[1],policy:Parameters<typeof resolveCanonicalData>[2],scenario="ready"){
 const params:Parameters<typeof resolveCanonicalData>=[tree,scope,policy,async()=>null];
 params[43]=async args=>{
  const account=socialAccount(args.provider,args.handle);
  const missing:SocialFeedResult={provider:args.provider,handle:args.handle,status:"unavailable",profile:null,items:[],refreshedAt:null,expiresAt:null};
  if(!account||scenario==="unavailable")return missing;
  const profileUrl=args.provider==="mastodon"?`https://${account.host}/@${account.username}`:`https://www.instagram.com/${account.username}/`;
  const now=Date.now();
  const notes=["A table set for making. This morning’s work began with a handful of clay, an open window, and no particular plan. Some days, that is enough.","The quiet details are the ones we keep coming back to. A soft edge. A glaze that catches the afternoon light. Something useful, made slowly.","Doors open, sleeves rolled. Thank you to everyone who joined us around the workshop table this weekend. More shared afternoons to come."];
  return {provider:args.provider,handle:args.handle,status:"ready",profile:{handle:account.handle,name:"Fieldwork Studio",url:profileUrl},items:scenario==="empty"?[]:notes.slice(0,args.limit).map((text,i)=>({id:String(i+1),url:args.provider==="mastodon"?`${profileUrl}/${i+1}`:`https://www.instagram.com/p/demo${i+1}/`,text,publishedAt:1789344000000-i*86400000,image:{url:`https://media.example.com/social-demo-${i+1}.png`,alt:["Handmade ceramic pieces in the studio","A sculptural vase in soft light","A shared table in a ceramics workshop"][i]!,width:1024,height:1024}})),refreshedAt:now,expiresAt:now+900000} satisfies SocialFeedResult;
 };
 return resolveCanonicalData(...params);
}
