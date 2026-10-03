import { z } from "zod";
import type { ToolRegistrar } from "../utils/tool-registry.js";
import type { GooglePlayClient } from "../providers/google/client.js";
import * as tracks from "../providers/google/tracks.js";
import * as listings from "../providers/google/listings.js";
import * as releases from "../providers/google/releases.js";
import * as images from "../providers/google/images.js";
import * as reviews from "../providers/google/reviews.js";
import * as inAppProducts from "../providers/google/inAppProducts.js";
import * as testers from "../providers/google/testers.js";
import * as details from "../providers/google/details.js";
import * as deobfuscation from "../providers/google/deobfuscation.js";
import * as subscriptions from "../providers/google/subscriptions.js";
import * as internalSharing from "../providers/google/internalSharing.js";
import * as extended from "../providers/google/extended.js";
import {
  GOOGLE_PLAY_API_CATALOG,
  flattenGoogleApiMethods,
} from "../providers/google/api-catalog.js";
import { withOptionalEdit } from "../providers/google/edits.js";
import { buildDataSafetyCsv, type DataSafetySpec } from "../providers/google/data-safety.js";
import { toolSuccess } from "../utils/tool-registry.js";

const optionalEditId = z
  .string()
  .optional()
  .describe(
    "Active edit ID. Omit for read-only calls — a temporary edit is created and discarded automatically.",
  );

