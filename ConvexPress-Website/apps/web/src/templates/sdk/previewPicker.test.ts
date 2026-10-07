import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { installPreviewPicker } from './previewPicker';

test('preview picking requires a validated parent draft and exact parent origin, suppresses actions and cancels', () => {
 const dom=new JSDOM('<a href="/away" data-customize="header.cta.label"><span>Read more</span></a>',{url:'https://site.example/?customize=preview'});
 const host=dom.window as unknown as Window;const sent:any[]=[];const parent={postMessage:(data:any,origin:string)=>sent.push({data,origin})};Object.defineProperty(host,'parent',{value:parent});
 const dispose=installPreviewPicker(host,true);const message=(source:any,origin:string,data:any)=>host.dispatchEvent(new dom.window.MessageEvent('message',{source,origin,data}));
 const command={type:'convexpress:customize:pick',enabled:true};const draft={type:'convexpress:customize',packId:'core',values:{},variants:{}};
 const click=()=>{const e=new dom.window.MouseEvent('click',{bubbles:true,cancelable:true});host.document.querySelector('span')!.dispatchEvent(e);return e.defaultPrevented};
 message(parent,'https://admin.example',command);expect(click()).toBe(false);
 message({},'https://admin.example',draft);message(parent,'https://admin.example',command);expect(click()).toBe(false);
 message(parent,'https://admin.example',draft);message(parent,'https://other.example',command);expect(click()).toBe(false);
 message({},'https://admin.example',command);expect(click()).toBe(false);
 message(parent,'https://admin.example',command);expect(click()).toBe(true);expect(sent).toEqual([{data:{type:'convexpress:customize:selected',field:'header.cta.label'},origin:'https://admin.example'}]);expect(click()).toBe(false);
 message(parent,'https://admin.example',command);host.document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));expect(sent.at(-1).data.type).toBe('convexpress:customize:cancelled');expect(click()).toBe(false);
 message(parent,'https://admin.example',command);message(parent,'https://admin.example',{...command,enabled:false});expect(click()).toBe(false);
 message(parent,'https://admin.example',command);dispose();expect(click()).toBe(false);dom.window.close();
});
