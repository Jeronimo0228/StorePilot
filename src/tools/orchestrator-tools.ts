import { dirname } from "node:path";
import { z } from "zod";
import type { ToolRegistrar } from "../utils/tool-registry.js";
import type { Config } from "../utils/config.js";
import type { AppleClient } from "../providers/apple/client.js";
import type { GooglePlayClient } from "../providers/google/client.js";
import { toolSuccess } from "../utils/tool-registry.js";
import {
  loadProjectMemory,
  loadProjectProfile,
  listRegisteredProjects,
  resolveStoreIds,
} from "../core/project-profile.js";
import { getProjectSession } from "../core/project-session.js";
import {
  buildReleaseSnapshot,
  explainBlockers,
} from "../core/release-snapshot.js";
import {
  executeConfigureRollout,
  executeCreateTesterGroup,
  executePromoteRelease,
  planConfigureRollout,
  planCreateTesterGroup,
  planPromoteRelease,
} from "../core/release-workflows.js";
import {
  describeIntent,
  executeReleaseIntent,
  type ReleaseIntent,
} from "../core/release-intent.js";

const testerTypeSchema = z
  .enum(["internal", "closed", "open"])
  .describe("Tester group type: internal employees, closed external, or open beta");

const dryRunSchema = z
  .boolean()
  .default(true)
  .describe(
    "When true (default), returns the execution plan without changing stores. Set false with confirm: true to execute.",
  );

function resolveProfile(_config: Config, configPath?: string) {
  const session = getProjectSession();
  return session.resolveForTool({ configPath }) ?? session.getActive();
}

