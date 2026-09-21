import { z } from 'zod';
import { safeLinkSchema } from './generated/field-runtime.mjs';

export const latestPostsArgsSchema = z.object({
  count:z.number().int().min(1).max(24).default(3),
  categorySlug:z.string().max(120).default(''),
  tagSlug:z.string().max(120).default(''),
  showAuthors:z.boolean().default(true),
  showExcerpts:z.boolean().default(true),
}).strict();
export const latestPostsResultSchema = z.object({items:z.array(z.object({
  id:z.string().min(1).max(256), title:z.string().max(512),
  href:safeLinkSchema(z,['relative']).max(2048),
  excerpt:z.string().max(8192).nullable(),
  publishedAt:z.number().int().nonnegative().nullable(),
  author:z.string().max(256).nullable(),
  image:z.object({src:safeLinkSchema(z,['http','https','relative']).max(4096),alt:z.string().max(1000)}).strict().nullable(),
}).strict()).max(24)}).strict().superRefine((value,ctx)=>{
  const ids=new Set<string>();
  let previous=Infinity;
  for(const [index,item] of value.items.entries()) {
    if(ids.has(item.id)) ctx.addIssue({code:'custom',path:['items',index],message:'Duplicate post identity'});
    ids.add(item.id);
    const date=item.publishedAt ?? -1;
    if(date>previous) ctx.addIssue({code:'custom',path:['items',index],message:'Posts must be ordered newest first'});
    previous=date;
  }
});
export type LatestPostsArgs = z.infer<typeof latestPostsArgsSchema>;
export type LatestPostsResult = z.infer<typeof latestPostsResultSchema>;
export function latestPostsMatchArgs(args:LatestPostsArgs, result:LatestPostsResult):boolean {
  return result.items.length <= args.count && result.items.every(item =>
    (args.showAuthors || item.author === null) && (args.showExcerpts || item.excerpt === null));
}
