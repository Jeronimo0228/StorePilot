import type { AppleClient } from "./client.js";
import * as apps from "./apps.js";
import * as versions from "./versions.js";
import * as metadata from "./metadata.js";
import * as screenshots from "./screenshots.js";

export type ContentRightsDeclaration =
  | "DOES_NOT_USE_THIRD_PARTY_CONTENT"
  | "USES_THIRD_PARTY_CONTENT";

export async function getContentRights(client: AppleClient, appId: string) {
  const app = (await apps.getApp(client, appId)) as {
    data: {
      id: string;
      attributes?: { contentRightsDeclaration?: string; primaryLocale?: string };
    };
  };
  return {
    appId,
    contentRightsDeclaration: app.data.attributes?.contentRightsDeclaration,
    primaryLocale: app.data.attributes?.primaryLocale,
  };
}

export async function setContentRights(
  client: AppleClient,
  appId: string,
  contentRightsDeclaration: ContentRightsDeclaration,
) {
  return client.patch(`/v1/apps/${appId}`, {
    data: {
      type: "apps",
      id: appId,
      attributes: { contentRightsDeclaration },
    },
  });
}

export async function getBuildExportCompliance(
  client: AppleClient,
  buildId: string,
) {
  const build = await client.get(`/v1/builds/${buildId}`, {
    "fields[builds]":
      "version,processingState,usesNonExemptEncryption,expirationDate",
    include: "buildBetaDetail,app",
  });

  let betaDetail: unknown = null;
  try {
    betaDetail = await client.get(
      `/v1/builds/${buildId}/buildBetaDetail`,
      {
        "fields[buildBetaDetails]":
          "autoNotifyEnabled,internalBuildState,externalBuildState",
      },
    );
  } catch {
    betaDetail = null;
  }

  return { build, buildBetaDetail: betaDetail };
}

export async function setBuildExportCompliance(
  client: AppleClient,
  buildId: string,
  attributes: {
    usesNonExemptEncryption: boolean;
    encryptionUpdated?: boolean;
  },
) {
  return client.patch(`/v1/builds/${buildId}`, {
    data: {
      type: "builds",
      id: buildId,
      attributes: {
        usesNonExemptEncryption: attributes.usesNonExemptEncryption,
        ...(attributes.encryptionUpdated !== undefined
          ? { encryptionUpdated: attributes.encryptionUpdated }
          : {}),
      },
    },
  });
}

export interface SubmissionReadinessItem {
  code: string;
  status: "ok" | "missing" | "warning";
  message: string;
  suggestion?: string;
}