export function registerOrchestratorTools(
  tool: ToolRegistrar,
  appleClient: AppleClient | undefined,
  googleClient: GooglePlayClient | undefined,
  config: Config,
) {
  tool.tool(
    "load_project",
    "Load storepilot.yaml project profile and persisted release memory from .storepilot/memory.json. Sets it as the active multi-project session.",
    {
      configPath: z
        .string()
        .optional()
        .describe("Path to storepilot.yaml (auto-discovered from cwd if omitted)"),
    },
    async ({ configPath }) => {
      const profile = loadProjectProfile(configPath);
      if (!profile) {
        return toolSuccess({
          loaded: false,
          message:
            "No storepilot.yaml found. Copy storepilot.example.yaml and set stores.ios.appId / stores.android.package.",
        });
      }
      getProjectSession().setActive(profile);
      const memory = loadProjectMemory(profile);
      return toolSuccess({ loaded: true, profile, memory, active: true });
    },
    { categories: ["read", "release"] },
  );

  tool.tool(
    "select_project",
    "Select the active StorePilot project for this MCP session. Match by project slug, display name, Android package, Apple appId, or config path. All subsequent tools auto-fill appId/packageName from this project.",
    {
      query: z
        .string()
        .describe(
          "Project slug, app name, package name, Apple appId, or path to storepilot.yaml",
        ),
    },
    async ({ query }) => {
      const session = getProjectSession();
      const profile = session.select(query);
      const memory = loadProjectMemory(profile);
      return toolSuccess({
        selected: true,
        profile,
        memory,
        registrySize: session.list().length,
      });
    },
    { categories: ["read", "release"] },
  );

  tool.tool(
    "resolve_project",
    "Resolve which StorePilot project would be used for a given app name/package/appId without changing the active session.",
    {
      query: z.string().describe("Project slug, app name, package, or appId"),
    },
    async ({ query }) => {
      const profile = getProjectSession().resolve(query);
      return toolSuccess({
        project: profile.project,
        name: profile.name,
        configPath: profile.configPath,
        iosAppId: profile.stores?.ios?.appId,
        androidPackage: profile.stores?.android?.package,
      });
    },
    { categories: ["read", "release"] },
  );

  tool.tool(
    "get_active_project",
    "Return the currently active StorePilot project for this MCP session (used when tools omit appId/packageName).",
    {},
    async () => {
      const session = getProjectSession();
      const profile = session.getActive();
      if (!profile) {
        return toolSuccess({
          active: false,
          registry: session.list(),
          message:
            "No active project. Call select_project or list_projects, or set STOREPILOT_CONFIG_PATH / STOREPILOT_PROJECTS.",
        });
      }
      return toolSuccess({
        active: true,
        profile,
        memory: loadProjectMemory(profile),
        registry: session.list(),
      });
    },
    { categories: ["read", "release"] },
  );

  tool.tool(
    "get_release_snapshot",
    "Unified release snapshot: production vs candidate versions, blockers, and recommended next actions. Uses storepilot.yaml defaults when IDs are omitted.",
    {
      appleAppId: z.string().optional().describe("Override Apple app ID"),
      googlePackageName: z
        .string()
        .optional()
        .describe("Override Android package name"),
      configPath: z.string().optional().describe("Path to storepilot.yaml"),
    },
    async ({ appleAppId, googlePackageName, configPath }) => {
      const profile = resolveProfile(config, configPath);
      const ids = resolveStoreIds(profile, { appleAppId, googlePackageName });

      const snapshot = await buildReleaseSnapshot(
        appleClient,
        googleClient,
        {
          profile,
          appleAppId: ids.appleAppId,
          googlePackageName: ids.googlePackageName,
        },
      );

      return toolSuccess(snapshot);
    },
    { categories: ["read", "release"] },
  );

  tool.tool(
    "explain_release_blockers",
    "Explain why a release may be blocked and what to do next. Wraps get_release_snapshot with human-readable guidance.",
    {
      appleAppId: z.string().optional(),
      googlePackageName: z.string().optional(),
      configPath: z.string().optional(),
    },
    async ({ appleAppId, googlePackageName, configPath }) => {
      const profile = resolveProfile(config, configPath);
      const ids = resolveStoreIds(profile, { appleAppId, googlePackageName });

      const snapshot = await buildReleaseSnapshot(
        appleClient,
        googleClient,
        {
          profile,
          appleAppId: ids.appleAppId,
          googlePackageName: ids.googlePackageName,
        },
      );

      return toolSuccess(explainBlockers(snapshot));
    },
    { categories: ["read", "release"] },
  );

  tool.tool(
    "create_tester_group",
    "Create a TestFlight beta group (iOS) and/or configure Google Play track testers. dryRun defaults to true.",
    {
      platform: z
        .enum(["ios", "android", "both"])
        .describe("Target platform(s)"),
      name: z.string().describe("Group name (TestFlight) or label for the operation"),
      type: testerTypeSchema,
      testers: z
        .array(
          z.object({
            email: z.string().email(),
            firstName: z.string().optional(),
            lastName: z.string().optional(),
          }),
        )
        .optional()
        .describe("iOS testers to invite by email"),
      googleGroups: z
        .array(z.string())
        .optional()
        .describe("Google Group emails for Android track testers"),
      appleAppId: z.string().optional(),
      googlePackageName: z.string().optional(),
      configPath: z.string().optional(),
      dryRun: dryRunSchema,
    },
    async (args) => {
      const profile = resolveProfile(config, args.configPath);
      if (args.dryRun) {
        const plan = await planCreateTesterGroup(
          appleClient,
          googleClient,
          profile,
          args,
        );
        return toolSuccess({ dryRun: true, plan });
      }

      const result = await executeCreateTesterGroup(
        appleClient,
        googleClient,
        profile,
        args,
      );
      return toolSuccess({ dryRun: false, ...result });
    },
    { categories: ["release"] },
  );

  tool.tool(
    "promote_release",
    "Promote a release: Android track-to-track promotion, or iOS submit for review / TestFlight beta review. dryRun defaults to true.",
    {
      platform: z.enum(["ios", "android"]),
      fromTrack: z.string().optional().describe("Android source track"),
      toTrack: z.string().optional().describe("Android destination track"),
      userFraction: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Staged rollout 0–1 when promoting to production"),
      buildId: z.string().optional().describe("iOS TestFlight build ID"),
      versionId: z.string().optional().describe("iOS App Store version ID"),
      releaseNotes: z
        .array(z.object({ language: z.string(), text: z.string() }))
        .optional(),
      appleAppId: z.string().optional(),
      googlePackageName: z.string().optional(),
      configPath: z.string().optional(),
      dryRun: dryRunSchema,
    },
    async (args) => {
      const profile = resolveProfile(config, args.configPath);
      if (args.dryRun) {
        const plan = await planPromoteRelease(
          appleClient,
          googleClient,
          profile,
          args,
        );
        return toolSuccess({ dryRun: true, plan });
      }

      const result = await executePromoteRelease(
        appleClient,
        googleClient,
        profile,
        args,
      );
      return toolSuccess({ dryRun: false, ...result });
    },
    { categories: ["release", "destructive"], destructive: true },
  );

  tool.tool(
    "configure_rollout",
    "Configure staged rollout: Android userFraction or iOS phased release. dryRun defaults to true.",
    {
      platform: z.enum(["ios", "android"]),
      percentage: z
        .number()
        .min(0)
        .max(100)
        .describe("Rollout percentage 0–100"),
      versionId: z.string().optional().describe("iOS App Store version ID"),
      track: z.string().optional().describe("Android track (default: production)"),
      googlePackageName: z.string().optional(),
      configPath: z.string().optional(),
      dryRun: dryRunSchema,
    },
    async (args) => {
      const profile = resolveProfile(config, args.configPath);
      if (args.dryRun) {
        const plan = await planConfigureRollout(
          appleClient,
          googleClient,
          profile,
          args,
        );
        return toolSuccess({ dryRun: true, plan });
      }

      const result = await executeConfigureRollout(
        appleClient,
        googleClient,
        profile,
        args,
      );
      return toolSuccess({ dryRun: false, ...result });
    },
    { categories: ["release", "destructive"], destructive: true },
  );

  tool.tool(
    "render_store_screenshots",
    "Compose store screenshots from raw app captures: device frames (iPhone 6.9\", iPad 13\", Android 1080x1920), brand backgrounds and localized headlines, plus the Play feature graphic. Reads a store-shots JSON config (see scripts/store-shots). Output PNGs are RGB (no alpha) and sized for App Store Connect / Google Play.",
    {
      shotsConfig: z.string().describe("Absolute path to the store-shots config JSON"),
      only: z.array(z.enum(["ios", "ipad", "android", "feature"])).optional().describe("Targets to render (default: all configured)"),
      slides: z.array(z.string()).optional().describe("Slide ids to render (default: all)"),
    },
    async ({ shotsConfig, only, slides }) => {
      const { execFile } = await import("node:child_process");
      const { fileURLToPath } = await import("node:url");
      const script = fileURLToPath(new URL("../scripts/store-shots/render.mjs", import.meta.url));
      const args = [script, shotsConfig, ...(only?.length ? ["--only", only.join(",")] : []), ...(slides?.length ? ["--slides", slides.join(",")] : [])];
      const output = await new Promise<string>((resolve, reject) =>
        execFile("node", args, { timeout: 20 * 60_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) =>
          err ? reject(new Error(stderr || err.message)) : resolve(stdout.trim()),
        ),
      );
      return toolSuccess({ output });
    },
  );

  tool.tool(
    "list_projects",
    "List all StorePilot projects from STOREPILOT_PROJECTS, STOREPILOT_PROJECTS_DIR, ~/.config/storepilot/projects, and STOREPILOT_CONFIG_PATH / cwd. Use select_project(query) to switch active app.",
    {
      configPath: z
        .string()
        .optional()
        .describe("Optional cwd hint for discovering storepilot.yaml"),
    },
    async ({ configPath }) => {
      const session = getProjectSession();
      // Force reload including optional cwd hint
      const projects = listRegisteredProjects(
        configPath ? dirname(configPath) : process.cwd(),
      );
      session.reload();
      const active = session.getActive();
      return toolSuccess({
        count: projects.length,
        projects,
        activeProject: active?.project ?? null,
        hint: "Pass project: \"my-app\" on any tool, or call select_project, to target an app by name.",
      });
    },
    { categories: ["read", "release"] },
  );

  const releaseIntentSchema = z.enum([
    "rollout_production",
    "promote_to_production",
    "submit_for_review",
    "configure_rollout",
  ]) as z.ZodType<ReleaseIntent>;

  tool.tool(
    "execute_release_intent",
    "High-level release orchestrator: rollout, promote, or submit for review across iOS/Android. dryRun defaults to true.",
    {
      intent: releaseIntentSchema.describe(
        "rollout_production | promote_to_production | submit_for_review | configure_rollout",
      ),
      platforms: z
        .array(z.enum(["ios", "android"]))
        .optional()
        .describe("Defaults to configured stores in storepilot.yaml"),
      percentage: z
        .number()
        .optional()
        .describe("Rollout % (0–100) or fraction (0–1) from storepilot defaultRollout"),
      versionId: z.string().optional().describe("iOS App Store version ID"),
      buildId: z.string().optional().describe("iOS build ID"),
      fromTrack: z.string().optional(),
      toTrack: z.string().optional(),
      appleAppId: z.string().optional(),
      googlePackageName: z.string().optional(),
      configPath: z.string().optional(),
      dryRun: dryRunSchema,
    },
    async (args) => {
      const profile = resolveProfile(config, args.configPath);
      const plan = describeIntent(args, profile);

      if (args.dryRun) {
        const result = await executeReleaseIntent(
          appleClient,
          googleClient,
          profile,
          args,
          true,
        );
        return toolSuccess(result);
      }

      const result = await executeReleaseIntent(
        appleClient,
        googleClient,
        profile,
        args,
        false,
      );
      return toolSuccess(result);
    },
    { categories: ["release", "destructive"], destructive: true },
  );
}
