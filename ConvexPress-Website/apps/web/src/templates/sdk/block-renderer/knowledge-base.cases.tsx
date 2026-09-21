import {test,expect} from 'bun:test';
import {renderToStaticMarkup} from 'react-dom/server';
import block from '../../../../../../../blocks/support/kb-search/render';
import {prepareBlocks,type BlockInstance} from './model';
import {resolveKnowledgeBaseDemo} from '../../../../block-demo/knowledge-base-adapter';
import {createDemoContentPageHost} from '../block-data/demo-channel';
import {validateCanonicalData} from '../block-data/portable/resolve';
const scope={websiteKey:'help',instanceKey:'staging'},policy={enabledPlugins:['knowledgeBase'],capabilities:['reference.targetResolution'],disabledBlocks:[]};
async function fixture(category?:string){
 const tree:BlockInstance[]=[{id:'help',name:'support/kb-search',version:1,attrs:{placeholder:'Search the help library',...(category?{category}:{})}}],current={scope,documentKey:'help-page',revision:'1',viewerKey:'public'};
 const envelope=await resolveKnowledgeBaseDemo(tree,scope,policy),host=createDemoContentPageHost(),grant=host.install({tree,context:current,policy,envelope});
 return {tree,envelope,host,render:()=>renderToStaticMarkup(prepareBlocks(tree,{'support/kb-search':block},policy,{media:{}},{grant,current}))};
}
test('knowledge search uses a labelled native GET form and binds the selected category to its real public slug',async()=>{
 const f=await fixture('demo-help-start'),html=f.render();expect(html).toContain('action="/help/search"');expect(html).toContain('method="get"');expect(html).toContain('name="q"');expect(html).toContain('name="category" value="getting-started"');expect(html).toContain('Search Getting started');expect(html).toContain('href="/help/getting-started/guide-0"');expect(html).not.toContain('demo-help-start');f.host.invalidate();expect(()=>f.render()).toThrow();
 const all=(await fixture()).render();expect(all).not.toContain('name="category"');expect(all).toContain('Search help articles');
});
test('missing categories do not silently turn into all-category search or expose invented results',async()=>{
 const html=(await fixture('not-a-published-category')).render();expect(html).toContain('Help search is not available here right now.');expect(html).not.toContain('<form');expect(html).not.toContain('guide-0');
});
test('knowledge results reject another selected category, arbitrary destinations and extra body fields',async()=>{
 const f=await fixture('demo-help-start'),entry=f.envelope.dataByBlock.help;if(entry.resolver!=='support.search'||!entry.data.category)throw Error('Wrong fixture');
 entry.data.category.id='foreign';expect(()=>validateCanonicalData(f.tree,scope,policy,f.envelope)).toThrow();entry.data.category.id='demo-help-start';
 entry.data.articles[0].href='https://foreign.invalid';expect(()=>validateCanonicalData(f.tree,scope,policy,f.envelope)).toThrow();entry.data.articles[0].href='/help/getting-started/guide-0';
 Object.assign(entry.data.articles[0],{content:'PRIVATE'});expect(()=>validateCanonicalData(f.tree,scope,policy,f.envelope)).toThrow();
});
