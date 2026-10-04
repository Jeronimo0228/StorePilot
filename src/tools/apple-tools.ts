import { z } from "zod";
import type { ToolRegistrar } from "../utils/tool-registry.js";
import type { AppleClient } from "../providers/apple/client.js";
import * as apps from "../providers/apple/apps.js";
import * as builds from "../providers/apple/builds.js";
import * as testflight from "../providers/apple/testflight.js";
import * as versions from "../providers/apple/versions.js";
import * as metadata from "../providers/apple/metadata.js";
import * as submissions from "../providers/apple/submissions.js";
import * as analytics from "../providers/apple/analytics.js";
import * as iap from "../providers/apple/iap.js";
import * as users from "../providers/apple/users.js";
import * as certificates from "../providers/apple/certificates.js";
import * as devices from "../providers/apple/devices.js";
import * as bundleIds from "../providers/apple/bundleIds.js";
import * as customerReviews from "../providers/apple/customerReviews.js";
import * as appInfo from "../providers/apple/appInfo.js";
import * as compliance from "../providers/apple/compliance.js";
import * as screenshots from "../providers/apple/screenshots.js";
import { APPLE_ASC_API_CATALOG } from "../providers/apple/api-catalog.js";
import { toolSuccess } from "../utils/tool-registry.js";
import { assertReadableAssetPath } from "../utils/asset-paths.js";

const screenshotDisplayTypeSchema = z.enum([
  "APP_IPHONE_67",
        "APP_IPHONE_65",
  "APP_IPHONE_61",
  "APP_IPHONE_58",
  "APP_IPHONE_55",
  "APP_IPHONE_47",
  "APP_IPAD_PRO_129",
  "APP_IPAD_PRO_3GEN_129",
  "APP_IPAD_105",
]);

