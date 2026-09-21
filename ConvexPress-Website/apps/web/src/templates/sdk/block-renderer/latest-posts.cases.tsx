import { SiteTimeZoneProvider } from "../../../contexts/SiteTimeZoneContext";
import {test,expect} from 'bun:test';
import {renderToStaticMarkup} from 'react-dom/server';
import latest from '../../../../../../../blocks/core/latest-posts/render';
import {prepareBlocks} from './model';
import {createDemoContentPageHost} from '../block-data/demo-channel';
import {resolveCanonicalData} from '../block-data/portable/resolve';
const policy={enabledPlugins:[],capabilities:[],disabledBlocks:[]};
const current={scope:{websiteKey:'fixture',instanceKey:'stage'},documentKey:'doc',revision:'1',viewerKey:'anonymous'};
const card={id:'real-id',title:'Clay & <script>care</script>',href:'/blog/clay',excerpt:'Notes on **care**.',publishedAt:1788566400000,author:'Studio author',image:{src:'/field.png',alt:'A sunlit field'}};
test('latest-posts rendering uses the installed envelope, preserves content and clears revoked data',async()=>{
 const tree=[{id:'latest',name:'core/latest-posts',version:2,attrs:{heading:'From the journal'}}];
 const registry={'core/latest-posts':latest};
 expect(()=>prepareBlocks(tree,registry,policy)).toThrow('no authorized');
 const envelope=await resolveCanonicalData(tree,current.scope,policy,async()=>null,undefined,async()=>({items:[card]}));
 const host=createDemoContentPageHost(),grant=host.install({tree,context:current,policy,envelope});
 const render=()=>renderToStaticMarkup(prepareBlocks(tree,registry,policy,{media:{}},{grant,current}));
 const html=render();
 for(const value of ['From the journal','href="/blog/clay"','src="/field.png"','A sunlit field','By Studio author','<strong>care</strong>','<time dateTime="2026-09-05T00:00:00.000Z"']) expect(html).toContain(value);
 expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');
 host.invalidate();expect(render).toThrow();
});
test('latest-posts empty and optional metadata states remain readable without fabricated images or authors',async()=>{
 const tree=[{id:'latest',name:'core/latest-posts',version:2,attrs:{showAuthors:false,showExcerpts:false,count:1}}];
 for(const items of [[],[{...card,author:null,excerpt:null,image:null,publishedAt:null}]]) {
  const envelope=await resolveCanonicalData(tree,current.scope,policy,async()=>null,undefined,async()=>({items}));
  const grant=createDemoContentPageHost().install({tree,context:current,policy,envelope});
  const html=renderToStaticMarkup(prepareBlocks(tree,{'core/latest-posts':latest},policy,{media:{}},{grant,current}));
  expect(html).not.toContain('<img');expect(html).not.toContain('<time');expect(html).not.toContain('Studio author');expect(html).not.toContain('Notes on');
  if(!items.length) expect(html).toContain('No posts to show yet.');
 }
});

test('latest-posts labels follow the authoritative site zone with stable machine timestamps',async()=>{
 const tree=[{id:'latest',name:'core/latest-posts',version:2,attrs:{}}];
 for(const [timeZone,label] of [['America/Denver','Sep 4, 2026'],['Asia/Tokyo','Sep 5, 2026']]){
  const envelope=await resolveCanonicalData(tree,current.scope,policy,async()=>null,undefined,async()=>({items:[card]}));
  const grant=createDemoContentPageHost().install({tree,context:current,policy,envelope});
  const html=renderToStaticMarkup(<SiteTimeZoneProvider timeZone={timeZone}>{prepareBlocks(tree,{'core/latest-posts':latest},policy,{media:{}},{grant,current})}</SiteTimeZoneProvider>);
  expect(html).toContain(label);expect(html).toContain('dateTime="2026-09-05T00:00:00.000Z"');
 }
});
