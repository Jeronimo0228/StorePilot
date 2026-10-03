import type { AppleClient } from "./client.js";
import * as metadata from "./metadata.js";
import {
  pollAppleAssetReady,
  readAssetFile,
  uploadAppleAssetParts,
} from "../../utils/apple-assets.js";

export type ScreenshotDisplayType =
  | "APP_IPHONE_67"
  | "APP_IPHONE_65"
  | "APP_IPHONE_61"
  | "APP_IPHONE_58"
  | "APP_IPHONE_55"
  | "APP_IPHONE_47"
  | "APP_IPAD_PRO_129"
  | "APP_IPAD_PRO_3GEN_129"
  | "APP_IPAD_105";

interface LocalizationRow {
  id: string;
  attributes: { locale: string };
  relationships?: {
    appScreenshotSets?: { links?: { related?: string } };
  };
}

interface ScreenshotSetRow {
  id: string;
  attributes: { screenshotDisplayType?: string };
}

interface ScreenshotReservation {
  data: {
    id: string;
    attributes?: {
      assetDeliveryState?: { state?: string; errors?: unknown };
      sourceFileChecksum?: string;
    };
    relationships?: unknown;
  };
}

export async function findVersionLocalization(
  client: AppleClient,
  versionId: string,
  locale: string,
) {
  const localizations = (await metadata.getVersionLocalizations(
    client,
    versionId,
  )) as { data: LocalizationRow[] };

  const existing = localizations.data?.find(
    (l) => l.attributes.locale === locale,
  );
  if (!existing) {
    throw new Error(
      `No App Store localization for locale "${locale}" on version ${versionId}`,
    );
  }
  return existing;
}

export async function findOrCreateVersionLocalization(
  client: AppleClient,
  versionId: string,
  locale: string,
) {
  const localizations = (await metadata.getVersionLocalizations(
    client,
    versionId,
  )) as { data: LocalizationRow[] };

  const existing = localizations.data?.find(
    (l) => l.attributes.locale === locale,
  );
  if (existing) return existing;

  const created = await metadata.createVersionLocalization(
    client,
    versionId,
    locale,
    {},
  );
  return (created as { data: LocalizationRow }).data;
}

export async function listScreenshotSets(
  client: AppleClient,
  localizationId: string,
) {
  return client.get<{ data: ScreenshotSetRow[] }>(
    `/v1/appStoreVersionLocalizations/${localizationId}/appScreenshotSets`,
    {
      "fields[appScreenshotSets]": "screenshotDisplayType",
      include: "appScreenshots",
    },
  );
}

export async function listScreenshotsInSet(
  client: AppleClient,
  screenshotSetId: string,
) {
  return client.get(`/v1/appScreenshotSets/${screenshotSetId}/appScreenshots`, {
    "fields[appScreenshots]":
      "fileName,fileSize,assetDeliveryState,imageAsset,sourceFileChecksum",
  });
}

async function findOrCreateScreenshotSet(
  client: AppleClient,
  localizationId: string,
  screenshotDisplayType: ScreenshotDisplayType,
) {
  const sets = await listScreenshotSets(client, localizationId);
  const existing = sets.data?.find(
    (s) => s.attributes.screenshotDisplayType === screenshotDisplayType,
  );
  if (existing) return existing;

  const created = await client.post<{ data: ScreenshotSetRow }>(
    "/v1/appScreenshotSets",
    {
      data: {
        type: "appScreenshotSets",
        attributes: { screenshotDisplayType },
        relationships: {
          appStoreVersionLocalization: {
            data: {
              type: "appStoreVersionLocalizations",
              id: localizationId,
            },
          },
        },
      },
    },
  );
  return created.data;
}

export async function uploadScreenshot(
  client: AppleClient,
  options: {
    versionId: string;
    locale: string;
    screenshotDisplayType: ScreenshotDisplayType;
    filePath: string;
  },
) {
  const localization = await findOrCreateVersionLocalization(
    client,
    options.versionId,
    options.locale,
  );
  const screenshotSet = await findOrCreateScreenshotSet(
    client,
    localization.id,
    options.screenshotDisplayType,
  );

  const asset = await readAssetFile(options.filePath);

  const reservation = await client.post<ScreenshotReservation>(
    "/v1/appScreenshots",
    {
      data: {
        type: "appScreenshots",
        attributes: {
          fileName: asset.fileName,
          fileSize: asset.fileSize,
        },
        relationships: {
          appScreenshotSet: {
            data: { type: "appScreenshotSets", id: screenshotSet.id },
          },
        },
      },
    },
  );

  const screenshotId = reservation.data.id;
  const uploadOps =
    (
      reservation.data as {
        attributes?: {
          uploadOperations?: Array<{
            method?: string;
            url?: string;
            length?: number;
            offset?: number;
            requestHeaders?: Array<{ name?: string; value?: string }>;
          }>;
        };
      }
    ).attributes?.uploadOperations ??
    (
      reservation as {
        data?: {
          uploadOperations?: Array<{
            method?: string;
            url?: string;
            length?: number;
            offset?: number;
            requestHeaders?: Array<{ name?: string; value?: string }>;
          }>;
        };
      }
    ).data?.uploadOperations;

  if (!uploadOps?.length) {
    throw new Error("Apple did not return upload operations for screenshot");
  }

  await uploadAppleAssetParts(asset.buffer, uploadOps);

  await client.patch(`/v1/appScreenshots/${screenshotId}`, {
    data: {
      type: "appScreenshots",
      id: screenshotId,
      attributes: {
        uploaded: true,
        sourceFileChecksum: asset.checksum,
      },
    },
  });

  await pollAppleAssetReady(async () => {
    const current = await client.get<ScreenshotReservation>(
      `/v1/appScreenshots/${screenshotId}`,
      { "fields[appScreenshots]": "assetDeliveryState" },
    );
    return {
      state: current.data.attributes?.assetDeliveryState?.state,
      errors: current.data.attributes?.assetDeliveryState?.errors,
    };
  });

  return {
    screenshotId,
    screenshotSetId: screenshotSet.id,
    localizationId: localization.id,
    locale: options.locale,
    screenshotDisplayType: options.screenshotDisplayType,
    fileName: asset.fileName,
  };
}

export async function uploadScreenshots(
  client: AppleClient,
  options: {
    versionId: string;
    locale: string;
    screenshotDisplayType: ScreenshotDisplayType;
    filePaths: string[];
  },
) {
  const results = [];
  for (const filePath of options.filePaths) {
    results.push(
      await uploadScreenshot(client, {
        versionId: options.versionId,
        locale: options.locale,
        screenshotDisplayType: options.screenshotDisplayType,
        filePath,
      }),
    );
  }
  return results;
}
