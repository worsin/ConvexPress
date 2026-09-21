import { test, expect } from "bun:test";
import { productCollectionArgsSchema, productCollectionResultSchema, productCollectionMatchArgs } from "./productCollectionContracts";

const card = { id: "one", title: "Notebook", href: "/products/notebook", excerpt: null, createdAt: 1, image: null, pricing: null, rating: null, cart: null };
const parse = (args: unknown) => productCollectionArgsSchema.parse(args);
const result = (items = [card], groups: {index: number; items: typeof card[]}[] = []) => ({items, groups});

test("all collection modes are explicit; empty category or tag cannot become a recent query", () => {
  for (const mode of ["manual", "sale", "featured", "recent", "recentlyViewed"])
    expect(parse({mode}).mode).toBe(mode);
  expect(parse({mode:"category",categorySlug:"books"}).categorySlug).toBe("books");
  expect(parse({mode:"tag",tagSlug:"gifts"}).tagSlug).toBe("gifts");
  for (const args of [{mode:"category"},{mode:"tag",tagSlug:"  "},{mode:"invented"},{count:1.5},{count:25},{sessionToken:"another-person"},{recentlyViewedIds:["private"]}])
    expect(productCollectionArgsSchema.safeParse(args).success).toBe(false);
});

test("empty and invalid manual selections stay empty, and each group preserves its own order", () => {
  for (const productIds of [[],[""],["wrong"]])
    expect(productCollectionMatchArgs(parse({productIds}),result())).toBe(false);
  const args=parse({productIds:["one","two"],groups:[{productIds:["two","one"]},{productIds:[]}]});
  const two={...card,id:"two"};
  const valid=result([card,two],[{index:0,items:[two,card]},{index:1,items:[]}]);
  expect(productCollectionMatchArgs(args,valid)).toBe(true);
  expect(productCollectionMatchArgs(args,{...valid,groups:[{index:0,items:[card,two]},{index:1,items:[]}]})).toBe(false);
  expect(productCollectionMatchArgs(args,{...valid,groups:[{index:1,items:[two,card]},{index:0,items:[]}]})).toBe(false);
  expect(productCollectionMatchArgs(args,{...valid,groups:[]})).toBe(false);
});

test("collection results never carry private source data, unsafe links, or a different cart target", () => {
  for(const item of [{...card,rawSourceMeta:"private"},{...card,href:"javascript:alert(1)"},{...card,cart:{kind:"add",productId:"other"}},{...card,rating:{average:5,count:0}},{...card,rating:{average:Infinity,count:1}}])
    expect(productCollectionResultSchema.safeParse(result([item] as any)).success).toBe(false);
  expect(productCollectionResultSchema.safeParse(result([card,card])).success).toBe(false);
  expect(productCollectionResultSchema.safeParse(result([{...card,cart:{kind:"add",productId:"one"}}] as any)).success).toBe(true);
});

test("price, rating and cart disclosure obey each saved control; counts and recent order are checked", () => {
  const args=parse({mode:"recent",showPrice:false});
  for(const item of [{...card,pricing:{price:{amount:0,currencyCode:"USD"},salePrice:null,salePriceFrom:null,salePriceTo:null,pricedAt:1}},{...card,rating:{average:4,count:1}},{...card,cart:{kind:"chooseOptions"}}])
    expect(productCollectionMatchArgs(args,result([item] as any))).toBe(false);
  expect(productCollectionMatchArgs(args,result([card,{...card,id:"newer",createdAt:2}]))).toBe(false);
  expect(productCollectionMatchArgs(parse({mode:"recent",count:1}),result([card,{...card,id:"two"}]))).toBe(false);
  expect(productCollectionMatchArgs(parse({mode:"recent",showRating:true,showAddToCart:true}),result([{...card,rating:{average:4,count:2},cart:{kind:"chooseOptions"}}] as any))).toBe(true);
});
