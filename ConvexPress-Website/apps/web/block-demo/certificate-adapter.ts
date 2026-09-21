import {resolveCanonicalData} from '../src/templates/sdk/block-data/portable/resolve';
import type {DataScope,ResolverPolicy} from '../src/templates/sdk/block-data/portable/contracts';
export function resolveCertificateDemo(tree:unknown,scope:DataScope,policy:ResolverPolicy){
 const args:Parameters<typeof resolveCanonicalData>=[tree,scope,policy,async()=>null];
 args[25]=async()=>({available:true});
 return resolveCanonicalData(...args);
}
export async function verifyDemoCertificate(serial:string){
 if(serial==='CERT-DEMO-UNAVAILABLE')return {state:'unavailable'};
 if(serial!=='CERT-DEMO-2026')return {state:'unverified'};
 return {state:'valid',serial,holderName:'Alex Morgan',courseTitle:'A practice of observation',certificateTitle:'Certificate of Completion',issuedAt:Date.UTC(2026,8,1),pdfUrl:null};
}
