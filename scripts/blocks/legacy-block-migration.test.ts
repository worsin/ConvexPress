import {test,expect} from 'bun:test';
import {migrateLegacyBlocks} from '../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/legacyBlockMigration';
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
