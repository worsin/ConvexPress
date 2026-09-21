import { expect, test } from "bun:test";
import { validateCloudInitializeCredential } from "./cloudInitializeCredential";
const target = { websiteKey: "website_aster", instanceKey: "instance_aster", environmentKind: "live",
  deploymentOrigin: "https://aster.convex.cloud", managementOrigin: "https://aster.convex.site", siteOrigin: "https://aster.example" };
const issued = { ...target, deploymentAdminKey: "prod:aster|synthetic-deployment-credential" };
test("cloud initialization checks every authoritative target field before returning its key", () => {
  expect(validateCloudInitializeCredential(issued, target)).toBe(issued.deploymentAdminKey);
  expect(validateCloudInitializeCredential(null, target)).toBe(null);
  for (const field of Object.keys(target)) {
    expect(() => validateCloudInitializeCredential({ ...issued, [field]: "wrong-target" }, target)).toThrow("target");
  }
  for (const key of ["prod:other|synthetic", "dev:aster|synthetic", "arbitrary"]) {
    expect(() => validateCloudInitializeCredential({ ...issued, deploymentAdminKey: key }, target)).toThrow("credential");
  }
});
