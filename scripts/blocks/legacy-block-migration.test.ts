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
