import {describe,expect,test} from "bun:test";
import {ConvexError} from "convex/values";
import {getErrorMessage} from "./utils";
describe("public mutation error messages",()=>{
 test("uses a ConvexError public message instead of its diagnostic stack",()=>{
  const error=new ConvexError({code:"EVENT_CATEGORY_IN_USE",message:"Move events to another category before deleting this category."});
  error.message="[CONVEX M] Request ID: diagnostic Server Error and stack";
  expect(getErrorMessage(error)).toBe("Move events to another category before deleting this category.");
 });
 test("supports string payloads and hides malformed server diagnostics",()=>{
  expect(getErrorMessage(new ConvexError("This event changed."))).toBe("This event changed.");
  expect(getErrorMessage(new ConvexError({code:"INTERNAL"}),"Try again.")).toBe("Try again.");
  expect(getErrorMessage({data:null},"Try again.")).toBe("Try again.");
 });
 test("preserves ordinary client validation errors and unknown fallbacks",()=>{
  expect(getErrorMessage(new Error("Choose an end time."))).toBe("Choose an end time.");
  expect(getErrorMessage(undefined,"Try again.")).toBe("Try again.");
 });
});

test("unexpected Convex transport errors use the action fallback without stack details",()=>{
 expect(getErrorMessage(new Error('[CONVEX M(commerce/products:update)] [Request ID: example] Server Error Uncaught Error: schema failure'),"Could not save the product.")).toBe("Could not save the product.");
});
