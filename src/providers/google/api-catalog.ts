/**
 * Complete Android Publisher v3 API surface exposed by @googleapis/androidpublisher.
 * Escape hatch `google_api_call` can invoke any of these via dot notation.
 * Typed MCP tools wrap the high-frequency / first-launch subset.
 */
export const GOOGLE_PLAY_API_CATALOG = {
  api: "androidpublisher",
  version: "v3",
  note: "Data Safety, privacy policy URL in listing contactWebsite, store listing, and contact details are API-accessible. Content rating questionnaire, Ads declaration, Target audience, News apps, and some Play Console policy forms remain Console-only (listed under consoleOnly).",
  resources: {
    applications: ["dataSafety"],
    "applications.deviceTierConfigs": ["create", "get", "list"],
    "applications.tracks.releases": ["list"],
    apprecovery: ["addTargeting", "cancel", "create", "deploy", "list"],
    edits: ["commit", "delete", "get", "insert", "validate"],
    "edits.apks": ["addexternallyhosted", "list", "upload"],
    "edits.bundles": ["list", "upload"],
    "edits.countryavailability": ["get"],
    "edits.deobfuscationfiles": ["upload"],
    "edits.details": ["get", "patch", "update"],
    "edits.expansionfiles": ["get", "patch", "update", "upload"],
    "edits.images": ["delete", "deleteall", "list", "upload"],
    "edits.listings": ["delete", "deleteall", "get", "list", "patch", "update"],
    "edits.testers": ["get", "patch", "update"],
    "edits.tracks": ["create", "get", "list", "patch", "update"],
    externaltransactions: [
      "createexternaltransaction",
      "getexternaltransaction",
      "refundexternaltransaction",
    ],
    generatedapks: ["download", "list"],
    grants: ["create", "delete", "patch"],
    inappproducts: [
      "batchDelete",
      "batchGet",
      "batchUpdate",
      "delete",
      "get",
      "insert",
      "list",
      "patch",
      "update",
    ],
    internalappsharingartifacts: ["uploadapk", "uploadbundle"],
    monetization: ["convertRegionPrices"],
    "monetization.onetimeproducts": [
      "batchDelete",
      "batchGet",
      "batchUpdate",
      "delete",
      "get",
      "list",
      "patch",
    ],
    "monetization.onetimeproducts.purchaseoptions": [
      "batchDelete",
      "batchUpdateStates",
    ],
    "monetization.onetimeproducts.purchaseoptions.offers": [
      "activate",
      "batchDelete",
      "batchGet",
      "batchUpdate",
      "batchUpdateStates",
      "cancel",
      "deactivate",
      "list",
    ],
    "monetization.subscriptions": [
      "archive",
      "batchGet",
      "batchUpdate",
      "create",
      "delete",
      "get",
      "list",
      "patch",
    ],
      "monetization.subscriptions.basePlans": [
      "activate",
      "batchMigratePrices",
      "batchUpdateStates",
      "deactivate",
      "delete",
      "migratePrices",
    ],
    "monetization.subscriptions.basePlans.offers": [
      "activate",
      "batchGet",
      "batchUpdate",
      "batchUpdateStates",
      "create",
      "deactivate",
      "delete",
      "get",
      "list",
      "patch",
    ],
    orders: ["batchget", "get", "refund"],
    "purchases.products": ["acknowledge", "consume", "get"],
    "purchases.productsv2": ["getproductpurchasev2"],
    "purchases.subscriptions": [
      "acknowledge",
      "cancel",
      "defer",
      "get",
      "refund",
      "revoke",
    ],
    "purchases.subscriptionsv2": ["cancel", "defer", "get", "revoke"],
    "purchases.voidedpurchases": ["list"],
    reviews: ["get", "list", "reply"],
    "systemapks.variants": ["create", "download", "get", "list"],
    users: ["create", "delete", "list", "patch"],
  },
  consoleOnly: [
    {
      item: "Content rating questionnaire (IARC)",
      reason: "No public Android Publisher endpoint",
    },
    {
      item: "Ads declaration (Contains ads)",
      reason: "Play Console policy form only",
    },
    {
      item: "Target audience and content",
      reason: "Play Console policy form only",
    },
    {
      item: "News apps / COVID / Government apps declarations",
      reason: "Play Console policy forms only",
    },
    {
      item: "App access instructions (login credentials for review)",
      reason: "Play Console App content section",
    },
    {
      item: "Financial features declaration",
      reason: "Play Console policy form only",
    },
    {
      item: "Store listing experiments / custom store listings UI extras",
      reason: "Partial API; some UI-only",
    },
  ],
  firstLaunchApiSteps: [
    "edits.details.update — contactEmail, contactWebsite (privacy policy URL), contactPhone, defaultLanguage",
    "edits.listings.update — title, shortDescription, fullDescription",
    "edits.images.upload — icon, featureGraphic, screenshots, tvBanner, etc.",
    "edits.countryavailability.get — distribution countries",
    "edits.bundles.upload / edits.apks.upload — first binary",
    "edits.tracks.update — assign to internal/closed/production",
    "applications.dataSafety — Safety Labels / Data Safety declaration",
    "edits.deobfuscationfiles.upload — ProGuard/R8 mapping (recommended)",
    "edits.commit — publish the edit",
  ],
} as const;

export function flattenGoogleApiMethods(): string[] {
  const out: string[] = [];
  for (const [resource, methods] of Object.entries(
    GOOGLE_PLAY_API_CATALOG.resources,
  )) {
    for (const method of methods) {
      out.push(`${resource}.${method}`);
    }
  }
  return out.sort();
}
