import type { AppleClient } from "./client.js";

export async function createAppStoreVersion(
  client: AppleClient,
  appId: string,
  versionString: string,
  platform: "IOS" | "MAC_OS" | "TV_OS" = "IOS",
) {
  return client.post("/v1/appStoreVersions", {
    data: {
      type: "appStoreVersions",
      attributes: {
        versionString,
        platform,
      },
      relationships: {
        app: {
          data: { type: "apps", id: appId },
        },
      },
    },
  });
}

export async function getAppStoreVersion(
  client: AppleClient,
  versionId: string,
) {
  return client.get(`/v1/appStoreVersions/${versionId}`, {
    "fields[appStoreVersions]":
      // Las relaciones deben estar en el sparse fieldset o Apple las omite (antes: "sin build" falso).
      "versionString,appStoreState,releaseType,earliestReleaseDate,platform,build,appStoreVersionLocalizations,appStoreVersionSubmission",
    include:
      "appStoreVersionLocalizations,build,appStoreVersionSubmission",
  });
}

export async function listAppStoreVersions(
  client: AppleClient,
  appId: string,
  filters?: { state?: string; platform?: string },
) {
  const params: Record<string, string> = {
    "fields[appStoreVersions]":
      "versionString,appStoreState,releaseType,platform,createdDate",
  };
  if (filters?.state)
    params["filter[appStoreState]"] = filters.state;
  if (filters?.platform) params["filter[platform]"] = filters.platform;

  return client.get(`/v1/apps/${appId}/appStoreVersions`, params);
}

export async function setReleaseType(
  client: AppleClient,
  versionId: string,
  releaseType: "MANUAL" | "AFTER_APPROVAL" | "SCHEDULED",
  earliestReleaseDate?: string,
) {
  const attributes: Record<string, unknown> = { releaseType };
  if (releaseType === "SCHEDULED" && earliestReleaseDate) {
    attributes.earliestReleaseDate = earliestReleaseDate;
  }

  return client.patch(`/v1/appStoreVersions/${versionId}`, {
    data: {
      type: "appStoreVersions",
      id: versionId,
      attributes,
    },
  });
}

export async function assignBuildToVersion(
  client: AppleClient,
  versionId: string,
  buildId: string,
) {
  return client.patch(
    `/v1/appStoreVersions/${versionId}/relationships/build`,
    {
      data: { type: "builds", id: buildId },
    },
  );
}
