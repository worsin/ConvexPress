import { expect, test } from 'bun:test';
import { uploadTicketAttachments } from './support-tickets-upload';

test('ticket uploads preserve the storage ID and reject malformed HTTP responses', async () => {
 const originalFetch=globalThis.fetch;
 const file=new File(['content'],'note.pdf',{type:'application/pdf'});
 const request=async()=>({uploadUrl:'https://upload.example.test'});
 try {
  globalThis.fetch=(async()=>new Response(JSON.stringify({storageId:'storage-fixture'}),{status:200})) as typeof fetch;
  const [uploaded]=await uploadTicketAttachments(request,[file]);
  expect(uploaded).toEqual({storageId:'storage-fixture',name:'note.pdf',mimeType:'application/pdf',size:7});
  globalThis.fetch=(async()=>new Response(JSON.stringify({storageId:42}),{status:200})) as typeof fetch;
  const error = await uploadTicketAttachments(request,[file]).then(() => null, (failure: unknown) => failure);
  expect(error instanceof Error && error.message.includes('returned no storage ID')).toBe(true);
 } finally { globalThis.fetch=originalFetch; }
});
