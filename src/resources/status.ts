import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  loadProjectMemory,
  loadProjectProfile,
  listRegisteredProjects,
} from "../core/project-profile.js";
import { getProjectSession } from "../core/project-session.js";
import {
  GOOGLE_PLAY_API_CATALOG,
  flattenGoogleApiMethods,
} from "../providers/google/api-catalog.js";
import { APPLE_ASC_API_CATALOG } from "../providers/apple/api-catalog.js";
import { getWebhookEvents } from "../webhook/handler.js";

export function registerResources(server: McpServer) {
  server.resource(
    "webhook-events",
    "webhook://events",
    {
      description: "Recent webhook events received from EAS and GitHub Actions",
      mimeType: "application/json",
    },
    async () => {
      const events = getWebhookEvents();
      return {
        contents: [
          {
            uri: "webhook://events",
            mimeType: "application/json",
            text: JSON.stringify(events, null, 2),
          },
        ],
      };
    },
  );

  server.resource(
    "pending-actions",
    "webhook://pending",
    {
      description: "Webhook events that have not been processed yet",
      mimeType: "application/json",
    },
    async () => {
      const events = getWebhookEvents(true);
      return {
        contents: [
          {
            uri: "webhook://pending",
            mimeType: "application/json",
            text: JSON.stringify(events, null, 2),
          },
        ],
      };
    },
  );

  server.resource(
    "project-memory",
    "project://memory",
    {
      description:
        "Active StorePilot project profile and release memory (.storepilot/memory.json)",
      mimeType: "application/json",
    },
    async () => {
      const session = getProjectSession();
      const profile = session.getActive() ?? loadProjectProfile();
      const payload = profile
        ? {
            profile,
            memory: loadProjectMemory(profile),
            registry: session.list(),
          }
        : {
            loaded: false,
            message: "No storepilot.yaml / active project",
            registry: listRegisteredProjects(),
          };

      return {
        contents: [
          {
            uri: "project://memory",
            mimeType: "application/json",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    },
  );

  server.resource(
    "project-registry",
    "project://registry",
    {
      description:
        "All registered StorePilot apps (STOREPILOT_PROJECTS / PROJECTS_DIR / config path)",
      mimeType: "application/json",
    },
    async () => {
      const session = getProjectSession();
      const projects = session.reload();
      return {
        contents: [
          {
            uri: "project://registry",
            mimeType: "application/json",
            text: JSON.stringify(
              {
                count: projects.length,
                active: session.getActive()?.project ?? null,
                projects,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.resource(
    "google-api-catalog",
    "catalog://google-play",
    {
      description:
        "Complete Google Play Android Publisher v3 API method catalog + first-launch checklist",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "catalog://google-play",
          mimeType: "application/json",
          text: JSON.stringify(
            {
              ...GOOGLE_PLAY_API_CATALOG,
              methods: flattenGoogleApiMethods(),
              methodCount: flattenGoogleApiMethods().length,
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.resource(
    "apple-api-catalog",
    "catalog://app-store-connect",
    {
      description:
        "App Store Connect API endpoint catalog by category + first-launch checklist",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "catalog://app-store-connect",
          mimeType: "application/json",
          text: JSON.stringify(APPLE_ASC_API_CATALOG, null, 2),
        },
      ],
    }),
  );
}