export function registerGoogleTools(
  tool: ToolRegistrar,
  client: GooglePlayClient,
) {
  tool.tool(
    "google_create_edit",
    "Create a new edit session for a Google Play app. Required before making changes.",
    {
      packageName: z
        .string()
        .describe("Android package name (e.g. com.example.app)"),
    },
    async ({ packageName }) => {
      const editId = await client.createEdit(packageName);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ editId, packageName }, null, 2),
          },
        ],
      };
    },
  );

  tool.tool(
    "google_commit_edit",
    "Commit an edit session, applying all pending changes",
    {
      packageName: z.string().describe("Android package name"),
      editId: z.string().describe("The edit ID to commit"),
    },
    async ({ packageName, editId }) => {
      await client.commitEdit(packageName, editId);
      return {
        content: [
          {
            type: "text" as const,
            text: `Edit ${editId} committed for ${packageName}`,
          },
        ],
      };
    },
  );

  tool.tool(
    "google_list_tracks",
    "List all tracks (internal, alpha, beta, production) and their releases",
    {
      packageName: z.string().describe("Android package name"),
      editId: optionalEditId,
    },
    async ({ packageName, editId }) => {
      const result = await withOptionalEdit(client, packageName, editId, (id) =>
        tracks.listTracks(client, packageName, id),
      );
      return toolSuccess(result);
    },
  );

  tool.tool(
    "google_update_track",
    "Update a track with a new release (assign builds, set status)",
    {
      packageName: z.string().describe("Android package name"),
      editId: z.string().describe("Active edit ID"),
      track: z
        .string()
        .describe(
          "Track name: 'internal', 'alpha', 'beta', 'production', or custom",
        ),
      versionCodes: z
        .array(z.string())
        .describe("Version codes to include in the release"),
      status: z
        .enum(["draft", "inProgress", "halted", "completed"])
        .describe("Release status"),
      releaseName: z
        .string()
        .optional()
        .describe("Human-readable release name"),
      releaseNotes: z
        .array(
          z.object({
            language: z.string().describe("BCP-47 language code (e.g. en-US)"),
            text: z.string().describe("Release notes text"),
          }),
        )
        .optional()
        .describe("Localized release notes"),
      userFraction: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Staged rollout fraction (0.0 to 1.0). Only for inProgress."),
      inAppUpdatePriority: z
        .number()
        .min(0)
        .max(5)
        .optional()
        .describe("In-app update priority (0-5)"),
    },
    async ({
      packageName,
      editId,
      track,
      versionCodes,
      status,
      releaseName,
      releaseNotes,
      userFraction,
      inAppUpdatePriority,
    }) => {
      const result = await tracks.updateTrack(
        client,
        packageName,
        editId,
        track,
        versionCodes,
        status,
        { releaseName, releaseNotes, userFraction, inAppUpdatePriority },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "google_promote_release",
    "Promote the active release from one track to another (e.g. internal → beta → production)",
    {
      packageName: z.string().describe("Android package name"),
      fromTrack: z.string().describe("Source track name"),
      toTrack: z.string().describe("Destination track name"),
      releaseName: z.string().optional().describe("Release name"),
      releaseNotes: z
        .array(
          z.object({
            language: z.string(),
            text: z.string(),
          }),
        )
        .optional()
        .describe("Localized release notes for the target track"),
      userFraction: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Staged rollout fraction for production"),
      status: z
        .enum(["draft", "inProgress", "halted", "completed"])
        .optional()
        .describe("Release status on target track (default: completed)"),
    },
    async ({
      packageName,
      fromTrack,
      toTrack,
      releaseName,
      releaseNotes,
      userFraction,
      status,
    }) => {
      const result = await tracks.promoteRelease(
        client,
        packageName,
        fromTrack,
        toTrack,
        { releaseName, releaseNotes, userFraction, status },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "google_set_rollout_fraction",
    "Update the staged rollout percentage for an in-progress release",
    {
      packageName: z.string().describe("Android package name"),
      track: z.string().describe("Track name (typically 'production')"),
      userFraction: z
        .number()
        .min(0)
        .max(1)
        .describe("New rollout fraction (0.0 to 1.0)"),
    },
    async ({ packageName, track, userFraction }) => {
      const result = await tracks.setRolloutFraction(
        client,
        packageName,
        track,
        userFraction,
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "google_halt_release",
    "Halt an in-progress staged rollout",
    {
      packageName: z.string().describe("Android package name"),
      track: z.string().describe("Track name"),
    },
    async ({ packageName, track }) => {
      const result = await tracks.haltRelease(client, packageName, track);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "google_update_listing",
    "Update a Google Play store listing for a specific language",
    {
      packageName: z.string().describe("Android package name"),
      editId: z.string().describe("Active edit ID"),
      language: z
        .string()
        .describe("BCP-47 language code (e.g. en-US)"),
      title: z.string().optional().describe("App title (max 30 chars)"),
      shortDescription: z
        .string()
        .optional()
        .describe("Short description (max 80 chars)"),
      fullDescription: z
        .string()
        .optional()
        .describe("Full description (max 4000 chars)"),
      video: z.string().optional().describe("YouTube video URL"),
    },
    async ({ packageName, editId, language, ...listingData }) => {
      const result = await listings.updateListing(
        client,
        packageName,
        editId,
        language,
        listingData,
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "google_set_release_notes",
    "Set release notes for the current release on a track",
    {
      packageName: z.string().describe("Android package name"),
      track: z.string().describe("Track name"),
      releaseNotes: z
        .array(
          z.object({
            language: z.string().describe("BCP-47 language code"),
            text: z.string().describe("Release notes text"),
          }),
        )
        .describe("Localized release notes"),
    },
    async ({ packageName, track, releaseNotes }) => {
      const result = await releases.setReleaseNotes(
        client,
        packageName,
        track,
        releaseNotes,
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "google_upload_image",
    "Upload a screenshot or graphic to a Google Play listing",
    {
      packageName: z.string().describe("Android package name"),
      editId: z.string().describe("Active edit ID"),
      language: z.string().describe("BCP-47 language code"),
      imageType: z
        .enum([
          "featureGraphic",
          "icon",
          "phoneScreenshots",
          "sevenInchScreenshots",
          "tenInchScreenshots",
          "tvBanner",
          "tvScreenshots",
          "wearScreenshots",
        ])
        .describe("Type of image to upload"),
      imagePath: z
        .string()
        .describe("Absolute path to the image file on disk"),
    },
    async ({ packageName, editId, language, imageType, imagePath }) => {
      const result = await images.uploadImage(
        client,
        packageName,
        editId,
        language,
        imageType,
        imagePath,
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "google_list_images",
    "List uploaded images for a Google Play listing",
    {
      packageName: z.string().describe("Android package name"),
      editId: optionalEditId,
      language: z.string().describe("BCP-47 language code"),
      imageType: z
        .enum([
          "featureGraphic",
          "icon",
          "phoneScreenshots",
          "sevenInchScreenshots",
          "tenInchScreenshots",
          "tvBanner",
          "tvScreenshots",
          "wearScreenshots",
        ])
        .describe("Type of images to list"),
    },
    async ({ packageName, editId, language, imageType }) => {
      const result = await withOptionalEdit(client, packageName, editId, (id) =>
        images.listImages(client, packageName, id, language, imageType),
      );
      return toolSuccess(result);
    },
  );

  tool.tool(
    "google_delete_all_images",
    "Delete all images of a specific type for a listing",
    {
      packageName: z.string().describe("Android package name"),
      editId: z.string().describe("Active edit ID"),
      language: z.string().describe("BCP-47 language code"),
      imageType: z
        .enum([
          "featureGraphic",
          "icon",
          "phoneScreenshots",
          "sevenInchScreenshots",
          "tenInchScreenshots",
          "tvBanner",
          "tvScreenshots",
          "wearScreenshots",
        ])
        .describe("Type of images to delete"),
    },
    async ({ packageName, editId, language, imageType }) => {
      await images.deleteAllImages(client, packageName, editId, language, imageType);
      return { content: [{ type: "text" as const, text: `All ${imageType} images deleted for ${language}` }] };
    },
  );

  // --- Reviews ---

  tool.tool(
    "google_list_reviews",
    "List recent user reviews for an app",
    {
      packageName: z.string().describe("Android package name"),
      translationLanguage: z.string().optional().describe("BCP-47 language code to translate reviews into"),
      maxResults: z.number().optional().describe("Max results to return"),
    },
    async ({ packageName, translationLanguage, maxResults }) => {
      const result = await reviews.listReviews(client, packageName, {
        translationLanguage,
        maxResults,
      });
      return toolSuccess(result ?? { reviews: [] });
    },
  );

  tool.tool(
    "google_get_review",
    "Get a specific user review",
    {
      packageName: z.string().describe("Android package name"),
      reviewId: z.string().describe("The review ID"),
      translationLanguage: z.string().optional().describe("BCP-47 language code for translation"),
    },
    async ({ packageName, reviewId, translationLanguage }) => {
      const result = await reviews.getReview(client, packageName, reviewId, translationLanguage);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "google_reply_to_review",
    "Reply to a user review on Google Play",
    {
      packageName: z.string().describe("Android package name"),
      reviewId: z.string().describe("The review ID to reply to"),
      replyText: z.string().describe("Reply text (max 350 chars)"),
    },
    async ({ packageName, reviewId, replyText }) => {
      const result = await reviews.replyToReview(client, packageName, reviewId, replyText);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // --- In-App Products ---

  tool.tool(
    "google_list_in_app_products",
    "List all in-app products (managed products and subscriptions) for an app",
    {
      packageName: z.string().describe("Android package name"),
      maxResults: z.number().optional().describe("Max results to return"),
      pageToken: z.string().optional().describe("Pagination token"),
    },
    async ({ packageName, maxResults, pageToken }) => {
      const result = await inAppProducts.listInAppProducts(
        client,
        packageName,
        maxResults,
        pageToken,
      );
      return toolSuccess(result);
    },
  );

  tool.tool(
    "google_get_in_app_product",
    "Get details of a specific in-app product",
    {
      packageName: z.string().describe("Android package name"),
      sku: z.string().describe("Product SKU"),
    },
    async ({ packageName, sku }) => {
      const result = await inAppProducts.getInAppProduct(client, packageName, sku);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "google_create_in_app_product",
    "Create a new in-app product",
    {
      packageName: z.string().describe("Android package name"),
      sku: z.string().describe("Product SKU (unique identifier)"),
      purchaseType: z.enum(["managedUser", "subscription"]).describe("Product type"),
      priceMicros: z.string().describe("Price in micros (e.g. '990000' for $0.99)"),
      currency: z.string().describe("Currency code (e.g. USD)"),
      defaultLanguage: z.string().describe("Default language (e.g. en-US)"),
      title: z.string().describe("Product title"),
      description: z.string().describe("Product description"),
      status: z.enum(["active", "inactive"]).default("active").describe("Product status"),
    },
    async ({ packageName, sku, purchaseType, priceMicros, currency, defaultLanguage, title, description, status }) => {
      const result = await inAppProducts.createInAppProduct(client, packageName, {
        sku,
        purchaseType,
        defaultPrice: { priceMicros, currency },
        listings: { [defaultLanguage]: { title, description } },
        status,
        defaultLanguage,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "google_update_in_app_product",
    "Update an existing in-app product",
    {
      packageName: z.string().describe("Android package name"),
      sku: z.string().describe("Product SKU"),
      priceMicros: z.string().optional().describe("New price in micros"),
      currency: z.string().optional().describe("Currency code"),
      status: z.enum(["active", "inactive"]).optional().describe("Product status"),
    },
    async ({ packageName, sku, priceMicros, currency, status }) => {
      const update: Record<string, unknown> = {};
      if (priceMicros && currency) update.defaultPrice = { priceMicros, currency };
      if (status) update.status = status;
      const result = await inAppProducts.updateInAppProduct(client, packageName, sku, update);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "google_delete_in_app_product",
    "Delete an in-app product",
    {
      packageName: z.string().describe("Android package name"),
      sku: z.string().describe("Product SKU to delete"),
    },
    async ({ packageName, sku }) => {
      await inAppProducts.deleteInAppProduct(client, packageName, sku);
      return { content: [{ type: "text" as const, text: `In-app product ${sku} deleted` }] };
    },
  );

  // --- Testers & Country Availability ---

  tool.tool(
    "google_get_testers",
    "Get testers for a specific track",
    {
      packageName: z.string().describe("Android package name"),
      editId: optionalEditId,
      track: z.string().describe("Track name"),
    },
    async ({ packageName, editId, track }) => {
      const result = await withOptionalEdit(client, packageName, editId, (id) =>
        testers.getTesters(client, packageName, id, track),
      );
      return toolSuccess(result);
    },
  );

  tool.tool(
    "google_update_testers",
    "Update tester Google Groups for a track",
    {
      packageName: z.string().describe("Android package name"),
      editId: z.string().describe("Active edit ID"),
      track: z.string().describe("Track name"),
      googleGroups: z.array(z.string()).optional().describe("Google Group email addresses for testers"),
    },
    async ({ packageName, editId, track, googleGroups }) => {
      const result = await testers.updateTesters(client, packageName, editId, track, googleGroups);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "google_get_country_availability",
    "Get country availability for a track",
    {
      packageName: z.string().describe("Android package name"),
      editId: optionalEditId,
      track: z.string().describe("Track name"),
    },
    async ({ packageName, editId, track }) => {
      const result = await withOptionalEdit(client, packageName, editId, (id) =>
        testers.getCountryAvailability(client, packageName, id, track),
      );
      return toolSuccess(result);
    },
  );

  // --- App Details ---

  tool.tool(
    "google_get_app_details",
    "Get app-level details (contact info, default language)",
    {
      packageName: z.string().describe("Android package name"),
      editId: optionalEditId,
    },
    async ({ packageName, editId }) => {
      const result = await withOptionalEdit(client, packageName, editId, (id) =>
        details.getAppDetails(client, packageName, id),
      );
      return toolSuccess(result);
    },
  );

  tool.tool(
    "google_update_app_details",
    "Update app-level details (contact email, phone, website, default language)",
    {
      packageName: z.string().describe("Android package name"),
      editId: z.string().describe("Active edit ID"),
      contactEmail: z.string().optional().describe("Developer contact email"),
      contactPhone: z.string().optional().describe("Developer contact phone"),
      contactWebsite: z.string().optional().describe("Developer website URL"),
      defaultLanguage: z.string().optional().describe("Default language (BCP-47)"),
    },
    async ({ packageName, editId, ...detailsData }) => {
      const result = await details.updateAppDetails(client, packageName, editId, detailsData);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "google_list_bundles",
    "List all uploaded AAB bundles for an app in an edit",
    {
      packageName: z.string().describe("Android package name"),
      editId: optionalEditId,
    },
    async ({ packageName, editId }) => {
      const result = await withOptionalEdit(client, packageName, editId, (id) =>
        details.listBundles(client, packageName, id),
      );
      return toolSuccess(result);
    },
  );

  tool.tool(
    "google_list_apks",
    "List all uploaded APKs for an app in an edit",
    {
      packageName: z.string().describe("Android package name"),
      editId: optionalEditId,
    },
    async ({ packageName, editId }) => {
      const result = await withOptionalEdit(client, packageName, editId, (id) =>
        details.listApks(client, packageName, id),
      );
      return toolSuccess(result);
    },
  );

  tool.tool(
    "google_list_listings",
    "List all store listings for an app across all languages",
    {
      packageName: z.string().describe("Android package name"),
      editId: optionalEditId,
    },
    async ({ packageName, editId }) => {
      const result = await withOptionalEdit(client, packageName, editId, (id) =>
        listings.getListings(client, packageName, id),
      );
      return toolSuccess(result);
    },
  );

  tool.tool(
    "google_get_listing",
    "Get a specific store listing by language",
    {
      packageName: z.string().describe("Android package name"),
      editId: optionalEditId,
      language: z.string().describe("BCP-47 language code"),
    },
    async ({ packageName, editId, language }) => {
      const result = await withOptionalEdit(client, packageName, editId, (id) =>
        listings.getListing(client, packageName, id, language),
      );
      return toolSuccess(result);
    },
  );

  tool.tool(
    "google_create_listing",
    "Create a new store listing for a language",
    {
      packageName: z.string().describe("Android package name"),
      editId: z.string().describe("Active edit ID"),
      language: z.string().describe("BCP-47 language code"),
      title: z.string().describe("App title (max 30 chars)"),
      shortDescription: z.string().describe("Short description (max 80 chars)"),
      fullDescription: z.string().describe("Full description (max 4000 chars)"),
      video: z.string().optional().describe("YouTube video URL"),
    },
    async ({ packageName, editId, language, ...listingData }) => {
      const result = await listings.createListing(client, packageName, editId, language, listingData);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "google_validate_edit",
    "Validate an edit without committing (dry-run check for errors)",
    {
      packageName: z.string().describe("Android package name"),
      editId: z.string().describe("Edit ID to validate"),
    },
    async ({ packageName, editId }) => {
      await client.validateEdit(packageName, editId);
      return { content: [{ type: "text" as const, text: `Edit ${editId} validated successfully for ${packageName}` }] };
    },
  );

  tool.tool(
    "google_create_release",
    "Create a new release on a track (without needing to manage edits manually)",
    {
      packageName: z.string().describe("Android package name"),
      track: z.string().describe("Track name (internal, alpha, beta, production)"),
      versionCodes: z.array(z.string()).describe("Version codes for the release"),
      status: z.enum(["draft", "inProgress", "halted", "completed"]).describe("Release status"),
      releaseName: z.string().optional().describe("Human-readable release name"),
      releaseNotes: z
        .array(z.object({
          language: z.string().describe("BCP-47 language code"),
          text: z.string().describe("Release notes text"),
        }))
        .optional()
        .describe("Localized release notes"),
      userFraction: z.number().min(0).max(1).optional().describe("Staged rollout fraction"),
    },
    async ({ packageName, track, versionCodes, status, releaseName, releaseNotes, userFraction }) => {
      const result = await releases.createRelease(client, packageName, track, versionCodes, status, {
        releaseName,
        releaseNotes,
        userFraction,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  tool.tool(
    "google_upload_and_release",
    "Upload AAB and assign to a track in one workflow (upload + track update + commit)",
    {
      packageName: z.string().describe("Android package name"),
      bundlePath: z.string().describe("Absolute path to .aab file"),
      track: z
        .string()
        .default("internal")
        .describe("Target track (internal, alpha, beta, production)"),
      status: z
        .enum(["draft", "inProgress", "halted", "completed"])
        .default("completed")
        .describe("Release status after upload"),
      releaseName: z.string().optional(),
      releaseNotes: z
        .array(
          z.object({
            language: z.string(),
            text: z.string(),
          }),
        )
        .optional(),
      userFraction: z.number().min(0).max(1).optional(),
      ackBundleInstallationWarning: z.boolean().optional(),
    },
    async ({
      packageName,
      bundlePath,
      track,
      status,
      releaseName,
      releaseNotes,
      userFraction,
      ackBundleInstallationWarning,
    }) => {
      const result = await releases.uploadBundleAndRelease(
        client,
        packageName,
        bundlePath,
        track as tracks.TrackName,
        status,
        { releaseName, releaseNotes, userFraction, ackBundleInstallationWarning },
      );
      return toolSuccess(result);
    },
    { categories: ["release", "destructive"], destructive: true },
  );

  tool.tool(
    "google_upload_deobfuscation_file",
    "Upload ProGuard/R8 mapping file for crash deobfuscation",
    {
      packageName: z.string().describe("Android package name"),
      editId: z.string().describe("Active edit ID"),
      apkVersionCode: z.number().int().describe("APK version code"),
      mappingPath: z.string().describe("Absolute path to mapping.txt"),
      deobfuscationFileType: z
        .enum(["proguard", "nativeCode"])
        .default("proguard"),
    },
    async ({
      packageName,
      editId,
      apkVersionCode,
      mappingPath,
      deobfuscationFileType,
    }) => {
      const result = await deobfuscation.uploadDeobfuscationFile(
        client,
        packageName,
        editId,
        apkVersionCode,
        mappingPath,
        deobfuscationFileType,
      );
      return toolSuccess(result);
    },
    { categories: ["release", "destructive"], destructive: true },
  );

  tool.tool(
    "google_list_subscriptions",
    "List Google Play subscriptions (monetization.subscriptions v2 API)",
    {
      packageName: z.string().describe("Android package name"),
      pageSize: z.number().int().min(1).max(100).optional(),
    },
    async ({ packageName, pageSize }) => {
      const result = await subscriptions.listSubscriptions(
        client,
        packageName,
        pageSize ?? 50,
      );
      return toolSuccess(result);
    },
  );

  tool.tool(
    "google_get_subscription",
    "Get a Google Play subscription by product ID",
    {
      packageName: z.string().describe("Android package name"),
      productId: z.string().describe("Subscription product ID"),
    },
    async ({ packageName, productId }) => {
      const result = await subscriptions.getSubscription(
        client,
        packageName,
        productId,
      );
      return toolSuccess(result);
    },
  );

  tool.tool(
    "google_upload_internal_sharing_apk",
    "Upload APK to Google Play Internal App Sharing (instant share link)",
    {
      packageName: z.string().describe("Android package name"),
      apkPath: z.string().describe("Absolute path to .apk file"),
    },
    async ({ packageName, apkPath }) => {
      const result = await internalSharing.uploadInternalSharingApk(
        client,
        packageName,
        apkPath,
      );
      return toolSuccess(result);
    },
    { categories: ["release", "destructive"], destructive: true },
  );

  tool.tool(
    "google_upload_internal_sharing_bundle",
    "Upload AAB to Google Play Internal App Sharing",
    {
      packageName: z.string().describe("Android package name"),
      bundlePath: z.string().describe("Absolute path to .aab file"),
    },
    async ({ packageName, bundlePath }) => {
      const result = await internalSharing.uploadInternalSharingBundle(
        client,
        packageName,
        bundlePath,
      );
      return toolSuccess(result);
    },
    { categories: ["release", "destructive"], destructive: true },
  );

  // ── Full API catalog + first-launch / extended surfaces ──────────────

  tool.tool(
    "google_list_api_catalog",
    "List EVERY Android Publisher v3 API method (complete surface). Use google_api_call for any method not wrapped as a typed tool. Also lists Play Console-only first-launch forms.",
    {},
    async () =>
      toolSuccess({
        ...GOOGLE_PLAY_API_CATALOG,
        methods: flattenGoogleApiMethods(),
        methodCount: flattenGoogleApiMethods().length,
      }),
    { categories: ["read"] },
  );

  tool.tool(
    "google_get_first_launch_checklist",
    "First Google Play deployment checklist: API-automatable steps (listing, contact/privacy URL, images, binary, data safety, tracks) vs Console-only policy forms (content rating, ads, target audience, etc.).",
    {
      packageName: z.string().optional().describe("Android package (uses active project if omitted)"),
    },
    async ({ packageName }) => {
      return toolSuccess({
        packageName: packageName ?? null,
        apiAutomatable: GOOGLE_PLAY_API_CATALOG.firstLaunchApiSteps,
        consoleOnly: GOOGLE_PLAY_API_CATALOG.consoleOnly,
        recommendedToolOrder: [
          "select_project / project param",
          "google_create_edit",
          "google_update_app_details (contactEmail + contactWebsite=privacy policy)",
          "google_update_listing",
          "google_upload_image (icon, featureGraphic, phoneScreenshots…)",
          "google_upload_bundle",
          "google_set_data_safety",
          "google_update_track / google_create_release",
          "google_commit_edit",
          "Then complete Console-only forms listed in consoleOnly before production",
        ],
        note: "After the first production release, day-2 automation (tracks, rollouts, listings) is fully covered by typed tools + google_api_call.",
      });
    },
    { categories: ["read", "release"] },
  );

  tool.tool(
    "google_set_data_safety",
    "Write the app Data Safety / Safety Labels declaration via applications.dataSafety. Pass either `spec` (simple JSON: data types, purposes, account questions — StorePilot builds the official CSV) or the raw `safetyLabels` CSV.",
    {
      packageName: z.string().describe("Android package name"),
      safetyLabels: z.string().optional().describe("Raw Safety Labels CSV (Play Console export format)"),
      spec: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          "Simple declaration: { encryptedInTransit, deletionRequest, dataDeletionUrl, accounts: { creationMethods: [PSL_ACM_...], deletionUrl, outsideAppTypes }, types: { PSL_EMAIL: { collected, shared, optional, ephemeral, purposes: [PSL_APP_FUNCTIONALITY...] } } }",
        ),
    },
    async ({ packageName, safetyLabels, spec }) => {
      const csv = safetyLabels ?? (spec ? buildDataSafetyCsv(spec as DataSafetySpec) : null);
      if (!csv) throw new Error("Pass `spec` or `safetyLabels`.");
      const result = await extended.setDataSafety(client, packageName, csv);
      return toolSuccess(result);
    },
    { categories: ["admin", "destructive"], destructive: true },
  );

  tool.tool(
    "google_get_expansion_file",
    "Get OBB expansion file metadata for an APK version in an edit",
    {
      packageName: z.string(),
      editId: z.string(),
      apkVersionCode: z.number().int(),
      expansionFileType: z.enum(["main", "patch"]),
    },
    async ({ packageName, editId, apkVersionCode, expansionFileType }) => {
      const result = await extended.getExpansionFile(
        client,
        packageName,
        editId,
        apkVersionCode,
        expansionFileType,
      );
      return toolSuccess(result);
    },
    { categories: ["read"] },
  );

  tool.tool(
    "google_upload_expansion_file",
    "Upload an OBB expansion file (main/patch) for an APK version in an edit",
    {
      packageName: z.string(),
      editId: z.string(),
      apkVersionCode: z.number().int(),
      expansionFileType: z.enum(["main", "patch"]),
      filePath: z.string().describe("Absolute path to .obb file"),
    },
    async ({
      packageName,
      editId,
      apkVersionCode,
      expansionFileType,
      filePath,
    }) => {
      const result = await extended.uploadExpansionFile(
        client,
        packageName,
        editId,
        apkVersionCode,
        expansionFileType,
        filePath,
      );
      return toolSuccess(result);
    },
    { categories: ["admin", "destructive"], destructive: true },
  );

  tool.tool(
    "google_get_order",
    "Get Google Play order details by order ID",
    {
      packageName: z.string(),
      orderId: z.string(),
    },
    async ({ packageName, orderId }) => {
      const result = await extended.getOrder(client, packageName, orderId);
      return toolSuccess(result);
    },
    { categories: ["read", "admin"] },
  );

  tool.tool(
    "google_batch_get_orders",
    "Batch-get Google Play orders (1–1000 order IDs)",
    {
      packageName: z.string(),
      orderIds: z.array(z.string()).min(1).max(1000),
    },
    async ({ packageName, orderIds }) => {
      const result = await extended.batchGetOrders(
        client,
        packageName,
        orderIds,
      );
      return toolSuccess(result);
    },
    { categories: ["read", "admin"] },
  );

  tool.tool(
    "google_refund_order",
    "Refund a Google Play order (optionally revoke entitlements)",
    {
      packageName: z.string(),
      orderId: z.string(),
      revoke: z
        .boolean()
        .optional()
        .describe("Also revoke access to purchased item"),
    },
    async ({ packageName, orderId, revoke }) => {
      const result = await extended.refundOrder(client, packageName, orderId, {
        revoke,
      });
      return toolSuccess(result);
    },
    { categories: ["admin", "destructive"], destructive: true },
  );

  tool.tool(
    "google_list_voided_purchases",
    "List voided/refunded purchases for an app",
    {
      packageName: z.string(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      maxResults: z.number().int().optional(),
      token: z.string().optional(),
      type: z.number().int().optional(),
    },
    async (args) => {
      const result = await extended.listVoidedPurchases(
        client,
        args.packageName,
        args,
      );
      return toolSuccess(result);
    },
    { categories: ["read", "admin"] },
  );

  tool.tool(
    "google_list_users",
    "List Play Console users with access to a developer account. parent is typically developers/{developerId}.",
    {
      parent: z
        .string()
        .describe("Resource parent, e.g. developers/123456789"),
    },
    async ({ parent }) => {
      const result = await extended.listPlayUsers(client, parent);
      return toolSuccess(result);
    },
    { categories: ["read", "admin"] },
  );

  tool.tool(
    "google_create_user",
    "Invite/create a Play Console user under a developer account",
    {
      parent: z.string().describe("developers/{developerId}"),
      user: z
        .record(z.string(), z.unknown())
        .describe("User resource body (email, accessState, grants, etc.)"),
    },
    async ({ parent, user }) => {
      const result = await extended.createPlayUser(client, parent, user);
      return toolSuccess(result);
    },
    { categories: ["admin", "destructive"], destructive: true },
  );

  tool.tool(
    "google_delete_user",
    "Remove a Play Console user by resource name",
    {
      name: z
        .string()
        .describe("User resource name, e.g. developers/123/users/abc"),
    },
    async ({ name }) => {
      const result = await extended.deletePlayUser(client, name);
      return toolSuccess(result);
    },
    { categories: ["admin", "destructive"], destructive: true },
  );

  tool.tool(
    "google_list_onetime_products",
    "List one-time in-app products (monetization.onetimeproducts)",
    {
      packageName: z.string(),
    },
    async ({ packageName }) => {
      const result = await extended.listOneTimeProducts(client, packageName);
      return toolSuccess(result);
    },
    { categories: ["read"] },
  );

  tool.tool(
    "google_get_onetime_product",
    "Get a one-time in-app product by productId",
    {
      packageName: z.string(),
      productId: z.string(),
    },
    async ({ packageName, productId }) => {
      const result = await extended.getOneTimeProduct(
        client,
        packageName,
        productId,
      );
      return toolSuccess(result);
    },
    { categories: ["read"] },
  );

  tool.tool(
    "google_convert_region_prices",
    "Convert a price into region prices using Play monetization.convertRegionPrices",
    {
      packageName: z.string(),
      price: z.object({
        currencyCode: z.string().optional(),
        units: z.string().optional(),
        nanos: z.number().optional(),
      }),
      productTaxCategoryCode: z.string().optional(),
    },
    async ({ packageName, price, productTaxCategoryCode }) => {
      const result = await extended.convertRegionPrices(
        client,
        packageName,
        price,
        productTaxCategoryCode,
      );
      return toolSuccess(result);
    },
    { categories: ["read", "admin"] },
  );

  tool.tool(
    "google_get_product_purchase",
    "Get status of a one-time product purchase token",
    {
      packageName: z.string(),
      productId: z.string(),
      token: z.string(),
    },
    async ({ packageName, productId, token }) => {
      const result = await extended.getProductPurchase(
        client,
        packageName,
        productId,
        token,
      );
      return toolSuccess(result);
    },
    { categories: ["read", "admin"] },
  );

  tool.tool(
    "google_acknowledge_product_purchase",
    "Acknowledge a one-time product purchase",
    {
      packageName: z.string(),
      productId: z.string(),
      token: z.string(),
      developerPayload: z.string().optional(),
    },
    async ({ packageName, productId, token, developerPayload }) => {
      const result = await extended.acknowledgeProductPurchase(
        client,
        packageName,
        productId,
        token,
        developerPayload,
      );
      return toolSuccess(result);
    },
    { categories: ["admin", "destructive"], destructive: true },
  );

  tool.tool(
    "google_get_subscription_purchase",
    "Get a subscription purchase by token (v1 purchases.subscriptions)",
    {
      packageName: z.string(),
      subscriptionId: z.string(),
      token: z.string(),
    },
    async ({ packageName, subscriptionId, token }) => {
      const result = await extended.getSubscriptionPurchase(
        client,
        packageName,
        subscriptionId,
        token,
      );
      return toolSuccess(result);
    },
    { categories: ["read", "admin"] },
  );

  tool.tool(
    "google_list_subscription_offers",
    "List offers under a subscription base plan",
    {
      packageName: z.string(),
      productId: z.string(),
      basePlanId: z.string(),
    },
    async ({ packageName, productId, basePlanId }) => {
      const result = await extended.listSubscriptionBasePlanOffers(
        client,
        packageName,
        productId,
        basePlanId,
      );
      return toolSuccess(result);
    },
    { categories: ["read"] },
  );

  tool.tool(
    "google_list_generated_apks",
    "List generated APKs for a given app bundle version code",
    {
      packageName: z.string(),
      versionCode: z.number().int(),
    },
    async ({ packageName, versionCode }) => {
      const result = await extended.listGeneratedApks(
        client,
        packageName,
        versionCode,
      );
      return toolSuccess(result);
    },
    { categories: ["read"] },
  );

  tool.tool(
    "google_list_app_recovery_actions",
    "List app recovery actions for a package",
    {
      packageName: z.string(),
    },
    async ({ packageName }) => {
      const result = await extended.listAppRecoveryActions(client, packageName);
      return toolSuccess(result);
    },
    { categories: ["read", "admin"] },
  );

  tool.tool(
    "google_list_system_apk_variants",
    "List system APK variants for OEM/system apps",
    {
      packageName: z.string(),
    },
    async ({ packageName }) => {
      const result = await extended.listSystemApkVariants(client, packageName);
      return toolSuccess(result);
    },
    { categories: ["read", "admin"] },
  );
}
