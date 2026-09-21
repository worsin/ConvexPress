import { SiteTimeZoneProvider } from "../../../contexts/SiteTimeZoneContext";
import {test,expect} from 'bun:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import grid from '../../../../../../../blocks/core/post-grid/render';
import {prepareBlocks} from './model';
import {BlockPaginationProvider} from './pagination';
import {createDemoContentPageHost} from '../block-data/demo-channel';
import {resolveCanonicalData} from '../block-data/portable/resolve';
import {canonicalPaginationSearch} from '../block-public/pagination-search';
import {blockPageHref,parseBlockPageSearch} from '../block-data/portable/postGridContracts';
const policy={enabledPlugins:[],capabilities:['reference.targetResolution'],disabledBlocks:[]};
const base={scope:{websiteKey:'fixture',instanceKey:'stage'},documentKey:'doc',revision:'1',viewerKey:'anonymous'};
const card={id:'post',title:'Clay & <script>care</script>',href:'/blog/clay',excerpt:'Notes on **care**.',publishedAt:1788566400000,author:'Studio author',image:{src:'/field.png',alt:'A sunlit field'}};
test('Post Grid renders trusted records and independent real-route pagination, then clears revoked grants',async()=>{
 const tree=['one','two'].map(id=>({id,name:'core/post-grid',version:1,attrs:{query:{category:'category-id',tag:'tag-id',author:'author-id'},limit:1}}));
 const request={one:'position-1',two:'position-4'},current={...base,request};
 const envelope=await resolveCanonicalData(tree,current.scope,policy,async()=>null,undefined,undefined,async args=>({items:[card],cursor:args.cursor,nextCursor:args.cursor+'-next'}),request);
 const host=createDemoContentPageHost(),grant=host.install({tree,context:current,policy,envelope});
 const href='/page/journal?campaign=autumn&blockPages='+encodeURIComponent(JSON.stringify(request))+'#stories';
 const render=()=>renderToStaticMarkup(<BlockPaginationProvider href={href}>{prepareBlocks(tree,{'core/post-grid':grid},policy,{media:{}},{grant,current})}</BlockPaginationProvider>);
 const html=render(),dom=new JSDOM(html),navs=dom.window.document.querySelectorAll('nav');
 expect(navs.length).toBe(2);expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');
 expect(html).toContain('<strong>care</strong>');expect(html).toContain('By Studio author');
 for(const [i,nav] of Array.from(navs).entries()) {
  const links=nav.querySelectorAll('a');expect(links.length).toBe(2);
  const reset=new URL(links[0].href,'https://fixture.invalid'),next=new URL(links[1].href,'https://fixture.invalid');
  expect(next.pathname).toBe('/page/journal');expect(next.hash).toBe('#stories');expect(next.searchParams.get('campaign')).toBe('autumn');
  expect(parseBlockPageSearch(next.searchParams.get('blockPages'))).toEqual(i===0?{one:'position-1-next',two:'position-4'}:{one:'position-1',two:'position-4-next'});
  expect(parseBlockPageSearch(reset.searchParams.get('blockPages'))).toEqual(i===0?{two:'position-4'}:{one:'position-1'});
 }
 host.invalidate();expect(render).toThrow();
});
test('empty grid continuations and completed collections remain distinct, with no invented content',async()=>{
 const tree=[{id:'grid',name:'core/post-grid',version:1,attrs:{showExcerpt:false}}];
 for(const nextCursor of ['older',null]) {
  const current={...base,request:{grid:'current'}};
  const envelope=await resolveCanonicalData(tree,current.scope,policy,async()=>null,undefined,undefined,async()=>({items:[],cursor:'current',nextCursor}),current.request);
  const grant=createDemoContentPageHost().install({tree,context:current,policy,envelope});
  const html=renderToStaticMarkup(prepareBlocks(tree,{'core/post-grid':grid},policy,{media:{}},{grant,current}));
  expect(html).toContain(nextCursor?'Continue to search older posts.':'You’ve reached the end');
  expect(html).toContain('published website');expect(html).not.toContain('<article');expect(html).not.toContain('<img');
 }
});
test('route search handles router-decoded JSON and direct URLs with identical closed validation',()=>{
 const href=blockPageHref('/page/stories?campaign=autumn','grid','cursor');
 const encoded=new URL(href,'https://fixture.invalid').searchParams.get('blockPages');
 expect(canonicalPaginationSearch({blockPages:encoded})).toEqual({blockPages:{grid:'cursor'}});
 expect(canonicalPaginationSearch({blockPages:{grid:'cursor'}})).toEqual({blockPages:{grid:'cursor'}});
 expect(canonicalPaginationSearch({})).toEqual({});
 expect(canonicalPaginationSearch({blockPages:{}})).toEqual({});
 for(const value of [[],{grid:42},{grid:'x'.repeat(4097)},JSON.parse('{"__proto__":"bad"}')]) expect(()=>canonicalPaginationSearch({blockPages:value})).toThrow();
});

test('Post Grid formats the same instant in the configured site zone while preserving its datetime',async()=>{
 const tree=[{id:'grid',name:'core/post-grid',version:1,attrs:{}}],current={...base};
 for(const [timeZone,label] of [['America/Denver','Sep 4, 2026'],['Asia/Tokyo','Sep 5, 2026']]){
  const envelope=await resolveCanonicalData(tree,current.scope,policy,async()=>null,undefined,undefined,async()=>({items:[card],cursor:null,nextCursor:null}));
  const grant=createDemoContentPageHost().install({tree,context:current,policy,envelope});
  const html=renderToStaticMarkup(<SiteTimeZoneProvider timeZone={timeZone}>{prepareBlocks(tree,{'core/post-grid':grid},policy,{media:{}},{grant,current})}</SiteTimeZoneProvider>);
  expect(html).toContain(label);expect(html).toContain('dateTime="2026-09-05T00:00:00.000Z"');
 }
});
