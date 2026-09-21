import {resolveCanonicalData} from "../src/templates/sdk/block-data/portable/resolve";
import type {DataScope,ResolverPolicy} from "../src/templates/sdk/block-data/portable/contracts";
import type {BlockPageRequest} from "../src/templates/sdk/block-data/portable/postGridContracts";
import {archiveHref} from "../src/templates/sdk/block-data/portable/archiveContracts";
export function resolveArchiveDemo(tree:unknown,scope:DataScope,policy:ResolverPolicy,request:BlockPageRequest={}){
 const parameters:Parameters<typeof resolveCanonicalData>=[tree,scope,policy,async()=>null];parameters[7]=request;
 parameters[33]=async args=>{
  const offset=args.cursor?Number(args.cursor.replace("demo-archive:","")):0;
  if(!Number.isInteger(offset)||offset<0||offset>=15||args.cursor&&args.cursor!==`demo-archive:${offset}`)throw Error("Invalid archive demonstration page");
  const all=Array.from({length:15},(_,i)=>{const date=new Date(Date.UTC(2026,8-i,1)),year=args.groupBy==="month"?date.getUTCFullYear():2026-i,month=args.groupBy==="month"?date.getUTCMonth()+1:null;return {year,month,href:archiveHref(year,month)};});
  const items=all.slice(offset,offset+Math.min(args.limit,6));return {groupBy:args.groupBy,timeZone:"America/Denver",items,cursor:args.cursor,nextCursor:offset+items.length<all.length?`demo-archive:${offset+items.length}`:null};
 };return resolveCanonicalData(...parameters);
}
