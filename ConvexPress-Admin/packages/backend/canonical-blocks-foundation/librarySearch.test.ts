import {expect,test} from 'bun:test';
import { dependencyDescriptors } from './generated/metadata';
import type { BlockName } from './generated/types';
import {validateCanonicalTree} from './generated/instances';
import {authoredBlockSearchText} from './searchText';
import {currentLibrarySearchText} from './librarySearch';
import type {DataEntry} from './contracts';
const empty={now:Date.parse('2026-09-28T12:00:00Z'),resources:{media:{}}};
function text(name:string,attrs:unknown,extra:Partial<Parameters<typeof currentLibrarySearchText>[1]>={},treatment?:unknown){
 const version=dependencyDescriptors[name as BlockName].version;
 const node=validateCanonicalTree([{id:'sample',name,version,attrs,...(treatment?{treatment}:{})}])[0];return currentLibrarySearchText(node,{...empty,...extra});
}
function data<R extends DataEntry['resolver']>(resolver:R,result:Extract<DataEntry,{resolver:R}>['data']):DataEntry{return {resolver,data:result,blockName:'sample',blockVersion:1,bindingKey:'sample'} as DataEntry;}
test('time boundaries share render semantics and candidate alternatives remain available',()=>{
 const attrs={text:'Seasonal notice',schedule:{startsAt:'2026-09-28T12:00:00Z',endsAt:'2026-09-28T13:00:00Z'}};
 expect(authoredBlockSearchText('core/announcement-bar',attrs)).toBe('Seasonal notice');
 expect(text('core/announcement-bar',attrs)).toBe('Seasonal notice');expect(text('core/announcement-bar',attrs,{now:empty.now-1})).toBe('');expect(text('core/announcement-bar',attrs,{now:empty.now+3600000})).toBe('');
 expect(text('core/countdown',{target:'2026-09-28T12:00:00Z',expiredText:'Open today'})).toBe('Open today');expect(text('core/countdown',{target:'2026-09-28T12:00:00Z',expiredText:'Open today'},{now:empty.now-1})).toBe('');
});
test('media-dependent titles refuse missing, wrong-kind and incomplete selections',()=>{
 const resources={media:{sound:{src:'/a.mp3',alt:'',mimeType:'audio/mpeg'},file:{src:'/a.pdf',alt:'',mimeType:'application/pdf'},image:{src:'/a.png',alt:'',mimeType:'image/png'}}};
 expect(text('core/audio',{title:'A recording'})).toBe('');expect(text('core/audio',{title:'A recording',media:{id:'sound'}},{resources})).toBe('A recording');
 expect(()=>text('core/audio',{title:'Hidden',media:{id:'image'}},{resources})).toThrow();
 expect(text('core/file-download',{title:'A guide',description:'Read this',media:{id:'file'}},{resources})).toBe('A guide Read this');expect(text('core/file-download',{title:'A guide',description:'Read this'})).toBe('');
 expect(text('core/before-after',{beforeLabel:'Earlier',afterLabel:'Later'})).toBe('');expect(()=>text('core/before-after',{before:{id:'image'}},{resources})).toThrow();expect(text('core/before-after',{before:{id:'image'},after:{id:'image'},beforeLabel:'Earlier',afterLabel:'Later'},{resources})).toBe('Earlier Later');
 expect(text('core/logo-cloud',{logos:[{name:'Visible partner'},{name:'Image alternative',mediaId:'image'}]},{resources})).toBe('Visible partner');
});
test('manual cards respect mode, remote selections, per-group bounds and price display',()=>{
 const attrs={eyebrow:'',heading:'Collection',intro:'A [label](https://example.invalid/secret)',count:1,showPrice:false,products:[{title:'First',summary:'A story',price:'Pricehidden',badge:'New'},{title:'Too many'}],groups:[{label:'Group',products:[{title:'Grouped'},{title:'Groupoverflow'}]}]};
 const entry=data('commerce.productCollection',{items:[],groups:[{index:0,items:[]}]});
 expect(text('blocks/product-collection',attrs,{data:entry})).toBe('Collection A label First A story New Grouped');
 expect(text('blocks/product-collection',{...attrs,productIds:['selected']},{data:entry})).toBe('Collection A label Grouped');
 expect(text('blocks/product-collection',{...attrs,mode:'featured',groups:[]},{data:data('commerce.productCollection',{items:[],groups:[]})})).toBe('Collection A label');
 expect(text('blocks/product-collection',{...attrs,showPrice:true},{data:entry})).toContain('Pricehidden');
});
test('current source availability controls authored form, product, bundle and contents headings',()=>{
 expect(text('core/form',{title:'Our form'},{data:data('forms.form',{form:null})})).toBe('');
 expect(text('commerce/product-hero',{title:'Our product'},{data:data('commerce.productCollection',{items:[],groups:[]})})).toBe('');
 expect(text('commerce/bundle-offer',{title:'Our bundle',body:'Special details'},{data:data('commerce.bundle',{bundle:null})})).toBe('');
 expect(text('core/table-of-contents',{title:'Inside',depth:2},{data:data('content.headings',{items:[{label:'Small',anchor:'small',level:3}]})})).toBe('');
 expect(text('core/table-of-contents',{title:'Inside',depth:2},{data:data('content.headings',{items:[{label:'Chapter',anchor:'chapter',level:2}]})})).toBe('Inside');
});
test('iframe candidates include fallback headings, but current copy chooses only the displayed heading',()=>{
 const attrs={title:'Explicit heading',url:{label:'Fallback heading',href:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'}};
 expect(authoredBlockSearchText('core/iframe',attrs)).toBe('Explicit heading Fallback heading');
 expect(text('core/iframe',attrs)).toBe('Explicit heading');expect(text('core/iframe',{...attrs,title:''})).toBe('Fallback heading');
 expect(text('core/iframe',{title:'Unselected heading'})).toBe('');
 expect(()=>text('core/iframe',{...attrs,url:{label:'Invalid',href:'https://example.invalid/frame'}})).toThrow();
});
test('video media kinds and direct sources share renderer refusal without indexing player controls',()=>{
 const resources={media:{movie:{src:'/movie.mp4',alt:'',mimeType:'video/mp4'},image:{src:'/poster.png',alt:'',mimeType:'image/png'}}};
 expect(text('core/video',{title:'Player control',url:{href:'https://example.invalid/movie.mp4',label:'Download'}},{resources})).toBe('');
 expect(()=>text('core/video',{media:{id:'image'}},{resources})).toThrow();
 expect(()=>text('core/video',{url:{href:'https://example.invalid/player',label:'Invalid'}})).toThrow();
 expect(text('core/hero-video',{title:'Editorial heading',video:{id:'movie'},poster:{id:'image'}},{resources})).toBe('Editorial heading');
 expect(()=>text('core/hero-video',{title:'Editorial heading',video:{id:'image'}},{resources})).toThrow();
 expect(()=>text('core/hero-video',{title:'Editorial heading',poster:{id:'movie'}},{resources})).toThrow();
});
