import { test, expect } from "bun:test";
import { resolveStockPolicy, canOrderQuantity } from "../stockPolicy";

test("explicit variant stock overrides parent tracking and stock status follows its quantity", () => {
  const stock=resolveStockPolicy({trackInventory:false,stockQuantity:100}, {manageStock:"yes",stockQuantity:2,stockStatus:"outofstock"});
  expect(stock).toMatchObject({owner:"variant",tracked:true,stockQuantity:2,stockStatus:"instock"});
  expect(canOrderQuantity(stock,2)).toBe(true);expect(canOrderQuantity(stock,3)).toBe(false);
});
test("parent mode inherits stock and backorders and ignores stale variant status", () => {
  const stock=resolveStockPolicy({trackInventory:true,stockQuantity:0,allowBackorders:true},{manageStock:"parent",stockQuantity:50,backorders:"no",stockStatus:"outofstock"});
  expect(stock).toMatchObject({owner:"product",stockQuantity:0,allowBackorders:true,stockStatus:"onbackorder"});
  expect(canOrderQuantity(stock,10)).toBe(true);
  expect(resolveStockPolicy({trackInventory:false},{manageStock:"parent",stockStatus:"outofstock"})).toMatchObject({owner:null,tracked:false,stockStatus:"instock"});
});
test("untracked variants use explicit manual availability without inheriting parent stock limits", () => {
  for(const status of ["instock","outofstock","onbackorder"] as const){
    const stock=resolveStockPolicy({trackInventory:true,stockQuantity:0},{manageStock:"no",stockQuantity:0,stockStatus:status});
    expect(stock.owner).toBeNull();expect(canOrderQuantity(stock,100)).toBe(status!=="outofstock");
  }
});
test("legacy variants retain variant quantity and parent tracking/backorder defaults",()=>{
  expect(resolveStockPolicy({trackInventory:true,stockQuantity:0,allowBackorders:true},{stockQuantity:3})).toMatchObject({owner:"variant",stockQuantity:3,allowBackorders:true});
  expect(resolveStockPolicy({trackInventory:false},{stockQuantity:3})).toMatchObject({owner:null,tracked:false});
});
test("reservations reduce tracked availability while backorders preserve signed stock",()=>{
  const empty=resolveStockPolicy({trackInventory:true,stockQuantity:3},null,3);expect(canOrderQuantity(empty,1)).toBe(false);
  const debt=resolveStockPolicy({trackInventory:false},{manageStock:"yes",stockQuantity:-2,backorders:"notify"},3);
  expect(debt).toMatchObject({stockQuantity:-2,available:-5,backorders:"notify",stockStatus:"onbackorder"});expect(canOrderQuantity(debt,2)).toBe(true);
  for(const invalid of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])expect(canOrderQuantity(debt,invalid)).toBe(false);
});
