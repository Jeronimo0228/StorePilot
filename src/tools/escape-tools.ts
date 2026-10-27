import { z } from "zod";
import type { ToolRegistrar } from "../utils/tool-registry.js";
import type { AppleClient } from "../providers/apple/client.js";
import type { GooglePlayClient } from "../providers/google/client.js";
import { toolSuccess } from "../utils/tool-registry.js";
import { ToolError } from "../utils/errors.js";
import * as review from "../providers/apple/review.js";
import * as bundles from "../providers/google/bundles.js";
import {
  assertAppleApiPath,
  assertGoogleMethod,
  isAppleWriteMethod,
  isGoogleWriteMethod,
  parseGoogleResource,
  resolveGoogleApiTarget,
} from "../utils/api-escape.js";

export function registerEscapeTools(
  tool: ToolRegistrar,
  appleClient: AppleClient | undefined,
  googleClient: GooglePlayClient | undefined,
) {
  if (appleClient) {
    tool.tool(
      "apple_get_version_review_info",
      "Get App Store version review submission state and review contact details (useful for rejections)",
      {
        versionId: z.string().describe("App Store version ID"),
      },
      async ({ versionId }) => {
        const result = await review.getVersionReviewInfo(appleClient, versionId);
        return toolSuccess(result);
      },
      { categories: ["read", "release"] },
    );

    tool.tool(
      "apple_list_version_review_info",
      "List review submission info for recent App Store versions of an app",
      {
        appId: z.string().describe("App Store Connect app ID"),
        limit: z.number().int().min(1).max(20).optional().describe("Max versions (default 10)"),
      },
      async ({ appId, limit }) => {
        const result = await review.listReviewSubmissionsForApp(
          appleClient,
          appId,
          limit ?? 10,
        );
        return toolSuccess(result);
      },
      { categories: ["read", "release"] },
    );

    tool.tool(
      "apple_api_call",
      "Low-level App Store Connect API call for endpoints not covered by typed tools. GET without confirm; POST/PATCH/DELETE require confirm: true.",
      {
        method: z
          .enum(["GET", "POST", "PATCH", "DELETE"])
          .default("GET")
          .describe("HTTP method"),
        path: z
          .string()
          .describe("API path starting with /v1/ or /v2/, e.g. /v1/apps"),
        query: z
          .record(z.string(), z.string())
          .optional()
          .describe("Query parameters"),
        body: z.unknown().optional().describe("JSON request body for POST/PATCH"),
        confirm: z
          .literal(true)
          .optional()
          .describe("Required for POST, PATCH, DELETE"),
      },
      async ({ method, path, query, body, confirm }) => {
        assertAppleApiPath(path);
        if (isAppleWriteMethod(method) && confirm !== true) {
          throw new ToolError(
            `apple_api_call ${method} requires confirm: true`,
            "CONFIRMATION_REQUIRED",
            false,
            "Preview with GET first, then retry with confirm: true for writes.",
          );
        }
        const result = await appleClient.request(path, {
          method,
          params: query,
          body,
        });
        return toolSuccess({ method, path, data: result ?? null });
      },
      { categories: ["admin"] },
    );
  }

  if (googleClient) {
    tool.tool(
      "google_upload_bundle",
      "Upload an AAB to a Google Play edit (creates edit, uploads, commits by default)",
      {
        packageName: z.string().describe("Android package name"),
        bundlePath: z.string().describe("Absolute path to .aab file"),
        editId: z
          .string()
          .optional()
          .describe("Existing edit ID; omit to create, upload, and commit"),
        ackBundleInstallationWarning: z
          .boolean()
          .optional()
          .describe("Acknowledge bundle installation warning"),
        commit: z
          .boolean()
          .default(true)
          .describe("Commit edit after upload when editId is omitted"),
      },
      async ({
        packageName,
        bundlePath,
        editId,
        ackBundleInstallationWarning,
        commit,
      }) => {
        if (editId) {
          const result = await bundles.uploadBundle(
            googleClient,
            packageName,
            editId,
            bundlePath,
            { ackBundleInstallationWarning },
          );
          return toolSuccess({ editId, bundle: result, committed: false });
        }

        if (commit) {
          const result = await bundles.uploadAndCommitBundle(
            googleClient,
            packageName,
            bundlePath,
            { ackBundleInstallationWarning },
          );
          return toolSuccess(result);
        }

        const newEditId = await googleClient.createEdit(packageName);
        const bundle = await bundles.uploadBundle(
          googleClient,
          packageName,
          newEditId,
          bundlePath,
          { ackBundleInstallationWarning },
        );
        return toolSuccess({ editId: newEditId, bundle, committed: false });
      },
      { categories: ["release", "destructive"], destructive: true },
    );

    tool.tool(
      "google_upload_apk",
      "Upload an APK to a Google Play edit",
      {
        packageName: z.string().describe("Android package name"),
        apkPath: z.string().describe("Absolute path to .apk file"),
        editId: z.string().describe("Active edit ID"),
      },
      async ({ packageName, apkPath, editId }) => {
        const result = await bundles.uploadApk(
          googleClient,
          packageName,
          editId,
          apkPath,
        );
        return toolSuccess({ editId, apk: result });
      },
      { categories: ["release", "destructive"], destructive: true },
    );

    tool.tool(
      "google_api_call",
      "Low-level Google Play Android Publisher API call. Use dot resource like edits.tracks.get with params JSON. get/list without confirm; writes require confirm: true.",
      {
        resource: z
          .string()
          .describe(
            "API path in dot notation including method, e.g. edits.tracks.get or monetization.onetimeproducts.list",
          ),
        params: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Method parameters as JSON object"),
        confirm: z
          .literal(true)
          .optional()
          .describe("Required for write methods (insert, update, delete, upload, etc.)"),
      },
      async ({ resource, params, confirm }) => {
        const parts = parseGoogleResource(resource);
        const methodName = parts[parts.length - 1];
        assertGoogleMethod(methodName);

        if (isGoogleWriteMethod(methodName) && confirm !== true) {
          throw new ToolError(
            `google_api_call ${resource} requires confirm: true`,
            "CONFIRMATION_REQUIRED",
            false,
            "Use a read method (get/list) to preview, then confirm writes.",
          );
        }

        const { target, methodName: fn } = resolveGoogleApiTarget(
          googleClient.api as unknown as Record<string, unknown>,
          parts,
        );

        const fnTyped = target[fn] as (
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown }>;
        // googleapis methods read `this.context`; call them bound to their resource.
        const response = await fnTyped.call(target, params ?? {});
        return toolSuccess({ resource, data: response?.data ?? response });
      },
      { categories: ["admin"] },
    );
  }
}
