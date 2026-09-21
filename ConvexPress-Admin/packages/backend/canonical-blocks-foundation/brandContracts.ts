import { z } from "zod";
import { safeLinkSchema } from "./generated/field-runtime.mjs";

export const brandArgsSchema = z.strictObject({ limit: z.number().int().min(1).max(48).default(12) });
export const publicBrandSchema = z.strictObject({
  id: z.string().min(1).max(256), name: z.string().min(1).max(160),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  description: z.string().max(3000), href: safeLinkSchema(z, ["relative"]).max(256),
  logo: z.strictObject({ src: safeLinkSchema(z, ["http", "https", "relative"]).max(4096), alt: z.string().max(1000) }).nullable(),
});
export const brandResultSchema = z.strictObject({items:z.array(publicBrandSchema).max(48)}).superRefine((data,ctx)=>{
  const ids=new Set<string>();
  for(const [index,item] of data.items.entries()) {
    if(ids.has(item.id)) ctx.addIssue({code:"custom",path:["items",index],message:"Duplicate brand identity"});
    ids.add(item.id);
    if(item.href !== `/brands/${item.slug}`) ctx.addIssue({code:"custom",path:["items",index,"href"],message:"Brand link must match its canonical slug"});
  }
});
export type BrandArgs=z.infer<typeof brandArgsSchema>;
export type PublicBrand=z.infer<typeof publicBrandSchema>;
export type BrandResult=z.infer<typeof brandResultSchema>;
export function brandsMatchArgs(args:BrandArgs,result:BrandResult):boolean {return result.items.length <= args.limit;}
