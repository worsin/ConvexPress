import { expect, test } from "bun:test";
import { api } from "../../_generated/api";
import { digitalFixture as fixture } from "./fixtures.test";
const queries = api.commerceDigital.queries;

test("digital authoring queries deny anonymous and customer access even when IDs are known", async () => {
  const { t, ids, customer } = await fixture();
  for (const caller of [t, customer]) {
    await expect(caller.query(queries.getFilesByProduct, { productId: ids.product })).rejects.toThrow();
    await expect(caller.query(queries.getFile, { fileId: ids.file })).rejects.toThrow();
    await expect(caller.query(queries.getDownloadTokensByOrder, { orderId: ids.order })).rejects.toThrow();
    await expect(caller.query(queries.getLicenseKeysByOrder, { orderId: ids.order })).rejects.toThrow();
    await expect(caller.query(queries.getAvailableLicenseKeyCount, { productId: ids.product })).rejects.toThrow();
    await expect(caller.query(queries.getLicenseActivations, { keyId: ids.key })).rejects.toThrow();
  }
});

test("digital managers retain authoring access until their permission is revoked", async () => {
  const { t, ids, operator } = await fixture();
  expect(await operator.query(queries.getFilesByProduct, { productId: ids.product })).toMatchObject([{ _id: ids.file }]);
  expect(await operator.query(queries.getFile, { fileId: ids.file })).toMatchObject({ _id: ids.file });
  expect(await operator.query(queries.getDownloadTokensByOrder, { orderId: ids.order })).toMatchObject([{ _id: ids.token }]);
  expect(await operator.query(queries.getLicenseKeysByOrder, { orderId: ids.order })).toMatchObject([{ _id: ids.key }]);
  expect(await operator.query(queries.getAvailableLicenseKeyCount, { productId: ids.product })).toBe(1);
  expect(await operator.query(queries.getLicenseActivations, { keyId: ids.key })).toEqual([]);
  await t.run(ctx => ctx.db.patch(ids.role, { capabilities: [] }));
  await expect(operator.query(queries.getFilesByProduct, { productId: ids.product })).rejects.toThrow();
  await expect(operator.query(queries.getFile, { fileId: ids.file })).rejects.toThrow();
  await expect(operator.query(queries.getDownloadTokensByOrder, { orderId: ids.order })).rejects.toThrow();
  await expect(operator.query(queries.getLicenseKeysByOrder, { orderId: ids.order })).rejects.toThrow();
  await expect(operator.query(queries.getAvailableLicenseKeyCount, { productId: ids.product })).rejects.toThrow();
  await expect(operator.query(queries.getLicenseActivations, { keyId: ids.key })).rejects.toThrow();
});

test("customer self-service remains bound to the signed-in customer", async () => {
  const { t, customer, operator, ids } = await fixture();
  expect(await t.query(queries.getMyDownloads, {})).toEqual([]);
  expect(await t.query(queries.getMyLicenseKeys, {})).toEqual([]);
  expect(await operator.query(queries.getMyDownloads, {})).toEqual([]);
  expect(await operator.query(queries.getMyLicenseKeys, {})).toEqual([]);
  expect(await customer.query(queries.getMyDownloads, {})).toMatchObject([{ _id: ids.token }]);
  expect(await customer.query(queries.getMyLicenseKeys, {})).toMatchObject([{ _id: ids.key }]);
});

test("inactive customers cannot keep reading purchases with an existing identity", async () => {
  const { t, customer, ids } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.customer, { status: "inactive" }));
  expect(await customer.query(queries.getMyDownloads, {})).toEqual([]);
  expect(await customer.query(queries.getMyLicenseKeys, {})).toEqual([]);
});

test("disabled digital commerce hides customer and administrative data", async () => {
  const { t, customer, operator, ids } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.plugins, { values: { commerceEnabled: true, commerceDigitalEnabled: false } }));
  expect(await customer.query(queries.getMyDownloads, {})).toBeNull();
  expect(await customer.query(queries.getMyLicenseKeys, {})).toBeNull();
  expect(await operator.query(queries.getFile, { fileId: ids.file })).toBeNull();
  expect(await operator.query(queries.getDownloadTokensByOrder, { orderId: ids.order })).toBeNull();
  expect(await operator.query(queries.getLicenseKeysByOrder, { orderId: ids.order })).toBeNull();
});
