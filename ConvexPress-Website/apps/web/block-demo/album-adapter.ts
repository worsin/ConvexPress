import { resolveCanonicalData } from "../src/templates/sdk/block-data/portable/resolve";
import type { DataScope, ResolverPolicy } from "../src/templates/sdk/block-data/portable/contracts";
import type { BlockPageRequest } from "../src/templates/sdk/block-data/portable/postGridContracts";
import type { AlbumResult } from "../src/templates/sdk/block-data/portable/albumContracts";
import retreat from "./assets/aster-house-retreat.png";
import mug from "./assets/aster-house-camp-mug.png";
import notebook from "./assets/aster-house-field-notebook.png";
import beans from "./assets/aster-house-sunday-white-beans.png";
const photo=(id:string,src:string,caption:string):AlbumResult["items"][number]=>({id,image:{src:src.startsWith("/")?src:`/${src}`,alt:caption},caption,href:null});
const photos=[photo("retreat",retreat,"A place to pause, surrounded by the quiet of the woods."),photo("mug",mug,"The first cup, before the day begins."),photo("notebook",notebook,"Room for a thought, a sketch, a new direction."),photo("lunch",beans,"A long lunch, with nowhere else to be.")];
export function resolveAlbumDemo(tree:unknown, scope:DataScope, policy:ResolverPolicy, request:BlockPageRequest={}) {
  const parameters:Parameters<typeof resolveCanonicalData>=[tree,scope,policy,async()=>null];
  parameters[7]=request;
  parameters[31]=async args=>{
    if(args.cursor!==null && args.cursor!=="demo-album:second")throw Error("Invalid demonstration album page");
    if(args.album!=="demo-album-coast")return {album:null,items:[],cursor:args.cursor,nextCursor:null};
    return {album:{id:args.album,title:"A slower kind of weekend",slug:"a-slower-weekend",href:"/gallery/a-slower-weekend",description:"Small rituals. Well-made things. A few moments from a weekend spent paying attention.",lightboxEnabled:true,captionsEnabled:true,downloadEnabled:true},items:args.cursor?photos.slice(3):photos.slice(0,3),cursor:args.cursor,nextCursor:args.cursor?null:"demo-album:second"};
  };
  return resolveCanonicalData(...parameters);
}
