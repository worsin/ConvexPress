import {expect,test} from 'bun:test';
import {publicDocumentHref,publicMenuDocumentHref} from '../publicDocumentHref';
test('canonical destinations preserve nested stored paths and encode a missing-path slug once',()=>{
 for(const [address,expected]of [
  [{type:'page',slug:'child',path:'/parent/child'},'/page/parent/child'],
  [{type:'page',slug:'guide été'},'/page/guide%20%C3%A9t%C3%A9'],
  [{type:'post',slug:'guide été'},'/blog/guide%20%C3%A9t%C3%A9'],
  [{type:'page',slug:'safe',path:'//outside.invalid'},'/page/safe'],
  [{type:'page',slug:'safe',path:'/bad\\path'},'/page/safe'],
 ] as const){expect(publicDocumentHref(address)).toBe(expected);expect(publicMenuDocumentHref(address)).toBe(expected);}
});
test('legacy menu root and already-served destinations remain explicit compatibility cases',()=>{
 expect(publicMenuDocumentHref({type:'page',slug:'home',path:'/'})).toBe('/');
 expect(publicMenuDocumentHref({type:'page',slug:'nested',path:'/page/nested'})).toBe('/page/nested');
 expect(publicMenuDocumentHref({type:'page',slug:'child',path:'parent/child'})).toBe('/page/parent/child');
});
