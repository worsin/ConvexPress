import {test,expect} from 'bun:test';
import {renderToStaticMarkup} from 'react-dom/server';
import author from '../../../../../../../blocks/core/author-bio/render';
import {prepareBlocks} from './model';
import {createDemoContentPageHost} from '../block-data/demo-channel';
import {resolveCanonicalDataWithDefinitions} from '../block-data/portable/resolve';
const policy={enabledPlugins:[],capabilities:['reference.targetResolution'],disabledBlocks:[]};
const context={scope:{websiteKey:'author-study',instanceKey:'isolated'},documentKey:'author-page',revision:'1',viewerKey:'anonymous'};
const profile={id:'site-author',name:'Public writer',bio:'Public **biography**',href:'/author/public-writer',image:{src:'/portrait.png',alt:'Public writer'}};
async function markup(attrs:unknown,data:unknown={author:null}){
 const tree=[{id:'bio',name:'core/author-bio',version:2,attrs}],host=createDemoContentPageHost();
 const envelope=await resolveCanonicalDataWithDefinitions(tree,context.scope,policy,{readPage:async()=>null,readAuthor:async()=>data});
 const grant=host.install({tree,context,policy,envelope});
 try{return renderToStaticMarkup(prepareBlocks(tree,{'core/author-bio':author},policy,{media:{photo:{src:'/photo.png',alt:'Authored portrait'}}},{grant,current:context}));}finally{host.invalidate();}
}
test('author bio retains manual content, authored portrait and destinations without a selected account',async()=>{
 expect(await markup({name:'No authored image'})).not.toContain('<img');
 const html=await markup({name:'Fictional Person',role:'Sample editor',bio:'An authored bio',mediaId:'photo',links:[{label:'Read',href:'/journal'}]});
 for(const value of ['Fictional Person','Sample editor','An authored bio','src="/photo.png"','href="/journal"'])expect(html).toContain(value);
});
test('selected author renders its public profile and archive with exact authored overrides',async()=>{
 const html=await markup({userId:'site-author'},{author:profile});
 for(const value of ['Public writer','biography','href="/author/public-writer"','src="/portrait.png"'])expect(html).toContain(value);
 const overridden=await markup({userId:'site-author',name:'Chosen display',bio:'Chosen bio',role:'Guest columnist',mediaId:'photo',links:[{label:'Read notes',href:'/notes'}]},{author:profile});
 for(const value of ['Chosen display','Chosen bio','Guest columnist','src="/photo.png"','href="/notes"'])expect(overridden).toContain(value);
 expect(overridden).not.toContain('src="/portrait.png"');expect(overridden).not.toContain('Public <strong>biography');
});
test('unavailable selected author does not fall back to misleading authored identity and mismatched results are refused',async()=>{
 const html=await markup({userId:'site-author',name:'Withdrawn identity',bio:'Withdrawn biography'});
 expect(html).toContain('Author unavailable.');expect(html).not.toContain('Withdrawn');
 await expect(markup({userId:'another-author'},{author:profile})).rejects.toThrow('another source');
 expect(await markup({userId:'site-author'},{author:{...profile,href:null,image:null}})).not.toContain('<img');
});

test('current author uses only its document-bound host result and preserves authored overrides',async()=>{
 const html=await markup({useCurrentAuthor:true},{author:profile});expect(html).toContain('Public writer');expect(html).toContain('href="/author/public-writer"');
 expect(await markup({useCurrentAuthor:true,name:'Authored current name'},{author:profile})).toContain('Authored current name');
 expect(await markup({useCurrentAuthor:true,name:'Withdrawn name'})).not.toContain('Withdrawn name');
});
