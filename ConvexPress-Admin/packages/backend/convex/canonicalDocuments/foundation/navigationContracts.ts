import {z} from 'zod';
import {renderMediaSchema} from './renderResources';
import {safeLinkSchema} from './generated/field_runtime.mjs';
const empty = z.strictObject({});
const source = z.strictObject({source: z.enum(['auto', 'manual'])});
const anchor = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,100}$/u);
const label = z.string().min(1).max(512);
const path = safeLinkSchema(z, ['relative']).max(2048).regex(/^\/(?!\/)/u);
const childPages = z.strictObject({
  parentLabel: label,
  items: z.array(z.strictObject({
    id: z.string().min(1).max(256), parentId: z.string().min(1).max(256).nullable(),
    label, href: path, depth: z.number().int().min(1).max(4),
  })).max(80),
}).superRefine((value, ctx) => {
  const depths = new Map<string, number>();
  for (const [index, item] of value.items.entries()) {
    if (depths.has(item.id) || item.depth !== (item.parentId === null ? 1 : (depths.get(item.parentId) ?? -2) + 1))
      ctx.addIssue({code: 'custom', path: ['items', index], message: 'Child pages must be unique and follow their visible parent in depth order'});
    depths.set(item.id, item.depth);
  }
});
const menuResult = z.strictObject({
  menu: z.strictObject({id: z.string().min(1).max(256), name: label}).nullable(),
  items: z.array(z.strictObject({
    id: z.string().min(1).max(256), parentId: z.string().min(1).max(256).nullable(),
    depth: z.number().int().min(0).max(5), kind: z.enum(['link','heading','separator']),
    label: z.string().max(512), description: z.string().max(500).nullable(),
    href: safeLinkSchema(z).nullable(), target: z.enum(['_self','_blank']), rel: z.string().max(256).nullable(),
  })).max(500),
}).superRefine((value, ctx) => {
  const depths = new Map<string, number>();
  if (!value.menu && value.items.length) ctx.addIssue({code:'custom',message:'An unassigned menu cannot contain items'});
  for (const [index,item] of value.items.entries()) {
    if (depths.has(item.id) || item.depth !== (item.parentId === null ? 0 : (depths.get(item.parentId) ?? -2)+1))
      ctx.addIssue({code:'custom',path:['items',index],message:'Menu items must be unique and follow their visible parent'});
    if ((item.kind === 'link') !== (item.href !== null)) ctx.addIssue({code:'custom',path:['items',index,'href'],message:'Only links have destinations'});
    if (item.target === '_blank' && (!item.rel?.split(/\s+/).includes('noopener') || !item.rel.split(/\s+/).includes('noreferrer')))
      ctx.addIssue({code:'custom',path:['items',index,'rel'],message:'New-window links require opener protection'});
    depths.set(item.id,item.depth);
  }
});
export const navigationArgsSchemas = {
  'site.viewer': empty,
  'site.menu': z.strictObject({source:z.enum(['location','menu']),location:z.string().max(80),menu:z.string().min(1).max(256).optional()}),
  'content.childPages': z.strictObject({depth: z.number().int().min(1).max(4)}),
  'content.breadcrumbs': source,
  'content.anchors': source,
  'content.headings': empty,
  'site.info': empty,
} as const;
export const navigationResultSchemas = {
  // Closed destinations prevent an authored block or resolver from redirecting
  // an account action to another site. No personal fields enter public page data.
  'site.viewer': z.discriminatedUnion('state', [
    z.strictObject({state:z.literal('signed-out'), href:z.literal('/login?returnTo=%2Fdashboard')}),
    z.strictObject({state:z.literal('signed-in'), href:z.literal('/dashboard')}),
  ]),
  'site.menu': menuResult,
  'content.childPages': childPages,
  'content.breadcrumbs': z.strictObject({
    items: z.array(z.strictObject({label, href: path.nullable(), current: z.boolean()})).max(12),
    currentPath: path.nullable(),
  }),
  'content.anchors': z.strictObject({items: z.array(z.strictObject({label, anchor})).max(80)}),
  'content.headings': z.strictObject({items: z.array(z.strictObject({label, anchor, level: z.number().int().min(1).max(6)})).max(80)}),
  'site.info': z.strictObject({name: z.string().max(512).nullable(), tagline: z.string().max(8192).nullable(), logo: renderMediaSchema.nullable()}),
} as const;
export type NavigationResolver = keyof typeof navigationArgsSchemas;
export type NavigationArgs<N extends NavigationResolver = NavigationResolver> = z.infer<(typeof navigationArgsSchemas)[N]>;
export type NavigationResult<N extends NavigationResolver = NavigationResolver> = z.infer<(typeof navigationResultSchemas)[N]>;
