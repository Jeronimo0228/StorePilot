import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config, Toolset } from "./config.js";
import { ToolError, toolErrorResult, toolTextResult } from "./errors.js";
import { getProjectSession } from "../core/project-session.js";

export type ToolCategory =
  | "read"
  | "release"
  | "metadata"
  | "admin"
  | "destructive";

export interface ToolOptions {
  categories?: ToolCategory[];
  destructive?: boolean;
}

const DESTRUCTIVE_TOOLS = new Set([
  "apple_submit_for_review",
  "apple_submit_for_beta_review",
  "apple_delete_in_app_purchase",
  "apple_remove_user",
  "apple_revoke_certificate",
  "apple_delete_profile",
  "apple_delete_review_response",
  "apple_disable_capability",
  "google_delete_all_images",
  "google_delete_in_app_product",
  "google_halt_release",
  "trigger_full_release",
  "promote_release",
  "configure_rollout",
  "execute_release_intent",
  "google_upload_bundle",
  "google_upload_apk",
  "google_upload_and_release",
  "google_upload_deobfuscation_file",
  "google_upload_internal_sharing_apk",
  "google_upload_internal_sharing_bundle",
  "apple_set_beta_group_public_link",
  "apple_set_export_compliance",
  "apple_upload_screenshot",
  "apple_upload_screenshots",
  "google_set_data_safety",
  "google_upload_expansion_file",
  "google_refund_order",
  "google_create_user",
  "google_delete_user",
  "google_acknowledge_product_purchase",
]);

const RELEASE_TOOLS = new Set([
  "trigger_full_release",
  "get_release_status",
  "apple_create_app_version",
  "apple_assign_build_to_version",
  "apple_set_release_type",
  "apple_set_phased_release",
  "apple_submit_for_review",
  "apple_set_release_notes",
  "google_create_release",
  "google_promote_release",
  "google_set_rollout_fraction",
  "google_update_track",
  "google_set_release_notes",
  "google_commit_edit",
  "google_validate_edit",
  "google_create_edit",
  "get_release_snapshot",
  "explain_release_blockers",
  "load_project",
  "select_project",
  "resolve_project",
  "get_active_project",
  "create_tester_group",
  "promote_release",
  "configure_rollout",
  "execute_release_intent",
  "list_projects",
  "google_get_first_launch_checklist",
  "apple_get_first_launch_checklist",
  "google_list_api_catalog",
  "apple_list_api_catalog",
  "google_set_data_safety",
  "google_upload_bundle",
  "google_upload_apk",
  "google_upload_and_release",
  "google_list_subscriptions",
  "google_get_subscription",
  "apple_get_version_review_info",
  "apple_list_version_review_info",
  "apple_get_submission_readiness",
  "apple_get_content_rights",
  "apple_get_export_compliance",
  "apple_list_screenshot_sets",
  "apple_list_screenshots",
]);

function inferCategories(name: string): ToolCategory[] {
  if (
    name.startsWith("list_pending") ||
    name.startsWith("mark_webhook") ||
    name.startsWith("get_release")
  ) {
    return ["read", "release"];
  }

  if (
    name.includes("_list_") ||
    name.includes("_get_") ||
    name.startsWith("apple_list") ||
    name.startsWith("apple_get") ||
    name.startsWith("google_list") ||
    name.startsWith("google_get")
  ) {
    return ["read"];
  }

  if (RELEASE_TOOLS.has(name)) {
    return ["release"];
  }

  if (
    DESTRUCTIVE_TOOLS.has(name) ||
    name.includes("_delete_") ||
    name.includes("_remove_") ||
    name.includes("_revoke_")
  ) {
    return ["destructive"];
  }

  if (
    name.includes("_update_") ||
    name.includes("_set_") ||
    name.includes("_create_") ||
    name.includes("_add_") ||
    name.includes("_register_") ||
    name.includes("_enable_") ||
    name.includes("_respond_") ||
    name.includes("_reply_") ||
    name.includes("_invite_") ||
    name.includes("_assign_") ||
    name.includes("_upload_") ||
    name.includes("_promote_") ||
    name.includes("_halt_")
  ) {
    return ["admin"];
  }

  return ["metadata"];
}

function isToolEnabled(toolset: Toolset, categories: ToolCategory[]): boolean {
  switch (toolset) {
    case "all":
      return true;
    case "release":
      return categories.some((c) => ["read", "release"].includes(c));
    case "readonly":
      return categories.includes("read");
    default:
      return true;
  }
}

export interface ToolRegistrar {
  tool: (
    name: string,
    description: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema: Record<string, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (args: any) => Promise<{ content: Array<{ type: "text"; text: string }> }>,
    options?: ToolOptions,
  ) => void;
}

export function createToolRegistrar(
  server: McpServer,
  config: Config,
): ToolRegistrar {
  return {
    tool(name, description, schema, handler, options = {}) {
      const categories = options.categories ?? inferCategories(name);
      const destructive =
        options.destructive ??
        (DESTRUCTIVE_TOOLS.has(name) || categories.includes("destructive"));

      if (!isToolEnabled(config.toolset, categories)) {
        return;
      }

      const hasDryRun = "dryRun" in schema;
      const finalSchema = destructive
        ? {
            ...schema,
            confirm: z
              .literal(true)
              .optional()
              .describe(
                hasDryRun
                  ? "Required when dryRun is false. Omit when dryRun is true (default)."
                  : "Must be true to confirm this destructive or irreversible store operation.",
              ),
          }
        : schema;

      // Optional multi-project selector — injected on every tool so agents can
      // target an app by name without restarting the MCP server.
      const schemaWithProject = {
        ...finalSchema,
        project: z
          .string()
          .optional()
          .describe(
            "StorePilot project slug, display name, package, or Apple appId. Selects which storepilot.yaml IDs to use for this call.",
          ),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      server.tool(name, description, schemaWithProject as any, async (rawArgs: any) => {
        try {
          const args = rawArgs as Record<string, unknown> & {
            confirm?: true;
            project?: string;
            dryRun?: boolean;
          };
          const dryRun = hasDryRun && args.dryRun !== false;
          if (destructive && args.confirm !== true && !dryRun) {
            throw new ToolError(
              `Tool "${name}" requires confirm: true when dryRun is false`,
              "CONFIRMATION_REQUIRED",
              false,
              "Run with dryRun: true to preview, then dryRun: false and confirm: true to execute.",
            );
          }

          // `confirm` sigue llegando al handler: las herramientas de escape lo validan.
          const { project, ...rest } = args;

          const session = getProjectSession();
          const profile = session.resolveForTool({
            project: typeof project === "string" ? project : undefined,
            configPath:
              typeof rest.configPath === "string" ? rest.configPath : undefined,
          });

          // Selecting via `project` also switches the session active project
          // so subsequent calls without project reuse the same app.
          if (typeof project === "string" && project.trim() && profile) {
            session.setActive(profile);
          }

          // Solo se inyectan los IDs que la herramienta declara; si no, terminan
          // como atributos desconocidos en el cuerpo enviado a la tienda (409).
          const withIds = session.injectStoreIds(rest, profile) as Record<string, unknown>;
          const injected = Object.fromEntries(
            Object.entries(withIds).filter(([key]) => key in rest || key in finalSchema),
          );
          return await handler(injected);
        } catch (err) {
          return toolErrorResult(err);
        }
      });
    },
  };
}

export function toolSuccess(data: unknown) {
  return toolTextResult({ success: true, data });
}