export async function getSubmissionReadiness(
  client: AppleClient,
  options: {
    appId: string;
    versionId: string;
    locale?: string;
    screenshotDisplayType?: screenshots.ScreenshotDisplayType;
  },
): Promise<{
  ready: boolean;
  checks: SubmissionReadinessItem[];
}> {
  const checks: SubmissionReadinessItem[] = [];
  const locale = options.locale;

  const rights = await getContentRights(client, options.appId);
  if (rights.contentRightsDeclaration) {
    checks.push({
      code: "CONTENT_RIGHTS",
      status: "ok",
      message: `Content rights set: ${rights.contentRightsDeclaration}`,
    });
  } else {
    checks.push({
      code: "CONTENT_RIGHTS",
      status: "missing",
      message: "App content rights declaration is not set",
      suggestion:
        "Use apple_set_content_rights with DOES_NOT_USE_THIRD_PARTY_CONTENT or USES_THIRD_PARTY_CONTENT.",
    });
  }

  const version = (await versions.getAppStoreVersion(
    client,
    options.versionId,
  )) as {
    data: {
      attributes?: { appStoreState?: string };
      relationships?: { build?: { data?: { id?: string } | null } };
    };
  };

  const buildId = version.data.relationships?.build?.data?.id;
  if (!buildId) {
    checks.push({
      code: "BUILD_ASSIGNED",
      status: "missing",
      message: "No build assigned to this App Store version",
      suggestion: "Use apple_assign_build_to_version.",
    });
  } else {
    checks.push({
      code: "BUILD_ASSIGNED",
      status: "ok",
      message: `Build assigned: ${buildId}`,
    });

    const compliance = await getBuildExportCompliance(client, buildId);
    const usesEncryption = (
      compliance.build as {
        data?: { attributes?: { usesNonExemptEncryption?: boolean } };
      }
    ).data?.attributes?.usesNonExemptEncryption;

    if (usesEncryption === false) {
      checks.push({
        code: "EXPORT_COMPLIANCE",
        status: "ok",
        message: "Export compliance: app does not use non-exempt encryption",
      });
    } else if (usesEncryption === true) {
      checks.push({
        code: "EXPORT_COMPLIANCE",
        status: "warning",
        message: "App declares non-exempt encryption — verify export documentation",
        suggestion:
          "Complete export compliance in App Store Connect or set usesNonExemptEncryption via apple_set_export_compliance if applicable.",
      });
    } else {
      checks.push({
        code: "EXPORT_COMPLIANCE",
        status: "missing",
        message: "Export compliance (usesNonExemptEncryption) not declared on build",
        suggestion:
          "Use apple_set_export_compliance with usesNonExemptEncryption: false for typical apps.",
      });
    }
  }

  const targetLocale = locale ?? rights.primaryLocale;
  if (targetLocale) {
    try {
      const localizations = (await metadata.getVersionLocalizations(
        client,
        options.versionId,
      )) as { data: Array<{ id: string; attributes: { locale: string } }> };

      const localization = localizations.data?.find(
        (l) => l.attributes.locale === targetLocale,
      );

      if (!localization) {
        checks.push({
          code: "SCREENSHOTS",
          status: "missing",
          message: `No localization for locale ${targetLocale}`,
          suggestion: "Create localization or use apple_upload_screenshot (creates if needed).",
        });
      } else {
        const sets = await screenshots.listScreenshotSets(
          client,
          localization.id,
        );
        const displayType =
          options.screenshotDisplayType ?? "APP_IPHONE_67";
        const set = sets.data?.find(
          (s) => s.attributes.screenshotDisplayType === displayType,
        );

        if (set) {
          const shots = await screenshots.listScreenshotsInSet(client, set.id);
          const count = (shots as { data?: unknown[] }).data?.length ?? 0;
          if (count > 0) {
            checks.push({
              code: "SCREENSHOTS",
              status: "ok",
              message: `${count} screenshot(s) for ${targetLocale} (${displayType})`,
            });
          } else {
            checks.push({
              code: "SCREENSHOTS",
              status: "missing",
              message: `No screenshots uploaded for ${targetLocale} (${displayType})`,
              suggestion: "Use apple_upload_screenshot.",
            });
          }
        } else {
          checks.push({
            code: "SCREENSHOTS",
            status: "missing",
            message: `No screenshot set for ${targetLocale} (${displayType})`,
            suggestion: "Use apple_upload_screenshot.",
          });
        }
      }
    } catch (err) {
      checks.push({
        code: "SCREENSHOTS",
        status: "warning",
        message: `Could not verify screenshots: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // Disponibilidad por países (sin ella la app aprobada no aparece en ninguna tienda).
  try {
    await client.get(`/v1/apps/${options.appId}/appAvailabilityV2`);
    checks.push({ code: "AVAILABILITY", status: "ok", message: "Territory availability configured" });
  } catch {
    checks.push({
      code: "AVAILABILITY",
      status: "missing",
      message: "No territory availability: the app would not be available in any country",
      suggestion: "Use apple_set_app_availability (all territories, optionally excluding some).",
    });
  }

  // Precio (sin calendario de precios Apple rechaza el envío con APP_PRICING_REQUIRED).
  try {
    const prices = (await client.get(`/v1/appPriceSchedules/${options.appId}/manualPrices`, { limit: "1" })) as {
      data?: unknown[];
    };
    if (!prices.data?.length) throw new Error("no manual prices");
    checks.push({ code: "PRICING", status: "ok", message: "Price schedule configured" });
  } catch {
    checks.push({
      code: "PRICING",
      status: "missing",
      message: "No price schedule: Apple blocks the submission (APP_PRICING_REQUIRED)",
      suggestion: "Use apple_set_app_pricing (customerPrice '0' for a free app).",
    });
  }

  // Datos para el equipo de revisión de Apple.
  try {
    const review = (await client.get(`/v1/appStoreVersions/${options.versionId}/appStoreReviewDetail`)) as {
      data?: { attributes?: Record<string, unknown> } | null;
    };
    const a = review.data?.attributes ?? {};
    const contactOk = Boolean(a.contactFirstName && a.contactLastName && a.contactEmail && a.contactPhone);
    const demoOk = a.demoAccountRequired !== true || Boolean(a.demoAccountName && a.demoAccountPassword);
    checks.push(
      contactOk && demoOk
        ? { code: "REVIEW_DETAILS", status: "ok", message: "Review contact and demo account set" }
        : {
            code: "REVIEW_DETAILS",
            status: "missing",
            message: !contactOk ? "Review contact (name, email, phone) incomplete" : "Demo account required but credentials missing",
            suggestion: "Set appStoreReviewDetail via apple_api_call (PATCH /v1/appStoreReviewDetails/{id}).",
          },
    );
  } catch {
    checks.push({
      code: "REVIEW_DETAILS",
      status: "missing",
      message: "No App Review details for this version",
      suggestion: "Create appStoreReviewDetails with contact info (and demo account if login is required).",
    });
  }

  // App Privacy no tiene API pública: se recuerda verificarla en la web.
  checks.push({
    code: "APP_PRIVACY",
    status: "warning",
    message: "App Privacy (data usage) can't be read via the public API — confirm it's published in App Store Connect",
    suggestion: "fastlane upload_app_privacy_details_to_app_store (Apple ID session) or App Store Connect → App Privacy.",
  });

  const ready = !checks.some((c) => c.status === "missing");
  return { ready, checks };
}
