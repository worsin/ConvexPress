/** Trusted current-document navigation adapters. Not registered endpoints. */
import {createPublicMenuReader} from '../menus/queries';
import {getCurrentUser} from '../helpers/permissions';
import type {PublicMenuItem} from '../menus/publicContract';
import type {Doc} from '../_generated/dataModel';
import type {QueryCtx} from '../_generated/server';
import {canDiscoverContent,createContentDiscoveryEvaluator} from '../helpers/publicContent';
import {RequestReadLedger} from '../helpers/requestReadLedger';
import {getDefaults} from '../settings/defaults';
import {SourceByteLedger} from './sourceBudget';
import {CanonicalDataError} from './foundation/contracts';
import {navigationTreeIndex} from './foundation/navigationTree';
import {createComposedRegistry} from './foundation/composedRegistry';
import type {ComposedDataContext} from './foundation/planner';
import {navigationArgsSchemas, navigationResultSchemas, type NavigationResolver, type NavigationResult} from './foundation/navigationContracts';

type CurrentDocument = Pick<Doc<'posts'>, '_id'|'type'|'title'|'slug'|'path'|'parentId'>;
export interface NavigationSource {document: CurrentDocument; tree: unknown; authoringTree?: unknown}
function href(document: CurrentDocument) {
  return document.type === 'page' ? `/page${document.path ?? `/${document.slug}`}` : `/blog/${document.slug}`;
}
function text(value: unknown): string | null {return typeof value === 'string' && value.trim() ? value : null;}
/** Caller supplies only the exact document already authorized by canonical get/
 * public get or write validation, including prepared title/tree for an unsaved write. */
