/** Service-only reader; the authorized canonical endpoint supplies its policy. */
import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { canDiscoverContent } from '../helpers/publicContent';
import { publicAuthorProfile } from '../helpers/publicAuthor';
import { RequestReadLedger } from '../helpers/requestReadLedger';
import { SourceByteLedger } from './sourceBudget';
import { CanonicalDataError } from './foundation/contracts';
import { latestPostsArgsSchema, latestPostsResultSchema, type LatestPostsResult } from './foundation/postContracts';

export async function readLatestPosts(ctx:QueryCtx, rawArgs:unknown, budget=new RequestReadLedger(), sources=new SourceByteLedger()):Promise<LatestPostsResult> {
  const args=latestPostsArgsSchema.parse(rawArgs);
  const selected:Id<'terms'>[]=[];
  for(const [taxonomy,slug] of [['category',args.categorySlug],['post_tag',args.tagSlug]] as const) {
    if(!slug) continue;
    budget.beforeRead();
    const term=budget.record(await ctx.db.query('terms').withIndex('by_slug_taxonomy',q=>q.eq('slug',slug).eq('taxonomy',taxonomy)).unique());
    if(!term) return {items:[]};
    selected.push(term._id);
  }
  const authors=new Map<Id<'users'>,string|null>();
  const images=new Map<Id<'media'>,LatestPostsResult['items'][number]['image']>();
  const items:LatestPostsResult['items']=[];
  const iterator=ctx.db.query('posts').withIndex('by_type_status_published',q=>q.eq('type','post').eq('status','publish').lte('publishedAt',Date.now())).order('desc')[Symbol.asyncIterator]();
  let scanned=0;
  try {
    while(items.length<args.count) {
      // Account each full source before fetching another, including rejected cards.
      sources.beforeRead(); budget.beforeRead();
      const next=await iterator.next(); if(next.done) break;
      const post=budget.record(next.value); sources.record('post',post);
      if(++scanned>160) throw new CanonicalDataError('POST_DISCOVERY_BUDGET','latestPosts','Post discovery exceeds its bounded source scan; no partial list is returned.');
      if(post.visibility!=='public') continue;
      let matches=true;
      for(const termId of selected) {
        budget.beforeRead();
        if(!budget.record(await ctx.db.query('termRelationships').withIndex('by_post_term',q=>q.eq('postId',post._id).eq('termId',termId)).unique())) {matches=false;break;}
      }
      if(!matches || !(await canDiscoverContent(ctx,post,budget))) continue;
      let author:string|null=null;
      if(args.showAuthors) {
        if(!authors.has(post.authorId)) {
          budget.beforeRead(); const user=budget.record(await ctx.db.get('users',post.authorId));
          authors.set(post.authorId,publicAuthorProfile(user)?.displayName ?? null);
        }
        author=authors.get(post.authorId) ?? null;
      }
      let image:LatestPostsResult['items'][number]['image']=null;
      if(post.featuredImageId) {
        if(!images.has(post.featuredImageId)) {
          sources.beforeRead(); budget.beforeRead();
          const media=budget.record(await ctx.db.get('media',post.featuredImageId));
          if(media) sources.record('media',media);
          let src:string|null|undefined=null;
          if(media && media.status==='active' && media.mediaType==='image' && media.mimeType.startsWith('image/')) {
            if(media.storageId) {budget.beforeRead();src=await ctx.storage.getUrl(media.storageId);}
            src??=media.url;
          }
          images.set(post.featuredImageId,src?{src,alt:media?.altText ?? ''}:null);
        }
        image=images.get(post.featuredImageId) ?? null;
      }
      items.push({id:post._id,title:post.title,href:`/blog/${encodeURIComponent(post.slug)}`,excerpt:args.showExcerpts?post.excerpt ?? null:null,publishedAt:post.publishedAt ?? null,author,image});
    }
  } finally { await iterator.return?.(); }
  return latestPostsResultSchema.parse({items});
}
