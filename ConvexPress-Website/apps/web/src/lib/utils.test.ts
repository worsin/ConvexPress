import { expect, test } from "bun:test";
import { ConvexError } from "convex/values";
import { getErrorMessage } from "./utils";

test("typed public Convex errors take precedence over the generic transport message", () => {
  const failure = new ConvexError({ code: "CONFLICT", message: "Settings changed. Reload before publishing." });
  failure.message = "Server Error";
  expect(getErrorMessage(failure)).toBe("Settings changed. Reload before publishing.");
  expect(getErrorMessage(new Error("Disconnected"))).toBe("Disconnected");
  expect(getErrorMessage(null, "Try again")).toBe("Try again");
});
