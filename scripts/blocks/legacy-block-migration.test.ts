import {test,expect} from 'bun:test';
import {migrateLegacyBlocks, reviewLegacyBlocks} from '../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/legacyBlockMigration';
import {legacyCompatibility} from '../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/compatibility/legacy_schemas.mjs';
const guide=(attrs:Record<string,unknown>={})=>({id:'guide',name:'reference/field-guide',version:1,attrs});
test('actual legacy defaults and every editorial axis survive as content plus separate treatment',()=>{
  for(let spacing=0;spacing<=8;spacing++)for(const alignment of ['left','center','right'])for(const ink of ['foreground','primary','muted'])for(const font of ['body','display']){
    const before=guide({heading:'Original',body:'Exact\nline',spacing,alignment,ink,font});
    const source=structuredClone(before),after=migrateLegacyBlocks([before])[0];
    expect(before).toEqual(source);
    expect(after.treatment).toEqual({name:'editorial',values:{spacing,alignment,ink,font}});
    expect(after.layout).toEqual({spacing:'none',width:'full'});
    expect(after.attrs.heading).toBe('Original');expect(after.attrs.body).toBe('Exact\nline');expect('spacing' in after.attrs).toBe(false);
  }
  const rendered=legacyCompatibility['reference/field-guide'].renderedSchema.parse({}) as any;
  const after=migrateLegacyBlocks([guide()])[0];expect(after.treatment).toEqual({name:'editorial',values:{spacing:rendered.spacing,alignment:rendered.alignment,ink:rendered.ink,font:rendered.font}});
});
test('unknown fields, unsafe links, wrong versions, active locks and unsupported legacy layout refuse whole conversion',()=>{
  for(const node of [guide({unknown:'retain me'}),guide({link:{label:'Unsafe',href:'javascript:alert(1)',newTab:false}}),{...guide(),version:99},{...guide(),layout:{padding:'large'}},{...guide(),lock:{edit:true}},guide({items:[{title:'Saved',unknown:'retain nested'}]}),{...guide(),innerBlocks:[guide()]}])expect(()=>migrateLegacyBlocks([node])).toThrow();
  expect(()=>migrateLegacyBlocks(Array.from({length:81},(_,i)=>({...guide(),id:`g${i}`})))).toThrow();
});
test('old inline grammar preserves literal markup and canonical marks under actual schema defaults',()=>{
  const result=migrateLegacyBlocks([{id:'heading',name:'core/heading',version:1,attrs:{text:'Literal **stars**',level:2}}]);
  expect(result[0].attrs.text).toEqual({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Literal **stars**'}]}]});
});

test('explicit review preserves inactive settings in a separate receipt without activating layout or locks',()=>{
  const source=[{...guide(),layout:{tone:'contrast',padding:'spacious',container:'full'},lock:{edit:true,move:true,remove:false}}];
  const before=structuredClone(source);
  const review=reviewLegacyBlocks(source);
  expect(review.blocks).toEqual(migrateLegacyBlocks([guide()]));
  expect(review.inactiveSettings).toEqual([{blockId:'guide',name:'reference/field-guide',layout:source[0].layout,lock:source[0].lock}]);
  expect(source).toEqual(before);
  expect(()=>migrateLegacyBlocks(source)).toThrow('explicit intent review');
  for(const changed of [{layout:{padding:'invented'}},{lock:{edit:'yes'}},{lock:{unknown:false}}])
    expect(()=>reviewLegacyBlocks([{...guide(),...changed}])).toThrow();
});

test('legacy Divider and Spacer preserve every original visual choice in a closed treatment',()=>{
  for(const [name,field,values] of [
    ['core/divider','variant',['default','section','subtle']],
    ['core/spacer','size',['small','medium','large','xlarge']],
  ] as const){
    for(const value of values){
      const source={id:'utility',name,version:1,attrs:{[field]:value}};
      const original=structuredClone(source),converted=migrateLegacyBlocks([source])[0];
      expect(source).toEqual(original);
      expect(converted).toEqual({id:'utility',name,version:2,attrs:{},treatment:{name:'original',values:{[field]:value}},layout:{spacing:'none',width:'full'}});
    }
    expect(()=>migrateLegacyBlocks([{id:'utility',name,version:1,attrs:{[field]:'arbitrary-css'}}])).toThrow();
    expect(()=>migrateLegacyBlocks([{id:'utility',name,version:1,attrs:{[field]:values[0],unknown:'keep this'}}])).toThrow();
  }
  expect(migrateLegacyBlocks([{id:'s',name:'core/spacer',version:1,attrs:{}}])[0].treatment).toEqual({name:'original',values:{size:'medium'}});
  expect(migrateLegacyBlocks([{id:'d',name:'core/divider',version:1,attrs:{}}])[0].treatment).toEqual({name:'original',values:{variant:'default'}});
});

test('original Hero alignment and media side survive conversion without inventing new content attrs',()=>{
  for(const [name,axis,values] of [
    ['core/hero-split','mediaSide',['left','right']],
    ['core/hero-text-only','alignment',['left','center']],
  ] as const){
    for(const value of values){
      const source={id:'original-hero',name,version:1,attrs:{title:'Retained original heading',body:'Retained body',primaryCtaLabel:'Read',primaryCtaUrl:'/about',[axis]:value}};
      const before=structuredClone(source), converted=migrateLegacyBlocks([source])[0];
      expect(source).toEqual(before);
      expect(converted.treatment).toEqual({name:'original',values:{[axis]:value}});
      expect(converted.attrs.title).toBe(source.attrs.title);
      expect(converted.attrs.body).toBe(source.attrs.body);
      expect(converted.attrs.primaryCtaUrl).toBe('/about');
      expect(axis in converted.attrs).toBe(false);
      expect(converted.version).toBe(2);
    }
    expect(()=>migrateLegacyBlocks([{id:'bad',name,version:1,attrs:{title:'Keep', [axis]:'arbitrary'}}])).toThrow();
    expect(()=>migrateLegacyBlocks([{id:'bad',name,version:1,attrs:{title:'Keep', unknown:'must not disappear'}}])).toThrow();
  }
  expect(migrateLegacyBlocks([{id:'s',name:'core/hero-split',version:1,attrs:{}}])[0].treatment).toEqual({name:'original',values:{mediaSide:'right'}});
  expect(migrateLegacyBlocks([{id:'t',name:'core/hero-text-only',version:1,attrs:{}}])[0].treatment).toEqual({name:'original',values:{alignment:'center'}});
});

test('original fleet media, commerce columns and newsletter presentation migrate as closed treatments',()=>{
 for(const [name,axis,values,defaultValue] of [
  ['core/media-text','mediaPosition',['left','right'],'right'],
  ['commerce/category-tiles','columns',[2,3,4],3],
  ['commerce/product-showcase','columns',[2,3,4],4],
  ['core/newsletter-signup','variant',['inline','large'],'inline'],
 ] as const){
  for(const value of values){
   const source={id:'original',name,version:1,attrs:{heading:'Retained heading',[axis]:value}};
   const before=structuredClone(source),converted=migrateLegacyBlocks([source])[0];
   expect(source).toEqual(before);expect(converted.attrs.heading).toBe('Retained heading');
   expect(converted.treatment).toEqual({name:'original',values:{[axis]:value}});expect(axis in converted.attrs).toBe(false);
  }
  expect(migrateLegacyBlocks([{id:'default',name,version:1,attrs:{}}])[0].treatment).toEqual({name:'original',values:{[axis]:defaultValue}});
  expect(()=>migrateLegacyBlocks([{id:'bad',name,version:1,attrs:{[axis]:'unknown'}}])).toThrow();
 }
});
