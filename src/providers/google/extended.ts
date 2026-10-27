import type { GooglePlayClient } from "./client.js";
import { createReadStream } from "node:fs";

/** Write Data Safety / Safety Labels declaration (CSV string per Google docs). */
export async function setDataSafety(
  client: GooglePlayClient,
  packageName: string,
  safetyLabels: string,
) {
  const res = await client.api.applications.dataSafety({
    packageName,
    requestBody: { safetyLabels },
  });
  return res.data;
}

export async function getExpansionFile(
  client: GooglePlayClient,
  packageName: string,
  editId: string,
  apkVersionCode: number,
  expansionFileType: "main" | "patch",
) {
  const res = await client.api.edits.expansionfiles.get({
    packageName,
    editId,
    apkVersionCode,
    expansionFileType,
  });
  return res.data;
}

export async function uploadExpansionFile(
  client: GooglePlayClient,
  packageName: string,
  editId: string,
  apkVersionCode: number,
  expansionFileType: "main" | "patch",
  filePath: string,
) {
  const res = await client.api.edits.expansionfiles.upload({
    packageName,
    editId,
    apkVersionCode,
    expansionFileType,
    media: {
      mimeType: "application/octet-stream",
      body: createReadStream(filePath),
    },
  });
  return res.data;
}

export async function getOrder(
  client: GooglePlayClient,
  packageName: string,
  orderId: string,
) {
  const res = await client.api.orders.get({ packageName, orderId });
  return res.data;
}

export async function batchGetOrders(
  client: GooglePlayClient,
  packageName: string,
  orderIds: string[],
) {
  const res = await client.api.orders.batchget({
    packageName,
    orderIds,
  });
  return res.data;
}

export async function refundOrder(
  client: GooglePlayClient,
  packageName: string,
  orderId: string,
  opts?: { revoke?: boolean },
) {
  const res = await client.api.orders.refund({
    packageName,
    orderId,
    revoke: opts?.revoke,
  });
  return res.data;
}

export async function listVoidedPurchases(
  client: GooglePlayClient,
  packageName: string,
  opts?: {
    startTime?: string;
    endTime?: string;
    maxResults?: number;
    token?: string;
    type?: number;
  },
) {
  const res = await client.api.purchases.voidedpurchases.list({
    packageName,
    startTime: opts?.startTime,
    endTime: opts?.endTime,
    maxResults: opts?.maxResults,
    token: opts?.token,
    type: opts?.type,
  });
  return res.data;
}

export async function listPlayUsers(client: GooglePlayClient, parent: string) {
  const res = await client.api.users.list({ parent });
  return res.data;
}

export async function createPlayUser(
  client: GooglePlayClient,
  parent: string,
  user: Record<string, unknown>,
) {
  const res = await client.api.users.create({
    parent,
    requestBody: user,
  });
  return res.data;
}

export async function deletePlayUser(
  client: GooglePlayClient,
  name: string,
) {
  await client.api.users.delete({ name });
  return { deleted: true, name };
}

export async function listOneTimeProducts(
  client: GooglePlayClient,
  packageName: string,
) {
  const res = await client.api.monetization.onetimeproducts.list({
    packageName,
  });
  return res.data;
}

export async function getOneTimeProduct(
  client: GooglePlayClient,
  packageName: string,
  productId: string,
) {
  const res = await client.api.monetization.onetimeproducts.get({
    packageName,
    productId,
  });
  return res.data;
}

export async function convertRegionPrices(
  client: GooglePlayClient,
  packageName: string,
  price: { currencyCode?: string; units?: string; nanos?: number },
  productTaxCategoryCode?: string,
) {
  const res = await client.api.monetization.convertRegionPrices({
    packageName,
    requestBody: {
      price,
      productTaxCategoryCode,
    },
  });
  return res.data;
}

export async function getProductPurchase(
  client: GooglePlayClient,
  packageName: string,
  productId: string,
  token: string,
) {
  const res = await client.api.purchases.products.get({
    packageName,
    productId,
    token,
  });
  return res.data;
}

export async function acknowledgeProductPurchase(
  client: GooglePlayClient,
  packageName: string,
  productId: string,
  token: string,
  developerPayload?: string,
) {
  await client.api.purchases.products.acknowledge({
    packageName,
    productId,
    token,
    requestBody: developerPayload ? { developerPayload } : {},
  });
  return { acknowledged: true };
}

export async function getSubscriptionPurchase(
  client: GooglePlayClient,
  packageName: string,
  subscriptionId: string,
  token: string,
) {
  const res = await client.api.purchases.subscriptions.get({
    packageName,
    subscriptionId,
    token,
  });
  return res.data;
}

export async function listSubscriptionBasePlanOffers(
  client: GooglePlayClient,
  packageName: string,
  productId: string,
  basePlanId: string,
) {
  const res =
    await client.api.monetization.subscriptions.basePlans.offers.list({
      packageName,
      productId,
      basePlanId,
    });
  return res.data;
}

export async function listGeneratedApks(
  client: GooglePlayClient,
  packageName: string,
  versionCode: number,
) {
  const res = await client.api.generatedapks.list({
    packageName,
    versionCode,
  });
  return res.data;
}

export async function listAppRecoveryActions(
  client: GooglePlayClient,
  packageName: string,
) {
  const res = await client.api.apprecovery.list({ packageName });
  return res.data;
}

export async function listSystemApkVariants(
  client: GooglePlayClient,
  packageName: string,
) {
  const res = await client.api.systemapks.variants.list({ packageName });
  return res.data;
}
