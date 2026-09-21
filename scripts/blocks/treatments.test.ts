import {expect,test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {parseBlockSpec} from './schema.mjs';
import {validateCanonicalTree,assertPackTreatments} from '../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated/instances';
import {validateBlockTreatment} from '../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated/schemas';
const values={spacing:4,alignment:'left',ink:'foreground',font:'display'};
const treatment={name:'editorial',values};
const node={id:'guide',name:'reference/field-guide',version:2,attrs:{},treatment};
test('all162 exact composable authored combinations survive generated validation without defaults or stripping',()=>{
  for(let spacing=0;spacing<=8;spacing++)for(const alignment of ['left','center','right'])for(const ink of ['foreground','primary','muted'])for(const font of ['body','display']){
    const selected={name:'editorial',values:{spacing,alignment,ink,font}};
    expect(validateBlockTreatment(node.name,selected)).toEqual(selected);
    expect(validateCanonicalTree([{...node,treatment:selected}])[0].treatment).toEqual(selected);
  }
});
test('partial, unknown, raw CSS and wrong-block treatment refuses; style remains independent',()=>{
  for(const invalid of [{name:'legacy-v1',values},{name:'editorial',values:{}},{name:'editorial',values:{...values,spacing:9}},{name:'editorial',values:{...values,spacing:0.5}},{name:'editorial',values:{...values,alignment:'end'}},{name:'editorial',values:{...values,className:'foo'}},{name:'editorial',values:{...values,ink:'red'}}])expect(()=>validateCanonicalTree([{...node,treatment:invalid}])).toThrow();
  expect(()=>validateCanonicalTree([{...node,name:'core/heading'}])).toThrow();
  expect(validateCanonicalTree([{...node,style:'default'}])[0].style).toBe('default');
  expect(()=>assertPackTreatments(validateCanonicalTree([{id:'section',name:'core/section',version:1,attrs:{},children:[node]}]),'unknown')).toThrow('PACK_TREATMENT_UNAVAILABLE');
});
test('spec rejects unbounded, duplicate or invalid finite axes/defaults',async()=>{
  const spec=JSON.parse(await readFile(new URL('../../blocks/reference/field-guide/block.json',import.meta.url),'utf8'));
  const edits=[(s:any)=>s.treatments.push(s.treatments[0]),(s:any)=>s.treatments[0].axes.push(s.treatments[0].axes[0]),(s:any)=>s.treatments[0].axes[0].max=100,(s:any)=>s.treatments[0].axes[0].default=9,(s:any)=>s.treatments[0].axes[1].default='end',(s:any)=>s.treatments[0].axes[1].options.push('left'),(s:any)=>s.treatments[0].axes[0].type='json'];
  for(const edit of edits){const next=structuredClone(spec);edit(next);expect(()=>parseBlockSpec(next)).toThrow();}
});