export function registerAppleTools(tool: ToolRegistrar, client: AppleClient) {
  tool.tool(
    "apple_list_apps",
    "List all apps in the App Store Connect account",
    {
      bundleId: z.string().optional().describe("Filter by bundle ID"),
      name: z.string().optional().describe("Filter by app name"),
    },
    async ({ bundleId, name }) => {
      const result = await apps.listApps(client, { bundleId, name });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_get_app",
    "Get details of a specific app including its App Store versions",
    { appId: z.string().describe("The App Store Connect app ID") },
    async ({ appId }) => {
      const result = await apps.getApp(client, appId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_list_builds",
    "List builds for an app, sorted by upload date (newest first)",
    {
      appId: z.string().describe("The App Store Connect app ID"),
      version: z.string().optional().describe("Filter by build version"),
      processingState: z
        .enum(["PROCESSING", "FAILED", "INVALID", "VALID"])
        .optional()
        .describe("Filter by processing state"),
    },
    async ({ appId, version, processingState }) => {
      const result = await builds.listBuilds(client, appId, {
        version,
        processingState,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_get_build",
    "Get detailed information about a specific build",
    { buildId: z.string().describe("The build ID") },
    async ({ buildId }) => {
      const result = await builds.getBuild(client, buildId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_create_beta_group",
    "Create a new TestFlight beta testing group",
    {
      appId: z.string().describe("The App Store Connect app ID"),
      groupName: z.string().describe("Name for the beta group"),
      isInternal: z
        .boolean()
        .default(false)
        .describe("Whether this is an internal testing group"),
    },
    async ({ appId, groupName, isInternal }) => {
      const result = await testflight.createBetaGroup(
        client,
        appId,
        groupName,
        isInternal,
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_add_build_to_beta_group",
    "Assign a build to a TestFlight beta group for testing",
    {
      betaGroupId: z.string().describe("The beta group ID"),
      buildId: z.string().describe("The build ID to assign"),
    },
    async ({ betaGroupId, buildId }) => {
      await testflight.addBuildToBetaGroup(client, betaGroupId, buildId);
      return {
        content: [
          {
            type: "text" as const,
            text: `Build ${buildId} added to beta group ${betaGroupId}`,
          },
        ],
      };
    },
  );

  tool.tool(
    "apple_submit_for_beta_review",
    "Submit a build for TestFlight external beta review",
    { buildId: z.string().describe("The build ID to submit for beta review") },
    async ({ buildId }) => {
      const result = await testflight.submitForBetaReview(client, buildId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_create_app_version",
    "Create a new App Store version for submission",
    {
      appId: z.string().describe("The App Store Connect app ID"),
      versionString: z
        .string()
        .describe("Version string (e.g. '1.2.0')"),
      platform: z
        .enum(["IOS", "MAC_OS", "TV_OS"])
        .default("IOS")
        .describe("Target platform"),
    },
    async ({ appId, versionString, platform }) => {
      const result = await versions.createAppStoreVersion(
        client,
        appId,
        versionString,
        platform,
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_update_app_localizations",
    "Update localized metadata for an app version (description, keywords, etc.)",
    {
      versionId: z.string().describe("The App Store version ID"),
      locale: z
        .string()
        .describe("Locale code (e.g. 'en-US', 'es-ES')"),
      description: z.string().optional().describe("App description"),
      keywords: z
        .string()
        .optional()
        .describe("Comma-separated keywords"),
      whatsNew: z.string().optional().describe("What's new / release notes"),
      promotionalText: z
        .string()
        .optional()
        .describe("Promotional text"),
      marketingUrl: z.string().optional().describe("Marketing URL"),
      supportUrl: z.string().optional().describe("Support URL"),
    },
    async ({ versionId, locale, ...attrs }) => {
      const localizationsResponse = await metadata.getVersionLocalizations(
        client,
        versionId,
      ) as { data: Array<{ id: string; attributes: { locale: string } }> };

      const existing = localizationsResponse.data?.find(
        (l) => l.attributes.locale === locale,
      );

      let result;
      if (existing) {
        result = await metadata.updateVersionLocalization(
          client,
          existing.id,
          attrs,
        );
      } else {
        result = await metadata.createVersionLocalization(
          client,
          versionId,
          locale,
          attrs,
        );
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_set_release_notes",
    "Set release notes (What's New) for multiple locales at once",
    {
      versionId: z.string().describe("The App Store version ID"),
      releaseNotes: z
        .array(
          z.object({
            locale: z.string().describe("Locale code (e.g. 'en-US')"),
            whatsNew: z.string().describe("Release notes text"),
          }),
        )
        .describe("Array of locale-specific release notes"),
    },
    async ({ versionId, releaseNotes }) => {
      const results = await metadata.setReleaseNotes(
        client,
        versionId,
        releaseNotes,
      );
      const summary = results.map((r, i) => ({
        locale: releaseNotes[i].locale,
        status: r.status,
        reason: r.status === "rejected" ? String(r.reason) : undefined,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }] };
    },
  );

  tool.tool(
    "apple_submit_for_review",
    "Submit an App Store version for App Review",
    {
      versionId: z.string().describe("The App Store version ID to submit"),
    },
    async ({ versionId }) => {
      const result = await submissions.submitForReview(client, versionId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_set_app_pricing",
    "Set the app price (default free) via appPriceSchedules; Apple derives other territories from the base one",
    {
      appId: z.string().describe("The App Store Connect app ID"),
      customerPrice: z
        .string()
        .default("0")
        .describe("Customer price in the base territory currency, e.g. '0' (free) or '0.99'"),
      baseTerritory: z.string().default("USA").describe("Base territory (ISO 3166 alpha-3)"),
    },
    async ({ appId, customerPrice, baseTerritory }) => {
      const result = await submissions.setAppPricing(client, appId, customerPrice, baseTerritory);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_get_review_status",
    "Check the current review status of an App Store version",
    {
      versionId: z.string().describe("The App Store version ID"),
    },
    async ({ versionId }) => {
      const result = await submissions.getReviewStatus(client, versionId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_assign_build_to_version",
    "Assign a build to an App Store version for submission",
    {
      versionId: z.string().describe("The App Store version ID"),
      buildId: z.string().describe("The build ID to assign"),
    },
    async ({ versionId, buildId }) => {
      await versions.assignBuildToVersion(client, versionId, buildId);
      return {
        content: [
          {
            type: "text" as const,
            text: `Build ${buildId} assigned to version ${versionId}`,
          },
        ],
      };
    },
  );

  tool.tool(
    "apple_list_beta_groups",
    "List all TestFlight beta groups for an app",
    {
      appId: z.string().describe("The App Store Connect app ID"),
    },
    async ({ appId }) => {
      const result = await testflight.listBetaGroups(client, appId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_set_beta_group_public_link",
    "Enable or disable TestFlight public link for a beta group",
    {
      betaGroupId: z.string().describe("TestFlight beta group ID"),
      enabled: z.boolean().describe("Enable public link"),
    },
    async ({ betaGroupId, enabled }) => {
      const result = await testflight.setBetaGroupPublicLink(
        client,
        betaGroupId,
        enabled,
      );
      return toolSuccess(result);
    },
    { categories: ["release", "destructive"], destructive: true },
  );

  // --- Analytics ---

  tool.tool(
    "apple_request_analytics_report",
    "Request an ongoing analytics report for an app",
    {
      appId: z.string().describe("The App Store Connect app ID"),
      reportType: z.string().describe("Report type to request"),
    },
    async ({ appId, reportType }) => {
      const result = await analytics.requestAnalyticsReport(client, appId, reportType);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_list_analytics_report_requests",
    "List analytics report requests for an app",
    {
      appId: z.string().describe("The App Store Connect app ID"),
    },
    async ({ appId }) => {
      const result = await analytics.listAnalyticsReportRequests(client, appId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_get_analytics_reports",
    "Get available analytics reports for a report request",
    {
      reportRequestId: z.string().describe("The analytics report request ID"),
      category: z.string().optional().describe("Filter by report category"),
    },
    async ({ reportRequestId, category }) => {
      const result = await analytics.getAnalyticsReports(client, reportRequestId, category);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_get_analytics_report_instances",
    "Get report instances (date-specific snapshots) for an analytics report",
    {
      reportId: z.string().describe("The analytics report ID"),
    },
    async ({ reportId }) => {
      const result = await analytics.getAnalyticsReportInstances(client, reportId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_get_analytics_report_segments",
    "Get downloadable segments (URLs) for an analytics report instance",
    {
      instanceId: z.string().describe("The analytics report instance ID"),
    },
    async ({ instanceId }) => {
      const result = await analytics.getAnalyticsReportSegments(client, instanceId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // --- In-App Purchases ---

  tool.tool(
    "apple_list_in_app_purchases",
    "List all in-app purchases for an app",
    {
      appId: z.string().describe("The App Store Connect app ID"),
    },
    async ({ appId }) => {
      const result = await iap.listInAppPurchases(client, appId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_get_in_app_purchase",
    "Get details of a specific in-app purchase",
    {
      iapId: z.string().describe("The in-app purchase ID"),
    },
    async ({ iapId }) => {
      const result = await iap.getInAppPurchase(client, iapId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_create_in_app_purchase",
    "Create a new in-app purchase product",
    {
      appId: z.string().describe("The App Store Connect app ID"),
      name: z.string().describe("Display name for the in-app purchase"),
      productId: z.string().describe("Unique product identifier (e.g. com.app.coins100)"),
      inAppPurchaseType: z
        .enum(["CONSUMABLE", "NON_CONSUMABLE", "NON_RENEWING_SUBSCRIPTION"])
        .describe("Type of in-app purchase"),
      referenceName: z.string().describe("Internal reference name"),
      reviewNote: z.string().optional().describe("Note for App Review"),
    },
    async ({ appId, ...attrs }) => {
      const result = await iap.createInAppPurchase(client, appId, attrs);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_update_in_app_purchase",
    "Update an existing in-app purchase",
    {
      iapId: z.string().describe("The in-app purchase ID"),
      name: z.string().optional().describe("Updated display name"),
      referenceName: z.string().optional().describe("Updated reference name"),
      reviewNote: z.string().optional().describe("Updated review note"),
    },
    async ({ iapId, ...attrs }) => {
      const result = await iap.updateInAppPurchase(client, iapId, attrs);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_delete_in_app_purchase",
    "Delete an in-app purchase (only if not yet approved)",
    {
      iapId: z.string().describe("The in-app purchase ID"),
    },
    async ({ iapId }) => {
      await iap.deleteInAppPurchase(client, iapId);
      return { content: [{ type: "text" as const, text: `In-app purchase ${iapId} deleted` }] };
    },
  );

  // --- Subscriptions ---

  tool.tool(
    "apple_list_subscription_groups",
    "List all subscription groups for an app",
    {
      appId: z.string().describe("The App Store Connect app ID"),
    },
    async ({ appId }) => {
      const result = await iap.listSubscriptionGroups(client, appId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_create_subscription_group",
    "Create a new subscription group",
    {
      appId: z.string().describe("The App Store Connect app ID"),
      referenceName: z.string().describe("Internal reference name for the group"),
    },
    async ({ appId, referenceName }) => {
      const result = await iap.createSubscriptionGroup(client, appId, referenceName);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_list_subscriptions",
    "List subscriptions within a subscription group",
    {
      subscriptionGroupId: z.string().describe("The subscription group ID"),
    },
    async ({ subscriptionGroupId }) => {
      const result = await iap.listSubscriptions(client, subscriptionGroupId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_create_subscription",
    "Create a new auto-renewable subscription in a group",
    {
      subscriptionGroupId: z.string().describe("The subscription group ID"),
      name: z.string().describe("Subscription name"),
      productId: z.string().describe("Unique product identifier"),
      referenceName: z.string().describe("Internal reference name"),
      subscriptionPeriod: z
        .enum(["ONE_WEEK", "ONE_MONTH", "TWO_MONTHS", "THREE_MONTHS", "SIX_MONTHS", "ONE_YEAR"])
        .describe("Billing period"),
      groupLevel: z.number().describe("Priority within the group (1 = highest)"),
      reviewNote: z.string().optional().describe("Note for App Review"),
    },
    async ({ subscriptionGroupId, ...attrs }) => {
      const result = await iap.createSubscription(client, subscriptionGroupId, attrs);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // --- Users & Roles ---

  tool.tool(
    "apple_list_users",
    "List all users in the App Store Connect team",
    {},
    async () => {
      const result = await users.listUsers(client);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_get_user",
    "Get details of a specific user",
    {
      userId: z.string().describe("The user ID"),
    },
    async ({ userId }) => {
      const result = await users.getUser(client, userId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_update_user_roles",
    "Update roles for a team member",
    {
      userId: z.string().describe("The user ID"),
      roles: z.array(z.string()).describe("Array of role names (e.g. ['ADMIN', 'DEVELOPER'])"),
      allAppsVisible: z.boolean().optional().describe("Whether user can see all apps"),
    },
    async ({ userId, roles, allAppsVisible }) => {
      const result = await users.updateUserRoles(client, userId, roles, allAppsVisible);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_remove_user",
    "Remove a user from the App Store Connect team",
    {
      userId: z.string().describe("The user ID to remove"),
    },
    async ({ userId }) => {
      await users.removeUser(client, userId);
      return { content: [{ type: "text" as const, text: `User ${userId} removed` }] };
    },
  );

  tool.tool(
    "apple_invite_user",
    "Invite a new user to the App Store Connect team",
    {
      email: z.string().describe("Email address"),
      firstName: z.string().describe("First name"),
      lastName: z.string().describe("Last name"),
      roles: z.array(z.string()).describe("Roles to assign"),
      allAppsVisible: z.boolean().default(true).describe("Can see all apps"),
      visibleAppIds: z.array(z.string()).optional().describe("App IDs visible to user (if not all)"),
    },
    async ({ visibleAppIds, ...attrs }) => {
      const result = await users.inviteUser(client, attrs, visibleAppIds);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_list_user_invitations",
    "List pending user invitations",
    {},
    async () => {
      const result = await users.listUserInvitations(client);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // --- Certificates & Profiles ---

  tool.tool(
    "apple_list_certificates",
    "List signing certificates",
    {
      certificateType: z.string().optional().describe("Filter by type (e.g. IOS_DISTRIBUTION, DEVELOPER_ID_APPLICATION)"),
      displayName: z.string().optional().describe("Filter by display name"),
    },
    async ({ certificateType, displayName }) => {
      const result = await certificates.listCertificates(client, { certificateType, displayName });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_get_certificate",
    "Get details of a specific certificate including its content",
    {
      certificateId: z.string().describe("The certificate ID"),
    },
    async ({ certificateId }) => {
      const result = await certificates.getCertificate(client, certificateId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_revoke_certificate",
    "Revoke a signing certificate",
    {
      certificateId: z.string().describe("The certificate ID to revoke"),
    },
    async ({ certificateId }) => {
      await certificates.revokeCertificate(client, certificateId);
      return { content: [{ type: "text" as const, text: `Certificate ${certificateId} revoked` }] };
    },
  );

  tool.tool(
    "apple_list_profiles",
    "List provisioning profiles",
    {
      profileType: z.string().optional().describe("Filter by type (e.g. IOS_APP_STORE, IOS_APP_DEVELOPMENT)"),
      profileState: z.string().optional().describe("Filter by state (ACTIVE, INVALID)"),
      name: z.string().optional().describe("Filter by profile name"),
    },
    async ({ profileType, profileState, name }) => {
      const result = await certificates.listProfiles(client, { profileType, profileState, name });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_get_profile",
    "Get details of a provisioning profile including linked certificates and devices",
    {
      profileId: z.string().describe("The profile ID"),
    },
    async ({ profileId }) => {
      const result = await certificates.getProfile(client, profileId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_create_profile",
    "Create a new provisioning profile",
    {
      name: z.string().describe("Profile name"),
      profileType: z.string().describe("Profile type (e.g. IOS_APP_STORE)"),
      bundleIdId: z.string().describe("Bundle ID resource ID"),
      certificateIds: z.array(z.string()).describe("Certificate resource IDs"),
      deviceIds: z.array(z.string()).optional().describe("Device resource IDs (for development profiles)"),
    },
    async ({ name, profileType, bundleIdId, certificateIds, deviceIds }) => {
      const result = await certificates.createProfile(client, { name, profileType }, bundleIdId, certificateIds, deviceIds);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_delete_profile",
    "Delete a provisioning profile",
    {
      profileId: z.string().describe("The profile ID to delete"),
    },
    async ({ profileId }) => {
      await certificates.deleteProfile(client, profileId);
      return { content: [{ type: "text" as const, text: `Profile ${profileId} deleted` }] };
    },
  );

  // --- Devices ---

  tool.tool(
    "apple_list_devices",
    "List registered devices for development and testing",
    {
      platform: z.string().optional().describe("Filter by platform (IOS, MAC_OS)"),
      status: z.string().optional().describe("Filter by status (ENABLED, DISABLED)"),
      name: z.string().optional().describe("Filter by device name"),
      udid: z.string().optional().describe("Filter by UDID"),
    },
    async (filters) => {
      const result = await devices.listDevices(client, filters);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_register_device",
    "Register a new device for development",
    {
      name: z.string().describe("Device name"),
      udid: z.string().describe("Device UDID"),
      platform: z.enum(["IOS", "MAC_OS"]).describe("Device platform"),
    },
    async ({ name, udid, platform }) => {
      const result = await devices.registerDevice(client, name, udid, platform);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_update_device_status",
    "Enable or disable a registered device",
    {
      deviceId: z.string().describe("The device ID"),
      status: z.enum(["ENABLED", "DISABLED"]).describe("New status"),
    },
    async ({ deviceId, status }) => {
      const result = await devices.updateDeviceStatus(client, deviceId, status);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // --- Bundle IDs & Capabilities ---

  tool.tool(
    "apple_list_bundle_ids",
    "List registered bundle IDs",
    {
      identifier: z.string().optional().describe("Filter by identifier (e.g. com.example.*)"),
      name: z.string().optional().describe("Filter by name"),
      platform: z.string().optional().describe("Filter by platform"),
    },
    async (filters) => {
      const result = await bundleIds.listBundleIds(client, filters);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_get_bundle_id",
    "Get a bundle ID with its capabilities",
    {
      bundleIdId: z.string().describe("The bundle ID resource ID"),
    },
    async ({ bundleIdId }) => {
      const result = await bundleIds.getBundleId(client, bundleIdId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_register_bundle_id",
    "Register a new bundle ID",
    {
      identifier: z.string().describe("Bundle identifier (e.g. com.example.myapp)"),
      name: z.string().describe("Display name"),
      platform: z.enum(["IOS", "MAC_OS", "UNIVERSAL"]).describe("Platform"),
    },
    async ({ identifier, name, platform }) => {
      const result = await bundleIds.registerBundleId(client, identifier, name, platform);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_enable_capability",
    "Enable a capability for a bundle ID (e.g. push notifications, sign in with apple)",
    {
      bundleIdId: z.string().describe("The bundle ID resource ID"),
      capabilityType: z.string().describe("Capability type (e.g. PUSH_NOTIFICATIONS, SIGN_IN_WITH_APPLE, ASSOCIATED_DOMAINS)"),
    },
    async ({ bundleIdId, capabilityType }) => {
      const result = await bundleIds.enableCapability(client, bundleIdId, capabilityType);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_disable_capability",
    "Disable a capability from a bundle ID",
    {
      capabilityId: z.string().describe("The capability resource ID"),
    },
    async ({ capabilityId }) => {
      await bundleIds.disableCapability(client, capabilityId);
      return { content: [{ type: "text" as const, text: `Capability ${capabilityId} disabled` }] };
    },
  );

  // --- Customer Reviews ---

  tool.tool(
    "apple_list_customer_reviews",
    "List customer reviews for an app",
    {
      appId: z.string().describe("The App Store Connect app ID"),
      rating: z.string().optional().describe("Filter by rating (1-5)"),
      territory: z.string().optional().describe("Filter by territory (e.g. USA, GBR)"),
      sort: z.string().optional().describe("Sort order (e.g. '-createdDate', 'rating')"),
    },
    async ({ appId, rating, territory, sort }) => {
      const result = await customerReviews.listCustomerReviews(client, appId, { rating, territory }, sort);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_get_customer_review",
    "Get a specific customer review with its response",
    {
      reviewId: z.string().describe("The review ID"),
    },
    async ({ reviewId }) => {
      const result = await customerReviews.getCustomerReview(client, reviewId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_respond_to_review",
    "Post a developer response to a customer review",
    {
      reviewId: z.string().describe("The review ID to respond to"),
      responseBody: z.string().describe("Response text (max 5970 chars)"),
    },
    async ({ reviewId, responseBody }) => {
      const result = await customerReviews.respondToReview(client, reviewId, responseBody);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_delete_review_response",
    "Delete a developer response to a review",
    {
      responseId: z.string().describe("The review response ID to delete"),
    },
    async ({ responseId }) => {
      await customerReviews.deleteReviewResponse(client, responseId);
      return { content: [{ type: "text" as const, text: `Review response ${responseId} deleted` }] };
    },
  );

  // --- App Info, Categories, Territories, Phased Release ---

  tool.tool(
    "apple_get_app_info",
    "Get app info including categories, age rating, and localizations",
    {
      appId: z.string().describe("The App Store Connect app ID"),
    },
    async ({ appId }) => {
      const result = await appInfo.getAppInfo(client, appId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_set_app_category",
    "Set primary and secondary categories for an app",
    {
      appInfoId: z.string().describe("The app info ID"),
      primaryCategoryId: z.string().describe("Primary category resource ID"),
      secondaryCategoryId: z.string().optional().describe("Secondary category resource ID"),
    },
    async ({ appInfoId, primaryCategoryId, secondaryCategoryId }) => {
      const result = await appInfo.setAppCategory(client, appInfoId, primaryCategoryId, secondaryCategoryId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_list_app_categories",
    "List all available App Store categories",
    {},
    async () => {
      const result = await appInfo.listAppCategories(client);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_list_territories",
    "List all available App Store territories",
    {},
    async () => {
      const result = await appInfo.listTerritories(client);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_get_app_availability",
    "Get the territory availability for an app",
    {
      appId: z.string().describe("The App Store Connect app ID"),
    },
    async ({ appId }) => {
      const result = await appInfo.getAppAvailability(client, appId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_set_app_availability",
    "Make the app available in all App Store territories (optionally excluding some, default CHN) and in new territories. Without availability an approved app is not sold anywhere.",
    {
      appId: z.string().describe("The App Store Connect app ID"),
      exclude: z.array(z.string()).optional().describe("Territory codes to exclude (default [\"CHN\"])"),
      availableInNewTerritories: z.boolean().optional().describe("Auto-enable future territories (default true)"),
    },
    async ({ appId, exclude, availableInNewTerritories }) => {
      const result = await appInfo.setAppAvailability(client, appId, { exclude, availableInNewTerritories });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_set_phased_release",
    "Configure phased release for an App Store version (gradual rollout over 7 days)",
    {
      versionId: z.string().describe("The App Store version ID"),
      phasedReleaseState: z
        .enum(["ACTIVE", "PAUSED", "COMPLETE"])
        .describe("Phased release state"),
    },
    async ({ versionId, phasedReleaseState }) => {
      const result = await appInfo.setPhasedRelease(client, versionId, phasedReleaseState);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_update_age_rating",
    "Update the age rating declaration for an app",
    {
      ageRatingDeclarationId: z.string().describe("The age rating declaration ID"),
      violenceCartoonOrFantasy: z.string().optional().describe("NONE, INFREQUENT_OR_MILD, FREQUENT_OR_INTENSE"),
      violenceRealistic: z.string().optional().describe("NONE, INFREQUENT_OR_MILD, FREQUENT_OR_INTENSE"),
      sexualContentOrNudity: z.string().optional().describe("NONE, INFREQUENT_OR_MILD, FREQUENT_OR_INTENSE"),
      profanityOrCrudeHumor: z.string().optional().describe("NONE, INFREQUENT_OR_MILD, FREQUENT_OR_INTENSE"),
      alcoholTobaccoOrDrugUseOrReferences: z.string().optional().describe("NONE, INFREQUENT_OR_MILD, FREQUENT_OR_INTENSE"),
      gamblingSimulated: z.string().optional().describe("NONE, INFREQUENT_OR_MILD, FREQUENT_OR_INTENSE"),
      horrorOrFearThemes: z.string().optional().describe("NONE, INFREQUENT_OR_MILD, FREQUENT_OR_INTENSE"),
      matureOrSuggestiveThemes: z.string().optional().describe("NONE, INFREQUENT_OR_MILD, FREQUENT_OR_INTENSE"),
      unrestrictedWebAccess: z.boolean().optional().describe("Contains unrestricted web access"),
      gambling: z.boolean().optional().describe("Contains real gambling"),
    },
    async ({ ageRatingDeclarationId, ...attrs }) => {
      const result = await appInfo.updateAgeRatingDeclaration(client, ageRatingDeclarationId, attrs);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_get_price_tiers",
    "List available App Store price points for an app in a territory",
    {
      appId: z.string().describe("The App Store Connect app ID"),
      territory: z
        .string()
        .optional()
        .describe("ISO territory code (default: USA)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Max price points to return (default: 200)"),
    },
    async ({ appId, territory, limit }) => {
      const result = await submissions.listAppPricePoints(client, appId, {
        territory,
        limit,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_list_app_versions",
    "List App Store versions for an app with optional filters",
    {
      appId: z.string().describe("The App Store Connect app ID"),
      state: z.string().optional().describe("Filter by state (e.g. READY_FOR_SALE, PREPARE_FOR_SUBMISSION)"),
      platform: z.string().optional().describe("Filter by platform (IOS, MAC_OS, TV_OS)"),
    },
    async ({ appId, state, platform }) => {
      const result = await versions.listAppStoreVersions(client, appId, { state, platform });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_set_release_type",
    "Set how a version is released after approval (manual, automatic, or scheduled)",
    {
      versionId: z.string().describe("The App Store version ID"),
      releaseType: z.enum(["MANUAL", "AFTER_APPROVAL", "SCHEDULED"]).describe("Release type"),
      earliestReleaseDate: z.string().optional().describe("ISO 8601 date for scheduled release"),
    },
    async ({ versionId, releaseType, earliestReleaseDate }) => {
      const result = await versions.setReleaseType(client, versionId, releaseType, earliestReleaseDate);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "apple_add_beta_testers",
    "Add testers to a TestFlight beta group by email",
    {
      betaGroupId: z.string().describe("The beta group ID"),
      testers: z.array(z.object({
        email: z.string().describe("Tester email"),
        firstName: z.string().optional().describe("First name"),
        lastName: z.string().optional().describe("Last name"),
      })).describe("Array of testers to add"),
    },
    async ({ betaGroupId, testers }) => {
      const results = await testflight.addBetaTesters(client, betaGroupId, testers);
      const summary = results.map((r, i) => ({
        email: testers[i].email,
        status: r.status,
        reason: r.status === "rejected" ? String(r.reason) : undefined,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }] };
    },
  );

  tool.tool(
    "apple_list_screenshot_sets",
    "List App Store screenshot sets for a version localization",
    {
      versionId: z.string().describe("App Store version ID"),
      locale: z.string().describe("BCP-47 locale, e.g. es-CO"),
    },
    async ({ versionId, locale }) => {
      const localization = await screenshots.findVersionLocalization(
        client,
        versionId,
        locale,
      );
      const result = await screenshots.listScreenshotSets(
        client,
        localization.id,
      );
      return toolSuccess({ localizationId: localization.id, locale, ...result });
    },
  );

  tool.tool(
    "apple_list_screenshots",
    "List uploaded screenshots in a screenshot set",
    {
      screenshotSetId: z.string().describe("App screenshot set ID"),
    },
    async ({ screenshotSetId }) => {
      const result = await screenshots.listScreenshotsInSet(
        client,
        screenshotSetId,
      );
      return toolSuccess(result);
    },
  );

  tool.tool(
    "apple_upload_screenshot",
    "Upload one App Store screenshot (reservation + binary upload + commit). Requires confirm: true.",
    {
      versionId: z.string().describe("App Store version ID"),
      locale: z.string().describe("BCP-47 locale"),
      screenshotDisplayType: screenshotDisplayTypeSchema.describe(
        "Device display type, e.g. APP_IPHONE_65",
      ),
      filePath: z.string().describe("Absolute path to PNG or JPEG screenshot"),
    },
    async ({ versionId, locale, screenshotDisplayType, filePath }) => {
      const safePath = assertReadableAssetPath(filePath);
      const result = await screenshots.uploadScreenshot(client, {
        versionId,
        locale,
        screenshotDisplayType,
        filePath: safePath,
      });
      return toolSuccess(result);
    },
    { categories: ["metadata", "release"], destructive: true },
  );

  tool.tool(
    "apple_upload_screenshots",
    "Upload multiple App Store screenshots sequentially. Requires confirm: true.",
    {
      versionId: z.string().describe("App Store version ID"),
      locale: z.string().describe("BCP-47 locale"),
      screenshotDisplayType: screenshotDisplayTypeSchema,
      filePaths: z
        .array(z.string())
        .min(1)
        .describe("Absolute paths to screenshot files"),
    },
    async ({ versionId, locale, screenshotDisplayType, filePaths }) => {
      const safePaths = filePaths.map((p: string) => assertReadableAssetPath(p));
      const result = await screenshots.uploadScreenshots(client, {
        versionId,
        locale,
        screenshotDisplayType,
        filePaths: safePaths,
      });
      return toolSuccess(result);
    },
    { categories: ["metadata", "release"], destructive: true },
  );

  tool.tool(
    "apple_replace_screenshots",
    "Replace a locale's App Store screenshots: deletes the existing set for that display type (and, with removeOtherSets, every other size so stale screenshots don't keep showing on smaller devices) and uploads the new files in order. Requires confirm: true.",
    {
      versionId: z.string().describe("App Store version ID"),
      locale: z.string().describe("BCP-47 locale"),
      screenshotDisplayType: screenshotDisplayTypeSchema,
      filePaths: z.array(z.string()).min(1).max(10).describe("Absolute paths, in display order (max 10)"),
      removeOtherSets: z.boolean().optional().describe("Also delete sets of other display types (default false)"),
    },
    async ({ versionId, locale, screenshotDisplayType, filePaths, removeOtherSets }) => {
      const safePaths = filePaths.map((p: string) => assertReadableAssetPath(p));
      const result = await screenshots.replaceScreenshots(client, {
        versionId,
        locale,
        screenshotDisplayType,
        filePaths: safePaths,
        removeOtherSets,
      });
      return toolSuccess(result);
    },
    { categories: ["metadata", "release"], destructive: true },
  );

  tool.tool(
    "apple_get_content_rights",
    "Get app content rights declaration required before App Store submission",
    {
      appId: z.string().describe("App Store Connect app ID"),
    },
    async ({ appId }) => {
      const result = await compliance.getContentRights(client, appId);
      return toolSuccess(result);
    },
    { categories: ["read", "release"] },
  );

  tool.tool(
    "apple_set_content_rights",
    "Set app content rights declaration. Requires confirm: true.",
    {
      appId: z.string().describe("App Store Connect app ID"),
      contentRightsDeclaration: z
        .enum([
          "DOES_NOT_USE_THIRD_PARTY_CONTENT",
          "USES_THIRD_PARTY_CONTENT",
        ])
        .describe("Third-party content declaration"),
    },
    async ({ appId, contentRightsDeclaration }) => {
      const result = await compliance.setContentRights(
        client,
        appId,
        contentRightsDeclaration,
      );
      return toolSuccess(result);
    },
    { categories: ["release", "destructive"], destructive: true },
  );

  tool.tool(
    "apple_get_export_compliance",
    "Get export compliance / encryption settings for a build",
    {
      buildId: z.string().describe("Build ID"),
    },
    async ({ buildId }) => {
      const result = await compliance.getBuildExportCompliance(client, buildId);
      return toolSuccess(result);
    },
    { categories: ["read", "release"] },
  );

  tool.tool(
    "apple_set_export_compliance",
    "Declare export compliance on a build (typically usesNonExemptEncryption: false). Requires confirm: true.",
    {
      buildId: z.string().describe("Build ID"),
      usesNonExemptEncryption: z
        .boolean()
        .describe("True if app uses non-exempt encryption"),
    },
    async ({ buildId, usesNonExemptEncryption }) => {
      const result = await compliance.setBuildExportCompliance(client, buildId, {
        usesNonExemptEncryption,
        encryptionUpdated: true,
      });
      return toolSuccess(result);
    },
    { categories: ["release", "destructive"], destructive: true },
  );

  tool.tool(
    "apple_get_submission_readiness",
    "Preflight checklist before App Store submission: content rights, build, export compliance, screenshots",
    {
      appId: z.string().describe("App Store Connect app ID"),
      versionId: z.string().describe("App Store version ID"),
      locale: z.string().optional().describe("Locale to check screenshots for"),
      screenshotDisplayType: screenshotDisplayTypeSchema
        .optional()
        .describe("Screenshot device type to verify (default APP_IPHONE_65)"),
    },
    async ({ appId, versionId, locale, screenshotDisplayType }) => {
      const result = await compliance.getSubmissionReadiness(client, {
        appId,
        versionId,
        locale,
        screenshotDisplayType,
      });
      return toolSuccess(result);
    },
    { categories: ["read", "release"] },
  );

  tool.tool(
    "apple_list_api_catalog",
    "Catalog of App Store Connect API endpoints by category. Use apple_api_call for any /v1 or /v2 path not covered by a typed tool — this is how agents reach 100% of ASC REST.",
    {},
    async () => toolSuccess(APPLE_ASC_API_CATALOG),
    { categories: ["read"] },
  );

  tool.tool(
    "apple_get_first_launch_checklist",
    "First App Store submission checklist: API steps vs Transporter/UI-only items (IPA upload, agreements, full privacy nutrition labels).",
    {
      appId: z.string().optional().describe("Apple app ID (uses active project if omitted)"),
    },
    async ({ appId }) =>
      toolSuccess({
        appId: appId ?? null,
        apiAutomatable: APPLE_ASC_API_CATALOG.firstLaunchApiSteps,
        consoleOnlyOrExternal: APPLE_ASC_API_CATALOG.consoleOnlyOrExternal,
        recommendedToolOrder: [
          "select_project / project param",
          "apple_create_app_version",
          "Upload IPA via EAS/Transporter (not REST)",
          "apple_assign_build_to_version",
          "apple_update_app_localizations + apple_set_release_notes",
          "apple_upload_screenshots",
          "apple_set_export_compliance + apple_set_content_rights",
          "apple_update_age_rating + apple_set_app_category",
          "apple_get_submission_readiness",
          "apple_submit_for_review",
        ],
      }),
    { categories: ["read", "release"] },
  );
}
