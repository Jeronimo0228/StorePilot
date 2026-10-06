import type { AppleClient } from "./client.js";

/**
 * Envía una versión a App Review con el flujo vigente (reviewSubmissions): reutiliza una solicitud
 * abierta de la app o crea una, agrega la versión como ítem y la marca como enviada.
 * (appStoreVersionSubmissions ya no admite CREATE.)
 */
export async function submitForReview(client: AppleClient, versionId: string) {
  const version = (await client.get(`/v1/appStoreVersions/${versionId}`, {
    "fields[appStoreVersions]": "platform,app",
    include: "app",
  })) as { data: { attributes?: { platform?: string }; relationships?: { app?: { data?: { id: string } } } } };
  const appId = version.data.relationships?.app?.data?.id;
  if (!appId) throw new Error(`No app found for version ${versionId}`);
  const platform = version.data.attributes?.platform ?? "IOS";

  const open = (await client.get(`/v1/apps/${appId}/reviewSubmissions`, {
    "filter[state]": "READY_FOR_REVIEW",
    "filter[platform]": platform,
  })) as { data?: Array<{ id: string }> };
  let submissionId = open.data?.[0]?.id;
  if (!submissionId) {
    const created = (await client.post("/v1/reviewSubmissions", {
      data: {
        type: "reviewSubmissions",
        attributes: { platform },
        relationships: { app: { data: { type: "apps", id: appId } } },
      },
    })) as { data: { id: string } };
    submissionId = created.data.id;
  }

  const items = (await client.get(`/v1/reviewSubmissions/${submissionId}/items`, {
    include: "appStoreVersion",
  })) as { data?: Array<{ relationships?: { appStoreVersion?: { data?: { id: string } | null } } }> };
  const alreadyAdded = items.data?.some((i) => i.relationships?.appStoreVersion?.data?.id === versionId);
  if (!alreadyAdded) {
    // Si la versión no es enviable, Apple responde 409 con associatedErrors (privacidad, precio…).
    await client.post("/v1/reviewSubmissionItems", {
      data: {
        type: "reviewSubmissionItems",
        relationships: {
          reviewSubmission: { data: { type: "reviewSubmissions", id: submissionId } },
          appStoreVersion: { data: { type: "appStoreVersions", id: versionId } },
        },
      },
    });
  }

  return client.patch(`/v1/reviewSubmissions/${submissionId}`, {
    data: { type: "reviewSubmissions", id: submissionId, attributes: { submitted: true } },
  });
}

/**
 * Retira de revisión la versión indicada: cancela la reviewSubmission que la contiene
 * (estado WAITING_FOR_REVIEW / READY_FOR_REVIEW). La versión vuelve a ser editable.
 */
export async function cancelReview(client: AppleClient, versionId: string) {
  const version = (await client.get(`/v1/appStoreVersions/${versionId}`, {
    "fields[appStoreVersions]": "app",
    include: "app",
  })) as { data: { relationships?: { app?: { data?: { id: string } } } } };
  const appId = version.data.relationships?.app?.data?.id;
  if (!appId) throw new Error(`No app found for version ${versionId}`);
  const subs = (await client.get(`/v1/apps/${appId}/reviewSubmissions`, {
    "filter[state]": "WAITING_FOR_REVIEW,READY_FOR_REVIEW,UNRESOLVED_ISSUES",
    include: "items",
    "fields[reviewSubmissionItems]": "appStoreVersion",
  })) as { data?: Array<{ id: string; attributes?: { state?: string } }>; included?: Array<{ id: string; relationships?: { appStoreVersion?: { data?: { id: string } | null } } }> };
  const canceled: string[] = [];
  for (const sub of subs.data ?? []) {
    const items = (await client.get(`/v1/reviewSubmissions/${sub.id}/items`, {
      include: "appStoreVersion",
    })) as { data?: Array<{ relationships?: { appStoreVersion?: { data?: { id: string } | null } } }> };
    if (!items.data?.some((i) => i.relationships?.appStoreVersion?.data?.id === versionId)) continue;
    await client.patch(`/v1/reviewSubmissions/${sub.id}`, {
      data: { type: "reviewSubmissions", id: sub.id, attributes: { canceled: true } },
    });
    canceled.push(sub.id);
  }
  return { versionId, canceled };
}

export async function getReviewStatus(
  client: AppleClient,
  versionId: string,
) {
  const version = await client.get<{
    data: {
      id: string;
      attributes: {
        versionString: string;
        appStoreState: string;
      };
    };
  }>(`/v1/appStoreVersions/${versionId}`, {
    "fields[appStoreVersions]": "versionString,appStoreState",
  });

  return {
    versionId,
    versionString: version.data.attributes.versionString,
    state: version.data.attributes.appStoreState,
  };
}

/**
 * Fija el precio de la app (por defecto gratis) con appPriceSchedules: busca el price point del
 * territorio base cuyo customerPrice coincide y lo programa desde hoy. Apple deriva el resto de países.
 */
export async function setAppPricing(
  client: AppleClient,
  appId: string,
  customerPrice = "0",
  baseTerritory = "USA",
) {
  const target = Number(customerPrice);
  let path: string | undefined = `/v1/apps/${appId}/appPricePoints`;
  let params: Record<string, string> | undefined = {
    "fields[appPricePoints]": "customerPrice",
    "filter[territory]": baseTerritory,
    limit: "200",
  };
  let pointId: string | undefined;
  while (path && !pointId) {
    const page: { data: Array<{ id: string; attributes?: { customerPrice?: string } }>; links?: { next?: string } } =
      await client.get(path, params);
    pointId = page.data.find((p) => Number(p.attributes?.customerPrice) === target)?.id;
    path = page.links?.next?.replace("https://api.appstoreconnect.apple.com", "");
    params = undefined;
  }
  if (!pointId) throw new Error(`No price point ${customerPrice} in ${baseTerritory} for app ${appId}`);

  return client.post("/v1/appPriceSchedules", {
    data: {
      type: "appPriceSchedules",
      relationships: {
        app: { data: { type: "apps", id: appId } },
        baseTerritory: { data: { type: "territories", id: baseTerritory } },
        manualPrices: { data: [{ type: "appPrices", id: "${price0}" }] },
      },
    },
    included: [
      {
        type: "appPrices",
        id: "${price0}",
        attributes: { startDate: null },
        relationships: { appPricePoint: { data: { type: "appPricePoints", id: pointId } } },
      },
    ],
  });
}

export async function listAppPricePoints(
  client: AppleClient,
  appId: string,
  options?: {
    territory?: string;
    limit?: number;
  },
) {
  const territory = options?.territory ?? "USA";
  const limit = options?.limit ?? 200;

  return client.get(`/v1/apps/${appId}/appPricePoints`, {
    "fields[appPricePoints]": "customerPrice,proceeds",
    "filter[territory]": territory,
    limit: String(limit),
    include: "territory",
  });
}

/** @deprecated Use listAppPricePoints — global /v1/appPriceTiers was removed by Apple */
export async function getAppPriceTiers(client: AppleClient, appId: string, territory?: string) {
  return listAppPricePoints(client, appId, { territory });
}