export function createNavigationReader(ctx: QueryCtx, source: NavigationSource, budget = new RequestReadLedger(), sources = new SourceByteLedger(), composed?: ComposedDataContext) {
  const currentPath = href(source.document);
  const readMenu = createPublicMenuReader(ctx, budget, sources);
  // Build navigation only when requested. Site identity/menu/viewer reads do not
  // need an anchor index and must not reject an otherwise valid custom page.
  const libraryIndex = composed ? undefined : navigationTreeIndex(source.tree);
  const index = () => libraryIndex ?? navigationTreeIndex(source.tree, composed ? {registry:createComposedRegistry(composed.definitions,composed.scope)} : undefined);
  return async (resolver: NavigationResolver, rawArgs: unknown): Promise<NavigationResult> => {
    const args = navigationArgsSchemas[resolver].parse(rawArgs);
    if (resolver === 'site.viewer') {
      const user = await getCurrentUser(ctx, budget);
      return user?.status === 'active'
        ? {state:'signed-in', href:'/dashboard'}
        : {state:'signed-out', href:'/login?returnTo=%2Fdashboard'};
    }
    if (resolver === 'site.menu' && 'source' in args && 'location' in args) {
      const menu = args.source === 'menu' && !args.menu ? null : await readMenu(args.source === 'menu' ? {menuId:args.menu!} : {locationSlug:args.location});
      const items: NavigationResult<'site.menu'>['items'] = [];
      const visit = (nodes: PublicMenuItem[]) => { for (const item of nodes) {
        items.push({id:item._id,parentId:item.parentItemId ?? null,depth:item.depth,
          kind:item.itemType === 'heading' || item.url === '#' ? 'heading' : item.itemType === 'separator' ? 'separator' : 'link',
          label:item.label,description:item.description ?? null,href:item.url === '#' ? null : item.url ?? null,target:item.target ?? '_self',rel:item.linkRel ?? null});
        visit(item.children);
      }};
      if(menu)visit(menu.items);
      return navigationResultSchemas['site.menu'].parse({menu:menu?{id:menu.menu._id,name:menu.menu.name}:null,items});
    }
    if (resolver === 'content.childPages' && 'depth' in args) {
      const discover = createContentDiscoveryEvaluator(ctx, budget);
      const items: NavigationResult<'content.childPages'>['items'] = [];
      const seen = new Set<string>([source.document._id]);
      let scanned = 0;
      const visit = async (parent: CurrentDocument, depth: number): Promise<void> => {
        const iterator = ctx.db.query('posts').withIndex('by_parent', q => q.eq('parentId', parent._id))[Symbol.asyncIterator]();
        try {
          let finished = false;
          while (!finished) {
            const batch: Doc<'posts'>[] = [];
            // Account each full source before reading another. Only policy
            // lookups are batched; hidden parents never load descendants.
            while (batch.length < 16) {
              sources.beforeRead(); budget.beforeRead();
              const next = await iterator.next();
              if (next.done) { finished = true; break; }
              const child = budget.record(next.value); sources.record('post', child);
              if (++scanned > 80) throw new CanonicalDataError('CHILD_PAGE_BUDGET', 'childPages', 'The child-page directory exceeds its 80-source limit.');
              if (seen.has(child._id)) throw new CanonicalDataError('CHILD_PAGE_CYCLE', 'childPages', 'Page hierarchy contains a cycle.');
              seen.add(child._id);
              batch.push(child);
            }
            await discover.preload(batch);
            for (const child of batch) {
              if (child.type !== 'page' || !(await discover(child))) continue;
              items.push({id: child._id, parentId: depth === 1 ? null : parent._id, label: child.title, href: href(child), depth});
              if (depth < args.depth) await visit(child, depth + 1);
            }
          }
        } finally { await iterator.return?.(); }
      };
      if (source.document.type === 'page') await visit(source.document, 1);
      return navigationResultSchemas[resolver].parse({parentLabel: source.document.title, items});
    }
    if (resolver === 'content.headings') return navigationResultSchemas[resolver].parse({items: index().headings});
    if (resolver === 'content.anchors') return navigationResultSchemas[resolver].parse({items: index().anchors});
    if (resolver === 'content.breadcrumbs') {
      if ('source' in args && args.source === 'manual') return {items: [], currentPath};
      const items: NavigationResult<'content.breadcrumbs'>['items'] = [];
      const seen = new Set<string>([source.document._id]);
      let parentId = source.document.type === 'page' ? source.document.parentId : undefined;
      for (let count = 0; parentId; count++) {
        if (count >= 10 || seen.has(parentId)) throw new CanonicalDataError('ANCESTOR_BUDGET','breadcrumbs','Page ancestry exceeds ten levels or contains a cycle.');
        seen.add(parentId);
        sources.beforeRead(); budget.beforeRead();
        const parent = budget.record(await ctx.db.get('posts', parentId));
        if (parent) sources.record('post', parent);
        // Stop, rather than skip over, a hidden ancestor. Neither its title/link
        // nor the relationship to ancestors above it belongs in public output.
        if (!parent || parent.type !== 'page' || !(await canDiscoverContent(ctx, parent, budget))) break;
        items.unshift({label: parent.title, href: href(parent), current: false});
        parentId = parent.parentId;
      }
      items.push({label: source.document.title, href: currentPath, current: true});
      return navigationResultSchemas[resolver].parse({items, currentPath});
    }
    budget.beforeRead();
    const settings = budget.record(await ctx.db.query('settings').withIndex('by_section', q => q.eq('section','general')).unique());
    const raw = settings?.values;
    const values = {...getDefaults('general'), ...(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {})};
    // Match the existing public site identity's source, not private settings,
    // integration credentials, or an arbitrary resource chosen by the block.
    const name = text(values.siteTitle), tagline = text(values.tagline), logo = text(values.logoUrl);
    const result = navigationResultSchemas['site.info'].safeParse({name, tagline, logo: logo ? {src: logo, alt: name ?? ''} : null});
    if (!result.success) throw new CanonicalDataError('INVALID_PUBLIC_SITE_INFO','site.info','Public site identity contains an unsupported logo URL or exceeds its content limits.');
    return result.data;
  };
}
