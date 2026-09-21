import {expect,test} from 'bun:test';
import {pageSectionsToBlocks} from '../../ConvexPress-Website/apps/web/src/lib/blocks/page-sections';
import {pageSectionsToBlocks as bundled} from '../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/compatibility/legacy_schemas.mjs';
import {migrateLegacySections} from '../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/legacySectionMigration';
test('bundled section projection is byte-equivalent to actual Website fallback for all seven source kinds with stable IDs',()=>{
 for(const type of ['hero','feature-grid','cta-band','story-split','pricing-cards','testimonial-band','rich-text']){
  const sections=[{id:'original',type,data:{title:'Fallback title',heading:'Chosen heading',content:'Fallback body',body:'Chosen body',items:[],plans:[],testimonials:[]}}];
  expect(bundled(sections)).toEqual(pageSectionsToBlocks(sections as any));
 }
});
test('rich text sections use existing source precedence and preserve literal markdown characters without changing source',()=>{
 const source=[{id:'original',type:'rich-text',data:{heading:'Chosen',title:'Shadow',body:'First **bold**\n\nSecond',content:'Shadow content'}}];
 const before=structuredClone(source),result=migrateLegacySections(source);
 expect(source).toEqual(before);expect(result[0].id).toBe('original');expect(result[0].attrs.heading).toBe('Chosen');
 expect(result[0].attrs.body).toEqual({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'First **bold**'}]},{type:'paragraph',content:[{type:'text',text:'Second'}]}]});
});
test('shell intent, unknown source/rows, unstable IDs and coercions refuse rather than lose authored fields',()=>{
 for(const section of [{id:'a',type:'rich-text',data:{body:'text'},shell:{padding:'large'}},{id:'a',type:'unknown',data:{}},{id:'',type:'rich-text',data:{}},{id:'a',type:'rich-text',data:{mediaId:'ignored'}},{id:'a',type:'feature-grid',data:{items:[{title:'a',unknown:'b'}]}},{id:'a',type:'rich-text',data:{body:12}}])expect(()=>migrateLegacySections([section])).toThrow();
});
