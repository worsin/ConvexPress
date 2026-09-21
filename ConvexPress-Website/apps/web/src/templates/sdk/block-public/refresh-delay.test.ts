import {test,expect} from 'bun:test';
import {publicDocumentRefreshDelay} from './refresh-delay';
import type {PublicCanonicalDocument} from '../block-data/portable/publicDocumentContracts';
// Scheduling-only fixture: trust validation happens before this helper is called.
const calendar=(endsAt:number)=>({state:'ready',data:{dataByBlock:{calendar:{resolver:'events.list',data:{endsAt}}}}}) as unknown as PublicCanonicalDocument;
test('current calendar month refreshes at its boundary with a bounded timer',()=>{
 expect(publicDocumentRefreshDelay(calendar(100050),100000)).toBe(1000);
 expect(publicDocumentRefreshDelay(calendar(500000),100000)).toBe(60000);
});
test('browsing historical calendar months cannot cause a one-second refresh loop',()=>{
 expect(publicDocumentRefreshDelay(calendar(50000),100000)).toBe(60000);
 expect(publicDocumentRefreshDelay(null,100000)).toBe(null);
});

const form=(nextChangeAt:number|null)=>({state:'ready',data:{dataByBlock:{form:{resolver:'forms.form',data:{nextChangeAt}}}}}) as unknown as PublicCanonicalDocument;
test('embedded forms refresh when their opening or closing boundary arrives',()=>{
 expect(publicDocumentRefreshDelay(form(101500),100000)).toBe(1500);
 expect(publicDocumentRefreshDelay(form(100001),100000)).toBe(1000);
 expect(publicDocumentRefreshDelay(form(99999),100000)).toBe(60000);
 expect(publicDocumentRefreshDelay(form(null),100000)).toBe(60000);
});

test('contact forms share opening and closing deadline refresh',()=>{
 const contact=form(101500)!;
 (contact as any).data.dataByBlock.form.resolver='forms.contact';
 expect(publicDocumentRefreshDelay(contact,100000)).toBe(1500);
});
