import { expect, test } from 'bun:test';
import { selectedPreviewField } from './customizeSelection';
test('native picking accepts only its current frame, origin and declared field while armed',()=>{
 const frame={} as Window;const event={source:frame,origin:'https://site.example',data:{type:'convexpress:customize:selected',field:'header.search.variant'}} as unknown as MessageEvent;
 const fields=['header.search.variant'];const accept=(next:MessageEvent,picking=true)=>selectedPreviewField(next,frame,'https://site.example',picking,fields);
 expect(accept(event)).toBe(fields[0]);expect(accept(event,false)).toBeNull();expect(accept({...event,source:{}} as MessageEvent)).toBeNull();expect(accept({...event,origin:'https://other.example'} as MessageEvent)).toBeNull();expect(accept({...event,data:{...event.data,field:'unknown.field'}} as MessageEvent)).toBeNull();
});
