import { expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
const router=await import('@tanstack/react-router');
mock.module('@tanstack/react-router',()=>({...router,Link:({children})=><a>{children}</a>}));
const item={_id:'line',quantity:1,lineTotalAmount:3400,product:{title:'Linen kitchen cloth',sku:'PARENT-SKU'},variant:{title:'Pair',sku:'LINEN-PAIR',optionSummary:'Set size: Pair'}};
const cart={items:[item],itemCount:1,subtotalAmount:3400,totalAmount:3400,discountAmount:0,currencyCode:'USD'};
for(const pack of ['core','journal','depot','aster-house']){
 const Review=(await import(`../../templates/packs/${pack}/surfaces/checkout.review`)).default;
 const Shared=(await import(`../../templates/packs/${pack}/surfaces/cart.shared`)).default;
 test(`${pack} review shows the actual selected variant without client metadata`,()=>{
  const html=renderToStaticMarkup(<Review data={{isReady:true,cart,session:{email:'fixture@example.invalid',totalAmount:3400},paymentStep:'review',currencyCode:'USD',shippingLabel:'Demo',paymentLabel:'Demo',checkoutIssues:[],canPlaceOrder:true,isCardPayment:false}}/>);
  expect(html).toContain('Set size: Pair');expect(html).toContain('LINEN-PAIR');expect(html).not.toContain('PARENT-SKU');expect(html).toContain('$34.00');
 });
 test(`${pack} shared cart preserves the selected option`,()=>{
  const html=renderToStaticMarkup(<Shared data={{sharedCart:cart,isReady:true,isCopying:false,onCopy:async()=>{}}}/>);
  expect(html).toContain('Set size: Pair');expect(html).toContain('LINEN-PAIR');expect(html).not.toContain('PARENT-SKU');
 });
}
