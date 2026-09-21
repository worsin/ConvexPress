import {z} from "zod";
import {defaultStringifySearch} from "@tanstack/react-router";
import {dateArchiveResultSchema,archiveYearSchema,archiveMonthSchema} from "@/templates/sdk/block-data/portable/archiveContracts";
export type DateArchiveResult=z.infer<typeof dateArchiveResultSchema>|null;
export interface DateArchiveBinding{instanceKey:string;year?:number;month?:number;cursor?:string;viewerSubject:string|null}
export function readDateArchive(raw:unknown,binding:DateArchiveBinding):DateArchiveResult{
 const value=raw===null?null:dateArchiveResultSchema.parse(raw);
 if(value&&(value.scope.instanceKey!==binding.instanceKey||value.year!==(binding.year??null)||value.month!==(binding.month??null)||value.cursor!==(binding.cursor??null)||value.viewerSubject!==binding.viewerSubject))throw Error("The archive belongs to another view");return value;
}
export function dateArchiveSearch(search:Record<string,unknown>):{year?:number;month?:number;cursor?:string}{
 const year=search.year===undefined?undefined:archiveYearSchema.parse(Number(search.year));
 const month=search.month===undefined?undefined:archiveMonthSchema.parse(Number(search.month));
 if(month!==undefined&&year===undefined)throw Error("A month requires a year");
 const cursor=search.cursor===undefined?undefined:z.string().min(1).max(4096).parse(search.cursor);
 return {...(year!==undefined?{year}:{}),...(month!==undefined?{month}:{}),...(cursor?{cursor}:{})};
}
export function dateArchiveHref(year:number|null,month:number|null,cursor:string|null=null){return "/archive"+defaultStringifySearch({...year!==null?{year}:{},...month!==null?{month}:{},...cursor?{cursor}:{}});}
