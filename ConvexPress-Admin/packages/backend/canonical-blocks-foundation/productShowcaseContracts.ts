import { z } from "zod";
import { productCollectionCardSchema } from "./productCollectionContracts";
export const productShowcaseArgsSchema = z.strictObject({
 source:z.enum(["newest","category","sale","slugs"]).default("newest"),
 categorySlug:z.string().max(160).default(""), productSlugs:z.array(z.string().max(160)).max(24).default([]),
 count:z.number().int().min(1).max(24).default(4), showAddToCart:z.boolean().default(true),
}).superRefine((args,ctx)=>{if(args.source==="category"&&!args.categorySlug.trim())ctx.addIssue({code:"custom",path:["categorySlug"],message:"Choose a product category."});});
export const productShowcaseCardSchema=productCollectionCardSchema.extend({slug:z.string().min(1).max(256),stock:z.enum(["instock","outofstock","onbackorder","options","external"])});
export const productShowcaseResultSchema=z.strictObject({items:z.array(productShowcaseCardSchema).max(24)}).superRefine((result,ctx)=>{
 const ids=new Set<string>(),slugs=new Set<string>();
 for(const [i,item] of result.items.entries()){
  if(ids.has(item.id)||slugs.has(item.slug)||item.href!==`/products/${encodeURIComponent(item.slug)}`)ctx.addIssue({code:"custom",path:["items",i],message:"Product identities and links must be distinct and consistent."});
  if ((item.stock === "outofstock" || item.stock === "external") && item.cart !== null || item.stock === "options" && item.cart?.kind === "add" || item.stock !== "options" && item.cart?.kind === "chooseOptions") ctx.addIssue({code:"custom",path:["items",i,"cart"],message:"Purchase action must match availability."});
  ids.add(item.id);slugs.add(item.slug);
 }
});
export type ProductShowcaseArgs=z.infer<typeof productShowcaseArgsSchema>;
export type ProductShowcaseResult=z.infer<typeof productShowcaseResultSchema>;
export function productShowcaseMatchArgs(args:ProductShowcaseArgs,result:ProductShowcaseResult):boolean {
 if(result.items.length>args.count)return false;
 const selected=[...new Set(args.productSlugs)];let previous=-1;
 for(const [i,item] of result.items.entries()){
  if(item.rating!==null||item.pricing===null||(!args.showAddToCart&&item.cart!==null))return false;
  if(args.source==="slugs"){const index=selected.indexOf(item.slug);if(index<=previous)return false;previous=index;}
  if(args.source==="newest"&&i>0&&item.createdAt>result.items[i-1]!.createdAt)return false;
 }
 return true;
}
