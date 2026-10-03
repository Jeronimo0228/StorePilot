import type { AppleClient } from "./client.js";

export async function getAppInfo(client: AppleClient, appId: string) {
  const response = await client.get<{
    data: Array<{ id: string }>;
  }>(`/v1/apps/${appId}/appInfos`);
  if (!response.data?.length) throw new Error("No app info found");
  return client.get(`/v1/appInfos/${response.data[0].id}`, {
    include:
      "primaryCategory,secondaryCategory,ageRatingDeclaration,appInfoLocalizations",
  });
}

export async function updateAgeRatingDeclaration(
  client: AppleClient,
  ageRatingDeclarationId: string,
  attributes: {
    alcoholTobaccoOrDrugUseOrReferences?: string;
    contests?: string;
    gamblingAndContests?: boolean;
    gambling?: boolean;
    gamblingSimulated?: string;
    horrorOrFearThemes?: string;
    matureOrSuggestiveThemes?: string;
    medicalOrTreatmentInformation?: string;
    profanityOrCrudeHumor?: string;
    sexualContentGraphicAndNudity?: string;
    sexualContentOrNudity?: string;
    violenceCartoonOrFantasy?: string;
    violenceRealistic?: string;
    violenceRealisticProlongedGraphicOrSadistic?: string;
    unrestrictedWebAccess?: boolean;
    seventeenPlus?: boolean;
  },
) {
  return client.patch(
    `/v1/ageRatingDeclarations/${ageRatingDeclarationId}`,
    {
      data: {
        type: "ageRatingDeclarations",
        id: ageRatingDeclarationId,
        attributes,
      },
    },
  );
}

export async function setAppCategory(
  client: AppleClient,
  appInfoId: string,
  primaryCategoryId: string,
  secondaryCategoryId?: string,
) {
  const relationships: Record<string, unknown> = {
    primaryCategory: {
      data: { type: "appCategories", id: primaryCategoryId },
    },
  };
  if (secondaryCategoryId) {
    relationships.secondaryCategory = {
      data: { type: "appCategories", id: secondaryCategoryId },
    };
  }

  return client.patch(`/v1/appInfos/${appInfoId}`, {
    data: {
      type: "appInfos",
      id: appInfoId,
      relationships,
    },
  });
}

export async function listAppCategories(client: AppleClient) {
  return client.get("/v1/appCategories", {
    "fields[appCategories]": "platforms",
    include: "subcategories",
    "filter[platforms]": "IOS",
  });
}

export async function listTerritories(client: AppleClient) {
  return client.get("/v1/territories", {
    "fields[territories]": "currency",
    limit: "200",
  });
}

export async function getAppAvailability(client: AppleClient, appId: string) {
  // v1 /appAvailability fue retirado por Apple: v2 con los territorios incluidos.
  return client.get(`/v1/apps/${appId}/appAvailabilityV2`, {
    include: "territoryAvailabilities",
    "limit[territoryAvailabilities]": "50",
  });
}

/**
 * Crea la disponibilidad v2 de la app: todos los territorios disponibles salvo `exclude`
 * (p. ej. CHN, que exige licencia ICP). Apple exige incluir cada territorio en la petición.
 */
export async function setAppAvailability(
  client: AppleClient,
  appId: string,
  options: { exclude?: string[]; availableInNewTerritories?: boolean } = {},
) {
  const territories = (await client.getAll<{ id: string }>("/v1/territories", { limit: "200" })) as Array<{ id: string }>;
  const exclude = new Set((options.exclude ?? ["CHN"]).map((t) => t.toUpperCase()));
  const included = territories.map((t, i) => ({
    type: "territoryAvailabilities",
    id: `\${t${i}}`,
    attributes: { available: !exclude.has(t.id) },
    relationships: { territory: { data: { type: "territories", id: t.id } } },
  }));
  return client.post("/v2/appAvailabilities", {
    data: {
      type: "appAvailabilities",
      attributes: { availableInNewTerritories: options.availableInNewTerritories ?? true },
      relationships: {
        app: { data: { type: "apps", id: appId } },
        territoryAvailabilities: { data: included.map((x) => ({ type: x.type, id: x.id })) },
      },
    },
    included,
  });
}

export async function setPhasedRelease(
  client: AppleClient,
  versionId: string,
  phasedReleaseState: "ACTIVE" | "PAUSED" | "COMPLETE",
) {
  try {
    const existing = await client.get<{
      data: { id: string } | null;
    }>(`/v1/appStoreVersions/${versionId}/appStoreVersionPhasedRelease`);

    if (existing?.data?.id) {
      return client.patch(
        `/v1/appStoreVersionPhasedReleases/${existing.data.id}`,
        {
          data: {
            type: "appStoreVersionPhasedReleases",
            id: existing.data.id,
            attributes: { phasedReleaseState },
          },
        },
      );
    }
  } catch {
    // No existing phased release, create one
  }

  return client.post("/v1/appStoreVersionPhasedReleases", {
    data: {
      type: "appStoreVersionPhasedReleases",
      attributes: { phasedReleaseState },
      relationships: {
        appStoreVersion: {
          data: { type: "appStoreVersions", id: versionId },
        },
      },
    },
  });
}
